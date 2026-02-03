/**
 * Adaptive Practice Test System
 *
 * Generates practice tests that dynamically adjust difficulty based on
 * student performance. Uses Item Response Theory (IRT) principles.
 */

export interface TestQuestion {
  id: string;
  conceptName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  difficultyScore: number; // 1-10 scale
  type: 'multiple_choice' | 'free_response' | 'true_false' | 'worked_problem';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  hints?: string[];
  relatedConcepts?: string[];
}

export interface TestSession {
  id: string;
  questions: TestQuestion[];
  currentIndex: number;
  answers: {
    questionId: string;
    userAnswer: string;
    isCorrect: boolean;
    timeTaken: number;
    hintUsed: boolean;
  }[];
  currentDifficulty: number; // Running difficulty level (1-10)
  streak: number; // Current correct/incorrect streak
  estimatedAbility: number; // Student's estimated ability level
}

export interface AdaptiveConfig {
  minQuestions: number;
  maxQuestions: number;
  startingDifficulty: number;
  difficultyStep: number;
  streakThreshold: number; // How many in a row before adjusting difficulty
  targetAccuracy: number; // Aim for this accuracy rate
}

const DEFAULT_CONFIG: AdaptiveConfig = {
  minQuestions: 5,
  maxQuestions: 20,
  startingDifficulty: 5,
  difficultyStep: 1,
  streakThreshold: 2,
  targetAccuracy: 0.7 // 70% correct is optimal learning zone
};

/**
 * Initialize a new adaptive test session
 */
export function createTestSession(
  questions: TestQuestion[],
  config: Partial<AdaptiveConfig> = {}
): TestSession {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    id: crypto.randomUUID(),
    questions: sortQuestionsByDifficulty(questions),
    currentIndex: 0,
    answers: [],
    currentDifficulty: fullConfig.startingDifficulty,
    streak: 0,
    estimatedAbility: fullConfig.startingDifficulty
  };
}

/**
 * Sort questions by difficulty for easier selection
 */
function sortQuestionsByDifficulty(questions: TestQuestion[]): TestQuestion[] {
  return [...questions].sort((a, b) => a.difficultyScore - b.difficultyScore);
}

/**
 * Get the next question based on current performance
 */
export function getNextQuestion(
  session: TestSession,
  config: Partial<AdaptiveConfig> = {}
): TestQuestion | null {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Check if we should end the test
  if (shouldEndTest(session, fullConfig)) {
    return null;
  }

  // Find questions closest to current difficulty that haven't been asked
  const answeredIds = new Set(session.answers.map(a => a.questionId));
  const availableQuestions = session.questions.filter(q => !answeredIds.has(q.id));

  if (availableQuestions.length === 0) {
    return null;
  }

  // Select question closest to current difficulty
  const targetDifficulty = session.currentDifficulty;
  const sortedByProximity = [...availableQuestions].sort((a, b) => {
    const diffA = Math.abs(a.difficultyScore - targetDifficulty);
    const diffB = Math.abs(b.difficultyScore - targetDifficulty);
    return diffA - diffB;
  });

  // Add some randomness - pick from top 3 closest
  const candidates = sortedByProximity.slice(0, Math.min(3, sortedByProximity.length));
  const selected = candidates[Math.floor(Math.random() * candidates.length)];

  return selected;
}

/**
 * Record an answer and update the session
 */
export function recordAnswer(
  session: TestSession,
  questionId: string,
  userAnswer: string,
  timeTaken: number,
  hintUsed: boolean = false,
  config: Partial<AdaptiveConfig> = {}
): TestSession {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  const question = session.questions.find(q => q.id === questionId);
  if (!question) {
    throw new Error('Question not found');
  }

  const isCorrect = checkAnswer(question, userAnswer);

  // Update streak
  let newStreak: number;
  if (isCorrect) {
    newStreak = session.streak >= 0 ? session.streak + 1 : 1;
  } else {
    newStreak = session.streak <= 0 ? session.streak - 1 : -1;
  }

  // Adjust difficulty based on streak
  let newDifficulty = session.currentDifficulty;

  if (newStreak >= fullConfig.streakThreshold) {
    // Student is doing well - increase difficulty
    newDifficulty = Math.min(10, newDifficulty + fullConfig.difficultyStep);
  } else if (newStreak <= -fullConfig.streakThreshold) {
    // Student is struggling - decrease difficulty
    newDifficulty = Math.max(1, newDifficulty - fullConfig.difficultyStep);
  }

  // Update estimated ability using ELO-like formula
  const expectedScore = 1 / (1 + Math.pow(10, (question.difficultyScore - session.estimatedAbility) / 4));
  const actualScore = isCorrect ? 1 : 0;
  const kFactor = 0.5; // Learning rate
  const newAbility = session.estimatedAbility + kFactor * (actualScore - expectedScore);

  return {
    ...session,
    currentIndex: session.currentIndex + 1,
    answers: [
      ...session.answers,
      {
        questionId,
        userAnswer,
        isCorrect,
        timeTaken,
        hintUsed
      }
    ],
    currentDifficulty: newDifficulty,
    streak: newStreak,
    estimatedAbility: Math.max(1, Math.min(10, newAbility))
  };
}

/**
 * Check if an answer is correct
 */
function checkAnswer(question: TestQuestion, userAnswer: string): boolean {
  const normalizedUser = userAnswer.toLowerCase().trim();
  const normalizedCorrect = question.correctAnswer.toLowerCase().trim();

  // Exact match
  if (normalizedUser === normalizedCorrect) {
    return true;
  }

  // For multiple choice, check if it's the same option letter/number
  if (question.type === 'multiple_choice') {
    // User might answer with just the letter (A, B, C, D)
    const letterMatch = normalizedUser.match(/^[a-d]$/);
    if (letterMatch) {
      const index = letterMatch[0].charCodeAt(0) - 'a'.charCodeAt(0);
      return question.options?.[index]?.toLowerCase().trim() === normalizedCorrect;
    }
  }

  // For true/false, accept variations
  if (question.type === 'true_false') {
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

/**
 * Determine if the test should end
 */
function shouldEndTest(session: TestSession, config: AdaptiveConfig): boolean {
  const { minQuestions, maxQuestions } = config;
  const answeredCount = session.answers.length;

  // Must answer minimum questions
  if (answeredCount < minQuestions) {
    return false;
  }

  // Can't exceed maximum
  if (answeredCount >= maxQuestions) {
    return true;
  }

  // Check if we have high confidence in ability estimate
  // (requires at least 10 questions and consistent performance)
  if (answeredCount >= 10) {
    const recentAnswers = session.answers.slice(-5);
    const recentAccuracy = recentAnswers.filter(a => a.isCorrect).length / 5;

    // If performance is stable around target accuracy, we can end
    if (Math.abs(recentAccuracy - config.targetAccuracy) < 0.15) {
      return true;
    }
  }

  return false;
}

/**
 * Get test results and analysis
 */
export function getTestResults(session: TestSession): {
  score: number;
  totalQuestions: number;
  accuracy: number;
  estimatedAbility: number;
  abilityLevel: 'beginner' | 'developing' | 'proficient' | 'advanced' | 'expert';
  strongConcepts: string[];
  weakConcepts: string[];
  averageTime: number;
  hintsUsed: number;
  byDifficulty: {
    easy: { correct: number; total: number };
    medium: { correct: number; total: number };
    hard: { correct: number; total: number };
  };
} {
  const { answers, questions, estimatedAbility } = session;

  const correctCount = answers.filter(a => a.isCorrect).length;
  const accuracy = answers.length > 0 ? correctCount / answers.length : 0;

  // Analyze by concept
  const conceptPerformance: Record<string, { correct: number; total: number }> = {};

  for (const answer of answers) {
    const question = questions.find(q => q.id === answer.questionId);
    if (!question) continue;

    if (!conceptPerformance[question.conceptName]) {
      conceptPerformance[question.conceptName] = { correct: 0, total: 0 };
    }

    conceptPerformance[question.conceptName].total += 1;
    if (answer.isCorrect) {
      conceptPerformance[question.conceptName].correct += 1;
    }
  }

  const strongConcepts: string[] = [];
  const weakConcepts: string[] = [];

  for (const [concept, perf] of Object.entries(conceptPerformance)) {
    const rate = perf.correct / perf.total;
    if (rate >= 0.75) {
      strongConcepts.push(concept);
    } else if (rate <= 0.5) {
      weakConcepts.push(concept);
    }
  }

  // Analyze by difficulty
  const byDifficulty = {
    easy: { correct: 0, total: 0 },
    medium: { correct: 0, total: 0 },
    hard: { correct: 0, total: 0 }
  };

  for (const answer of answers) {
    const question = questions.find(q => q.id === answer.questionId);
    if (!question) continue;

    byDifficulty[question.difficulty].total += 1;
    if (answer.isCorrect) {
      byDifficulty[question.difficulty].correct += 1;
    }
  }

  // Determine ability level
  let abilityLevel: 'beginner' | 'developing' | 'proficient' | 'advanced' | 'expert';
  if (estimatedAbility <= 2) {
    abilityLevel = 'beginner';
  } else if (estimatedAbility <= 4) {
    abilityLevel = 'developing';
  } else if (estimatedAbility <= 6) {
    abilityLevel = 'proficient';
  } else if (estimatedAbility <= 8) {
    abilityLevel = 'advanced';
  } else {
    abilityLevel = 'expert';
  }

  const averageTime = answers.length > 0
    ? answers.reduce((sum, a) => sum + a.timeTaken, 0) / answers.length
    : 0;

  return {
    score: correctCount,
    totalQuestions: answers.length,
    accuracy,
    estimatedAbility,
    abilityLevel,
    strongConcepts,
    weakConcepts,
    averageTime,
    hintsUsed: answers.filter(a => a.hintUsed).length,
    byDifficulty
  };
}

/**
 * Generate difficulty score from difficulty label
 */
export function difficultyLabelToScore(label: 'easy' | 'medium' | 'hard'): number {
  switch (label) {
    case 'easy':
      return 3;
    case 'medium':
      return 5;
    case 'hard':
      return 8;
  }
}

/**
 * Generate difficulty label from score
 */
export function scoreToDifficultyLabel(score: number): 'easy' | 'medium' | 'hard' {
  if (score <= 3) return 'easy';
  if (score <= 6) return 'medium';
  return 'hard';
}
