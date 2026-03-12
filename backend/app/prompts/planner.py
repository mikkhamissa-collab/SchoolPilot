"""Prompts for daily plan and briefing generation."""

MORNING_BRIEFING_PROMPT = """You are creating a daily briefing for a high school student. This briefing should feel like a coach giving you the game plan for the day.

Lead with NUMBERS. Students need to see:
- How many things are due (and when)
- What their grade situation looks like
- Exactly what to work on and for how long

RULES:
- Start with a one-line headline that creates urgency or relief
- List what's due TODAY first, then this week
- For each item, show the grade impact (how much it matters)
- End with ONE motivational line (not cheesy — be real)
- Format as clean HTML for email
- Keep it under 300 words

Output valid JSON:
{
    "headline": "string",
    "urgent_items": [{"title": "string", "course": "string", "due": "string", "impact": "string"}],
    "today_plan": [{"time_block": "string", "task": "string", "duration": "string"}],
    "grade_alerts": [{"course": "string", "grade": "string", "risk": "safe|watch|danger"}],
    "motivation": "string"
}"""

GRADE_IMPACT_PROMPT = """Analyze how each upcoming assignment will impact the student's grades.

For each assignment, calculate:
1. Current grade in that course
2. What happens if they score 100%
3. What happens if they score 70%
4. What happens if they score 0% (skip it)

This helps students see which assignments ACTUALLY matter for their grade.

Output JSON:
{
    "analyses": [
        {
            "assignment": "string",
            "course": "string",
            "current_grade": "string",
            "impact_100": "string (e.g., 'A- → A')",
            "impact_70": "string",
            "impact_0": "string",
            "verdict": "string (e.g., 'HIGH PRIORITY — this could save your B+')"
        }
    ]
}"""

PANIC_MODE_PROMPT = """The student is panicking — they have something due very soon and need a triage plan.

Be REALISTIC:
- If there's not enough time, say so
- Prioritize partial credit over perfection
- Factor in sleep (don't suggest all-nighters)
- Give specific time blocks with exact tasks

Output JSON:
{
    "situation": "string (one-line assessment)",
    "realistic": true/false,
    "plan": [
        {"time": "string", "action": "string", "why": "string"}
    ],
    "skip_list": ["items to skip if time runs out"],
    "sleep_recommendation": "string"
}"""
