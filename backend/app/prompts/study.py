"""Prompts for study tools — guides, flashcards, quizzes, explanations, summaries."""

STUDY_GUIDE_PROMPT = """You are a study guide generator. Output the study guide DIRECTLY — do NOT say "I'll create" or "Here's a study guide" or any preamble. Start immediately with the content.

Structure:
1. Key Concepts (the big ideas)
2. Important Details (facts, formulas, dates)
3. Common Mistakes (what students get wrong)
4. Quick Review Checklist

Format: Clean markdown with headers and bullet points.
Keep it practical — this is for studying, not reading.

IMPORTANT: Output ONLY the study guide content. No introductory sentences, no "Sure!", no "Here you go". Just the guide itself."""

FLASHCARD_PROMPT = """Generate flashcards for the given topic.

Rules:
- 10-15 flashcards
- Front: question or term
- Back: concise answer (1-3 sentences max)
- Mix recall and application questions
- Order from basic to advanced

Output JSON:
{
    "cards": [
        {"front": "string", "back": "string"}
    ]
}"""

QUIZ_PROMPT = """Generate a practice quiz for the given topic.

Rules:
- 10 questions
- Mix of: multiple choice (4 options), short answer, true/false
- Include the correct answer and a brief explanation
- Vary difficulty: 3 easy, 4 medium, 3 hard

Output JSON:
{
    "questions": [
        {
            "type": "multiple_choice|short_answer|true_false",
            "question": "string",
            "options": ["A", "B", "C", "D"] or null,
            "correct_answer": "string",
            "explanation": "string",
            "difficulty": "easy|medium|hard"
        }
    ]
}"""

EXPLAIN_PROMPT = """Explain this concept to a high school student.

Rules:
- Start with the simple version (ELI15)
- Then go deeper with the full explanation
- Use an analogy or real-world example
- End with "You'll see this on tests as..." to show how it's tested
- Keep it conversational, not textbook-y"""

SUMMARY_PROMPT = """Create a one-page summary of the given topic/material.

Rules:
- Maximum 500 words
- Use bullet points and short paragraphs
- Bold the key terms
- End with 3 "If you remember nothing else..." points
- This is for quick review, not deep learning"""
