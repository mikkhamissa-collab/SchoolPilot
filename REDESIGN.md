# REDESIGN.md — Full Frontend Redesign for SchoolPilot

You are redesigning the entire SchoolPilot frontend. The goal: make it look like a premium product — not a student project, not "vibe coded." Think Linear, Vercel, Raycast. Monochrome + one accent color. No emojis anywhere. Minimalist. Lots of whitespace. Every loading state should feel intentional and polished (pulsing orbs, streaming text, shimmer lines — like ChatGPT/Claude's thinking animations).

## Reference File

Read `landing-page-final.jsx` in the repo root FIRST. This is the approved design direction. Every page must feel like it belongs on the same site as that landing page. Match its tokens, its spacing philosophy, its typography, its animation patterns.

---

## Design Tokens (use these EXACTLY)

Update `web/app/globals.css` to replace the current theme with:

```css
@theme inline {
  --color-bg: #09090b;
  --color-surface: #111113;
  --color-surface-hover: #18181b;
  --color-border: #1e1e22;
  --color-border-light: #27272a;
  --color-accent: #7c3aed;
  --color-accent-light: #a78bfa;
  --color-accent-glow: rgba(124, 58, 237, 0.15);
  --color-text: #fafafa;
  --color-text-secondary: #a1a1aa;
  --color-muted: #71717a;
  --color-dim: #52525b;
  --color-green: #22c55e;
  --color-red: #ef4444;
  --color-amber: #f59e0b;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

Remove all old token names (`--color-bg-dark`, `--color-bg-card`, `--color-bg-hover`, `--color-text-primary`, `--color-text-muted`). Search the entire `web/` directory for any references to old tokens and update them.

---

## Global Rules (apply to EVERY file you touch)

1. **NO EMOJIS.** The current Sidebar.tsx uses emojis for nav icons (🏠📊📖🕐👥⚙️). Replace ALL emojis with clean SVG icons — use simple inline SVGs, no icon library. Every emoji anywhere in the frontend must go.

2. **No excessive color.** Almost everything is grayscale. The only color is `--color-accent` (#7c3aed) used sparingly: active states, primary CTAs, the AI orb, important badges. Green/red/amber only for semantic data (grade up/down, due dates, at-risk alerts).

3. **Typography:** Inter font, tight letter-spacing on headings (`-0.03em` to `-0.04em`), generous line-height on body text (1.5-1.6). Section labels: 11-12px uppercase, `--color-accent` or `--color-muted`, letter-spacing `0.05-0.1em`.

4. **Spacing:** Generous. Don't cram. Use `gap` over margin when possible. Padding on cards: 16-20px. Section gaps: 24-32px.

5. **Borders:** 1px solid `--color-border`. Rounded corners: 8-12px for cards, 6-8px for buttons, 50% for avatars/orbs.

6. **Hover states:** Subtle. Background shifts to `--color-surface-hover`, or border lightens to `--color-border-light`. Never jarring.

7. **Loading/thinking animations:** Every loading state must use one of these patterns:
   - **ThinkingDots:** Three small dots that pulse sequentially (opacity + scale). Used for AI thinking.
   - **ThinkingOrb:** A 28px circle with `linear-gradient(135deg, accent, accent-light)` and a breathing box-shadow animation. Used as the AI avatar.
   - **ShimmerLine:** A horizontal line with a gradient that slides left-to-right. Used as section dividers during load.
   - **StreamingCursor:** A 2px-wide blinking cursor at the end of streaming text. Used in chat.
   - **SkeletonPulse:** Rounded rectangles with a subtle opacity pulse. Used for content placeholders.

   Create a shared `web/components/ui/Loading.tsx` file with all these as named exports.

8. **Transitions:** All state changes animated with `transition: all 0.2-0.3s ease`. Never instant. Never longer than 0.5s.

---

## File-by-File Redesign

### 1. `web/app/globals.css`
- Replace theme tokens (see above)
- Add global keyframes: `pulse3`, `breathe`, `fadeUp`, `slideIn`, `shimmer`, `cursorBlink`, `countUp`
- Keep scrollbar styling but update colors to new tokens
- Keep sync-glow animation but update colors
- Add utility classes: `.text-section-label` (the uppercase accent label pattern), `.card` (surface bg + border + rounded), `.glow-divider` (the animated gradient line)

### 2. `web/app/page.tsx` — Landing Page
- **Replace entirely** with the content from `landing-page-final.jsx`, converted to proper Next.js/TypeScript:
  - Convert to TSX with proper types
  - Replace inline styles with Tailwind classes where possible, keep CSS-in-JS for animations
  - Wire "Get started" buttons to `/auth/login`
  - Wire "See how it works" to smooth-scroll to the chat demo section
  - Keep all interactive elements: LiveChatDemo (typing + thinking + streaming), AnimatedDashboard (scroll-triggered reveal), FeatureBlocks (fade-in on scroll)
  - Import Inter font in `layout.tsx` if not already

### 3. `web/components/Sidebar.tsx` — Left Navigation
- **Remove all emojis.** Replace with clean inline SVGs:
  - Today → simple sun/compass icon
  - Grades → bar chart icon
  - Study → book icon
  - Focus → clock icon
  - Buddy → two-people icon
  - Settings → gear icon
- Keep the collapsed icon-rail layout (w-14)
- Active state: icon gets `--color-accent`, background gets `--color-accent-glow`
- Inactive: `--color-muted` icon, transparent background
- Hover: `--color-surface-hover` background
- The SchoolPilot logo at top: small 22px gradient square (accent → accent-light) with 6px border-radius. No text in collapsed state.
- Sign out button: muted, bottom of sidebar
- Chat toggle button: keep functionality, restyle with new tokens
- User avatar area at bottom: replace emoji/letter avatar with a simple circle, `--color-surface` background, user initial in `--color-muted`

### 4. `web/components/MobileNav.tsx` — Bottom Nav (Mobile)
- Same icon swap (emojis → SVGs)
- Fixed bottom bar, `--color-surface` background, `--color-border` top border
- Active: accent color icon + 2px accent underline
- Clean, minimal, 56px height

### 5. `web/components/ChatSidebar.tsx` — AI Chat Panel
This is the most important component. It must feel like talking to a premium AI.

- **Header:** ThinkingOrb (gradient circle) + "SchoolPilot" text + collapse button. No emojis.
- **Personality picker:** Remove emoji icons (`PERSONALITY_ICONS` currently uses unicode emojis). Replace with simple text labels or small colored dots. Keep it minimal.
- **Quick actions:** Style as pill buttons with `--color-border` borders, `--color-muted` text. On hover: `--color-border-light` border, `--color-text` text.
- **Messages:**
  - User messages: right-aligned, `--color-surface` background (slightly lighter than page), 14px radius with bottom-right corner small (4px)
  - AI messages: left-aligned, no background (just text), with ThinkingOrb as avatar (28px gradient circle). Text color: `--color-text-secondary`.
  - Streaming: show StreamingCursor at end of text while streaming
  - Thinking state: ThinkingOrb with breathing animation + ThinkingDots + dim "Thinking..." text below
- **Input bar:** `--color-bg` background, `--color-border` border, 10px radius. When focused: border transitions to `accent + 40% opacity`. Send button: filled circle, `--color-text` when input has content, `--color-border` when empty.
- **Conversation list:** Clean list with `--color-text` titles, `--color-dim` timestamps. Active conversation: `--color-accent-glow` left border.
- **Tool use action cards:** When AI uses tools (grade calculator, study plan, etc.), show a compact card with `--color-surface` background, `--color-border` border, 8px radius. Icon + tool name in `--color-muted`, result in `--color-text`.

### 6. `web/components/ChatMessage.tsx`
- Restyle to match the chat design above
- Remove any emoji usage
- Tool action cards: compact, monochrome with accent highlights

### 7. `web/app/(dashboard)/layout.tsx` — Dashboard Shell
- Keep the structure (sidebar + main + chat)
- Update background to `--color-bg`
- Keep transition for chat expand/collapse
- Remove the OfflineIndicator emoji if it has one — replace with a simple dot

### 8. `web/app/(dashboard)/today/page.tsx` — Daily Plan / Home
This is the first thing students see after login. It must feel calm and organized, not cluttered.

- **Top section:** Greeting ("Good evening, {name}") in large text (24-28px, -0.03em tracking). Below: last sync time in dim text with green dot if recent.
- **Stat cards row:** Three cards (GPA, Streak, Due This Week) matching the AnimatedDashboard style from the landing page. `--color-bg` background inside `--color-surface` cards. Large number, tiny uppercase label, subtle sub-text.
- **Daily plan section:** Section label ("Your plan for today" — uppercase, accent color, 11px). Plan items as clean rows: time in monospace dim text, task name in text color, priority badge (accent for high, muted for normal). Top priority item gets a subtle accent glow border.
- **Grade alerts:** If any class is near a grade boundary (within 2% of A/B, B/C), show a compact alert: amber badge + class name + current grade + what's needed. `--color-amber` accent.
- **Quick actions:** Row of minimal buttons: "Sync now", "Start focus", "Check grades". Outlined style, subtle.
- **Sync button:** When syncing, show a shimmer animation on the button + ThinkingDots.
- **Remove:** Any confetti, any excessive animations, any emojis in the UI.

### 9. `web/app/(dashboard)/grades/page.tsx` — Grade Tracker
- **Course list:** Clean table-like layout (not actual `<table>`). Each row: course name (left), trend indicator (small +/- icon in green/red), percentage (monospace, right-aligned, colored by threshold: green ≥90, white ≥80, amber <80), letter grade (dim, right).
- **Expandable course detail:** Click a course → slide-down panel showing category breakdown, recent scores, what-if calculator.
- **What-if calculator:** Clean input fields. "What do I need on [assignment] to get [target]?" Minimal form, accent CTA button.
- **Grade logging:** Compact modal. Course dropdown, score input, total input. "Log grade" button.
- **At-risk badge:** Small amber pill on courses near a grade boundary.
- **Loading state:** SkeletonPulse rows (5 rows of varying width).

### 10. `web/app/(dashboard)/study/page.tsx` — Study Tools
- **Course picker:** Horizontal scrolling pills for courses. Active: accent background. Inactive: border outline.
- **Tool grid:** Five options (Study Guide, Flashcards, Quiz, Explain, Summary) as compact cards. Each: icon (simple SVG, no emoji), title, one-line description. On hover: border lightens, subtle lift.
- **Generated content:** Renders inline below the tool grid. Clean typography: headings in text color, body in text-secondary, code blocks in `--color-bg` with mono font.
- **Loading state:** ThinkingOrb + ThinkingDots + "Generating your study guide..." text. The content should stream in (if using SSE) or fade-in section by section.
- **Saved content:** Tab to switch between "Generate" and "Saved". Saved items as a list with title + date + course tag.

### 11. `web/app/(dashboard)/focus/page.tsx` — Focus Timer
- **Timer display:** Large centered number (48-64px, monospace, tight tracking). Below: session type label in dim text.
- **Preset buttons:** Three pills in a row: "25 min", "45 min", "15 min". Plus a custom input. Outlined style. Selected: accent border + accent text.
- **Start button:** Large, centered. `--color-text` background, `--color-bg` text. When running: accent background with subtle pulse.
- **During session:** Timer counts down. Minimal. Background stays dark. Maybe a very subtle radial glow behind the timer using accent-glow.
- **Session history:** Below the timer. "Today's sessions" as a compact list: duration + time + assignment (if linked). Weekly total in a small stat card.
- **Streak display:** Small card showing current streak + longest streak.

### 12. `web/app/(dashboard)/buddy/page.tsx` — Study Buddy
- **No buddy state:** Clean centered layout. "Find a study partner" heading. Email invite input + "Send invite" button (accent).
- **Paired state:** Buddy card showing: buddy name, mutual streak, last activity. "Nudge" button (outlined). Activity feed: simple list of recent activity in dim text.
- **Pending state:** "Waiting for {email} to accept..." with ThinkingDots.

### 13. `web/app/(dashboard)/settings/page.tsx` — Settings
- **Sections:** Stacked with `--color-border` dividers between them. Section labels: uppercase, muted, 11px.
- **Profile:** Name, school, grade, timezone. Clean input fields: `--color-bg` background, `--color-border` border, 8px radius. Focus: accent border.
- **LMS Connection:** Status indicator (green dot = connected, red dot = disconnected). "Reconnect" button if disconnected.
- **Personality:** Four options as radio cards. Selected: accent border. Each: name + one-line description.
- **Email preferences:** Toggle switches (simple, custom — not a library). Accent color when on.
- **Danger zone:** "Delete account" in red text, with confirmation step. Subtle, tucked at the bottom.

### 14. `web/app/auth/login/page.tsx` — Login/Signup
- Centered card on dark background
- SchoolPilot logo (gradient square) + name at top
- Email + password inputs (same style as settings inputs)
- "Log in" / "Sign up" toggle as text tabs at top of card
- Primary button: `--color-text` background, `--color-bg` text, full width
- Error messages: `--color-red` text, subtle
- Below card: "Free for all students" in dim text
- Subtle background glow (radial gradient with accent-glow)

### 15. `web/app/onboarding/page.tsx` — Onboarding Flow
- Multi-step flow with progress indicator (simple dots or thin progress bar at top, accent fill)
- Each step: centered card, clean typography
- **Step 1 (Personality):** Four radio cards for personality presets. Clean descriptions, no emojis. Selected: accent border + accent-glow background.
- **Step 2 (LMS Connect):** Credential input form. Live status as Playwright agent runs: "Logging in..." → "Exploring your courses..." → "Found 6 classes!" Each step shows with a ThinkingDots animation then a green checkmark.
- **Step 3 (Review):** What the agent found: courses listed with teacher names. Student can remove/add.
- **Step 4 (Preferences):** Time preference (morning/afternoon/night as three minimal cards), email toggle, timezone auto-detected.
- **Step 5 (Done):** "You're all set." Big text. "Go to your dashboard" button (accent).
- Transitions between steps: horizontal slide or fade.

### 16. `web/components/Skeleton.tsx`
- Restyle to use `--color-surface` background with subtle opacity pulse animation
- Rounded: 8px
- No shimmer gradient (too flashy) — just gentle opacity pulse

### 17. `web/components/StreakBadge.tsx`
- Remove any emojis (likely has a 🔥)
- Simple display: number + "day streak" text. Maybe a small flame SVG icon if needed, but keep it subtle.

### 18. `web/components/GradeLogModal.tsx`
- Clean modal overlay (dark scrim, centered card)
- `--color-surface` background, `--color-border` border
- Input fields match the global style
- Accent CTA button

### 19. `web/components/ShareCard.tsx` & `web/components/Confetti.tsx`
- ShareCard: restyle to match
- Confetti: **DELETE THIS COMPONENT.** Remove all imports/references. No confetti anywhere.

### 20. `web/components/BuddyWidget.tsx` & `web/components/WeeklyRecapModal.tsx`
- Restyle to match new tokens
- Remove any emojis

### 21. `web/components/OfflineIndicator.tsx`
- Small, fixed banner at top. `--color-surface` background, `--color-amber` left border or dot. "You're offline" in muted text.
- No emojis.

### 22. `web/app/not-found.tsx`
- Clean 404 page. Large "404" in dim text. "Page not found" below. "Go home" link in accent.

### 23. `web/app/privacy/page.tsx`
- Keep content, restyle with new tokens. Clean typography.

---

## New Shared Components to Create

### `web/components/ui/Loading.tsx`
Export: `ThinkingDots`, `ThinkingOrb`, `ShimmerLine`, `StreamingCursor`, `SkeletonPulse`, `SkeletonRow`

### `web/components/ui/Badge.tsx`
Small pill component. Props: `children`, `color` (accent/green/red/amber/muted). Renders as: colored bg at 10% opacity, colored text, 6px radius, 11px font.

### `web/components/ui/Card.tsx`
Props: `children`, `className`, `glow` (boolean, adds accent-glow border). Default: surface bg, border, 12px radius, 16-20px padding.

### `web/components/ui/GlowDivider.tsx`
The animated gradient horizontal line from the landing page. Used between sections.

### `web/components/ui/SectionLabel.tsx`
The uppercase label pattern. Props: `children`. Renders as 11px uppercase, accent color, 0.1em letter spacing.

### `web/components/icons/`
Create a file per icon or one `icons.tsx` barrel file. Simple, clean 20x20 SVGs:
- `SunIcon` (today/home)
- `ChartIcon` (grades)
- `BookIcon` (study)
- `ClockIcon` (focus)
- `UsersIcon` (buddy)
- `GearIcon` (settings)
- `SendIcon` (chat send)
- `ChatIcon` (chat toggle)
- `SyncIcon` (sync/refresh)
- `ChevronIcon` (expand/collapse)
- `PlusIcon` (add)
- `XIcon` (close)
- `CheckIcon` (success)
- `AlertIcon` (warning)
- `TrendUpIcon` / `TrendDownIcon` (grade trends)
- `FlameIcon` (streak — subtle, optional)
- `LogOutIcon` (sign out)

All icons: `currentColor` fill/stroke, 1.5px stroke width, round line caps. No filled icons — all outlined.

---

## Animations to Add to globals.css

```css
@keyframes pulse3 {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.85); }
  40% { opacity: 1; transform: scale(1.15); }
}
@keyframes breathe {
  0%, 100% { box-shadow: 0 0 8px rgba(124, 58, 237, 0.25); }
  50% { box-shadow: 0 0 24px rgba(124, 58, 237, 0.5); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes cursorBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
@keyframes skeletonPulse {
  0%, 100% { opacity: 0.08; }
  50% { opacity: 0.15; }
}
```

---

## What NOT to Do

- Do NOT add any UI component library (no shadcn, no Radix, no MUI, no Chakra)
- Do NOT add any icon library (no lucide, no heroicons, no font-awesome) — hand-write inline SVGs
- Do NOT use gradients excessively — the only gradient is on the AI orb and the logo
- Do NOT use color in unexpected places — when in doubt, use grayscale
- Do NOT add tooltips, popovers, or fancy interactions that aren't essential
- Do NOT use emojis anywhere. Search the entire codebase for emoji unicode ranges and remove them all
- Do NOT change any backend logic, API calls, auth flow, or data fetching — ONLY restyle
- Do NOT break any existing functionality. Every page must still work after the redesign
- Do NOT remove the responsive/mobile-first approach — keep it, just restyle it

---

## Build Order

1. `globals.css` + new tokens + animations
2. `web/components/icons/` (all SVG icons)
3. `web/components/ui/` (Loading, Badge, Card, GlowDivider, SectionLabel)
4. `Sidebar.tsx` + `MobileNav.tsx` (nav overhaul, emoji→SVG)
5. `ChatSidebar.tsx` + `ChatMessage.tsx` (chat redesign — most complex)
6. `web/app/page.tsx` (landing page from landing-page-final.jsx)
7. `web/app/auth/login/page.tsx` (login redesign)
8. `web/app/onboarding/page.tsx` (onboarding redesign)
9. `web/app/(dashboard)/today/page.tsx` (home redesign)
10. `web/app/(dashboard)/grades/page.tsx` (grades redesign)
11. `web/app/(dashboard)/study/page.tsx` (study tools redesign)
12. `web/app/(dashboard)/focus/page.tsx` (focus timer redesign)
13. `web/app/(dashboard)/buddy/page.tsx` (buddy redesign)
14. `web/app/(dashboard)/settings/page.tsx` (settings redesign)
15. `Skeleton.tsx`, `StreakBadge.tsx`, `GradeLogModal.tsx`, `BuddyWidget.tsx`, `WeeklyRecapModal.tsx`, `OfflineIndicator.tsx`, `ErrorBoundary.tsx`
16. Delete `Confetti.tsx`, remove all references
17. `not-found.tsx`, `privacy/page.tsx`
18. Full search for any remaining emojis or old token references — clean up

Build each file completely. No stubs. No TODOs. No "implement later." Every file production-ready.
