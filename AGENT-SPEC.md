# SchoolPilot Agent — Technical Spec

## Vision

An AI academic companion — "Claw for school." Not a tool that spits out data, but an assistant that *knows* you as a student, understands your classes, and helps you navigate academics.

Think: personal tutor + executive function support + someone who actually remembers what you told them last week.

---

## Core Principles

1. **Be a companion, not a dashboard.** Students talk to it. It talks back. It has personality.
2. **Understand, don't just scrape.** The agent explores and comprehends — it doesn't blindly parse HTML.
3. **Learn over time.** Every interaction makes it smarter about this specific student.
4. **Personalized > Generic.** "Your physics teacher weights labs heavily and you struggle with circuits" beats "you have 5 assignments due."

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Student Interface                        │
│              (Chat UI — web app or extension)                │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    Agent Core (LLM)                          │
│         - Personality (SOUL.md equivalent)                   │
│         - Conversation handling                              │
│         - Decision making                                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Browser    │ │   Memory     │ │   Planning   │
│    Agent     │ │   System     │ │   Engine     │
│  (Playwright)│ │  (Context)   │ │  (Priority)  │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## Component 1: The Browser Agent

### Purpose
Explore any LMS like a human would. Log in, click around, read pages, extract information.

### Tech Stack
- **Playwright** for browser automation
- **Claude API** for decision-making at each step
- Runs headless (or headed for debugging)

### Agent Loop
```python
while not done:
    # 1. Observe current page
    page_content = get_page_content()  # Screenshot or cleaned HTML
    
    # 2. AI decides what to do
    action = llm.decide(
        page_content=page_content,
        goal="Extract all academic information for this student",
        already_found=extracted_data,
        pages_visited=history
    )
    
    # 3. Execute action
    if action.type == "click":
        await page.click(action.selector)
    elif action.type == "extract":
        extracted_data.append(action.data)
    elif action.type == "done":
        done = True
    
    # 4. Brief pause (don't hammer the server)
    await sleep(1)
```

### What It Extracts
- Courses enrolled
- Assignments (title, due date, description, points/weight)
- Grades (current scores, grade breakdowns)
- Syllabus/course info
- Upcoming events/calendar
- Teacher names + any context

### Auth Handling
- Student provides credentials (stored securely, encrypted at rest)
- Or: browser extension approach where student is already logged in
- Handle session expiry gracefully

---

## Component 2: Memory System

### Purpose
Remember everything about this student. Persist across sessions. Get smarter over time.

### Structure
```
student_data/
├── profile.md           # Who they are, goals, preferences
├── classes/
│   ├── physics.md       # Everything about physics class
│   ├── english.md       # Everything about english class
│   └── ...
├── patterns.md          # Learned behaviors (procrastinates on essays, strong at math)
├── history/
│   └── 2026-02-24.md    # Daily interaction logs
└── extracted/
    └── lms_snapshot.json # Raw LMS data from last sync
```

### profile.md Example
```markdown
# Student Profile

## Basics
- Name: [Student name]
- School: American School in London
- Grade: 11th
- Timezone: Europe/London

## Goals
- Get into a good CS program
- Maintain 3.8+ GPA
- Actually understand physics (not just pass)

## Patterns I've Noticed
- Works best in the morning
- Tends to underestimate essay time
- Strong at math, struggles with memorization-heavy subjects
- Responds well to deadlines, less to "importance"

## Preferences
- Likes direct communication, not hand-holding
- Prefers bullet points over paragraphs
- Wants to be challenged, not just told what to do
```

### classes/physics.md Example
```markdown
# Physics — Mr. Harrison

## Course Info
- Period: 3rd
- Room: S204

## Grading
- Tests: 40%
- Labs: 30%
- Homework: 20%
- Participation: 10%

## Teacher Style
- Strict on deadlines, rarely accepts late work
- Tests are harder than homework suggests
- Gives partial credit generously
- Likes when students ask questions

## Student Context
- Current grade: B+ (87%)
- Weakest area: Circuits and magnetism
- Goal: Get to A- by end of semester

## Notes
- 2026-02-20: Mentioned test format is changing to more conceptual questions
- 2026-02-15: Struggled with lab report — need to show more work
```

---

## Component 3: The Agent's Personality

### SOUL.md (Equivalent)
```markdown
# SchoolPilot Agent — Who You Are

You're an academic companion. Not a tutor who lectures, not an app that sends reminders — a partner who actually gets it.

## Core Traits

**Be real, not corporate.** Talk like a smart friend who happens to have perfect memory. "You've got a physics test Friday and you still haven't touched circuits — that's the part you bombed last time" not "Reminder: Physics assessment scheduled for Friday."

**Push back when needed.** If they're prioritizing wrong, say so. If they're overconfident, challenge it. You're not here to validate, you're here to help them succeed.

**Remember everything.** Reference past conversations. Notice patterns. "You said the same thing before the last English essay and then pulled an all-nighter."

**Be concise.** Students are busy and stressed. Don't write paragraphs when a sentence works.

**Celebrate wins.** Notice when they do well. Acknowledge effort, not just results.

## What You're NOT

- A search engine
- A lecture bot
- A nag
- Their parent

## Example Interactions

❌ "Based on my analysis of your assignment deadlines, I recommend prioritizing the physics lab report."

✅ "Physics lab is due Thursday and it's worth more than that history reading. Start there."

❌ "Great job on completing your homework! Keep up the good work!"

✅ "Nice — you actually started early for once. That physics grade is gonna thank you."
```

---

## Component 4: Onboarding Flow

### Phase 1: LMS Exploration
Agent logs in, explores, extracts everything. Student doesn't need to do anything.

### Phase 2: Context Questions
After extraction, agent asks targeted questions to fill gaps:

**Per-class questions:**
- "How would you describe [Teacher]'s grading style?"
- "What's your goal in this class — just pass, do well, or actually master it?"
- "What's hardest for you in [Subject]?"
- "Anything I should know about how this class works that wouldn't be on the LMS?"

**General questions:**
- "When do you usually do your best work?"
- "What tends to trip you up — forgetting things, underestimating time, motivation?"
- "What's your overall goal this semester?"

### Phase 3: Confirmation
Agent summarizes what it learned, student corrects anything wrong.

"Here's what I've got: You're taking 6 classes, physics is your hardest, you want to keep your GPA above 3.8, and you tend to procrastinate on essays. Sound right?"

---

## Component 5: Ongoing Interaction

### Daily Check-in (Optional)
Agent can proactively reach out:
- "You've got that calc test tomorrow — how's prep going?"
- "Heads up: three things due Friday, nothing due tomorrow. Good time to get ahead."

### On-Demand Chat
Student can ask anything:
- "What should I work on tonight?"
- "How screwed am I if I skip the history reading?"
- "Explain the physics lab requirements"

### Sync Updates
Agent periodically re-explores LMS to catch new assignments, grade updates.

---

## Technical Implementation Notes

### For Claude Code

**Start with:**
1. Playwright browser automation setup
2. Basic agent loop that can navigate Teamie
3. Extraction of assignments into structured JSON

**Then add:**
1. Memory file system (markdown files like above)
2. Onboarding question flow
3. Chat interface (can be CLI first, web later)

**LLM Integration:**
- Use Claude API (Anthropic SDK)
- System prompt = the SOUL.md content
- Include relevant memory files in context for each interaction

**Don't over-engineer initially:**
- File-based storage is fine (no DB needed yet)
- CLI interface is fine for prototype
- Single-user is fine (no auth system needed yet)

### File Structure for Codebase
```
schoolpilot-agent/
├── agent/
│   ├── browser.py      # Playwright automation
│   ├── explorer.py     # LMS exploration logic  
│   ├── extractor.py    # Data extraction
│   └── loop.py         # Main agent loop
├── memory/
│   ├── store.py        # Read/write memory files
│   └── templates/      # Default file templates
├── chat/
│   ├── interface.py    # CLI chat interface
│   └── prompts.py      # System prompts, SOUL
├── data/
│   └── [student files live here]
├── main.py             # Entry point
├── requirements.txt
└── README.md
```

### Key Dependencies
```
playwright
anthropic
python-dotenv
```

---

## MVP Success Criteria

Working prototype that can:
1. ✅ Log into Teamie and navigate around
2. ✅ Extract assignments, grades, course info
3. ✅ Ask onboarding questions and store answers
4. ✅ Chat about academics with memory of context
5. ✅ Give personalized priority recommendations

---

## Future Enhancements (Post-MVP)

- Web UI (chat interface in browser)
- Mobile app
- Calendar integration
- Study session planning
- Practice question generation
- Multi-LMS support (Canvas, Blackboard, Google Classroom)
- Grade prediction ("you need X on the final to get a B+")
- Teacher pattern analysis (automatic detection of grading style)
- Social features (study groups, shared notes)

---

## Open Questions

1. **Chrome extension vs standalone app?** Extension is simpler for auth (student already logged in), standalone is more powerful.

2. **How often to sync LMS?** Daily? On-demand? On each chat?

3. **Pricing model?** Freemium? Subscription? This affects how much LLM usage we can afford per student.

---

*This spec is a living document. Update as we learn.*
