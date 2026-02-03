/**
 * Spaced Repetition Algorithm (SM-2 based)
 *
 * Implements a modified SuperMemo 2 algorithm for optimal learning retention.
 * Students review concepts at increasing intervals based on how well they know them.
 */

export interface StudyConcept {
  id: string;
  user_id: string;
  course_name: string;
  topic_name: string;
  concept_name: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  last_reviewed: string | null;
  total_reviews: number;
  correct_count: number;
  streak: number;
  best_streak: number;
  difficulty_rating: 'easy' | 'medium' | 'hard';
  mastery_level: number;
  created_at: string;
}

export interface ReviewResult {
  quality: number; // 0-5 (SM-2 quality rating)
  wasCorrect: boolean;
  timeTakenSeconds?: number;
}

export interface SpacedRepetitionUpdate {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  streak: number;
  best_streak: number;
  mastery_level: number;
  difficulty_rating: 'easy' | 'medium' | 'hard';
}

/**
 * Quality ratings for SM-2 algorithm:
 * 5 - Perfect response, no hesitation
 * 4 - Correct response after hesitation
 * 3 - Correct response with difficulty
 * 2 - Incorrect response but easy to recall correct answer
 * 1 - Incorrect response, correct answer remembered
 * 0 - Complete blackout
 */
export type QualityRating = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Calculate the next review parameters based on SM-2 algorithm
 */
export function calculateNextReview(
  concept: StudyConcept,
  result: ReviewResult
): SpacedRepetitionUpdate {
  const { quality, wasCorrect, timeTakenSeconds } = result;

  let easeFactor = concept.ease_factor;
  let intervalDays = concept.interval_days;
  let repetitions = concept.repetitions;
  let streak = concept.streak;
  let bestStreak = concept.best_streak;

  if (quality >= 3) {
    // Correct response - increase interval
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 3;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    repetitions += 1;
    streak += 1;
    if (streak > bestStreak) {
      bestStreak = streak;
    }
  } else {
    // Incorrect response - reset to beginning
    repetitions = 0;
    intervalDays = 1;
    streak = 0;
  }

  // Update ease factor using SM-2 formula
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const efChange = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  easeFactor = Math.max(1.3, easeFactor + efChange);

  // Calculate next review date
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + intervalDays);

  // Calculate mastery level (0-100)
  const masteryLevel = calculateMasteryLevel(
    concept.total_reviews + 1,
    concept.correct_count + (wasCorrect ? 1 : 0),
    repetitions,
    easeFactor,
    bestStreak
  );

  // Determine difficulty rating
  const difficultyRating = determineDifficulty(
    easeFactor,
    concept.total_reviews + 1,
    concept.correct_count + (wasCorrect ? 1 : 0)
  );

  return {
    ease_factor: Math.round(easeFactor * 100) / 100,
    interval_days: intervalDays,
    repetitions,
    next_review: nextReview.toISOString().split('T')[0],
    streak,
    best_streak: bestStreak,
    mastery_level: masteryLevel,
    difficulty_rating: difficultyRating
  };
}

/**
 * Calculate mastery level as a percentage
 */
function calculateMasteryLevel(
  totalReviews: number,
  correctCount: number,
  repetitions: number,
  easeFactor: number,
  bestStreak: number
): number {
  if (totalReviews === 0) return 0;

  // Factors that contribute to mastery:
  // 1. Accuracy (40%)
  const accuracy = correctCount / totalReviews;
  const accuracyScore = accuracy * 40;

  // 2. Repetitions (30%) - capped at 10
  const repetitionScore = Math.min(repetitions / 10, 1) * 30;

  // 3. Ease factor (20%) - normalized from 1.3-3.0 range
  const normalizedEase = (easeFactor - 1.3) / 1.7;
  const easeScore = normalizedEase * 20;

  // 4. Best streak (10%) - capped at 5
  const streakScore = Math.min(bestStreak / 5, 1) * 10;

  const mastery = Math.round(accuracyScore + repetitionScore + easeScore + streakScore);
  return Math.min(100, Math.max(0, mastery));
}

/**
 * Determine difficulty rating based on performance
 */
function determineDifficulty(
  easeFactor: number,
  totalReviews: number,
  correctCount: number
): 'easy' | 'medium' | 'hard' {
  if (totalReviews < 3) return 'medium';

  const accuracy = correctCount / totalReviews;

  if (easeFactor >= 2.5 && accuracy >= 0.85) {
    return 'easy';
  } else if (easeFactor <= 1.8 || accuracy <= 0.5) {
    return 'hard';
  }
  return 'medium';
}

/**
 * Get concepts that are due for review today
 */
export function getDueForReview(concepts: StudyConcept[]): StudyConcept[] {
  const today = new Date().toISOString().split('T')[0];
  return concepts.filter(c => c.next_review <= today);
}

/**
 * Get concepts by priority (due first, then by difficulty)
 */
export function getPrioritizedConcepts(concepts: StudyConcept[]): StudyConcept[] {
  const today = new Date().toISOString().split('T')[0];

  return [...concepts].sort((a, b) => {
    // Due concepts come first
    const aDue = a.next_review <= today;
    const bDue = b.next_review <= today;

    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;

    // Among due concepts, hard ones come first
    const difficultyOrder = { hard: 0, medium: 1, easy: 2 };
    const diffA = difficultyOrder[a.difficulty_rating];
    const diffB = difficultyOrder[b.difficulty_rating];

    if (diffA !== diffB) return diffA - diffB;

    // Then by mastery level (lower mastery first)
    return a.mastery_level - b.mastery_level;
  });
}

/**
 * Calculate overall course mastery
 */
export function calculateCourseMastery(concepts: StudyConcept[]): number {
  if (concepts.length === 0) return 0;

  const totalMastery = concepts.reduce((sum, c) => sum + c.mastery_level, 0);
  return Math.round(totalMastery / concepts.length);
}

/**
 * Get concepts that need the most work (weak spots)
 */
export function getWeakestConcepts(concepts: StudyConcept[], limit: number = 5): StudyConcept[] {
  return [...concepts]
    .filter(c => c.total_reviews > 0) // Only concepts that have been reviewed
    .sort((a, b) => {
      // Sort by mastery level (lowest first)
      if (a.mastery_level !== b.mastery_level) {
        return a.mastery_level - b.mastery_level;
      }
      // Then by difficulty (hard first)
      const difficultyOrder = { hard: 0, medium: 1, easy: 2 };
      return difficultyOrder[a.difficulty_rating] - difficultyOrder[b.difficulty_rating];
    })
    .slice(0, limit);
}

/**
 * Get concepts that are mastered (for celebration!)
 */
export function getMasteredConcepts(concepts: StudyConcept[], threshold: number = 80): StudyConcept[] {
  return concepts.filter(c => c.mastery_level >= threshold);
}

/**
 * Calculate study session recommendations
 */
export function getStudyRecommendations(concepts: StudyConcept[]): {
  dueToday: number;
  weakConcepts: number;
  masteredConcepts: number;
  recommendedMinutes: number;
  focusArea: string | null;
} {
  const dueToday = getDueForReview(concepts).length;
  const weakConcepts = getWeakestConcepts(concepts).filter(c => c.mastery_level < 50).length;
  const masteredConcepts = getMasteredConcepts(concepts).length;

  // Recommend 2 minutes per due concept, minimum 10 minutes
  const recommendedMinutes = Math.max(10, dueToday * 2);

  // Find the topic that needs the most work
  const topicMastery: Record<string, { total: number; count: number }> = {};
  for (const concept of concepts) {
    if (!topicMastery[concept.topic_name]) {
      topicMastery[concept.topic_name] = { total: 0, count: 0 };
    }
    topicMastery[concept.topic_name].total += concept.mastery_level;
    topicMastery[concept.topic_name].count += 1;
  }

  let focusArea: string | null = null;
  let lowestMastery = Infinity;

  for (const [topic, data] of Object.entries(topicMastery)) {
    const avgMastery = data.total / data.count;
    if (avgMastery < lowestMastery) {
      lowestMastery = avgMastery;
      focusArea = topic;
    }
  }

  return {
    dueToday,
    weakConcepts,
    masteredConcepts,
    recommendedMinutes,
    focusArea
  };
}

/**
 * Convert answer time to quality rating
 * Quick + correct = 5
 * Slow + correct = 3-4
 * Incorrect = 0-2
 */
export function timeToQuality(
  wasCorrect: boolean,
  timeTakenSeconds: number,
  expectedSeconds: number = 30
): QualityRating {
  if (!wasCorrect) {
    // Incorrect answers
    if (timeTakenSeconds < expectedSeconds * 0.5) {
      return 1; // Quick wrong answer - careless
    }
    return 0; // Slow wrong answer - didn't know it
  }

  // Correct answers
  const speedRatio = timeTakenSeconds / expectedSeconds;

  if (speedRatio <= 0.5) {
    return 5; // Very fast - perfect
  } else if (speedRatio <= 1.0) {
    return 4; // Normal speed - correct with hesitation
  } else if (speedRatio <= 2.0) {
    return 3; // Slow - correct with difficulty
  }
  return 3; // Very slow but still correct
}
