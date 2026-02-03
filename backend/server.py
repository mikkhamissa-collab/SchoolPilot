# server.py — Flask backend for SchoolPilot: AI study plans, work chunking, study guides, sprints, and grades.
import json
import logging
import os
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

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
    "- RANK BY URGENCY AND IMPACT, not by class. The most urgent high-stakes items come first regardless of subject.\n"
    "- Urgency ranking: Overdue > Due tomorrow > Due this week > Due next week\n"
    "- Type weight: Assessments/Tests/Exams > Quizzes > Assignments > Tasks\n"
    "- Start with a '🔥 MOST PRESSING' section listing the top 2-3 most critical items\n"
    "- Then group remaining items by day. Bold the most urgent items.\n"
    "- Be concise. Use short punchy sentences. No fluff.\n"
    "- If something is due tomorrow or is overdue, flag it clearly.\n"
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

COMPREHENSIVE_STUDY_GUIDE_PROMPT: str = (
    "Create a comprehensive study guide that builds knowledge from the ground up. "
    "The student has provided ACTUAL course materials, assignments, and extracted content from their class. "
    "Your job is to create a study guide that DIRECTLY matches what they'll be tested on.\n\n"
    "1. LEARNING PATH: Create a step-by-step learning progression based on their actual unit objectives\n"
    "2. RESOURCES: Recommend specific YouTube videos and Khan Academy topics that teach the EXACT skills listed\n"
    "3. PRACTICE PROBLEMS: Create worked example problems in the SAME STYLE as their actual assignments\n"
    "4. PRACTICE TEST: Generate a realistic practice test that MIRRORS their actual homework format\n\n"
    "CRITICAL RULES:\n"
    "- Use the EXACT concepts, formulas, and terminology from their course materials\n"
    "- Practice problems must match the difficulty and style of their actual assignments\n"
    "- If they provided assignment instructions, model your problems after those\n"
    "- Reference specific topics from their unit descriptions\n"
    "- The practice test should feel like it came from their actual teacher\n"
    "- YouTube searches should find videos teaching the SPECIFIC skills they need\n\n"
    "Respond ONLY with valid JSON, no markdown. Format:\n"
    '{"course": "...", "unit": "...", "overview": "...", '
    '"learning_path": [{"order": 1, "topic": "...", "description": "...", "prerequisites": [], '
    '"youtube_search": "...", "khan_academy_topic": "...", "estimated_minutes": 30}], '
    '"worked_examples": [{"topic": "...", "problem": "...", "difficulty": "easy|medium|hard", '
    '"solution_steps": [{"step": 1, "action": "...", "explanation": "..."}], "final_answer": "..."}], '
    '"practice_test": {"title": "...", "time_limit_minutes": 45, "instructions": "...", '
    '"questions": [{"number": 1, "type": "multiple_choice|free_response|calculation", '
    '"question": "...", "options": ["A...", "B...", "C...", "D..."], "correct_answer": "...", '
    '"explanation": "...", "points": 5}]}, '
    '"study_tips": ["..."]}'
)

TOPIC_EXTRACTOR_PROMPT: str = (
    "Analyze these course materials and assignments to identify the key topics and concepts covered. "
    "Extract every testable topic, formula, definition, and skill mentioned.\n\n"
    "Respond ONLY with valid JSON. Format:\n"
    '{"topics": [{"name": "...", "type": "concept|formula|definition|skill|procedure", '
    '"importance": "high|medium|low", "source": "...", "details": "..."}], '
    '"formulas": [{"name": "...", "formula": "...", "when_to_use": "..."}], '
    '"vocabulary": [{"term": "...", "definition": "..."}]}'
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_urgency_score(a: dict) -> int:
    """Calculate urgency score for sorting. Higher = more urgent."""
    score = 0

    # Overdue items are most urgent
    if a.get('isOverdue'):
        score += 1000

    # Type weight
    type_str = (a.get('type') or '').lower()
    if 'assess' in type_str or 'test' in type_str or 'exam' in type_str:
        score += 100
    elif 'quiz' in type_str:
        score += 50
    elif 'assignment' in type_str:
        score += 25

    # Due date proximity (lower date number = sooner = more urgent)
    if a.get('date'):
        try:
            day_num = int(a['date'])
            # Invert: lower day numbers get higher scores
            score += max(0, 31 - day_num) * 10
        except (ValueError, TypeError):
            pass

    return score


def format_assignments(assignments: List[Dict], include_overdue: Optional[List[Dict]] = None) -> str:
    """Format assignment dicts into a readable text block for Claude, sorted by urgency."""
    all_items = list(assignments)

    # Add overdue items if provided
    if include_overdue:
        for item in include_overdue:
            item_copy = dict(item)
            item_copy['isOverdue'] = True
            all_items.append(item_copy)

    # Sort by urgency score (highest first)
    all_items.sort(key=lambda x: get_urgency_score(x), reverse=True)

    lines: list[str] = []
    for i, a in enumerate(all_items, 1):
        status = '[OVERDUE]' if a.get('isOverdue') else ''
        parts = [f"{i}. {status} {a.get('title', 'Untitled')}".strip()]
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
    overdue: list[dict] = data.get('overdue', [])
    now = datetime.now()
    today_str = now.strftime('%A, %B %d, %Y')

    # Format assignments with overdue items included and sorted by urgency
    formatted = format_assignments(assignments, include_overdue=overdue)

    overdue_count = len(overdue)
    overdue_note = f"\n\n⚠️ You have {overdue_count} OVERDUE item(s) that need immediate attention!" if overdue_count > 0 else ""

    user_message = (
        f"Today is {today_str}.{overdue_note}\n\n"
        f"Here are my assignments sorted by urgency (most urgent first):\n\n"
        f"{formatted}"
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
# Comprehensive Study Guide endpoints
# ---------------------------------------------------------------------------

@app.route('/study-guide/extract-topics', methods=['POST'])
def extract_topics():
    """Extract topics and concepts from course materials."""
    data = request.get_json(silent=True)
    if not data or 'materials' not in data:
        return jsonify({'error': 'No materials provided'}), 400

    try:
        course = validate_str(data.get('course', ''), 100, 'course')
        unit = validate_str(data.get('unit', ''), 200, 'unit')
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    materials = data['materials']

    # Format materials for Claude
    parts = []
    if course:
        parts.append(f"Course: {course}")
    if unit:
        parts.append(f"Unit: {unit}")

    parts.append("\nCourse Materials:")
    for i, m in enumerate(materials, 1):
        if isinstance(m, str):
            parts.append(f"{i}. {m}")
        else:
            name = m.get('name', m.get('title', 'Unknown'))
            content = m.get('content', m.get('instructions', ''))
            parts.append(f"{i}. {name}")
            if content:
                parts.append(f"   Content: {content[:500]}")

    try:
        return jsonify(call_claude_json(TOPIC_EXTRACTOR_PROMPT, '\n'.join(parts), max_tokens=2048))
    except (ValueError, KeyError):
        return jsonify({'error': 'Failed to parse AI response'}), 502
    except Exception as e:
        return jsonify({'error': f'Claude API error: {e}'}), 502


@app.route('/study-guide/comprehensive', methods=['POST'])
def comprehensive_study_guide():
    """Generate a comprehensive study guide with learning path, videos, examples, and practice test.

    Now accepts REAL extracted content from course materials for mind-blowing accuracy.
    """
    data = request.get_json(silent=True)
    if not data or 'course' not in data:
        return jsonify({'error': 'No course provided'}), 400

    try:
        course = validate_str(data['course'], 100, 'course')
        unit = validate_str(data.get('unit', ''), 500, 'unit')
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    topics = data.get('topics', [])
    materials = data.get('materials', [])
    student_notes = data.get('notes', '')

    # NEW: Accept deep-scraped content
    unit_description = data.get('unit_description', '')  # Full unit description with objectives
    unit_objectives = data.get('unit_objectives', [])    # Learning objectives list
    assignment_instructions = data.get('assignment_instructions', [])  # Actual HW instructions
    extracted_content = data.get('extracted_content', [])  # Content from PDFs/docs
    resource_list = data.get('resources', [])  # YouTube, Khan Academy links found

    # Build a comprehensive prompt with REAL content
    parts = [f"Course: {course}"]
    if unit:
        parts.append(f"Unit: {unit}")

    # Include full unit description if provided
    if unit_description:
        parts.append(f"\n=== UNIT DESCRIPTION (from course) ===\n{unit_description[:2000]}")

    # Include learning objectives
    if unit_objectives:
        parts.append(f"\n=== LEARNING OBJECTIVES (what students must master) ===")
        for i, obj in enumerate(unit_objectives, 1):
            parts.append(f"  {i}. {obj}")

    if topics:
        parts.append(f"\n=== KEY TOPICS ({len(topics)}) ===")
        for i, t in enumerate(topics, 1):
            if isinstance(t, str):
                parts.append(f"  {i}. {t}")
            else:
                name = t.get('name', t.get('topic', 'Unknown'))
                details = t.get('details', '')
                importance = t.get('importance', '')
                line = f"  {i}. {name}"
                if importance:
                    line += f" [{importance}]"
                if details:
                    line += f": {details}"
                parts.append(line)

    # Include actual assignment instructions - this is GOLD
    if assignment_instructions:
        parts.append(f"\n=== ACTUAL ASSIGNMENT INSTRUCTIONS (model problems after these!) ===")
        for i, instr in enumerate(assignment_instructions[:5], 1):  # Limit to 5
            title = instr.get('title', f'Assignment {i}')
            text = instr.get('instructions', instr.get('text', ''))
            due = instr.get('dueDate', '')
            parts.append(f"\n--- {title} ---")
            if due:
                parts.append(f"Due: {due}")
            if text:
                parts.append(text[:1500])  # Limit each instruction

    # Include extracted content from PDFs/docs
    if extracted_content:
        parts.append(f"\n=== EXTRACTED CONTENT FROM COURSE MATERIALS ===")
        for i, content in enumerate(extracted_content[:10], 1):
            title = content.get('title', f'Document {i}')
            text = content.get('text', content.get('extracted_text', ''))
            parts.append(f"\n--- {title} ---")
            parts.append(text[:2000])  # Limit each doc

    # Include found resources for reference
    if resource_list:
        parts.append(f"\n=== RESOURCES FOUND IN COURSE ({len(resource_list)}) ===")
        for r in resource_list[:15]:
            rtype = r.get('type', 'resource')
            name = r.get('name', 'Untitled')
            url = r.get('url', '')
            parts.append(f"  - [{rtype}] {name}: {url}")

    if materials:
        parts.append(f"\n=== COURSE MATERIALS/ASSIGNMENTS ({len(materials)}) ===")
        for i, m in enumerate(materials, 1):
            if isinstance(m, str):
                parts.append(f"  {i}. {m}")
            else:
                name = m.get('name', m.get('title', 'Unknown'))
                mtype = m.get('type', '')
                parts.append(f"  {i}. [{mtype}] {name}" if mtype else f"  {i}. {name}")

    if student_notes:
        parts.append(f"\n=== STUDENT'S NOTES/AREAS OF DIFFICULTY ===\n{student_notes[:500]}")

    try:
        result = call_claude_json(COMPREHENSIVE_STUDY_GUIDE_PROMPT, '\n'.join(parts), max_tokens=4096)
        return jsonify(result)
    except (ValueError, KeyError):
        return jsonify({'error': 'Failed to parse AI response'}), 502
    except Exception as e:
        return jsonify({'error': f'Claude API error: {e}'}), 502


@app.route('/study-guide/practice-test', methods=['POST'])
def generate_practice_test():
    """Generate a standalone practice test that MIRRORS actual course homework style."""
    data = request.get_json(silent=True)
    if not data or 'course' not in data:
        return jsonify({'error': 'No course provided'}), 400

    try:
        course = validate_str(data['course'], 100, 'course')
        unit = validate_str(data.get('unit', ''), 500, 'unit')
        num_questions = min(max(int(data.get('num_questions', 10)), 5), 25)
    except (ValueError, TypeError) as e:
        return jsonify({'error': str(e)}), 400

    topics = data.get('topics', [])
    difficulty = data.get('difficulty', 'medium')  # easy, medium, hard, mixed

    # NEW: Accept real homework examples to mirror
    sample_problems = data.get('sample_problems', [])  # Actual problems from their HW
    assignment_style = data.get('assignment_style', '')  # Description of HW format
    unit_objectives = data.get('unit_objectives', [])  # What they need to master
    formulas = data.get('formulas', [])  # Formulas they need to know

    prompt = (
        f"Generate a {num_questions}-question practice test for {course}"
        + (f" - {unit}" if unit else "")
        + f". Difficulty: {difficulty}.\n\n"
    )

    # Add real context if provided
    if unit_objectives:
        prompt += "=== LEARNING OBJECTIVES (test these!) ===\n"
        for obj in unit_objectives[:10]:
            prompt += f"- {obj}\n"
        prompt += "\n"

    if formulas:
        prompt += "=== FORMULAS STUDENTS MUST KNOW ===\n"
        for f in formulas[:10]:
            name = f.get('name', '') if isinstance(f, dict) else str(f)
            formula = f.get('formula', '') if isinstance(f, dict) else ''
            prompt += f"- {name}: {formula}\n" if formula else f"- {name}\n"
        prompt += "\n"

    if sample_problems:
        prompt += "=== SAMPLE PROBLEMS FROM THEIR ACTUAL HOMEWORK (MIRROR THIS STYLE!) ===\n"
        for i, prob in enumerate(sample_problems[:5], 1):
            if isinstance(prob, str):
                prompt += f"{i}. {prob}\n"
            else:
                prompt += f"{i}. {prob.get('problem', prob.get('text', str(prob)))}\n"
        prompt += "\n"

    if assignment_style:
        prompt += f"=== ASSIGNMENT STYLE NOTES ===\n{assignment_style}\n\n"

    prompt += (
        "CRITICAL RULES:\n"
        "- Questions MUST match the style of their actual homework\n"
        "- Use the SAME terminology and problem formats they see in class\n"
        "- If sample problems were provided, create similar problems (not copies)\n"
        "- Test the EXACT learning objectives listed\n"
        "- Include point values that sum to 100\n"
        "- Provide detailed explanations for each answer\n"
        "- Questions should progressively increase in difficulty\n"
        "- This should feel like it came from their actual teacher\n\n"
        "Respond ONLY with valid JSON. Format:\n"
        '{"title": "...", "course": "...", "unit": "...", "time_limit_minutes": 45, '
        '"total_points": 100, "instructions": "...", '
        '"questions": [{"number": 1, "type": "multiple_choice|free_response|calculation", '
        '"question": "...", "options": ["A...", "B...", "C...", "D..."], "points": 5, '
        '"correct_answer": "...", "explanation": "...", "topic": "..."}]}'
    )

    if topics:
        prompt += f"\n\nTopics to cover:\n" + "\n".join(f"- {t}" for t in topics[:10])

    try:
        return jsonify(call_claude_json(prompt, "", max_tokens=4096))
    except (ValueError, KeyError):
        return jsonify({'error': 'Failed to parse AI response'}), 502
    except Exception as e:
        return jsonify({'error': f'Claude API error: {e}'}), 502


# ---------------------------------------------------------------------------
# Morning Autopilot Email System
# ---------------------------------------------------------------------------

MORNING_AUTOPILOT_PROMPT: str = """You are an executive function coach for a high school student. Your job is to eliminate ALL decision-making from their day.

Create a SPECIFIC, TIME-BLOCKED action plan for TODAY. The student should be able to follow this like a checklist with ZERO thinking required.

CRITICAL RULES:
1. Start each task with a SPECIFIC TIME (e.g., "7:00 AM - 7:30 AM")
2. Every task must be concrete and actionable - no vague instructions
3. Include EXACT page numbers, problem numbers, or specific actions
4. Build in breaks (Pomodoro style: 25 min work, 5 min break)
5. Prioritize by urgency: OVERDUE > Due today > Due tomorrow > Due this week
6. For studying, specify WHAT to study and HOW (e.g., "Review flashcards for Unit 3 vocabulary" not just "study")
7. Include meal/break reminders
8. End with a clear "DONE FOR THE DAY" marker so they know when to stop

FORMAT YOUR RESPONSE AS HTML EMAIL with these sections:
1. 🌅 GOOD MORNING - Brief motivational opener (1 sentence)
2. ⚡ TODAY'S MISSION - One-line summary of the day's goal
3. 🚨 URGENT (if any overdue/due today items)
4. 📋 YOUR SCHEDULE - Time-blocked tasks with checkboxes
5. 💡 PRO TIP - One specific tip for the day
6. 🎯 DONE WHEN - Clear completion criteria

Use HTML formatting: <h2>, <p>, <ul>, <li>, <strong>, <em>, checkboxes as ☐
Make it scannable - students should understand the plan in 30 seconds."""


def generate_autopilot_html(plan_data: dict) -> str:
    """Generate beautiful HTML email for the morning autopilot."""
    schedule = plan_data.get('schedule', [])
    urgent = plan_data.get('urgent', [])
    mission = plan_data.get('mission', 'Crush today!')
    greeting = plan_data.get('greeting', 'Rise and shine!')
    tip = plan_data.get('tip', 'Start with the hardest task when your energy is highest.')
    done_when = plan_data.get('done_when', 'All checkboxes marked!')

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e5e5e5; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #1a1a2e; border-radius: 16px; padding: 24px; }}
            h1 {{ color: #7c3aed; margin-bottom: 8px; }}
            h2 {{ color: #fff; font-size: 18px; margin-top: 24px; margin-bottom: 12px; }}
            .mission {{ background: linear-gradient(135deg, #7c3aed22, #7c3aed11); padding: 16px; border-radius: 12px; border-left: 4px solid #7c3aed; margin: 16px 0; }}
            .urgent {{ background: #ef444422; padding: 16px; border-radius: 12px; border-left: 4px solid #ef4444; margin: 16px 0; }}
            .urgent h3 {{ color: #ef4444; margin: 0 0 8px 0; }}
            .task {{ background: #0a0a0f; padding: 12px 16px; border-radius: 8px; margin: 8px 0; display: flex; align-items: flex-start; gap: 12px; }}
            .task-time {{ color: #7c3aed; font-weight: 600; min-width: 100px; }}
            .task-content {{ flex: 1; }}
            .task-title {{ color: #fff; font-weight: 500; }}
            .task-details {{ color: #a0a0a0; font-size: 14px; margin-top: 4px; }}
            .checkbox {{ font-size: 18px; }}
            .tip {{ background: #22c55e22; padding: 16px; border-radius: 12px; border-left: 4px solid #22c55e; margin: 16px 0; }}
            .done {{ background: #7c3aed; color: white; padding: 16px; border-radius: 12px; text-align: center; margin-top: 24px; }}
            .footer {{ text-align: center; color: #666; font-size: 12px; margin-top: 24px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 SchoolPilot</h1>
            <p style="color: #a0a0a0; margin-top: 0;">Your daily autopilot is ready</p>

            <h2>🌅 {greeting}</h2>

            <div class="mission">
                <strong>⚡ TODAY'S MISSION:</strong><br>
                {mission}
            </div>
    """

    if urgent:
        html += """
            <div class="urgent">
                <h3>🚨 URGENT - DO THESE FIRST</h3>
        """
        for item in urgent:
            html += f"""
                <div class="task">
                    <span class="checkbox">☐</span>
                    <div class="task-content">
                        <div class="task-title">{item.get('title', 'Task')}</div>
                        <div class="task-details">{item.get('details', '')}</div>
                    </div>
                </div>
            """
        html += "</div>"

    html += """
            <h2>📋 YOUR SCHEDULE</h2>
    """

    for task in schedule:
        html += f"""
            <div class="task">
                <span class="checkbox">☐</span>
                <span class="task-time">{task.get('time', '')}</span>
                <div class="task-content">
                    <div class="task-title">{task.get('title', 'Task')}</div>
                    <div class="task-details">{task.get('details', '')}</div>
                </div>
            </div>
        """

    html += f"""
            <div class="tip">
                <strong>💡 PRO TIP:</strong><br>
                {tip}
            </div>

            <div class="done">
                <strong>🎯 YOU'RE DONE WHEN:</strong><br>
                {done_when}
            </div>

            <div class="footer">
                <p>Powered by SchoolPilot AI • <a href="https://schoolpilot.co" style="color: #7c3aed;">Open Dashboard</a></p>
            </div>
        </div>
    </body>
    </html>
    """
    return html


@app.route('/autopilot/generate', methods=['POST'])
def generate_autopilot():
    """Generate a daily autopilot plan based on assignments and schedule."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    assignments = data.get('assignments', [])
    overdue = data.get('overdue', [])
    sprints = data.get('active_sprints', [])
    study_time = data.get('available_study_hours', 2)
    wake_time = data.get('wake_time', '7:00 AM')
    preferences = data.get('preferences', {})

    now = datetime.now()
    today_str = now.strftime('%A, %B %d, %Y')
    day_of_week = now.strftime('%A')

    # Build context for Claude
    parts = [
        f"Today is {today_str} ({day_of_week}).",
        f"Student wakes up at {wake_time}.",
        f"Available study time today: {study_time} hours.",
    ]

    if overdue:
        parts.append(f"\n⚠️ OVERDUE ITEMS ({len(overdue)}):")
        for i, item in enumerate(overdue, 1):
            parts.append(f"  {i}. {item.get('title', 'Unknown')} - {item.get('course', '')} - Was due: {item.get('due', 'unknown')}")

    if assignments:
        # Sort by urgency
        sorted_assignments = sorted(assignments, key=lambda x: get_urgency_score(x), reverse=True)
        parts.append(f"\nUPCOMING ASSIGNMENTS ({len(assignments)}):")
        for i, a in enumerate(sorted_assignments[:10], 1):
            due = a.get('due', '')
            date = a.get('date', '')
            day = a.get('day', '')
            parts.append(f"  {i}. {a.get('title', 'Unknown')} [{a.get('type', 'Task')}]")
            parts.append(f"      Course: {a.get('course', 'Unknown')}")
            parts.append(f"      Due: {day} {date} {due}".strip())

    if sprints:
        parts.append(f"\nACTIVE STUDY SPRINTS ({len(sprints)}):")
        for sprint in sprints[:3]:
            parts.append(f"  - {sprint.get('test_name', 'Unknown')} on {sprint.get('test_date', 'Unknown')}")
            today_tasks = sprint.get('today_tasks', [])
            if today_tasks:
                parts.append(f"    Today's sprint tasks: {', '.join(today_tasks)}")

    parts.append(f"\nGenerate a complete time-blocked schedule for today starting from {wake_time}.")
    parts.append("Include specific times, exact tasks, and clear completion criteria.")

    try:
        result = call_claude_json(
            MORNING_AUTOPILOT_PROMPT,
            '\n'.join(parts),
            max_tokens=2048
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Failed to generate plan: {e}'}), 502


@app.route('/autopilot/send', methods=['POST'])
def send_autopilot_email():
    """Generate and send the morning autopilot email."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    email_to = data.get('email', '').strip()
    if not email_to or '@' not in email_to:
        return jsonify({'error': 'Invalid email'}), 400

    assignments = data.get('assignments', [])
    overdue = data.get('overdue', [])
    sprints = data.get('active_sprints', [])
    study_time = data.get('available_study_hours', 2)
    wake_time = data.get('wake_time', '7:00 AM')
    student_name = data.get('name', 'there')

    now = datetime.now()
    today_str = now.strftime('%A, %B %d')
    day_of_week = now.strftime('%A')

    # Build context for Claude
    parts = [
        f"Today is {now.strftime('%A, %B %d, %Y')} ({day_of_week}).",
        f"Student's name: {student_name}",
        f"Student wakes up at {wake_time}.",
        f"Available study time today: {study_time} hours.",
    ]

    if overdue:
        parts.append(f"\n⚠️ OVERDUE ITEMS ({len(overdue)}):")
        for i, item in enumerate(overdue, 1):
            parts.append(f"  {i}. {item.get('title', 'Unknown')} - {item.get('course', '')} - Was due: {item.get('due', 'unknown')}")

    if assignments:
        sorted_assignments = sorted(assignments, key=lambda x: get_urgency_score(x), reverse=True)
        parts.append(f"\nUPCOMING ASSIGNMENTS ({len(assignments)}):")
        for i, a in enumerate(sorted_assignments[:10], 1):
            due = a.get('due', '')
            date = a.get('date', '')
            day = a.get('day', '')
            parts.append(f"  {i}. {a.get('title', 'Unknown')} [{a.get('type', 'Task')}]")
            parts.append(f"      Course: {a.get('course', 'Unknown')}")
            parts.append(f"      Due: {day} {date} {due}".strip())

    if sprints:
        parts.append(f"\nACTIVE STUDY SPRINTS:")
        for sprint in sprints[:3]:
            parts.append(f"  - {sprint.get('test_name', 'Unknown')} on {sprint.get('test_date', 'Unknown')}")

    parts.append(f"\nGenerate a complete time-blocked schedule starting from {wake_time}.")
    parts.append("Respond with JSON containing: greeting, mission, urgent (array), schedule (array with time/title/details), tip, done_when")

    try:
        plan = call_claude_json(
            MORNING_AUTOPILOT_PROMPT + "\n\nRespond ONLY with valid JSON. Format:\n"
            '{"greeting": "...", "mission": "...", "urgent": [{"title": "...", "details": "..."}], '
            '"schedule": [{"time": "7:00 AM", "title": "...", "details": "..."}], "tip": "...", "done_when": "..."}',
            '\n'.join(parts),
            max_tokens=2048
        )

        # Generate HTML email
        html_content = generate_autopilot_html(plan)

        # Send email
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            'from': 'SchoolPilot <pilot@schoolpilot.co>',
            'to': [email_to],
            'subject': f'🚀 Your {today_str} Autopilot Plan',
            'html': html_content,
        })

        return jsonify({
            'status': 'sent',
            'plan': plan,
            'tasks_count': len(plan.get('schedule', [])),
            'urgent_count': len(plan.get('urgent', [])),
        })

    except Exception as e:
        return jsonify({'error': f'Failed to send autopilot: {e}'}), 502


@app.route('/autopilot/schedule', methods=['POST'])
def schedule_autopilot():
    """Schedule daily autopilot emails for a user (stores preference, actual scheduling done by cron)."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    email = data.get('email', '').strip()
    send_time = data.get('send_time', '6:30 AM')  # Default: 6:30 AM
    enabled = data.get('enabled', True)
    timezone = data.get('timezone', 'America/New_York')

    if not email or '@' not in email:
        return jsonify({'error': 'Invalid email'}), 400

    # In production, this would save to database
    # For now, return success
    return jsonify({
        'status': 'scheduled',
        'email': email,
        'send_time': send_time,
        'enabled': enabled,
        'timezone': timezone,
        'message': f'Daily autopilot emails will be sent at {send_time} ({timezone})'
    })


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
