# Chits Spin

Implemented on October 20, 2026. Native device acceptance is still pending.

## Architecture and scope

Spin is an additive Expo Router screen at `/spin`, entered from the existing Cards Focus banner or the Focus header. It adds no bottom tab. The web route follows Focus's existing native-only fallback pattern.

Settings → CHITS → Show Chits Spin controls both the Cards entry/banner and Focus header entry. The preference defaults on and is stored separately as `app_settings.spin_visible` so hiding does not overwrite wheel preferences, estimates or history. An entry appears only with at least one available saved source or saved custom wheel item; built-in New note suggestions alone do not qualify. Eligibility checks use all categories, any duration and high energy so restrictive wheel filters cannot hide access to their controls. Existing availability, completed-checklist, exclusion, snooze and skip rules still apply. Focus session banners remain visible independently of Spin. Entries refresh on navigation focus, source/Focus/Spin changes, foregrounding and once per active minute for cooldown expiry.

The implementation reuses:

- The SQLite provider, exclusive transactions, versioned migrations, and full-database backup/restore.
- `createRevisitRepository` for canonical source availability, checklist counts, Revisit settings, relationships, opens, and optimistic checklist completion.
- `reviewSuggestion` for Revisit inactivity, progress, dismissal, snooze, and review cooldown rules.
- Existing Focus routing, continuity, duration configuration, timer, editor, session repository, and active-session protection.
- `createBoardRepository().organizeMessages` for adding an original thought to a board, and `ConnectedNotes` for established related-note interactions.
- Theme surfaces/actions/chips, localized text and direction, and the original mascot SVG. Its artwork is unchanged.

Chits has no general card completion status or canonical task deadline/priority/estimate fields. Spin never interprets a column name or ordinary note text as unfinished work. Outstanding checklists are actionable work. Cards without checklists are review exercises; saved/pinned ideas can receive creative prompts. An unfinished Focus session can supply a continuation suggestion without inventing task status. Calendar dates influence selection as **planned dates**, separately from reminders; they are not presented as task deadlines.

The Unorganized Notes category includes available chat thoughts outside boards, including recent, unpinned plain notes. Ordinary text is a five-minute review/organizing exercise; actual unfinished checklists remain tasks subject to task estimates. Existing exclusions, hidden/archive rules, snooze and Spin skip cooldowns still apply. This category is enabled when upgrading the former all-selected preferences; deliberately partial/empty selections are preserved, and a category-settings version marker prevents re-enabling a later opt-out.

## Custom wheel

The header mode icon opens a Change wheel menu with From my notes and Custom wheel; the last mode persists locally. Custom mode begins with zero items and never seeds itself from notes or built-in actions. Edit items opens the existing keyboard-aware FormSheet to add, rename or delete choices. Each item keeps a stable ID and insertion order. Deletion and Clear wheel require an inline confirmation within that sheet; cancel/close does not delete anything. Labels allow 1–120 characters and the wheel supports up to 24 items, with actual item text on each segment. Custom labels follow the slice radius, wrap into up to three lines, and use smaller text/fewer lines for crowded wheels. Long labels end with an ellipsis; full labels remain in the accessible wheel description, item list and result. The note-based category wheel keeps its numbered segments. A bounded item legend keeps the main wheel visible.

Custom choices use equal-size random selection ranges, including normal repeat outcomes. The same wheel geometry, reduced-motion behavior, landing tone and celebration settings apply. Results use a compact card with no wheel. Custom spins never create notes, Focus sessions, task completion states or source achievements. Custom items and selected mode use separate app_settings keys (`spin_custom_items`, `spin_mode`), included in full backup/restore without a schema migration. Failed/malformed saves do not replace prior custom choices. Existing note behavior is retained in NoteSpinScreen.

Settings has a direct Chits Spin row for building a custom wheel even when no notes qualify for entry visibility. Saved custom items qualify for the Cards/Focus entry, subject to the Show Chits Spin toggle. Empty, populated and item-editor layouts were visually checked against a separate simulator database; keyboard/touch, full result interactions, dark mode and physical-device acceptance remain pending.

## Selection and interaction

1. Read keyset pages of source metadata, bounded text previews, existing checklist counts, metadata, relationships, Calendar plans, and recent Spin exposure. Source privacy, deleted records, archived records, and archived boards are handled by the existing repository.
2. Filter completed checklists, excluded/snoozed notes, unavailable sources, disabled categories, tasks beyond the selected time budget, and explicitly assigned energy above the chosen level. Unknown task durations remain unestimated and can be excluded. Five-minute mode excludes unestimated tasks and estimates above five minutes.
3. Weight eligible choices using outstanding reminder urgency, user-entered priority, Calendar plans, Revisit eligibility, recent exposure, and skips. A source's multiple category memberships do not create extra lottery tickets. Choose randomly within those weights, avoiding the previous source whenever another source is eligible.
4. Commit the source reference before starting a native-driver wheel animation. Freeze its categories and calculate a five-turn landing angle whose segment center meets the stationary pointer. Numbered segments correspond to full, wrapping category labels below the wheel.
5. Present the original source, board/Space when available, estimate, priority, reminder/Calendar context, and recommendation reason. The Spin action stays visible while configuring choices.

The main picker fits the available viewport with two clear groups: a centered wheel/category legend, followed by a single decision panel. Time and energy use matching selection trays; a divider separates the challenge row, and the primary action anchors that same panel. Preferences are a header action opening the existing bounded FormSheet. The compact mascot stays visible above the wheel. The wheel measures the remaining flex area and stays grouped with its legend. Landscape places the wheel beside the decision panel. Large accessibility text retains bounded internal scrolling, and detailed results also scroll within the viewport. The iPhone 18 Pro simulator was visually checked with the complete default picker visible together.

Results use a semi-compact card with a category/title/source header, one wrapped metadata row, and a grouped reason/prompt panel. Start Focus remains the primary action, with Open Original and Spin Again together below it. Those actions stay outside the scrolling details area. A labelled More Actions menu retains completion/confirmation, skip, board organization, estimate editing, related notes, and adjusting choices; estimate controls open in a bounded sheet, and related notes open the existing Revisit detail instead of expanding the result card. The wheel and its legend are shown only while choosing/spinning; the result screen contains the mascot feedback and result card.

The wheel also includes a Suggestions segment with a New note action, enabled by default even for existing preferences. It remains available without saved sources and uses the same weighted selection and repeat avoidance. Users can disable Suggestions in preferences. Its compact result opens the existing AddNoteSheet: saving uses the canonical message repository, including ordered content and attachments; cancelling creates nothing. Suggested actions never enter source-keyed Spin history or earn source achievements. Their result and ten-minute skip cooldown last for the current screen session.

Source skips apply a ten-minute exclusion, then reduce weight for the rest of a day. Recent selections receive one-fifth their otherwise calculated weight for a day. Overdue outstanding-checklist reminders have a separate visible list, even when category, duration, energy, or challenge filters exclude them from the wheel.

Review/writing prompts are five-minute **exercises**, never inferred estimates of finishing an entire note. Exercise completion requires explicit confirmation and an original-context open. Creative and board exercises also require a source edit or reorganization since selection. Timer expiry never completes a source or Spin activity.

Checklist completion presents the exact remaining-item count and uses the existing optimistic confirmation plan. Original checklist changes and the Spin progress/reward write share one transaction; a failure rolls everything back. It completes the confirmed remaining checklist, rather than silently picking one checkbox.

Focus opens the existing workspace in context and proposes the selected estimate/exercise duration. Existing saved sessions retain their own duration and progress. Starting or resuming a real running session records a verified Focus association; merely viewing its configuration does not earn the Focus achievement. Opening Focus counts as opening the original working context for exercise confirmation.

A native-driver particle burst plays on each successful wheel landing and confirmed completion (including saving a suggested new note). Each event restarts the burst independently of result-card mounting or data refreshes. It is decorative, ignores touches, stays out of the accessibility tree, and stops on background/unmount. Restoring a result does not trigger a burst. The burst renderer was visually checked in an isolated iOS simulator preview; actual landing/completion interactions remain pending native acceptance.

Reduced motion skips rotation, anticipation, and celebration. Optional sound is off by default, uses a bundled short landing tone, and never requires microphone access. Haptics are best effort. Animations/listeners stop on unmount/backgrounding; an interrupted spin settles to its preselected result. Requests are locked while a spin/action is in progress. Candidate calculations never run on animation frames.

## Database and backup

Migration **31** adds:

| Storage | Purpose |
| --- | --- |
| `spin_metadata` | Optional user-entered duration, priority, and required energy, keyed to the original Revisit source |
| `spin_history` | Source/category references, selection/open/skip/confirmed-progress timestamps, challenge flag, and verified Focus session reference |
| `spin_achievements` | Stable achievement identifiers and earned timestamps |
| `app_settings.spin_preferences` | Time, energy, category selection, unestimated inclusion, sound, achievements, and celebrations |

Migration **32** extends the Spin history category constraint for Unorganized Notes. It rebuilds only the source-reference history table, preserving every existing row/ID, the autoincrement sequence, metadata and the organization trigger. Original source content is untouched. Backups from schema 31 upgrade through this migration.

No titles, note bodies, file paths, or checklist copies are stored in Spin tables. Source deletion cascades its metadata/history. Archived/hidden sources remain unavailable. Earned achievements survive later source deletion. A promotion trigger moves Spin references and estimates from a thought to its new card, preserving any preexisting card estimate. Recent history is bounded to 2,000 records; earned achievements persist separately.

Backup validation recognizes the new tables/columns for schema 31; older backups receive the migration. Full backup/restore carries preferences, metadata, references, history, and achievements. The test SQLite adapter now returns Expo's actual `lastInsertRowId` field instead of Node SQLite's differently named field.

Achievements represent selection, a verified Focus start/resume, a confirmed five-minute challenge, an eligible Revisit open, confirmed progress on five distinct sources, or development of three distinct creative sources. Spinning alone cannot earn completion rewards. Achievement tracking and celebration animations have separate switches.

## File inventory

Created:

- `src/app/spin.tsx`, `src/app/spin.native.tsx`
- `src/features/spin/spin-screen.tsx`, `spin-wheel.tsx`, `spin-celebration.tsx`, `spin-entry.tsx`, `unavailable.tsx`
- `src/services/spin-engine.ts`, `src/services/spin-changes.ts`, `src/services/spin-custom.ts`
- `src/db/spin-custom-repository.ts`
- `src/features/spin/note-spin-screen.tsx`, `src/features/spin/custom-spin-screen.tsx`
- `src/features/spin/use-spin-visibility.ts`
- `src/db/spin-schema.ts`, `src/db/spin-repository.ts`
- `assets/sounds/spin-land.wav`
- `tests/spin.test.mjs`, `tests/spin-custom.test.mjs`
- This document

Modified:

- `src/app/_layout.tsx`: register the stack destination.
- `src/features/focus/focus-cards-banner.tsx`: contextual entry using the body theme's icon color.
- `src/features/focus/focus-screen.tsx`: contextual header entry, suggested duration, and verified session association.
- `src/db/migrations.ts`: additive version 31 migration.
- `src/db/revisit-repository.ts`: bounded metadata page; optional transactional completion callback; existing translated untitled fallback.
- `src/services/backup-service.native.ts`: schema-aware Spin table/column validation.
- All 14 catalogs under `src/localization/locales/`: 111 new strings per locale, including dialogue, accessibility, settings, reasons, and achievements.
- `docs/localization-report.json`: regenerated catalog audit.
- `tests/helpers/backup-runtime.mjs`: Expo-compatible SQLite insert result.

## Verification and limits

Automated evidence and remaining manual checks are separate. See the final verification entry below for executed command results.

An iPhone 18 Pro simulator was built and the real `/spin` screen opened. Screenshots verified the existing mascot, custom photo header, source-derived category, theme controls, responsive wheel, and visible primary action. This was a visual smoke check, not a completed spin/touch/VoiceOver/performance acceptance test. Screenshots and build/export outputs are temporary artifacts under `/tmp/chits-spin-*`; they are not added to the repository.

Known limits:

- Native-only feature; web displays the same native-only explanation pattern as Focus.
- The existing all-platform/web export encounters unresolved `@/services/backup-service` from `src/app/backup.native.tsx`. That import and absence of a generic service predate this feature. Separate iOS/Android exports succeeded.
- The existing style-token script reports nine radius violations in `src/app/(tabs)/index.native.tsx` and `src/components/boards/card-list-row.native.tsx`; neither file is changed here.
- No universal card “done” state or task deadline exists in the current model. Spin preserves those boundaries. Metadata uses duration presets in this UI; it does not infer energy or duration from content.
- Creative recommendations use pinned or Revisit-eligible notes and established explicit relationships. They do not upload content, call AI services, infer new semantic relationships, or create source edits automatically.
- Revisit preserves its configured eligibility rules, evaluated against a bounded preview for Spin. This can omit an unpinned note whose meaningful words occur only much later in its body.
- Android hardware, physical iOS, screen reader use, audio/haptic perception, large-library performance, every theme/language, and bundled Release airplane-mode acceptance remain pending. The Debug simulator uses Metro and does not establish airplane-mode acceptance.
- All supported catalogs have translated entries and pass structural auditing; native-speaker review remains necessary.

## Manual QA checklist — pending unless explicitly stated above

Use a disposable test installation/backup with genuine sample source records, including at least two outstanding checklists, a board card/subtasks, a pinned idea, old eligible notes, an explicit relationship, a Space placement, a past reminder, and an unfinished Focus session. Never complete personal tasks just to exercise QA.

1. **Multiple tasks:** Enter through Cards and through Focus. Spin with several eligible sources. Verify the wheel's numbers/legend, pointer landing, actual category, source title, board/Space, estimate, priority, and explanation agree. Verify no extra bottom tab appears and back navigation preserves the original screen.
2. **No eligible work:** Try an empty installation, all-complete lists, and all categories deselected. The empty explanation appears, unavailable categories stay out, and Spin is disabled without claiming a selected task exists. Change filters and confirm recovery.
3. **Available time:** Try 5/15/30/60 minutes and Surprise Me. Give a task a longer estimate, then confirm it disappears under a shorter budget. Toggle unestimated inclusion. Verify no estimate is inferred from long/short note text.
4. **Energy:** Assign low/medium/high required energy in the result metadata controls. Toggle the same chip to clear it. Verify higher assigned energy is excluded under a lower available level, and changing priority/estimate preserves the other metadata.
5. **Repeated spins:** Spin repeatedly, including fast double taps and returning from another screen. Verify only one selection per accepted spin, different sources whenever available, correct one-category behavior, gradual stopping, landing feedback, and no stuck loading state.
6. **Focus:** Start Focus from a result. Confirm the same original item opens and the proposed duration is appropriate. Explicitly start a session; test pause/resume, an unfinished saved session, and an already active different item. Verify existing single-session protection remains. Timer expiry must not check source items or confirm a challenge. Return to Spin and confirm progress only after real work.
7. **Open originals:** Open a thought/checklist in Chat and a card in Card Details. Confirm correct source navigation, visible content, editing behavior, and back navigation. Test titles with long text, emoji, RTL, and no title.
8. **Complete:** Request checklist completion, inspect the exact remaining-item count, and cancel once. Then confirm on disposable data. Reopen Notes/Boards and verify the same canonical checkboxes/subtasks changed, with no duplicated status. Change the source while a plan is pending and confirm stale completion is rejected. Simulate a write failure and verify no partial completion/reward.
9. **Skip:** Skip a result. Confirm the original status stays unchanged, the item is absent for ten minutes, another eligible source can be selected, and weight recovers gradually after cooldown. Restart and verify the skipped result does not reappear as an active result.
10. **Revisit:** Use old eligible notes, recently opened/reviewed notes, snoozes, dismissals, inactive/excluded sources, and disabled Revisit. Confirm eligibility follows existing preferences. Open a Revisit result, return, and explicitly confirm review. Repeated opens/spins must not award completion achievements.
11. **Deletion/archive/privacy:** Select a result, then delete, archive, or hide its source; also archive its board. Return to Spin: source actions must become unavailable safely. Check foreign keys and verify no original note is recreated. Remove a related target and confirm it is not suggested as available.
12. **Light/dark:** Switch both modes before entry and while returning to Spin. Inspect wheel boundaries, pointer, numbers, legend, result surfaces, all button states, and readable contrast. Confirm the Cards Spin icon remains visible on a plain body background.
13. **Custom themes:** Test every Chits style, custom accent, and photo header. Verify mascot artwork is unchanged and both Focus header actions fit. Inspect compact phones, landscape, tablet width, and large text; scroll controls/results as needed while the main Spin action stays reachable.
14. **Languages:** Test `en`, `fil`, `pt-BR`, `es`, `id`, `fr`, `de`, `ja`, `ko`, `it`, `vi`, `hi`, `tr`, and `ar`. Verify no raw keys/English fallbacks, correct parameters, wrapping labels/buttons, readable native scripts, Arabic direction, and matching wheel/legend numbers. Arrange native-speaker copy review.
15. **Platforms/accessibility:** Repeat key flows on physical iOS and Android. Test VoiceOver/TalkBack focus order, selected/disabled controls, result announcement, switch labels, dynamic text, reduced motion, touch targets, optional sound off/on, and haptics where supported. With celebrations off, no completion bounce should play.
16. **Offline/lifecycle:** Use a bundled Release installation in airplane mode. Open originals, spin, edit, skip, use Focus, complete, and restart without network access. Background during acceleration and deceleration, resume, navigate away, and lock/unlock; verify no duplicate selection, orphaned listener, endless animation, or spontaneous task completion.
17. **Persistence/backup/rewards:** Restart after each preference, metadata change, spin, skip, Focus start, and confirmed completion. The latest available result should restore. Make/restore a full backup, including one from before schema 31. Verify source IDs, source data, metadata, preferences, history, and earned achievements. Test all six achievements, repeat actions, and tracking/celebrations disabled.
18. **Existing behavior/integrity:** Compare original note text, structured blocks, attachments, board membership/order, checklist states, Calendar entries, reminders, relationships, Space placement, Focus history, and theme/language settings before/after read-only spins. Add a thought to a board using Spin; verify the original organization workflow runs once, its Spin references/estimate follow the card, connections still work, and no duplicate task or source copy appears.

## Executed verification

- `npm test`: **480 tests passed**.
- Spin suite: **44 tests passed**, including a focused rerun after the final creative-progress guard (pinning alone cannot earn creative completion). Covers real SQLite transactions, Focus start/resume verification, and full backup/restore through the native-service test harness.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run check:localization`: passed for all 14 bundled languages and 111 new keys per language.
- `git diff --check`: passed.
- iOS simulator Debug build: `xcodebuild` for `ios/Chits.xcworkspace`, scheme `Chits`, succeeded with code signing disabled; installed and visually inspected on the booted iPhone 18 Pro.
- Separate `expo export --platform ios` and `--platform android`: passed.
- `expo export --platform all`: failed at the existing web backup-service resolution described above, after iOS/Android bundling.
- `npm run check:style`: failed on the nine existing radius violations described above.

Suggestion acceptance checks: confirm New note can land with or without saved sources; its Add note button opens the existing composer; cancellation preserves all saved data; text, checklist, inline image and attachment submissions each create one canonical note; saving shows confirmation; Suggestions can be disabled and survives a preferences reload. These touch interactions remain pending native acceptance.

Visibility acceptance checks (native interactions pending): Settings defaults on with no stored value; no-source installs hide both entries; creating the first eligible chat note reveals them; toggling off hides both while preserving an active Focus banner; returning from Settings applies the choice; re-enabling restores entries; restart and backup/restore retain opt-out; filters that temporarily yield no choices do not hide entry access; cooldown expiry refreshes while foregrounded.
