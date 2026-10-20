# Chits Focus

Focus is an additive workspace for the original Chat note or board card. It adds no bottom tab, content database, linking system, or mascot assets.

## Audited integration points

| Area | Existing source reused |
| --- | --- |
| Appearance, system mode, typography, surfaces and controls | `theme-provider.tsx`, `constants/theme.ts`, `style-tokens.ts`, `ui/app-text.tsx`, `ui/primitives.tsx`, `ui/surface.tsx`, Revisit action controls |
| Editing, lists, images, undo and serialization | `notes/note-blocks-editor.tsx`, `note-content.ts`, `note-lists.ts`, `createMessageRepository().updateContent()` |
| Original note and card identity | `card/edit-content.native.tsx`, `card/[id].native.tsx`, Cards and Chat action menus; template-created notes use the same records |
| Tasks and relationships | `CardSubtasks`, `ConnectedNotes`, `createRevisitRepository()`; Revisit shows saved continuity references |
| Mascot | The approved `chits-mascot-animated.svg`, rendered as a still image without a WebView or repeating motion |
| Navigation and sheets | Root Expo Router stack, `AppHeader`, `FormSheet`, existing keyboard and safe-area conventions |
| Storage and recovery | SQLite exclusive transactions, versioned migrations, portable backup validation and private restore preparation |
| Notifications | Existing local-only notification adapter, permission flow and Android reminder channel; a separate Focus notification type and deterministic session identifier |
| Localization and accessibility | All 14 bundled catalogs, locale-aware text layout, existing accessible controls and reduced-motion-aware transitions |

Expo SDK 57 reference, SQLite, image and notifications documentation were read before implementation. No dependencies or native configuration were added.

## User flows

- Open a saved note/card and choose **Focus**, or use its Cards/Chat action menu. An editor with unsaved changes first needs its normal save.
- Configure 15, 25, 45, 60 or 1–720 custom minutes, or choose untimed work. The preference controls the initial selection.
- During Focus, use the actual note editor, images, lists and checklist controls. A multi-message card provides document selectors. Original card subtasks and other media are available in sheets. Related Notes expands using existing relationships.
- Save explicitly, or use Finish/Exit, which saves the draft through the existing note repository. A failed save keeps the workspace open. Reloading a changed source asks before discarding edits; an explicit recovery action can save the draft and its images as a new Chat note.
- Quick Capture appends a plain paragraph to the selected original note, or creates a Chat thought. It does not change the timer. Cancel retains the capture input until it is saved or the workspace closes.
- At the timer deadline, Focus records completion and stops counting. It leaves the editor mounted and editable, including unsaved text and staged images. No checklist is automatically completed.
- Exit before completion leaves an unfinished session. A later note/Revisit card offers explicit resume and dismissal. Opening a card never starts a new timer. A running session already restored after process termination remains the same session.
- Cards shows a compact banner above the filters for the running/paused session, or the latest visible unfinished session when continuity suggestions are enabled. It displays the source title, state and timer and opens that exact saved session without resuming it. Completed/dismissed sessions disappear; hidden unfinished sources are skipped and hidden active sources use a generic unavailable label. The existing Cards list/filter/sticky-heading layout is unchanged.
- History and settings are available from Focus and the existing Settings screen. History shows all-time totals, top 20 notes and paginated recent sessions; hidden/deleted note titles are resolved as unavailable.

## Session and timer contract

Migration 29 adds only `focus_sessions`, indexes and an organization-reference trigger. Preferences use `app_settings.focus_preferences`. The session stores a note key and timing/status fields, without a title, note body, file, or checklist snapshot. Deleting a note preserves its historical timing record. Organizing a Chat note into a card transfers the reference.

A partial unique index enforces one running/paused session globally. Serialized transactions make repeated Start taps idempotent. Resume checks source availability and another active session before writing. Dismissal persists; older unfinished sessions do not resurface after a newer completed session.

`advanceFocus()` projects elapsed time from persisted checkpoints. Only the small timer component renders every second; the editor does not subscribe to that tick. A root coordinator checkpoints at foreground/background transitions and every 15 foreground seconds, and pauses its own work during backup/restore. Timed sessions count background elapsed time up to their planned duration; paused intervals count separately. Foreground wall-clock changes are checked against a monotonic anchor. After suspension/relaunch, wall timestamps are authoritative; a negative or more-than-24-hour gap pauses conservatively rather than inventing focused time. Small wall-clock changes across process termination cannot be distinguished from real elapsed time.

Notifications default off. Permission is requested only when the user explicitly enables completion notifications. One generic local notification contains no note title or content. Pause, Finish, Exit and preference changes reconcile the schedule. Focus remains usable without permission. OS delivery timing is not guaranteed by the application.

Backups include and validate the new table. Restoring converts running/paused sessions to unfinished using their saved counters and requires explicit resume. It does not count the time since backup creation or automatically restart notification schedules.

## Verification

- `tests/focus.test.mjs`: timestamp accounting, deadlines, pause/resume, monotonic clock correction, process reopening, duplicate starts, competing notes, unavailable/hidden sources, write rollback, continuity dismissal, organization references, stale-edit protection, Quick Capture with image/checklist preservation, schema-28 migration and backup round trip/validation. Cards banner checks cover active-session priority, paused/unfinished sessions, continuity preferences, dismissal, completion, hidden-source privacy and reads that do not resume a timer.
- `tests/focus-notifications.test.mjs`: deterministic notification scheduling, pause/resume/expiry, denied permission, explicit permission requests and notification routing isolation. These use a mocked OS adapter; they do not establish device delivery.
- `tests/focus-timer-view.test.mjs`: runs the actual timer component through Expo Babel with React Compiler enabled, then exercises its compiled hooks/cache across consecutive countdown ticks, pause/resume, foreground catch-up and untimed ticks. This catches a display freeze that pure timer-accounting tests cannot detect: the compiler could cache a clock read when the ticking state was unused. The timer now projects directly from its sampled clock state.
- Verification passed: TypeScript, ESLint, localization audit (14 languages), and all 427 tests (24 Focus-specific). Earlier iOS/Android Metro exports passed before the subsequent UI refinements. The countdown display correction additionally has a compiler-enabled component regression test. These are distinct checks, not a substitute for native acceptance.
- iPhone 18 Pro / iOS 27 simulator: setup and active workspace rendered with a separate QA note and seeded session; the one-minute session reached exactly 60,000 focused milliseconds. Completion retained the editor. Light/dark rendering and accessibility-medium text were inspected. Dark text inheritance was corrected. Temporary fixture records and appearance/text-size changes are removed/restored after QA.

Physical iOS/Android acceptance still needs touch/keyboard checks (including IME, image picking and Quick Capture), VoiceOver/TalkBack, hardware back, actual notification delivery and permission-denial flows, background/termination tests on both platforms, and an on-device backup/restore round trip. Exports, Node tests and seeded simulator screenshots do not establish those results. Native-speaker review remains appropriate for the new translations.
