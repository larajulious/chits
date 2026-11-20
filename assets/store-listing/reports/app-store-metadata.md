# Proposed App Store metadata: Chits

**Status: proposal only.** Nothing has been changed in App Store Connect. Character counts were checked by script.

| Field | Limit | Proposed text | Count |
|---|---|---|---|
| App name | 30 | Chits: Chat Notes & Boards | 26 |
| Subtitle | 30 | Sticky notes, plans & to-dos | 28 |
| Keywords | 100 | kanban,planner,checklist,reminder,task,daily,journal,self,message,text,memo,voice,offline,fridge | 96 |
| Promotional text | 170 | Text yourself a thought, then stick it on the Fridge, drop it on a board or add it to today's plan. No account needed, and it works offline. | 140 |

Alternate subtitle to test: **Text yourself. Plan your day.** (29)

Notes
- The keyword field avoids every word already in the name and subtitle, because Apple indexes them together.
- "widget" is left out until the Home Screen widgets pass device QA.
- Promotional text can change without a new app version, so use it for seasonal angles later (for example, "Plan the holidays…").

## Description (1,627 characters, counted by source/validate.py)

Chits is a cozy place for everything on your mind. Write notes the way you text a friend, then turn them into plans when you're ready.

TEXT YOURSELF
Jot down a thought, a list or a voice note in a familiar chat. Each note is a bubble you can come back to, search, hide or organize later. Add photos, videos, PDFs and files right in the conversation.

TURN NOTES INTO PLANS
Move any note onto a board with columns like To do, Doing and Done. Drag cards between columns, add subtasks and set a reminder on the card.

STICK NOTES WHERE YOU'LL SEE THEM
Pin notes to the Fridge, the Desk, the Cork Board or the Wall. Pick sticky notes, lined paper or a receipt, and move them around like the real thing.

PLAN YOUR DAY, THEN WRAP IT UP
Plan My Day helps you choose a few little things for today. In the evening, Wrap Up My Day lets you look back at what got done and what can wait.

REMEMBER WHAT MATTERS
Give any note a date, a time and a reminder. The calendar shows what's coming up this week, and Chits nudges you when it's time.

CHECKLISTS EVERYWHERE
Groceries, packing lists, moving day: tick things off inside a note or a card and see your progress at a glance.

MORE WAYS TO THINK
• Connect related notes so ideas stay together
• Sketch ideas out on a Canvas
• Focus on one note at a time
• Search across everything you've written

PRIVATE BY DESIGN
No account and no sign-in. Chits works offline and keeps your notes on your device. You can back up and restore whenever you like.

Made for iPhone, including the folded and unfolded displays of iPhone Duo.

Chits is the mascot who keeps you company along the way. Say hi!

---
Claims to confirm before you publish:
- "including the folded and unfolded displays of iPhone Duo": the adaptive layout is in the current working tree and was verified on the simulator only. Ship it and check it on a device first.
- "Chits nudges you": relies on notification permission being granted.
