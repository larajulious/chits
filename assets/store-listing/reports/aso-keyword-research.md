# Chits: ASO research and keyword opportunities

Prepared 18 November 2026. This is qualitative research. No keyword tool (Apple Search Ads popularity, AppTweak, Sensor Tower and so on) was available, so **search volume and difficulty are not given as numbers anywhere in this report**. Where a column asks for them, it says what the evidence actually is.

## 1. What Chits really does (verified in the code and on simulator captures)

| Feature | Status | Evidence |
|---|---|---|
| Chat-style capture: text, checklists, voice notes, photos, videos, files and PDFs as bubbles | Shipped | `src/app/(tabs)/chat.native.tsx`; captured on iPhone 17 Pro Max |
| Boards: columns, cards, drag between columns, subtasks, reminders on cards | Shipped | `src/app/board/[id].native.tsx`; cross-column drag tested on the iPhone Duo simulator |
| Spaces (Fridge, Desk, Cork Board, Wall) with sticky, lined and receipt paper | Shipped | `src/app/(tabs)/spaces.native.tsx`, `space_placements` |
| Plan My Day and the evening Wrap Up | Shipped | `src/features/plan/*`; "Wrap Up My Day" captured |
| Calendar with timed entries and reminders | Shipped | `src/app/(tabs)/calendar.native.tsx`, `calendar_entries`, `message_reminders` |
| Checklists in notes and cards | Shipped | note `content_json` checklist blocks, `card_subtasks` |
| Connected notes | Shipped | `note_relationships` |
| Canvas / whiteboard | Shipped | `src/app/canvas*.tsx` |
| Offline, no account | Shipped | local SQLite, no `fetch` or sign-in anywhere in `src/` |
| Home Screen widgets (Anywhere, Plan, Sticky) | **Needs confirmation** | Present in code; memory notes say the iOS widgets haven't had device QA. Not used in any screenshot or headline. |
| iPhone Duo layouts (docked side panel, multi-column boards) | Shipped in the working tree | Added 18 Nov 2026; verified on the iPhone Duo simulator only |

## 2. Competitive landscape (listings read on 18 Nov 2026)

**Direct "chat with yourself" note apps.** Most are small, with few ratings.
- **Hey Me – Chat Notes**: chat bubbles in themed conversations; "Message your own brain…". 1 rating.
- **tetrify: Text Yourself**, subtitle "Self Chat for To-Dos, Notes": chat Spaces for notes, tasks, journal and habits; local and offline; ADHD-friendly positioning. 60 ratings, 4.8.
- **Chat Yourself: Self Chat**, subtitle "Journal, Notes & Brainstorming": topic chats, Face ID lock, iCloud sync. Contains ads.
- Others found but not read in full: Note Yourself – Remind Self, MessMe – Chat to Yourself, SelfChatNote, Introvert Chat, JustMe, Chat Note.

**Sticky-note and widget apps**: Sticky Notes: Colour Widgets, StickMe (cork-board look), WeeNote, Sticky Notes Simple Reminders (cork board). They lead with "Sticky Notes" and "Widgets".

**Personal kanban and planner apps**: Strider: Personal Kanban Board, Kanba, SimpleKanban, Tovo – Kanban, Tasks & Planner, Daily Planner: No Subs. Offline-first and "no account" claims are common.

**Category leaders (for patterns only)**:
- Google Keep – Notes and lists ("Notes and lists"), 29K ratings
- Trello: Daily Task Tracker ("Track & Manage To Do Lists"), 7.1K ratings
- Todoist: To Do List & Calendar ("Task manager & Reminders"), 131K ratings and an Editors' Choice badge

**Patterns observed**
- Titles take the form "Brand: keyword phrase" or "Brand – keyword phrase".
- Subtitles are short lists of use cases joined with commas or "&".
- The self-chat apps open on the messaging metaphor ("Text yourself", "Message your own brain").
- Privacy and offline appear in the self-chat and kanban niches, not at the category leaders.

## 3. Where Chits can stand out

1. **Chat capture that becomes structure.** The self-chat apps stop at the chat. Chits turns a chat note into a card on a board, a sticky on a Space, a calendar entry or a task for today. None of the chat apps above advertise boards.
2. **A warm, physical, playful look.** Sticky, lined and receipt papers, four Spaces and the Chits mascot. Kanban and planner apps look like SaaS tools.
3. **Offline with no account.** This is table stakes in the niche, so it belongs in the sequence, but it shouldn't lead.

## 4. Keyword opportunity matrix

How to read it:
- **Relevance:** how closely the term matches verified Chits features.
- **Competition and volume:** what the listings above show. No numbers are invented.
- **Confidence:** how sure I am the term is both searched and relevant, judged from how often it appears in competitor titles and subtitles.

| Keyword | Intent | Relevance | Competition (qualitative) | Volume evidence | Placement | Confidence | Source |
|---|---|---|---|---|---|---|---|
| chat notes | Wants notes in a messaging style | Very high | Moderate: used by Hey Me and others | Used in competitor titles; no volume data | App name | High | Hey Me, Chat Notes listings |
| notes | Generic note-taking | High | Very high: Apple Notes, Keep | Category head term; no volume data | App name ("Notes") | Medium (hard to rank for) | Keep, category |
| boards / kanban | Visual task boards | High | Moderate: kanban niche apps, Trello | Used in kanban titles; no volume data | Name ("Boards"), keyword "kanban" | High | Strider, Kanba, Trello |
| sticky notes | Colourful paper notes, often widgets | High (Spaces) | High: many widget apps | Many titles lead with it | Subtitle | Medium-high | Sticky Notes: Colour Widgets, StickMe |
| text yourself / message yourself | Wants to send notes to self | Very high | Moderate: tetrify, Chat Yourself | In competitor titles | Keywords ("self", "message") | High | tetrify, Chat Yourself |
| self chat | Same as above | Very high | Moderate | In competitor titles and subtitles | Keywords ("self"; "chat" is already in the name) | High | tetrify, Chat Yourself |
| to do list / todo | Task lists | Medium-high | Very high: Todoist, Trello | In leader titles | Subtitle ("to-dos"), keyword "todo" | Medium | Todoist, Trello |
| daily planner / plan my day | Plans the day | High | High | In planner titles | Keywords "planner", "daily" | Medium | Daily Planner, Tovo |
| checklist | Lists to tick | High | High | Common in descriptions | Keyword | Medium | Keep, Trello |
| reminders | Time-based nudges | High | High: Todoist subtitle | In leader subtitle | Keyword "reminder" | Medium | Todoist |
| calendar | Dated notes | Medium | Very high | In leader title | Keyword | Low-medium | Todoist |
| journal | Reflective writing | Medium (Wrap Up, chat) | Moderate | In the Chat Yourself subtitle | Keyword | Medium | Chat Yourself |
| offline notes | Privacy, no internet | High | Moderate | Common claim in the niche | Keyword "offline"; description | Medium | Kanba, tetrify, Daily Planner |
| voice notes | Audio memos | Medium-high | High (recorder apps) | Keep advertises audio | Keyword "voice"; description | Medium | Google Keep |
| fridge / cork board | Physical-board metaphor | High, unique | Low | StickMe and Simple Reminders use "cork board" | Keyword "fridge"; description | Low-medium | StickMe, Simple Reminders |
| widget | Home Screen notes | **Unverified feature** | High | Many titles | Hold until the widgets pass device QA | — | Sticky widget listings |
| ADHD | Focus aids | Not claimed by Chits | — | Used by tetrify | Do not use: Chits makes no such claim | — | tetrify |

## 5. Recommendations

- Keep **"Chat Notes"** and **"Boards"** in the name. Together they say what Chits is and pair the niche term with the structure no chat competitor offers.
- Use the subtitle for **sticky notes** and **plans/to-dos**. These are high-intent terms that the name doesn't cover.
- Put the self-chat vocabulary (**self, message, text**) and planner terms in the keyword field.
- Don't repeat words across the name, subtitle and keywords. Apple indexes them together.
- Measure before changing more: after release, check Search Ads popularity and impressions by search term in App Store Connect Analytics.

Sources: [App Store Connect screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en), [Hey Me – Chat Notes](https://apps.apple.com/app/id6749673618), [tetrify](https://apps.apple.com/app/id6447967703), [Chat Yourself](https://apps.apple.com/us/app/-/id6744992569), [Google Keep](https://apps.apple.com/us/app/google-keep-notes-and-lists/id1029207872), [Trello](https://apps.apple.com/us/app/trello-manage-team-projects/id461504587), [Todoist](https://apps.apple.com/us/app/todoist-to-do-list-planner/id572688855), [Sticky Notes: Colour Widgets](https://apps.apple.com/app/id1598768378), [StickMe](https://apps.apple.com/us/app/stickme-sticky-notes-widget/id608937293), [Strider](https://apps.apple.com/CA/app/id6763117980), [Kanba](https://apps.apple.com/app/id6499422529), [iMore on iMessage-style notes](https://www.imore.com/note-taking-app-works-imessage-and-it-might-be-genius).
