# Chits Revisit

## Availability

Revisit is enabled in iOS and Android development and production builds. No
`EXPO_PUBLIC_CHITS_REVISIT_ENABLED` environment variable is needed. The shared
`CHITS_REVISIT_ENABLED` constant in `src/constants/revisit.ts` is always true,
so the drawer entry, native route and Connected Notes sections are available
in release bundles too. Open **Notes → menu → Revisit**.

Within Revisit, the **Revisit suggestions** switch stops discovery while keeping
browsing, manual links, and existing connections available. **Manage excluded
notes** lets you include a note again. These preferences persist without deleting
notes, attachments, state, or relationships. No fake data is inserted into the app
database. Web has a neutral mobile-only fallback because its provider does not
open SQLite.

This enables the existing phases 1–4. Phase 5 remains deferred. The enablement
requires no schema migration or native configuration change; the existing
migration 27 and stored data are retained. Production bundling checks do not
replace the remaining device acceptance steps below.

## Production enablement verification

The production gate was removed at the user's request. All 22 Revisit tests,
TypeScript and changed-file ESLint pass. Android and iOS production exports pass
with `EXPO_PUBLIC_CHITS_REVISIT_ENABLED` unset. Generated minified bundles export
the enabled constant as true and contain the native Revisit route, drawer entry
and Connected Notes components. This verification covers JS release bundling;
it does not claim a signed APK/AAB, iOS Archive, or physical release-device test.

## Phase delivery

| Phase | Status | Delivered | Validation and remaining work |
| --- | --- | --- | --- |
| 1 — Architecture and data safety | Implemented | Audited both note identities, both checklist stores, existing archive behavior and portable snapshot backup. Added migration 27, repository, canonical relationships, transactional decisions and completion. | Real old-schema upgrades, idempotency, atomic rollback, deletion and portable round trips tested. Native interrupted restore remains a manual acceptance step. |
| 2 — Revisit MVP | Implemented | Three-note session, explainable ranking, unfinished work, cooldowns, snoozes, dismissal penalties, exclusion, preferences, original-note navigation and confirmed completion. | Unit/integration coverage; overview/empty states inspected on iOS simulator and Android emulator. Populated suggestion gestures still need device acceptance. |
| 3 — Related Notes MVP | Implemented | Local inverted retrieval and confidence scoring, rejected-pair persistence, manual linking, removal, categories, note-specific suggestions, Connected Notes in card details and an entry in the thought editor. | Canonical-pair, feedback, organization transfer, hidden/archive and deletion tests. Full native linking/removal acceptance remains manual. |
| 4 — Comparison | Implemented | Stacked original previews, creation/update times, explicit more-recent label, shared terms, relationship status and original-note actions. Connection-to-connection navigation replaces the preview screen to bound cycles. | Typecheck/bundling verified; populated comparison visually inspected on iOS. Comparison actions, hardware back and unsaved editor guards need manual acceptance. |
| 5 — Advanced features | Deferred | No merging, semantic models, cloud processing or new notifications. | A merge would need a separate structured-content preview, selected-block identity mapping and recovery design. |

## Files delivered

- `src/db/revisit-schema.ts` — schema, indexes, backfill and mutation triggers.
- `src/db/migrations.ts` — additive migration 27.
- `src/db/revisit-repository.ts` — paged retrieval, safe metadata writes, links, preferences and explicit completion.
- `src/services/revisit-engine.ts` — pure eligibility, tokenization, scoring and bounded candidate retrieval.
- `src/services/revisit-service.ts` — caching, cooperative processing, invalidation and per-note connection lookup.
- `src/constants/revisit.ts` — shared availability constant, enabled for production.
- `src/app/revisit.native.tsx` — overview, browse/link picker, connected-note management and comparison.
- `src/features/revisit/revisit-components.tsx` — shared presentation built from the same collection `NoteCard` used by Notes → Cards: board-tinted paper, readable note ink, metadata, progress, compact controls and secondary action menus.
- `src/app/revisit.tsx`, `src/features/revisit/unavailable.tsx` — gated/web fallback.
- `src/components/notes/connected-notes.native.tsx` — detail/editor integration.
- `src/components/navigation/app-drawer.tsx`, `src/components/navigation/app-drawer.native.tsx` — entry in both shared and native drawers; no new bottom tab.
- `src/app/card/[id].native.tsx`, `src/app/card/edit-content.native.tsx` — small Connected Notes insertion, preserving the existing editor and handlers.
- `src/services/backup-service.native.ts` — schema-aware validation and private snapshot cleanup.
- `tests/revisit.test.mjs` — isolated recommendation, SQLite, completion, backup and workload tests.
- `tests/calendar-data.test.mjs` — replace an incomplete schema-21 placeholder fixture with an actual schema-21 database for forward migration tests.
- `docs/revisit.md` — architecture, delivery status and manual acceptance instructions.

Other pre-existing modified/untracked files in the checkout belong to the earlier work and were preserved. No dependency additions, commits or data resets were needed.

## Actual data contract

The Revisit overview, browser/link picker, connected-note previews and comparison reuse the Notes → Cards collection surface, typography scale and 12-point grid spacing. Browse/link grids use two columns, falling back to one below 350 points or at a text scale of 1.3 and above. Review actions such as snooze, completion, archive, dismissal and inactive state are available in the note's ellipsis menu; possible connections expose Link/Compare with Not related in their menu. Board name and accent come from the existing board record for display only. Browse and link pickers reuse the shared `SearchField` from the main Search and Attachments screens, including its pill shape, icons, typography, colors and clear action. This UI alignment introduces no migration, stored content changes or ranking changes.

A note is either an unorganized `messages` row (`thought:<id>`) or an active board card (`card:<id>`). An organized thought is represented by its containing card, avoiding duplicate suggestions for the same content. A card aggregates its active, visible linked thoughts plus its `card_subtasks` rows. Plain text that looks like a checklist never becomes a task. `messages.content_json` keeps inline formatting, image references and checklist states; no recommendation rewrites it.

Archived/deleted thoughts, archived cards/boards and any card containing a hidden thought are excluded from discovery and previews. Missing or archived connected targets remain removable through an unavailable-note row; the target's content is not exposed. Attachments are not decoded or used for matching.

### Migration 27

| Table | Meaning and integrity |
| --- | --- |
| `revisit_notes` | Canonical key plus exactly one unique message/card FK with `ON DELETE CASCADE`; last meaningful edit/progress/open/revisit timestamps, snooze, dismissal count/time and exclusion. Canonical key shape enforced by a CHECK. |
| `note_relationships` | Ordered `note_a < note_b` pair is the primary key. Both ends cascade. Type is `related`, `follow-up` or `reference`. A second index serves lookups from either end. Categories describe an undirected connection. |
| `revisit_rejections` | Same ordered pair and cascading FKs; rejection timestamp. Removing a link also rejects the pair to avoid immediately suggesting it again. Manual relinking clears rejection. |
| `revisit_events` | Cascading note FK, action and timestamp. At most the latest 50 events per note; cumulative dismissal count is retained separately. |
| `revisit_revision` | One counter invalidates disposable caches after relevant writes. No note content is copied here. |

Existing rows initialize edit/progress from saved timestamps and existing card `last_opened_at`. Historical progress/open events cannot be reconstructed. New triggers distinguish content/checklist changes from pinning and opening; add/remove/text/state/order changes in saved checklists affect progress. Card subtasks and membership changes also invalidate progress. Organizing a thought promotes its explicit connections, rejected pairs and review decisions to the card. Review history remains attached to its original thought. Card-level relationships cascade if the card is permanently deleted; automatic distribution back to individual thoughts when detaching a multi-thought card is not attempted.

Schema creation uses `IF NOT EXISTS`/`INSERT OR IGNORE`. The existing exclusive migration transaction advances `user_version` only on success. Timestamps use Unix milliseconds. No source table is replaced or cleared. Hard deletion cascades metadata; soft-deleting a thought removes its registry entry and connected metadata. Archiving retains metadata for recovery.

### Backup and restore

Chits already snapshots the entire SQLite database, so all new tables and the `app_settings.revisit_preferences` value travel in the existing portable archive. Backup format remains version 2; database schema advances to 27. Validation requires the new tables/columns for schema 27 and verifies relationship references and pair ordering. Broken optional metadata is repaired only in private export/preparation snapshots. The live database is not repaired by backup validation.

Older backups migrate before activation. Existing checksum/staging/safety-copy/journal/remount behavior stays in place, so relationship data is activated together with the rest of the snapshot, rather than imported row by row. No app-level merge or duplicate relationship import is introduced.

## Recommendation rules

All weights and matching limits live in `REVISIT_DEFAULTS`.

### Worth revisiting and unfinished work

- Default minimum inactivity is 14 days; the UI offers 7, 14 or 30 days and the repository validates 1–365 days.
- A recent open or explicit revisit suppresses both categories for 14 days. Opening does not change checklist progress.
- Snoozed/excluded notes and notes with any pending future reminder are suppressed. This deliberately conservative rule avoids competing with an existing reminder; Revisit schedules no notifications.
- Dismissal suppresses for 90 days multiplied by the dismissal count, then reduces ranking by 12 points per dismissal.
- Age contributes 0.25 points per day, capped at 180 days. Unfinished work adds 8, a pin adds 5, and an overdue reminder adds 3. Nonpositive scores are omitted.
- Forgotten-note eligibility also requires at least four distinctive body terms or a pin; age alone is insufficient. A note containing an entirely completed checklist is omitted from forgotten-work suggestions.
- Still in Progress reads actual saved completed/total states across both checklist stores. It waits for inactivity in both meaningful content and progress. Counts include saved blank checkbox items, matching the editor.
- The overview admits at most three note suggestions across the first two sections in a session, plus at most three possible connections. Decisions remove cards without continuously filling the same session with new ones; **Start another review** starts a new session. Session slots are ephemeral; decisions persist.

**Revisit/Continue** records a revisit and opens the original, with `autoFocus=0` for thoughts. **Remind later** hides in-app suggestions for 1, 7 or 30 days. **Archive** uses the existing archive repository and confirmation. **Not relevant** records feedback without touching note content. **Mark inactive** excludes a plan and leaves all checkboxes untouched.

**Mark done** first builds a versioned completion plan from every participating saved checklist. The dialog names the note and exact remaining-item count. The write transaction rechecks the original serialized content and subtask versions/counts; stale, hidden or archived targets fail without changes. Only recognized saved unchecked items are marked complete. Unknown fields, list formatting, original words, IDs and attachment references are retained. Items can be unchecked in the original note afterward.

### Possible connections

NFKC normalization, Unicode letter/number tokenization, casing and stopword removal discard generic terms such as “update”, “notes” and “important”. CJK text uses adjacent character pairs. This is lexical matching and does not claim semantic understanding.

An inverted posting index retrieves candidates before scoring. Singleton terms never consume the shared-term candidate budget. Postings above 120 notes are skipped; each source considers at most 16 retrieval terms and 80 candidates. Similarity uses inverse-frequency weighted cosine (0.65), distinctive title overlap (0.35) and at most 0.04 for board context. Board membership alone cannot pass. At least three distinctive shared terms, or two distinctive title terms, are required. Default confidence threshold is 0.58. Explanation cards show the actual shared terms. Existing links and rejected pairs are filtered out. Per-note discovery uses the same engine focused on the selected note rather than only the overview's top three pairs.

False negatives are preferable to weak matches. Common topics in a very repetitive library and relationships expressed with different vocabulary may not be suggested; manual linking stays available. Shared tags are not implemented because Chits has no tag data model. No automatic linking, merging, cloud inference or sharing occurs.

### FTS and processing

The exact [Expo 57 SQLite reference](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/) was consulted before code changes. Runtime capability is probed with `sqlite_compileoption_used('ENABLE_FTS5')` and exposed as `report.fts5Supported`. Candidate matching deliberately uses the compatible in-memory inverted index on either build, avoiding a second persisted full-text copy or a mandatory native rebuild.

Processing runs on feature entry/focus or debounced changes, not in render. SQLite pages use keyset ordering (100 notes/page). Checklist counts run in SQLite; only bounded text previews and count summaries cross the bridge. Matching reads at most the first 12,000 characters per note and 512 distinct terms. There are yields between pages/index chunks/scoring chunks. Existing token sets are reused when text/title are unchanged. Revision plus minute-bucket caches invalidate on content, membership, privacy, archive, reminder, feedback and preference changes; snoozes age out within a minute. Focus-specific results are cached too. A revision change during calculation prevents publishing the stale report. A failed/interrupted calculation writes no recommendation state and can be retried.

Cold processing still walks the active note collection on feature entry after invalidation; it is not a persistent background incremental index. Unchanged tokenization and warm results are cached, but large-library native frame-time/memory measurements remain necessary before enabling production. Browse/link lists are virtualized; the connected-detail list initially shows 20 links with explicit pagination. Normal Notes rendering does not invoke the recommendation scan; it runs on Revisit entry/focus.

## Validation

Run:

```sh
node --test tests/revisit.test.mjs tests/calendar-data.test.mjs tests/backup-restore.test.mjs tests/note-checklists.test.mjs
npx tsc --noEmit
npm run lint
```

Tests use temporary SQLite databases and temporary media storage, isolated from app data. Coverage includes eligibility and ranking boundaries; snooze/dismissal persistence; canonical, rejected and deleted pairs; hidden/archive exclusion; real schema-26 upgrade and schema-21 forward migration; ordered inline checklists and card subtasks; malformed content; explicit completion and stale-plan/fault rollback; organization; restart; portable backup/restore; empty, image-only, Unicode and long notes; cache invalidation and interrupted calculations.

Desktop Node SQLite measurements on the development machine were approximately 19 ms / 143 ms / 689 ms cold for 100 / 1,000 / 5,000 notes, including cooperative yields, with cached reads about 0.02 ms. These are workload checks, not Android/iOS timing or frame-rate claims. Synthetic data is created only by tests.

iOS 27 simulator (iPhone 18 Pro) and Android 13 emulator both opened the development-gated Revisit overview; screenshots were inspected for header, toggle, actions and all three empty states. The iOS browser loaded existing notes and a real inline checklist preview correctly showed 1 of 2 completed, 50 percent and 1 remaining. Android browsing showed its empty state and hardware Back returned to Revisit. A populated iOS comparison showed both original previews, dates, relationship status, shared-term state and the correctly labeled more-recent update. No sample content was added to either app database. These observations do not verify populated suggestion interactions, screen-reader behavior, physical-device performance, native backup restoration or release builds.

Production iOS and Android JS/Hermes exports, TypeScript, full Expo lint and focused ESLint passed. The focused Revisit/calendar/backup/checklist run passed 55/55 cases, including all 22 new Revisit cases. The full suite completed with 273 passing / 275 tests. The two failures are existing source-shape assertions: `Card details edit controls follow the board accent` (`tests/detach-card.test.mjs`) and `the root layout only gains the onboarding layer, after every existing screen` (`tests/onboarding-first-run.test.mjs`). Their expected editor markup/root Calendar registration differs from the pre-existing working-tree changes; those screens were not rewritten to satisfy stale regex assertions. All Revisit cases passed. Rerun after unrelated ongoing layout work is settled.

## Manual Android/iOS acceptance

1. Build each native app with no Revisit environment variable. Verify the drawer entry, Revisit route and Connected Notes sections in release mode, plus original Notes/Chat/Boards/Cards/Calendar/Spaces/Attachments behavior. Turn Revisit suggestions off and confirm browsing/manual connections remain available while automatic suggestions disappear and stored data remains.
2. Use real existing notes. Recent notes may correctly produce empty states. For exhaustive scenarios use a separate disposable simulator/emulator installation, never seed sample notes into personal storage.
3. Open Revisit and change the inactivity preference. Inspect reasons, real progress counts and the three-note session limit. Revisit an eligible note and return; it should disappear without opening the keyboard. Restart and verify it stays reviewed.
4. Snooze, dismiss twice, archive and restore different eligible notes. Confirm the note body/media/state stays unchanged, the snooze survives restart, and a pending future reminder prevents resurfacing. Check expiry using a disposable test installation with controlled dates.
5. Edit/toggle/add/remove/reorder inline tasks and card subtasks, then return. Verify counts and inactivity reset. Cancel Mark done, then confirm it for a disposable checklist: check the exact affected count, preserved images/formatting and ability to uncheck. Change the source between preview/confirmation and verify rejection.
6. Browse notes, open Connections, manually link another note, change its type and compare. Check both dates, shared terms and the recent-update label. Use Open/Back through A → B → A; connected previews should replace one another rather than build a cycle. Leave an unsaved editor and verify the existing discard guard still works.
7. Reject a suggested pair, restart, and verify it stays absent. Remove a manual link, confirm neither note is deleted, and manually relink it. Exclude/include a note; disable/enable suggestions with links still present.
8. Hide or archive a source/board, or delete a linked note. Confirm no hidden text appears, missing targets are safe, and permanent deletion leaves no orphan metadata. Organize an already connected thought and verify its connection follows the card.
9. Create a portable backup after making links/snoozes/rejections/preferences; restore on a disposable installation and verify them together with attachment bytes and checklist states. Restore an older backup. Exercise failed/interrupted restore using existing recovery tests and a disposable install.
10. Test VoiceOver/TalkBack, largest system text, dark/light and existing Chits themes, Reduced Motion, keyboard focus and hardware back. Check every new action is reachable and progress is spoken as text. Capture real frame times/memory at 100/1,000/5,000 notes, including huge checklists and many connections, before release.

## Requirement status

| Brief requirement | Status | Qualification |
| --- | --- | --- |
| 1. Expert roles and quality standards | Partially implemented | Product/data/privacy/accessibility standards applied; independent design review, physical QA and complete accessibility acceptance remain outstanding. |
| 2–3. Simple discovery layer and three capabilities | Implemented | Passive local overview plus original-note continuity and explicit connections. |
| 4. Worth Revisiting | Implemented | Configurable deterministic rules, review/snooze/archive/dismissal, session limit. Relevance is a heuristic, not inferred truth. |
| 5. Still in Progress | Implemented | Both saved checklist types, progress tracking, future reminder/exclusion rules, explicitly confirmed completion. |
| 6. Related-note discovery | Implemented | Distinctive lexical evidence, confidence threshold, durable rejected pairs, canonical identities. No tag/semantic data is invented. |
| 7. Connected Notes | Implemented | Manual links/types/removal, card detail preview, thought editor entry, bounded preview traversal. Multi-thought detach does not redistribute card relationships automatically. |
| 8. Comparison | Implemented | Stacked dates, previews, shared terms, status and explicit recent-update label; no correctness declaration. |
| 9. Merge | Deferred | Structured-content recovery/selection has not been designed or implemented. |
| 10. UI integration | Implemented | Drawer entry, three sections, detail/editor access and existing theme primitives. Full native visual acceptance remains manual. |
| 11. SQLite architecture | Implemented | Additive migration, FK cleanup, canonical unique pairs, transactions, indexes and documented timestamps. |
| 12. Local search and engine | Partially implemented | FTS capability probe and compatible bounded inverted retrieval, cached tokenization and cooperative work; cold refresh still enumerates active notes. |
| 13. Privacy and user control | Implemented | On-device matching, no analytics/text transmission, explicit mutations, switch and exclusion management. |
| 14. Backup/restore | Implemented | Full-snapshot inclusion, schema-aware validation, legacy migration and isolated round-trip/fault tests; native acceptance outstanding. |
| 15. Performance | Partially implemented | Measured desktop workloads, bounded previews/candidates and caches; physical native stress/memory/frame-time benchmarks outstanding. |
| 16. Automated and native QA | Partially implemented | Automated coverage plus native overview smoke checks; populated native interactions and full regression acceptance outstanding. |
| 17. Accessibility | Partially implemented | Text progress, labels, wrapping/dynamic text and 48-point actions; no new custom animation; full screen-reader/large-text acceptance outstanding. |
| 18. Phase sequence | Implemented | Data layer first, then Revisit, connections and comparison. Advanced work deferred. |
| 19. Availability and user control | Implemented | Production enabled at the user's request; actual local records and persistent suggestions preference. The former development-only gate is removed. |
| 20. Handoff | Implemented | Per-phase status, files, schema, rules, UI, performance, tests, manual instructions and limitations documented here. |

Next: finish populated native/accessibility acceptance, measure real mobile frame times/memory, resolve unrelated baseline test assertions, and review recommendation relevance with a real library during release acceptance. Success can be evaluated from the existing local review events (reviewed/snoozed/dismissed) and explicit linked/rejected pairs; no analytics collection was added.
