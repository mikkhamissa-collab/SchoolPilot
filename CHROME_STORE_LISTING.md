# Chrome Web Store Listing — SchoolPilot

## Short Description (132 chars max)
AI study assistant for Teamie LMS. Scans your assignments, creates daily plans, tracks grades, and generates study guides.

## Detailed Description
SchoolPilot connects to your Teamie LMS dashboard and uses AI to help you stay on top of your schoolwork.

HOW IT WORKS
1. Go to your Teamie dashboard (lms.asl.org/dash)
2. Click the SchoolPilot extension
3. Hit "Scan & Send" to get an AI-prioritized daily plan emailed to you

FEATURES
- Smart Daily Plans: AI scans your upcoming and overdue assignments, then emails you a prioritized action plan
- Grade Tracker: Enter your grades by weighted category. Calculate "What do I need on the next test?" and run what-if scenarios
- Focus Mode: Break any assignment into timed, actionable chunks with clear "done when" criteria
- AI Study Guides: Generate study guides with key concepts and practice questions for any course or topic
- Sprint Mode: Create 7-day study sprints with spaced repetition for upcoming tests
- Flashcards & Quizzes: AI-generated flashcards, multiple choice quizzes, and concept explanations
- Background Scanning: Optional recurring scans with notifications for new assignments and overdue items
- Grade-Aware Priorities: Factors in your current grades to flag assignments that could push you across grade boundaries

SYNC TO WEB
Sync your assignments to schoolpilot.co for a full dashboard with grade trends, study history, and mastery tracking.

PRIVACY
SchoolPilot reads assignment data from your Teamie dashboard only when you trigger it. Your data is sent to our backend for AI processing and email delivery. We do not sell or share your data. Full privacy policy: https://schoolpilot.co/privacy

## Category
Education

## Language
English

## Permission Justifications

### activeTab
Required to read assignment data from the user's currently open Teamie LMS page. Only activated when the user clicks the extension icon and manually triggers a scan.

### scripting
Required to inject the content script that extracts assignment titles, due dates, and course names from the Teamie LMS dashboard DOM. The script runs only on lms.asl.org when triggered by the user.

### storage
Stores user preferences (email, backend URL), grade data, and study progress locally in Chrome. No sensitive data is stored.

### alarms
Powers the optional background scanning feature. When enabled by the user, it periodically checks for new or overdue assignments on open Teamie tabs.

### notifications
Displays alerts for new assignments, overdue items, and grade-critical priorities when background scanning detects changes.

### Host permission: lms.asl.org
Required to read assignment and grade data from the Teamie LMS platform. This is the only external site the extension accesses for data scraping.

### Host permission: schoolpilot.co
Required for the optional web app sync feature. Users can sync their assignment data to their SchoolPilot web dashboard.

## Screenshots Needed (1280x800 or 640x400)
1. Extension popup showing the Plan tab with "Scan & Send" button
2. Extension popup showing the Grades tab with grade calculation
3. Extension popup showing the Study tab with flashcards or quiz
4. The schoolpilot.co dashboard with assignments and stats
5. A sample daily plan email

## Tile Icon
Already have: extension/icons/icon128.png
