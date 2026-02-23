# plan_v2.py — Grade-aware, anxiety-first planning endpoints
# These replace the generic /process endpoint with something stickier

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request

from prompts_v2 import (
    MORNING_BRIEFING_V2,
    GRADE_IMPACT_ANALYZER,
    WHAT_DO_I_NEED_PROMPT,
    WEEKLY_FORECAST_PROMPT,
    PANIC_MODE_PROMPT,
    PERSONALIZATION_CONTEXT,
    GRADE_GUARDIAN_PROMPT,
    STUDY_SESSION_PROMPT,
    TUTOR_SESSION_PROMPT,
    PRE_SESSION_DIAGNOSTIC_PROMPT,
)

# Import shared helpers from server.py (or duplicate if needed)
try:
    from server import call_claude_json, validate_str, validate_list
except ImportError:
    # Fallback implementations
    import anthropic
    import os
    
    ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
    CLAUDE_MODEL = os.environ.get('CLAUDE_MODEL', 'claude-sonnet-4-20250514')
    
    _client = None
    def get_client():
        global _client
        if _client is None:
            _client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        return _client
    
    def call_claude_json(system: str, user: str, max_tokens: int = 2048) -> dict:
        client = get_client()
        msg = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{'role': 'user', 'content': user}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
            if raw.endswith('```'):
                raw = raw[:-3].strip()
        return json.loads(raw)
    
    def validate_str(val, max_len, name):
        if not isinstance(val, str):
            raise ValueError(f'{name} must be a string')
        return val.strip()[:max_len]
    
    def validate_list(val, name):
        if not isinstance(val, list) or len(val) == 0:
            raise ValueError(f'{name} must be a non-empty list')
        return val


# Blueprint for v2 endpoints
plan_v2_bp = Blueprint('plan_v2', __name__, url_prefix='/plan')


# =============================================================================
# HELPERS
# =============================================================================

def calculate_grade_risk(grades: List[Dict]) -> List[Dict]:
    """
    Analyze grades and identify risk levels.
    
    Risk levels:
    - danger: Within 1% of dropping a letter grade
    - watch: Within 3% of dropping
    - safe: More than 3% buffer
    """
    THRESHOLDS = [
        (90, 'A'),
        (80, 'B'),
        (70, 'C'),
        (60, 'D'),
    ]
    
    analyzed = []
    for grade in grades:
        current = grade.get('current', 0)
        course = grade.get('course', 'Unknown')
        
        # Find which threshold they're near
        for threshold, name in THRESHOLDS:
            if current >= threshold:
                buffer = current - threshold
                if buffer < 1:
                    risk = 'danger'
                elif buffer < 3:
                    risk = 'watch'
                else:
                    risk = 'safe'
                
                analyzed.append({
                    'course': course,
                    'current': current,
                    'threshold': threshold,
                    'thresholdName': name,
                    'buffer': round(buffer, 1),
                    'risk': risk,
                    'nextAssessment': grade.get('nextAssessment'),
                })
                break
        else:
            # Below 60%
            analyzed.append({
                'course': course,
                'current': current,
                'threshold': 60,
                'thresholdName': 'D',
                'buffer': round(current - 60, 1),
                'risk': 'danger',
            })
    
    # Sort by risk (danger first)
    risk_order = {'danger': 0, 'watch': 1, 'safe': 2}
    analyzed.sort(key=lambda x: (risk_order.get(x['risk'], 3), -x['current']))
    
    return analyzed


def format_assignments_for_prompt(assignments: List[Dict], overdue: List[Dict]) -> str:
    """Format assignments into a clean text block for Claude."""
    lines = []
    
    if overdue:
        lines.append(f"⚠️ OVERDUE ({len(overdue)}):")
        for i, a in enumerate(overdue, 1):
            lines.append(f"  {i}. {a.get('title', 'Untitled')} [{a.get('type', 'Task')}]")
            lines.append(f"     Course: {a.get('course', 'Unknown')}")
            lines.append(f"     Was due: {a.get('due', 'unknown')}")
        lines.append("")
    
    if assignments:
        lines.append(f"UPCOMING ({len(assignments)}):")
        for i, a in enumerate(assignments, 1):
            due_info = f"{a.get('day', '')} {a.get('date', '')} {a.get('due', '')}".strip()
            lines.append(f"  {i}. {a.get('title', 'Untitled')} [{a.get('type', 'Task')}]")
            lines.append(f"     Course: {a.get('course', 'Unknown')}")
            if due_info:
                lines.append(f"     Due: {due_info}")
    
    return '\n'.join(lines)


def format_grades_for_prompt(grades: List[Dict]) -> str:
    """Format grade data for Claude."""
    lines = ["CURRENT GRADES:"]
    for g in grades:
        risk_emoji = "🔴" if g['risk'] == 'danger' else "🟡" if g['risk'] == 'watch' else "🟢"
        lines.append(f"  {risk_emoji} {g['course']}: {g['current']}% ({g['buffer']:+.1f}% from {g['thresholdName']})")
        if g.get('nextAssessment'):
            na = g['nextAssessment']
            lines.append(f"     → Next: {na['title']} in {na['dueIn']} (need {na['neededScore']}%)")
    return '\n'.join(lines)


# =============================================================================
# ENDPOINTS
# =============================================================================

@plan_v2_bp.route('/generate-v2', methods=['POST'])
def generate_plan_v2():
    """
    Generate a grade-aware daily plan.
    
    This is the main endpoint that powers the new Today page.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    assignments = data.get('assignments', [])
    overdue = data.get('overdue', [])
    grades = data.get('grades', [])
    name = data.get('name', 'there')
    
    # Analyze grade risks
    grade_analysis = calculate_grade_risk(grades) if grades else []
    
    # Build context
    now = datetime.now()
    today_str = now.strftime('%A, %B %d, %Y')
    
    context_parts = [
        f"Today is {today_str}.",
        f"Student's name: {name}",
        "",
        format_grades_for_prompt(grade_analysis) if grade_analysis else "No grade data available.",
        "",
        format_assignments_for_prompt(assignments, overdue),
    ]
    
    user_message = '\n'.join(context_parts)
    
    try:
        result = call_claude_json(MORNING_BRIEFING_V2, user_message, max_tokens=2048)
        
        # Ensure grade alerts are included
        if 'gradeAlerts' not in result:
            result['gradeAlerts'] = grade_analysis
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Failed to generate plan: {e}'}), 502


@plan_v2_bp.route('/what-do-i-need', methods=['POST'])
def what_do_i_need():
    """
    The killer feature: "What do I need on X to get Y?"
    
    Input:
    - course: Course name
    - currentGrade: Current percentage
    - targetGrade: Target letter grade or percentage
    - assessment: Name of upcoming assessment
    - assessmentWeight: How much it's worth (e.g., 15 for 15%)
    - categoryBreakdown: Optional detailed breakdown
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    required_fields = ['course', 'currentGrade', 'targetGrade', 'assessment', 'assessmentWeight']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Build context
    context = f"""
Course: {data['course']}
Current grade: {data['currentGrade']}%
Target: {data['targetGrade']}
Upcoming assessment: {data['assessment']}
Assessment weight: {data['assessmentWeight']}% of final grade
"""
    
    if data.get('categoryBreakdown'):
        context += f"\nGrade breakdown by category:\n{json.dumps(data['categoryBreakdown'], indent=2)}"
    
    try:
        result = call_claude_json(WHAT_DO_I_NEED_PROMPT, context, max_tokens=1024)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Calculation failed: {e}'}), 502


@plan_v2_bp.route('/week-forecast', methods=['POST'])
def week_forecast():
    """
    7-day academic forecast.
    
    Helps students see the week before it hits them.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    assignments = data.get('assignments', [])
    grades = data.get('grades', [])
    
    grade_analysis = calculate_grade_risk(grades) if grades else []
    
    now = datetime.now()
    context = f"""
Today is {now.strftime('%A, %B %d, %Y')}.

{format_grades_for_prompt(grade_analysis) if grade_analysis else "No grade data."}

{format_assignments_for_prompt(assignments, [])}

Generate a 7-day forecast showing:
1. Which days are "storm" days (multiple deadlines or high-stakes)
2. Which days are "clear" (good for getting ahead)
3. Critical path: when to START preparing for tests/essays
"""
    
    try:
        result = call_claude_json(WEEKLY_FORECAST_PROMPT, context, max_tokens=2048)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Forecast failed: {e}'}), 502


@plan_v2_bp.route('/panic-mode', methods=['POST'])
def panic_mode():
    """
    Emergency triage for "test tomorrow, not ready" situations.
    
    Honest, pragmatic advice about what can realistically be learned.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    test_name = data.get('testName', 'the test')
    hours_until = data.get('hoursUntil', 12)
    topics = data.get('topics', [])
    known_well = data.get('knownWell', [])
    struggling_with = data.get('strugglingWith', [])
    
    context = f"""
SITUATION: Test tomorrow, student is panicking.

Test: {test_name}
Time remaining: {hours_until} hours
Sleep needed: 7-8 hours (so really {max(0, hours_until - 8)} study hours)

Topics on the test:
{json.dumps(topics, indent=2) if topics else "Not specified"}

Student says they know well:
{json.dumps(known_well, indent=2) if known_well else "Not specified"}

Student is struggling with:
{json.dumps(struggling_with, indent=2) if struggling_with else "Not specified"}

Create a realistic triage plan. Be honest about what can and can't be learned in time.
"""
    
    try:
        result = call_claude_json(PANIC_MODE_PROMPT, context, max_tokens=2048)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Triage failed: {e}'}), 502


@plan_v2_bp.route('/grade-impact', methods=['POST'])
def grade_impact():
    """
    Analyze how today's assignments affect grades.
    
    Shows scenarios: ace it, decent, bomb it.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    grades = data.get('grades', [])
    assignments = data.get('assignments', [])
    
    grade_analysis = calculate_grade_risk(grades) if grades else []
    
    context = f"""
{format_grades_for_prompt(grade_analysis)}

Today's assignments:
{format_assignments_for_prompt(assignments, [])}

For each assignment, analyze:
1. How much it affects the final grade
2. What happens if they ace it (95%+)
3. What happens if they do okay (75-85%)
4. What happens if they bomb it (<60%)
5. Is this a make-or-break assignment for their letter grade?
"""
    
    try:
        result = call_claude_json(GRADE_IMPACT_ANALYZER, context, max_tokens=2048)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Analysis failed: {e}'}), 502


@plan_v2_bp.route('/analyze', methods=['POST'])
def analyze():
    """
    Grade Guardian: Analyze assignments + grades to find the single most
    important action. Powers the Grade Guardian dashboard view.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    assignments = data.get('assignments', [])
    overdue = data.get('overdue', [])
    grades = data.get('grades', [])
    target_grades = data.get('targetGrades', {})  # {courseName: targetPct}
    name = data.get('name', 'there')

    # Analyze grade risks using target grades when available
    grade_analysis = calculate_grade_risk_with_targets(grades, target_grades) if grades else []

    now = datetime.now()
    today_str = now.strftime('%A, %B %d, %Y')

    context_parts = [
        f"Today is {today_str}.",
        f"Student's name: {name}",
        "",
    ]

    # Include target grades in the context
    if target_grades:
        context_parts.append("TARGET GRADES:")
        for course_name, target in target_grades.items():
            context_parts.append(f"  {course_name}: {target}%")
        context_parts.append("")

    context_parts.extend([
        format_grades_for_prompt(grade_analysis) if grade_analysis else "No grade data available.",
        "",
        format_assignments_for_prompt(assignments, overdue),
    ])

    user_message = '\n'.join(context_parts)

    try:
        result = call_claude_json(GRADE_GUARDIAN_PROMPT, user_message, max_tokens=2048)

        # Ensure grade alerts are included
        if 'gradeAlerts' not in result:
            result['gradeAlerts'] = grade_analysis

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Failed to analyze: {e}'}), 502


@plan_v2_bp.route('/study-session', methods=['POST'])
def study_session():
    """
    Generate a focused study session for a specific assignment/test.

    If course materials are provided, uses TUTOR_SESSION_PROMPT for deep
    personalized study based on actual course docs. Otherwise falls back
    to the generic STUDY_SESSION_PROMPT.

    If student diagnostic answers are provided, factors those into the plan.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    assignment_name = data.get('assignmentName', '')
    assignment_type = data.get('assignmentType', 'assignment')
    course = data.get('course', '')
    current_grade = data.get('currentGrade')
    target_score = data.get('targetScore')
    available_minutes = data.get('availableMinutes', 120)

    # New: course content from deep scraper
    course_content = data.get('courseContent', '')
    # New: student's self-assessment from diagnostic questions
    student_profile = data.get('studentProfile', {})
    # strong_topics, weak_topics, diagnostic_answers

    if not assignment_name or not course:
        return jsonify({'error': 'Missing assignmentName or course'}), 400

    context_parts = [
        f"Assignment: {assignment_name}",
        f"Type: {assignment_type}",
        f"Course: {course}",
        f"Available time: {available_minutes} minutes",
    ]

    if current_grade is not None:
        context_parts.append(f"Current grade in this class: {current_grade}%")
    if target_score is not None:
        context_parts.append(f"Score they need: {target_score}%")

    topics = data.get('topics', [])
    if topics:
        context_parts.append(f"Topics to cover: {', '.join(topics)}")

    # Add student profile if available
    if student_profile:
        context_parts.append("\nSTUDENT SELF-ASSESSMENT:")
        if student_profile.get('strong_topics'):
            context_parts.append(f"  Confident in: {', '.join(student_profile['strong_topics'])}")
        if student_profile.get('weak_topics'):
            context_parts.append(f"  Struggling with: {', '.join(student_profile['weak_topics'])}")
        if student_profile.get('diagnostic_answers'):
            context_parts.append("  Diagnostic results:")
            for ans in student_profile['diagnostic_answers']:
                topic = ans.get('topic', '')
                correct = ans.get('wasCorrect', False)
                context_parts.append(f"    - {topic}: {'Got it right' if correct else 'Got it wrong'}")

    # Add course content if available (from deep scraper)
    if course_content:
        # Truncate to stay within token limits
        truncated = course_content[:8000]
        context_parts.append(f"\nACTUAL COURSE MATERIALS FROM THEIR LMS:\n{truncated}")

    # Choose prompt based on whether we have course content
    prompt = TUTOR_SESSION_PROMPT if course_content else STUDY_SESSION_PROMPT

    try:
        result = call_claude_json(
            prompt,
            '\n'.join(context_parts),
            max_tokens=4096  # Tutor mode needs more tokens for practice problems
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Failed to generate study session: {e}'}), 502


@plan_v2_bp.route('/study-session/diagnostic', methods=['POST'])
def study_session_diagnostic():
    """
    Generate pre-session diagnostic questions.

    Before starting a study session, ask the student 3-5 quick questions
    to gauge where they stand so the AI can personalize the session.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    assignment_name = data.get('assignmentName', '')
    course = data.get('course', '')
    course_content = data.get('courseContent', '')

    if not assignment_name or not course:
        return jsonify({'error': 'Missing assignmentName or course'}), 400

    context_parts = [
        f"Course: {course}",
        f"Assignment: {assignment_name}",
    ]

    topics = data.get('topics', [])
    if topics:
        context_parts.append(f"Topics covered: {', '.join(topics)}")

    if course_content:
        truncated = course_content[:6000]
        context_parts.append(f"\nCOURSE MATERIALS:\n{truncated}")

    try:
        result = call_claude_json(
            PRE_SESSION_DIAGNOSTIC_PROMPT,
            '\n'.join(context_parts),
            max_tokens=2048
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Failed to generate diagnostic: {e}'}), 502


def calculate_grade_risk_with_targets(grades: List[Dict], target_grades: Dict) -> List[Dict]:
    """
    Like calculate_grade_risk but uses student-defined target grades
    instead of fixed letter-grade thresholds.
    """
    analyzed = []
    for grade in grades:
        current = grade.get('current', 0)
        course = grade.get('course', 'Unknown')

        # Use student's target if available, otherwise find nearest threshold
        target = target_grades.get(course)
        if target is not None:
            target = float(target)
            buffer = current - target
            if buffer < -1:
                risk = 'danger'
            elif buffer < 1:
                risk = 'danger'
            elif buffer < 3:
                risk = 'watch'
            else:
                risk = 'safe'

            # Determine threshold name from target
            if target >= 90:
                threshold_name = 'A'
            elif target >= 80:
                threshold_name = 'B'
            elif target >= 70:
                threshold_name = 'C'
            else:
                threshold_name = 'D'

            analyzed.append({
                'course': course,
                'current': current,
                'threshold': target,
                'thresholdName': threshold_name,
                'buffer': round(buffer, 1),
                'risk': risk,
                'nextAssessment': grade.get('nextAssessment'),
            })
        else:
            # Fall back to standard thresholds
            THRESHOLDS = [(90, 'A'), (80, 'B'), (70, 'C'), (60, 'D')]
            for threshold, name in THRESHOLDS:
                if current >= threshold:
                    buf = current - threshold
                    if buf < 1:
                        r = 'danger'
                    elif buf < 3:
                        r = 'watch'
                    else:
                        r = 'safe'
                    analyzed.append({
                        'course': course,
                        'current': current,
                        'threshold': threshold,
                        'thresholdName': name,
                        'buffer': round(buf, 1),
                        'risk': r,
                        'nextAssessment': grade.get('nextAssessment'),
                    })
                    break
            else:
                analyzed.append({
                    'course': course,
                    'current': current,
                    'threshold': 60,
                    'thresholdName': 'D',
                    'buffer': round(current - 60, 1),
                    'risk': 'danger',
                })

    risk_order = {'danger': 0, 'watch': 1, 'safe': 2}
    analyzed.sort(key=lambda x: (risk_order.get(x['risk'], 3), -x['current']))
    return analyzed


# =============================================================================
# REGISTRATION
# =============================================================================

def register_plan_v2_routes(app):
    """Register the v2 plan routes with the Flask app."""
    app.register_blueprint(plan_v2_bp)


# For standalone testing
if __name__ == '__main__':
    from flask import Flask
    app = Flask(__name__)
    register_plan_v2_routes(app)
    app.run(debug=True, port=5001)
