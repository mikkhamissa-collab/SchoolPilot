/**
 * Mastery Tracking API
 *
 * Handles concept tracking, spaced repetition updates, and mastery analytics.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  calculateNextReview,
  getDueForReview,
  getWeakestConcepts,
  calculateCourseMastery,
  getStudyRecommendations,
  timeToQuality
} from "@/lib/spaced-repetition";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// GET - Fetch concepts and mastery stats
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const courseName = searchParams.get("course");
  const topicName = searchParams.get("topic");
  const action = searchParams.get("action") || "list";

  try {
    // Build query
    let query = supabaseAdmin
      .from("study_concepts")
      .select("*")
      .eq("user_id", user.id);

    if (courseName) {
      query = query.eq("course_name", courseName);
    }
    if (topicName) {
      query = query.eq("topic_name", topicName);
    }

    const { data: concepts, error } = await query.order("next_review", { ascending: true });

    if (error) throw error;

    const allConcepts = concepts || [];

    switch (action) {
      case "due": {
        // Get concepts due for review today
        const dueConcepts = getDueForReview(allConcepts);
        return NextResponse.json({
          concepts: dueConcepts,
          count: dueConcepts.length
        });
      }

      case "weak": {
        // Get weakest concepts
        const weakConcepts = getWeakestConcepts(allConcepts, 10);
        return NextResponse.json({
          concepts: weakConcepts,
          count: weakConcepts.length
        });
      }

      case "stats": {
        // Get overall mastery stats
        const recommendations = getStudyRecommendations(allConcepts);
        const courseMastery = calculateCourseMastery(allConcepts);

        // Group by course for course-level stats
        const courseStats: Record<string, { concepts: number; mastery: number }> = {};
        for (const concept of allConcepts) {
          if (!courseStats[concept.course_name]) {
            courseStats[concept.course_name] = { concepts: 0, mastery: 0 };
          }
          courseStats[concept.course_name].concepts += 1;
          courseStats[concept.course_name].mastery += concept.mastery_level;
        }

        // Calculate averages
        for (const course of Object.keys(courseStats)) {
          courseStats[course].mastery = Math.round(
            courseStats[course].mastery / courseStats[course].concepts
          );
        }

        return NextResponse.json({
          totalConcepts: allConcepts.length,
          overallMastery: courseMastery,
          ...recommendations,
          courseStats
        });
      }

      default: {
        // Return all concepts
        return NextResponse.json({
          concepts: allConcepts,
          count: allConcepts.length,
          overallMastery: calculateCourseMastery(allConcepts)
        });
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - Create concepts or record reviews
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  try {
    switch (action) {
      case "create_concepts": {
        // Bulk create concepts for a topic
        const { course_name, topic_name, concepts } = body;

        if (!course_name || !topic_name || !concepts?.length) {
          return NextResponse.json(
            { error: "course_name, topic_name, and concepts are required" },
            { status: 400 }
          );
        }

        const conceptRows = concepts.map((conceptName: string) => ({
          user_id: user.id,
          course_name,
          topic_name,
          concept_name: conceptName,
          ease_factor: 2.5,
          interval_days: 1,
          repetitions: 0,
          next_review: new Date().toISOString().split("T")[0],
          mastery_level: 0,
          difficulty_rating: "medium"
        }));

        const { data, error } = await supabaseAdmin
          .from("study_concepts")
          .upsert(conceptRows, {
            onConflict: "user_id,course_name,topic_name,concept_name",
            ignoreDuplicates: true
          })
          .select();

        if (error) throw error;

        return NextResponse.json({
          success: true,
          created: data?.length || 0
        });
      }

      case "record_review": {
        // Record a review and update spaced repetition
        const { concept_id, was_correct, time_taken_seconds, question_text, user_answer, correct_answer } = body;

        if (!concept_id || was_correct === undefined) {
          return NextResponse.json(
            { error: "concept_id and was_correct are required" },
            { status: 400 }
          );
        }

        // Get current concept
        const { data: concept, error: fetchError } = await supabaseAdmin
          .from("study_concepts")
          .select("*")
          .eq("id", concept_id)
          .eq("user_id", user.id)
          .single();

        if (fetchError || !concept) {
          return NextResponse.json({ error: "Concept not found" }, { status: 404 });
        }

        // Calculate quality rating
        const quality = timeToQuality(was_correct, time_taken_seconds || 30);

        // Calculate new review parameters
        const update = calculateNextReview(concept, {
          quality,
          wasCorrect: was_correct,
          timeTakenSeconds: time_taken_seconds
        });

        // Record the review
        const { error: reviewError } = await supabaseAdmin
          .from("concept_reviews")
          .insert({
            concept_id,
            quality,
            time_taken_seconds,
            question_text,
            user_answer,
            correct_answer,
            was_correct
          });

        if (reviewError) throw reviewError;

        // Update the concept
        const { data: updated, error: updateError } = await supabaseAdmin
          .from("study_concepts")
          .update({
            ...update,
            total_reviews: concept.total_reviews + 1,
            correct_count: concept.correct_count + (was_correct ? 1 : 0),
            last_reviewed: new Date().toISOString()
          })
          .eq("id", concept_id)
          .select()
          .single();

        if (updateError) throw updateError;

        // Check if this creates a weak spot
        if (!was_correct && concept.correct_count / (concept.total_reviews + 1) < 0.5) {
          // Upsert weak spot
          await supabaseAdmin
            .from("weak_spots")
            .upsert({
              user_id: user.id,
              course_name: concept.course_name,
              topic_name: concept.topic_name,
              concept_name: concept.concept_name,
              times_missed: 1,
              last_occurred: new Date().toISOString()
            }, {
              onConflict: "user_id,course_name,topic_name,concept_name"
            });
        }

        return NextResponse.json({
          success: true,
          concept: updated,
          nextReview: update.next_review,
          masteryLevel: update.mastery_level
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
