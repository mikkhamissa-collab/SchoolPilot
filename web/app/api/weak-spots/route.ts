/**
 * Weak Spot Detection API
 *
 * Analyzes student performance to identify concepts they consistently struggle with.
 * Provides personalized recommendations for improvement.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const FLASK_URL = process.env.FLASK_BACKEND_URL || "http://localhost:5000";

// GET - Get weak spots for a user
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
  const includeResolved = searchParams.get("include_resolved") === "true";

  try {
    let query = supabaseAdmin
      .from("weak_spots")
      .select("*")
      .eq("user_id", user.id);

    if (courseName) {
      query = query.eq("course_name", courseName);
    }

    if (!includeResolved) {
      query = query.eq("resolved", false);
    }

    const { data: weakSpots, error } = await query.order("times_missed", { ascending: false });

    if (error) throw error;

    // Get concept mastery levels for context
    const { data: concepts } = await supabaseAdmin
      .from("study_concepts")
      .select("concept_name, course_name, mastery_level, difficulty_rating, total_reviews, correct_count")
      .eq("user_id", user.id);

    // Enrich weak spots with mastery data
    const enrichedWeakSpots = (weakSpots || []).map(ws => {
      const concept = concepts?.find(
        c => c.concept_name === ws.concept_name && c.course_name === ws.course_name
      );

      return {
        ...ws,
        mastery_level: concept?.mastery_level || 0,
        accuracy: concept?.total_reviews
          ? Math.round((concept.correct_count / concept.total_reviews) * 100)
          : 0,
        difficulty_rating: concept?.difficulty_rating || "unknown"
      };
    });

    // Group by course
    const byCourse: Record<string, typeof enrichedWeakSpots> = {};
    for (const ws of enrichedWeakSpots) {
      if (!byCourse[ws.course_name]) {
        byCourse[ws.course_name] = [];
      }
      byCourse[ws.course_name].push(ws);
    }

    return NextResponse.json({
      weak_spots: enrichedWeakSpots,
      by_course: byCourse,
      total_count: enrichedWeakSpots.length
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - Analyze and detect weak spots, or mark as resolved
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
      case "analyze": {
        // Analyze recent performance and detect new weak spots
        const { course_name } = body;

        // Get recent concept reviews
        const { data: concepts } = await supabaseAdmin
          .from("study_concepts")
          .select("*, concept_reviews(*)")
          .eq("user_id", user.id)
          .eq(course_name ? "course_name" : "user_id", course_name || user.id);

        if (!concepts || concepts.length === 0) {
          return NextResponse.json({
            weak_spots_found: 0,
            message: "No concepts to analyze"
          });
        }

        const newWeakSpots: Array<{
          user_id: string;
          course_name: string;
          topic_name: string;
          concept_name: string;
          times_missed: number;
          error_pattern: string;
          common_mistakes: string[];
        }> = [];

        for (const concept of concepts) {
          // Check if this concept should be flagged as a weak spot
          if (concept.total_reviews >= 3) {
            const accuracy = concept.correct_count / concept.total_reviews;

            // Flag if accuracy is below 50% after 3+ reviews
            if (accuracy < 0.5) {
              // Analyze common mistakes from reviews
              const reviews = concept.concept_reviews || [];
              const incorrectReviews = reviews.filter((r: { was_correct: boolean }) => !r.was_correct);
              const commonMistakes = incorrectReviews
                .slice(0, 5)
                .map((r: { user_answer?: string }) => r.user_answer)
                .filter(Boolean);

              // Generate error pattern description
              let errorPattern = "";
              if (accuracy < 0.25) {
                errorPattern = "Fundamental understanding gap - needs to relearn from basics";
              } else if (accuracy < 0.4) {
                errorPattern = "Consistent difficulty - may be confusing with similar concepts";
              } else {
                errorPattern = "Occasional mistakes - needs more practice";
              }

              newWeakSpots.push({
                user_id: user.id,
                course_name: concept.course_name,
                topic_name: concept.topic_name,
                concept_name: concept.concept_name,
                times_missed: concept.total_reviews - concept.correct_count,
                error_pattern: errorPattern,
                common_mistakes: commonMistakes
              });
            }
          }
        }

        // Upsert weak spots
        if (newWeakSpots.length > 0) {
          for (const ws of newWeakSpots) {
            await supabaseAdmin
              .from("weak_spots")
              .upsert(ws, {
                onConflict: "user_id,course_name,topic_name,concept_name"
              });
          }
        }

        return NextResponse.json({
          weak_spots_found: newWeakSpots.length,
          weak_spots: newWeakSpots
        });
      }

      case "resolve": {
        // Mark a weak spot as resolved
        const { weak_spot_id } = body;

        if (!weak_spot_id) {
          return NextResponse.json({ error: "weak_spot_id is required" }, { status: 400 });
        }

        const { error } = await supabaseAdmin
          .from("weak_spots")
          .update({
            resolved: true,
            resolved_at: new Date().toISOString()
          })
          .eq("id", weak_spot_id)
          .eq("user_id", user.id);

        if (error) throw error;

        return NextResponse.json({ success: true });
      }

      case "get_recommendations": {
        // Get AI-powered recommendations for improving weak spots
        const { course_name, topic_name, concept_name } = body;

        // Get the weak spot details
        const { data: weakSpot } = await supabaseAdmin
          .from("weak_spots")
          .select("*")
          .eq("user_id", user.id)
          .eq("course_name", course_name)
          .eq("topic_name", topic_name)
          .eq("concept_name", concept_name)
          .single();

        if (!weakSpot) {
          return NextResponse.json({ error: "Weak spot not found" }, { status: 404 });
        }

        // Get recommendations from AI
        const response = await fetch(`${FLASK_URL}/weak-spot/recommend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            course_name,
            topic_name,
            concept_name,
            error_pattern: weakSpot.error_pattern,
            common_mistakes: weakSpot.common_mistakes,
            times_missed: weakSpot.times_missed
          })
        });

        if (!response.ok) {
          // Fallback recommendations if AI fails
          return NextResponse.json({
            recommendations: {
              videos: [],
              practice_steps: [
                "Review the fundamental definition of this concept",
                "Work through 5 basic examples",
                "Identify what makes this concept different from similar ones",
                "Practice with increasingly difficult problems",
                "Test yourself without looking at notes"
              ],
              study_tips: [
                "Break the concept into smaller parts",
                "Create flashcards for key formulas or definitions",
                "Teach the concept to someone else (or explain it out loud)",
                "Look for real-world examples that illustrate the concept"
              ],
              estimated_time_to_master: "2-3 study sessions"
            }
          });
        }

        const recommendations = await response.json();
        return NextResponse.json({ recommendations });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
