# server.py — Flask backend for SchoolPilot: AI study plans, work chunking, study guides, sprints, and grades.
import json
import logging
import os
import re
import time
from datetime import datetime
from typing import Any, Optional

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

import anthropic
import resend

from grades import GradeCalculator

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
load_dotenv(_env_path, override=True)

ANTHROPIC_API_KEY: str = os.environ.get('ANTHROPIC_API_KEY', '')
RESEND_API_KEY: str = os.environ.get('RESEND_API_KEY', '')
CLAUDE_MODEL: str = os.environ.get('CLAUDE_MODEL', 'claude-sonnet-4-20250514')

app = Flask(__name__)
CORS(app, origins=[
    r'chrome-extension://*',
    r'http://localhost:*',
    r'http://127.0.0.1:*',
    r'https://*.onrender.com',
    r'https://schoolpilot.co',
    r'https://*.schoolpilot.co',
    r'https://*.vercel.app',
])

logger = logging.getLogger(__name__)

# Warn on missing keys at startup so the developer knows immediately.
if not ANTHROPIC_API_KEY:
    logger.warning('ANTHROPIC_API_KEY is not set — Claude endpoints will fail.')
if not RESEND_API_KEY:
    logger.warning('RESEND_API_KEY is not set — email sending will fail.')

# ---------------------------------------------------------------------------
# Singleton Anthropic client
# ---------------------------------------------------------------------------

_anthropic_client: Optional[anthropic.Anthropic] = None


def get_anthropic_client() -> anthropic.Anthropic:
    """Lazy-init singleton Anthropic client."""
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client


# ---------------------------------------------------------------------------
# DRY Claude helper
# ---------------------------------------------------------------------------

def call_claude(system_prompt: str, user_message: str, max_tokens: int = 1024) -> str:
    """Call Claude and return the text response. Raises on API errors."""
    client = get_anthropic_client()
    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{'role': 'user', 'content': user_message}],
    )
    return message.content[0].text


def call_claude_json(system_prompt: str, user_message: str, max_tokens: int = 1024) -> dict:
    """Call Claude and parse the JSON response."""
    raw = call_claude(system_prompt, user_message, max_tokens)
    return _parse_json_response(raw)


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def validate_str(val: Any, max_len: int, name: str) -> str:
    """Validate and sanitise a string field from request data."""
    if not isinstance(val, str):
        raise ValueError(f'{name} must be a string')
    return val.strip()[:max_len]


def validate_list(val: Any, name: str) -> list:
    """Validate a non-empty list field."""
    if not isinstance(val, list) or len(val) == 0:
        raise ValueError(f'{name} must be a non-empty list')
    return val


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

RATE_LIMIT: int = 10
_rate_store: dict[str, list[float]] = {}
_last_prune: float = time.time()
PRUNE_INTERVAL: float = 3600  # hourly


def check_rate_limit(email: str) -> bool:
    """Return True if the email is within rate limit, False if exceeded."""
    global _last_prune
    now = time.time()
    day_ago = now - 86400

    # Hourly full prune to prevent memory leak from stale keys
    if now - _last_prune > PRUNE_INTERVAL:
        stale = [k for k, v in _rate_store.items() if not v or v[-1] < day_ago]
        for k in stale:
            del _rate_store[k]
        _last_prune = now

    if email not in _rate_store:
        _rate_store[email] = []

    _rate_store[email] = [t for t in _rate_store[email] if t > day_ago]

    if len(_rate_store[email]) >= RATE_LIMIT:
        return False

    _rate_store[email].append(now)
    return True


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

SYSTEM_PROMPT: str = (
    "You are a sharp, no-BS academic planner for a high school student. "
    "You receive their upcoming assignments and create a focused daily action plan.\n\n"
    "Rules:\n"
    "- Today's date context will be provided. Prioritize by urgency (due soonest) "
    "and weight (assessments > assignments > tasks).\n"
    "- Be concise. Use short punchy sentences. No fluff.\n"
    "- Group by day. Bold the most urgent items.\n"
    "- If something is due tomorrow morning, flag it as URGENT.\n"
    "- End with one motivational line that isn't cheesy.\n"
    "- Format for email readability (short paragraphs, clear headers)."
)

CHUNK_PROMPT: str = (
    "Break this assignment into 2-5 actionable study chunks. Each chunk should be:\n"
    "- 15-45 minutes of focused work\n"
    "- Have a clear 'done when' definition\n"
    "- Be specific enough to start immediately\n"
    "Prioritize the hardest/most important chunk for when energy is high.\n\n"
    "Respond ONLY with valid JSON, no markdown, no explanation. Format:\n"
    '{"chunks": [{"step": 1, "task": "...", "minutes": 25, "done_when": "..."}], "total_minutes": 70}'
)

STUDY_GUIDE_PROMPT: str = (
    "Generate a study guide for this unit/course. Rules:\n"
    "- Every concept must cite which assignment or material it came from using [Source: ...]\n"
    "- High-likelihood topics = appeared multiple times or recently emphasized\n"
    "- Be concise. Students skim these.\n"
    "- Include 3-5 practice questions in the style of what they've seen.\n\n"
    "Respond ONLY with valid JSON, no markdown, no explanation. Format:\n"
    '{"unit": "...", "summary": "...", '
    '"key_concepts": [{"concept": "...", "source": "..."}], '
    '"high_likelihood_topics": [{"topic": "...", "reason": "...", "sources": ["..."]}], '
    '"practice_questions": [{"question": "...", "hint": "..."}]}'
)

SPRINT_PROMPT: str = (
    "Create a 7-day sprint study plan for an upcoming test. Rules:\n"
    "- Day 1-5: Learn new topics (1-2 per day based on available hours)\n"
    "- Spaced repetition: review each topic again on +1, +3, and +6 days after first learning\n"
    "- Day 6: Full practice test / comprehensive review\n"
    "- Day 7 (test day or day before): Light review only, confidence building\n"
    "- Each day has clear tasks with time estimates fitting the student's available hours\n"
    "- Mark review sessions distinctly from new learning\n"
    "- If fewer topics than days, spread them out and add more review\n\n"
    "Respond ONLY with valid JSON, no markdown, no explanation. Format:\n"
    '{"test_name": "...", "course": "...", "total_days": 7, '
    '"days": [{"day": 1, "date": "...", "theme": "...", '
    '"tasks": [{"task": "...", "minutes": 30, "type": "learn|review|practice", "topic": "..."}], '
    '"total_minutes": 60}], '
    '"tips": ["...", "..."]}'
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def format_assignments(assignments: list[dict]) -> str:
    """Format assignment dicts into a readable text block for Claude."""
    lines: list[str] = []
    for i, a in enumerate(assignments, 1):
        parts = [f"{i}. {a.get('title', 'Untitled')}"]
        if a.get('type'):
            parts.append(f"   Type: {a['type']}")
        if a.get('course'):
            parts.append(f"   Course: {a['course']}")
        if a.get('due'):
            parts.append(f"   Due: {a['due']}")
        if a.get('date') or a.get('day'):
            parts.append(f"   Date: {a.get('day', '')} {a.get('date', '')}".strip())
        lines.append('\n'.join(parts))
    return '\n\n'.join(lines)


def markdown_to_html(text: str) -> str:
    """Minimal markdown-to-HTML: bold, headers, line breaks."""
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'^### (.+)$', r'<h3>\1</h3>', text, flags=re.MULTILINE)
    text = re.sub(r'^## (.+)$', r'<h2>\1</h2>', text, flags=re.MULTILINE)
    text = re.sub(r'^# (.+)$', r'<h1>\1</h1>', text, flags=re.MULTILINE)
    text = text.replace('\n', '<br>\n')
    return text


def _parse_json_response(raw: str) -> dict:
    """Parse JSON from Claude response, stripping markdown fences if present."""
    raw = raw.strip()
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
        if raw.endswith('```'):
            raw = raw[:-3].strip()
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/process', methods=['POST'])
def process():
    data = request.get_json(silent=True)
    if not data or not isinstance(data.get('assignments'), list) or len(data['assignments']) == 0:
        return jsonify({'error': 'No assignments provided'}), 400

    # Email from request body, fall back to env
    email_to: str = data.get('email', '').strip()
    if not email_to or '@' not in email_to:
        email_to = os.environ.get('EMAIL_TO', '')
    if not email_to:
        return jsonify({'error': 'No email provided'}), 400

    if not check_rate_limit(email_to):
        return jsonify({'error': 'Rate limit exceeded. Max 10 scans per day.'}), 429

    assignments: list[dict] = data['assignments']
    now = datetime.now()
    today_str = now.strftime('%A, %B %d, %Y')

    user_message = (
        f"Today is {today_str}.\n\n"
        f"Here are my upcoming assignments:\n\n"
        f"{format_assignments(assignments)}"
    )

    try:
        plan_text = call_claude(SYSTEM_PROMPT, user_message)
    except Exception as e:
        return jsonify({'error': f'Claude API error: {e}'}), 502

    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            'from': 'SchoolPilot <pilot@schoolpilot.co>',
            'to': [email_to],
            'subject': f'SchoolPilot \u2014 Your Plan for {today_str}',
            'html': markdown_to_html(plan_text),
        })
    except Exception as e:
        return jsonify({'error': f'Email error: {e}'}), 502

    return jsonify({'status': 'sent', 'assignments_count': len(assignments)})


@app.route('/chunk', methods=['POST'])
def chunk():
    data = request.get_json(silent=True)
    if not data or 'assignment' not in data:
        return jsonify({'error': 'No assignment provided'}), 400

    try:
        assignment = data['assignment']
        title = validate_str(assignment.get('title', 'Untitled'), 200, 'title')
        context = validate_str(data.get('context', ''), 500, 'context')
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    parts = [f"Assignment: {title}"]
    if assignment.get('type'):
        parts.append(f"Type: {validate_str(assignment['type'], 100, 'type')}")
    if assignment.get('course'):
        parts.append(f"Course: {validate_str(assignment['course'], 100, 'course')}")
    if assignment.get('due'):
        parts.append(f"Due: {validate_str(assignment['due'], 100, 'due')}")
    if context:
        parts.append(f"Additional context: {context}")

    try:
        return jsonify(call_claude_json(CHUNK_PROMPT, '\n'.join(parts)))
    except (ValueError, KeyError):
        return jsonify({'error': 'Failed to parse AI response'}), 502
    except Exception as e:
        return jsonify({'error': f'Claude API error: {e}'}), 502


@app.route('/study-guide', methods=['POST'])
def study_guide():
    data = request.get_json(silent=True)
    if not data or 'course' not in data:
        return jsonify({'error': 'No course provided'}), 400

    try:
        course = validate_str(data['course'], 100, 'course')
        unit = validate_str(data.get('unit', ''), 200, 'unit')
        notes = validate_str(data.get('notes', ''), 500, 'notes')
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    assignments = data.get('assignments', [])

    parts = [f"Course: {course}"]
    if unit:
        parts.append(f"Unit/Topic: {unit}")
    if assignments:
        parts.append("Assignments and materials covered:")
        for i, a in enumerate(assignments, 1):
            name = a if isinstance(a, str) else a.get('name', a.get('title', 'Unknown'))
            parts.append(f"  {i}. {name}")
    if notes:
        parts.append(f"\nAdditional notes from student: {notes}")

    try:
        return jsonify(call_claude_json(STUDY_GUIDE_PROMPT, '\n'.join(parts), max_tokens=2048))
    except (ValueError, KeyError):
        return jsonify({'error': 'Failed to parse AI response'}), 502
    except Exception as e:
        return jsonify({'error': f'Claude API error: {e}'}), 502


@app.route('/sprint/create', methods=['POST'])
def sprint_create():
    data = request.get_json(silent=True)
    if not data or 'test_name' not in data or 'test_date' not in data:
        return jsonify({'error': 'Missing test_name or test_date'}), 400

    try:
        test_name = validate_str(data['test_name'], 200, 'test_name')
        test_date = validate_str(data['test_date'], 20, 'test_date')
        course = validate_str(data.get('course', ''), 100, 'course')
        topics = validate_list(data.get('topics', []), 'topics')
        topics = [validate_str(t, 200, 'topic') for t in topics]
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    hours_per_day = data.get('available_hours_per_day', 2)
    today_str = datetime.now().strftime('%A, %B %d, %Y')

    parts = [
        f"Test: {test_name}",
        f"Test date: {test_date}",
        *(([f"Course: {course}"] if course else [])),
        f"Today: {today_str}",
        f"Available study hours per day: {hours_per_day}",
        f"Topics to cover ({len(topics)}):",
    ]
    for i, t in enumerate(topics, 1):
        parts.append(f"  {i}. {t}")

    try:
        return jsonify(call_claude_json(SPRINT_PROMPT, '\n'.join(parts), max_tokens=2048))
    except (ValueError, KeyError):
        return jsonify({'error': 'Failed to parse AI response'}), 502
    except Exception as e:
        return jsonify({'error': f'Claude API error: {e}'}), 502


# ---------------------------------------------------------------------------
# Grade engine endpoints
# ---------------------------------------------------------------------------

def _build_calculator(data: dict) -> GradeCalculator:
    """Build a GradeCalculator from request data."""
    return GradeCalculator(
        categories=data['categories'],
        grades=data.get('grades', []),
        policies=data.get('policies'),
    )


@app.route('/grades/calculate', methods=['POST'])
def grades_calculate():
    data = request.get_json(silent=True)
    if not data or 'categories' not in data:
        return jsonify({'error': 'Missing categories'}), 400
    try:
        calc = _build_calculator(data)
        return jsonify(calc.calculate())
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/grades/required', methods=['POST'])
def grades_required():
    data = request.get_json(silent=True)
    if not data or 'categories' not in data or 'target' not in data or 'category' not in data:
        return jsonify({'error': 'Missing categories, target, or category'}), 400
    try:
        calc = _build_calculator(data)
        result = calc.required_score(
            target=data['target'],
            category=data['category'],
            max_score=data.get('max_score', 100),
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/grades/whatif', methods=['POST'])
def grades_whatif():
    data = request.get_json(silent=True)
    if not data or 'categories' not in data or 'hypotheticals' not in data:
        return jsonify({'error': 'Missing categories or hypotheticals'}), 400
    try:
        calc = _build_calculator(data)
        result = calc.what_if(data['hypotheticals'])
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
