# Screenshot A/B tests: Chits

Only the first three frames change between variants. Frames 4–8 stay identical, so any difference can be traced to the opening.

| Variant | Frame 1 | Frame 2 | Frame 3 | Audience |
|---|---|---|---|---|
| **A: Chat-style notes** (control, the exported set) | "Notes that feel like chats" (Chat) | "Turn notes into plans" (Board) | "Stick notes where you'll see them" (Spaces) | People searching "chat notes", "text yourself", "self chat"; quick capturers |
| **B: Notes + Kanban** | "Your notes, your boards" (Board, To do + Doing) | "Capture it like a chat" (Chat) | "Stick notes where you'll see them" (Spaces) | People searching "kanban", "to do list", "planner"; organizers |

To build B, reorder the slides and change the frame 1 and 2 headlines in `source/copy.json`, then run `python3 source/compose.py`.

## App Store: Product Page Optimization
- Up to three treatments against the original; screenshot sets are uploaded per treatment. Apple reviews treatments, so allow review time.
- Split traffic 50/50 between A and B. Run for at least 14 days and until App Store Connect reports a result with high confidence. Don't stop early on a promising trend.
- Read: **conversion rate** (impressions → first-time downloads) by treatment; **product page views**; **first-time downloads**.
- Note: product page optimization reaches people who land on the product page (from search and browse), but search-result tiles show the first 1–3 screenshots, so frame 1 drives most of the effect.

## Google Play: store listing experiments
- Default graphics experiment: phone screenshots, Variant B against the current listing, 50% audience, retained first-time installers as the metric (Google's default).
- Run at least 7 days and until Play Console reports a result at its confidence level (90% default).
- Read: **store listing visitors**, **first-time installers**, **retained installers (1 day)**, and **conversion rate** by traffic source.

## Measurement plan
| Metric | Where | Why |
|---|---|---|
| Search impressions | App Store Connect → Analytics → Sources (App Store Search); Play Console → Acquisition | Checks the metadata changes (the name and subtitle tests are separate from screenshots) |
| Product page views / store listing visitors | Same | Is the search tile attractive enough to open? |
| Product page conversion rate | App Store Connect PPO report; Play experiment report | Main screenshot metric |
| First-time downloads / installers | Same | Volume check |
| Traffic source differences | Search vs Browse vs Referral | Variant A may win in search for "chat notes"; B may win in browse |

Run one test at a time (screenshots *or* metadata), so the result is attributable. No increase is promised: the results decide.
