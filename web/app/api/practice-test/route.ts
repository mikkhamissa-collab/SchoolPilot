/**
 * Adaptive Practice Test API
 *
 * Generates practice tests that adapt to student performance.
 * Uses AI to generate questions based on course materials.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const FLASK_URL = process.env.FLASK_BACKEND_URL;
if (!FLASK_URL) {
  console.error("FLASK_BACKEND_URL environment variable is not set");
}

// POST - Generate or continue practice test
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
      case "generate": {
        // Generate a new practice test
        const { course_name, topic_name, difficulty_level, question_count, include_concepts } = body;

        if (!course_name || !topic_name) {
          return NextResponse.json(
            { error: "course_name and topic_name are required" },
            { status: 400 }
          );
        }

        // Get student's weak spots to focus on
        const { data: weakSpots } = await supabaseAdmin
          .from("weak_spots")
          .select("concept_name, error_pattern")
          .eq("user_id", user.id)
          .eq("course_name", course_name)
          .eq("resolved", false);

        // Get student's concept mastery levels
        const { data: concepts } = await supabaseAdmin
          .from("study_concepts")
          .select("concept_name, mastery_level, difficulty_rating")
          .eq("user_id", user.id)
          .eq("course_name", course_name)
          .eq("topic_name", topic_name);

        // Build context for AI
        const weakConceptsList = weakSpots?.map(w => w.concept_name) || [];
        const conceptMastery = concepts?.reduce((acc, c) => {
          acc[c.concept_name] = { mastery: c.mastery_level, difficulty: c.difficulty_rating };
          return acc;
        }, {} as Record<string, { mastery: number; difficulty: string }>) || {};

        // Generate questions using AI
        const testResponse = await fetch(`${FLASK_URL}/practice-test/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            course_name,
            topic_name,
            difficulty_level: difficulty_level || "adaptive",
            question_count: question_count || 10,
            include_concepts: include_concepts || [],
            weak_concepts: weakConceptsList,
            concept_mastery: conceptMastery
          })
        });

        if (!testResponse.ok) {
          throw new Error("Failed to generate practice test");
        }

        const testData = await testResponse.json();

        // Save the test session
        const { data: savedTest, error: saveError } = await supabaseAdmin
          .from("practice_tests")
          .insert({
            user_id: user.id,
            course_name,
            topic_name,
            difficulty_level: difficulty_level || "adaptive",
            total_questions: testData.questions.length,
            questions: testData.questions,
            weak_areas: weakConceptsList,
            started_at: new Date().toISOString()
          })
          .select()
          .single();

        if (saveError) throw saveError;

        return NextResponse.json({
          test_id: savedTest.id,
          questions: testData.questions.map((q: { id: string; question: string; type: string; options?: string[]; difficulty: string; difficultyScore: number; conceptName: string; hints?: string[] }) => ({
            id: q.id,
            question: q.question,
            type: q.type,
            options: q.options,
            difficulty: q.difficulty,
            difficultyScore: q.difficultyScore,
            conceptName: q.conceptName,
            hints: q.hints
          })),
          total_questions: testData.questions.length
        });
      }

      case "answer": {
        // Record an answer and get the next question
        const { test_id, question_id, answer, time_taken, hint_used } = body;

        if (!test_id || !question_id || answer === undefined) {
          return NextResponse.json(
            { error: "test_id, question_id, and answer are required" },
            { status: 400 }
          );
        }

        // Get the test
        const { data: test, error: testError } = await supabaseAdmin
          .from("practice_tests")
          .select("*")
          .eq("id", test_id)
          .eq("user_id", user.id)
          .single();

        if (testError || !test) {
          return NextResponse.json({ error: "Test not found" }, { status: 404 });
        }

        // Find the question
        const questions = test.questions as {
          id: string;
          question: string;
          type: string;
          options?: string[];
          correctAnswer: string;
          explanation: string;
          difficulty: string;
          difficultyScore: number;
          conceptName: string;
        }[];
        const question = questions.find(q => q.id === question_id);

        if (!question) {
          return NextResponse.json({ error: "Question not found" }, { status: 404 });
        }

        // Check the answer
        const isCorrect = checkAnswer(question.correctAnswer, answer, question.type);

        // Update the question with the answer
        const updatedQuestions = questions.map(q => {
          if (q.id === question_id) {
            return {
              ...q,
              userAnswer: answer,
              isCorrect,
              timeTaken: time_taken,
              hintUsed: hint_used
            };
          }
          return q;
        });

        // Calculate current score
        const answeredQuestions = updatedQuestions.filter((q) => 'userAnswer' in q);
        const correctCount = answeredQuestions.filter((q) => (q as { isCorrect?: boolean }).isCorrect).length;

        // Update the test
        await supabaseAdmin
          .from("practice_tests")
          .update({
            questions: updatedQuestions,
            score: correctCount
          })
          .eq("id", test_id);

        // Update mastery for this concept
        const { data: concept } = await supabaseAdmin
          .from("study_concepts")
          .select("*")
          .eq("user_id", user.id)
          .eq("course_name", test.course_name)
          .eq("concept_name", question.conceptName)
          .single();

        if (concept) {
          // Record the review
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://schoolpilot.co'}/api/mastery`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              action: "record_review",
              concept_id: concept.id,
              was_correct: isCorrect,
              time_taken_seconds: time_taken,
              question_text: question.question,
              user_answer: answer,
              correct_answer: question.correctAnswer
            })
          });
        }

        // Check if test is complete
        const isComplete = answeredQuestions.length >= test.total_questions;

        if (isComplete) {
          // Calculate final results
          const weakAreas = new Set<string>();
          const strongAreas = new Set<string>();

          for (const q of updatedQuestions as ({ conceptName: string; isCorrect?: boolean })[]) {
            if ('isCorrect' in q) {
              if (q.isCorrect) {
                strongAreas.add(q.conceptName);
              } else {
                weakAreas.add(q.conceptName);
                // Remove from strong if they got it wrong
                strongAreas.delete(q.conceptName);
              }
            }
          }

          await supabaseAdmin
            .from("practice_tests")
            .update({
              completed: true,
              completed_at: new Date().toISOString(),
              time_taken_seconds: (updatedQuestions as { timeTaken?: number }[]).reduce((sum, q) => sum + (q.timeTaken || 0), 0),
              weak_areas: Array.from(weakAreas),
              strong_areas: Array.from(strongAreas)
            })
            .eq("id", test_id);
        }

        return NextResponse.json({
          is_correct: isCorrect,
          correct_answer: question.correctAnswer,
          explanation: question.explanation,
          current_score: correctCount,
          questions_answered: answeredQuestions.length,
          is_complete: isComplete
        });
      }

      case "complete": {
        // Get final test results
        const { test_id } = body;

        const { data: test, error } = await supabaseAdmin
          .from("practice_tests")
          .select("*")
          .eq("id", test_id)
          .eq("user_id", user.id)
          .single();

        if (error || !test) {
          return NextResponse.json({ error: "Test not found" }, { status: 404 });
        }

        const questions = test.questions as {
          conceptName: string;
          difficulty: string;
          isCorrect?: boolean;
          timeTaken?: number;
        }[];
        const answeredQuestions = questions.filter(q => 'isCorrect' in q);
        const correctCount = answeredQuestions.filter(q => q.isCorrect).length;

        // Calculate by difficulty
        const byDifficulty = {
          easy: { correct: 0, total: 0 },
          medium: { correct: 0, total: 0 },
          hard: { correct: 0, total: 0 }
        };

        for (const q of answeredQuestions) {
          const diff = q.difficulty as 'easy' | 'medium' | 'hard';
          byDifficulty[diff].total += 1;
          if (q.isCorrect) {
            byDifficulty[diff].correct += 1;
          }
        }

        return NextResponse.json({
          test_id: test.id,
          score: correctCount,
          total_questions: test.total_questions,
          accuracy: answeredQuestions.length > 0 ? correctCount / answeredQuestions.length : 0,
          time_taken_seconds: test.time_taken_seconds,
          weak_areas: test.weak_areas,
          strong_areas: test.strong_areas,
          by_difficulty: byDifficulty,
          completed_at: test.completed_at
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

// GET - Get test history
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
  const limit = parseInt(searchParams.get("limit") || "10");

  try {
    let query = supabaseAdmin
      .from("practice_tests")
      .select("id, course_name, topic_name, score, total_questions, difficulty_level, completed, completed_at, weak_areas, strong_areas")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (courseName) {
      query = query.eq("course_name", courseName);
    }

    const { data: tests, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      tests: tests || [],
      count: tests?.length || 0
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Check if answer is correct
 */
function checkAnswer(correctAnswer: string, userAnswer: string, type: string): boolean {
  const normalizedUser = userAnswer?.toString().toLowerCase().trim() || '';
  const normalizedCorrect = correctAnswer?.toString().toLowerCase().trim() || '';

  if (normalizedUser === normalizedCorrect) {
    return true;
  }

  // For multiple choice, accept letter answers
  if (type === 'multiple_choice') {
    const letterMatch = normalizedUser.match(/^[a-d]$/);
    if (letterMatch) {
      const optionIndex = normalizedUser.charCodeAt(0) - 'a'.charCodeAt(0);
      // This would need the options array to check properly
      // For now, just check if it matches the correct answer
      return normalizedUser === normalizedCorrect.charAt(0);
    }
  }

  // For true/false
  if (type === 'true_false') {
    const trueVariants = ['true', 't', 'yes', 'y', '1'];
    const falseVariants = ['false', 'f', 'no', 'n', '0'];

    const userIsTrue = trueVariants.includes(normalizedUser);
    const userIsFalse = falseVariants.includes(normalizedUser);
    const correctIsTrue = trueVariants.includes(normalizedCorrect);
    const correctIsFalse = falseVariants.includes(normalizedCorrect);

    if (userIsTrue && correctIsTrue) return true;
    if (userIsFalse && correctIsFalse) return true;
  }

  return false;
}
