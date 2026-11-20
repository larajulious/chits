# Chits store screenshots: copy, design and rationale

## Positioning

| Direction | Search relevance | Differentiation | Benefit clarity | Storytelling | Verdict |
|---|---|---|---|---|---|
| A. Notes that feel like conversations | High ("chat notes", "text yourself") | Medium: several small self-chat apps | Very clear in one glance | Strong first frame | **Primary** |
| B. Notes, boards and daily plans in one place | Medium-high (notes, kanban, planner) | High: no self-chat app offers boards | Clear but broader | Needs 2 frames | **Alternate to test** |
| C. A more personal, visual way to organize | Low: few people search for it | High (look and feel) | Vague | Good as a mood | Use as the visual tone, not the message |
| D. Sticky notes and kanban for everyday life | High in two separate niches | Medium | Clear | Splits attention | Use in frames 2–3 |

**Primary: A, leading into B.** Frame 1 says what Chits is (chat-style notes). Frames 2–3 show what the chat apps don't have: boards and physical Spaces. Frames 4–8 cover depth (planning, checklists, reminders, media, privacy). The visual tone comes from C: warm paper and a desk.

## Design system

- **Type:** Fredoka SemiBold for headlines (the app's own display face), Nunito for the eyebrow and supporting line. Headlines run two lines, left-aligned on a shared margin. Eyebrows are small spaced capitals in a darker shade of the slide colour.
- **Colour:** each slide takes one of Chits' own colours: desk beige `#EADFCB`, sticky yellow `#FBE47E`, blue `#CFE6F7`, orange `#FFD6AE`, green `#D2F0C4`, pink `#FFC7CC`, paper white `#FBFAF6`, and ink `#2B2620` for the closing frame. A faint dot grid repeats the desk dots inside the app.
- **UI first:** every phone screen is an unedited simulator capture with a 9:41 status bar and full signal and battery. Screens get rounded corners and a soft shadow, but no device frame (Google discourages them). Captures run off the bottom edge so the UI reads large at thumbnail size.
- **Variation with cohesion:** single screens (1, 4, 6, 8), tilted pairs (2, 3), a cropped close-up (5) and a crop plus overlay (7). The margins, type scale and shadow stay the same throughout.
- **Mascot:** Chits appears where the app shows it (the Plan, Pick a Space and Notes heroes). No extra mascot art is added on top.
- **iPhone Duo inner display:** each slide pairs the real unfolded capture (the side panel docked, two board columns) with the real folded capture of the same screen. The message, folded or open, is the same notes.
- **Google Play:** headline only (no eyebrow or supporting line), kept under 20% of the image, with the UI at full width.

## The sequence

| # | File | Eyebrow / headline / line | Audience and problem | Real UI | Composition | Why here |
|---|---|---|---|---|---|---|
| 01 | main-value | Chat-style notes · "Notes that feel like chats" · Text yourself a thought. Sort it out later. | People who text themselves or lose thoughts in Notes | Chat timeline: a checklist, a reminder bell, a voice note, a PDF | Single large screen on desk beige | It says what Chits is in one look, using the term people search for |
| 02 | kanban-boards | Boards · "Turn notes into plans" · Cards, columns and checklists you can drag around. | People whose notes turn into to-dos | "Apartment Move" board, To do and Doing columns, subtask progress, a card reminder | Two tilted screens on yellow | The thing chat apps lack; turns a "notes" app into a "plans" app |
| 03 | spaces | Spaces · "Stick notes where you'll see them" · On the Fridge, Desk, Cork Board or Wall. | Visual thinkers and sticky-note users | Pick a Space with all four Spaces; the Fridge with five notes on three paper styles | Two tilted screens on blue | Unique and memorable; reaches the sticky-notes searchers |
| 04 | plan-my-day | Plan My Day · "Plan your day, then wrap it up" · A few little things. One evening check-in. | People who are overwhelmed by long to-do lists | Today's plan, 2 of 4 done, "Wrap Up My Day" | Single screen on orange | Daily habit, and a reason to open the app every day |
| 05 | checklists | Checklists · "Tick off the little things" · Checklists live right inside your notes and cards. | List makers (groceries, packing) | Notes grid with live checklist progress | Cropped close-up on green | Shows everyday usefulness |
| 06 | calendar | Calendar & reminders · "Remember what matters" · Give any note a date, a time and a nudge. | Forgetful planners | Month view with dated notes and today's entries | Single screen on pink | Reminders are a top search intent at the category leaders |
| 07 | rich-notes | Voice notes & files · "More than just text" · Voice notes, photos, videos and PDFs. | People who capture by voice or keep files | Voice note and PDF bubbles; the PDF open in Chits' viewer | Crop plus overlay on paper white | Answers "can it hold my stuff?" |
| 08 | offline | Private by design · "No account. Works offline." · Your notes are saved right on your iPhone. | Privacy-minded people | Notes on the free board | Single screen on ink | Common in the niche, a reassuring close and the strongest contrast frame |

## Claims checked against the app

- Voice notes, photos, videos and PDFs: the attachment types are photo, video, audio and file, plus an in-app PDF viewer. Photos and videos are claimed in the copy but not shown, because there are no licensed sample photos. Add a real photo of your own to slide 7 if you want them visible.
- "No account. Works offline.": there are no network calls and no sign-in; storage is local SQLite.
- "Drag around": card drag between columns was tested on the Duo simulator.
- Not claimed anywhere: Home Screen widgets (not yet verified on a device), sync, collaboration, AI, ratings and awards.
