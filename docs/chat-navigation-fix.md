# Chat navigation reliability report

Status: **Ready for Manual Testing**

Manual Android and iOS validation: **Pending User Verification**. No device automation was performed for this implementation. Earlier device checks in this conversation do not establish acceptance of these changes.

## A. Root cause and evidence

The app uses Expo Router backed by a persistent React Navigation Tabs navigator. The native button is `BottomNav`; `/chat` resolves to `src/app/(tabs)/chat.native.tsx`. Route identifiers are literal strings, independent of translated labels.

Confirmed defects in the implementation reviewed:

1. **Navigation depended on optional native geometry.** `BottomNav` called `openChat` only inside `measureInWindow`. A missing ref, missing callback, zero dimensions, or invalid dimensions could suppress navigation completely. This dependency exists in the committed HEAD as well as the recent working changes.
2. **Recent transition fixes delayed navigation and coupled availability to decoration.** The working tree used a 70 ms handoff timer, a 1000 ms recovery timer, and `disabled={isOpening}`. Interruption could leave the launcher unavailable while waiting for animation cleanup. These timers and the disabled latch have been removed. Earlier transition versions also made the entire Chat scene transparent according to icon-animation progress; Chat now remains opaque and the navigator owns the scene fade.
3. **History visibility depended on every pinned message.** Initial loading awaited `Promise.all([listTimeline(50), listPinned()])`. `listPinned` hydrates all pinned messages, including attachments, organization metadata and reminders. SQLite convenience statements are serialized, so competing work shares a queue. Slow pins delayed timeline publication; a rejected pin load discarded a successful timeline result. This is a confirmed error and scheduling dependency, not a measured explanation of every reported freeze.
4. **Row actions defeated existing row memoization.** Each `renderFeedItem` call created a new message action callback. Unchanged memoized rows received changed props unnecessarily.
5. **Programmatic scrolls could request older pages.** Initial positioning emits scroll events, but history paging only checked the offset. It now requires user scrolling after initial positioning (with the existing message deep-link exception).
6. **Duplicate focus could lose the originating route.** The lifecycle's `focus()` overwrote its balloon-origin flag on repeated focus. It is now idempotent.

The recent working changes also eagerly mounted Chat and its initial 50 rich rows at app startup (`lazy: false`). This was added during the earlier fixes without profiling. Normal lazy tab mounting has been restored; unnecessary initial rendering is no longer used to conceal navigation latency.

### Investigated without establishing a cause

- No infinite effect loop, per-open database initialization, translated route identity, navigator key tied to theme/locale, or unconditional fullscreen-editor mount was found.
- Header photo and faded-header backdrop layers use `pointerEvents="none"`; no source evidence establishes that these layers intercept the reported taps. Native photo-modal dismissal still needs manual verification.
- Timeline retrieval already uses keyset pagination and a 50-item page. Existing cursor and attachment indexes are present; enrichment is batched rather than one query per message. No repository SQL, schema, index, migration, or stored content was changed.
- Revisit relationship calculations do not run as part of ordinary Chat opening. Organization suggestions are primarily triggered after sending.
- Actual device query durations, render counts, frame times, and tap-to-content latency have not been collected for this implementation. No claim is made that the provisional 300 ms target is achieved.

## B. Implementation

| File | Change |
| --- | --- |
| `src/components/navigation/bottom-nav.tsx` | Calls `openChat` directly on press. Measures on layout/press-in solely for the optional clone. Removes animation-based disabling. Preserves the current floating icon design, touch target, safe-area positioning and physical alignment. |
| `src/components/navigation/chat-transition.tsx` | Dispatches `/chat` synchronously once for an accepted press. Focus acknowledges navigation. Animation completion only removes its own visual clone; it cannot navigate, disable the launcher, or set scene opacity. No handoff or recovery timers. Stable action context excludes animation state. |
| `src/services/chat-transition-lifecycle.ts` | Makes focus idempotent; supports returning to Archive and Search as well as existing origins. Retains rapid-tap and stale-callback guards. |
| `src/services/chat-transition-motion.ts` | Validates optional geometry separately and retains a short local lift/fade. |
| `src/app/(tabs)/_layout.tsx` | Retains Tabs/history, the existing navigator fade and Reduced Motion behavior, while restoring ordinary lazy Chat mounting. |
| `src/app/(tabs)/chat.native.tsx` | Publishes history before optional pin hydration, guards inactive/superseded load results, stabilizes row actions, and prevents initial/programmatic scrolls from starting older-history requests. |
| `src/services/chat-feed-load.ts` | Small async load coordinator that isolates timeline and pinned-query failures and suppresses stale results. |
| `tests/chat-launcher-recovery.test.mjs`, `tests/chat-feed-load.test.mjs` | Tests immediate dispatch without geometry/timers, stable route strings, repeated taps/focus, interrupted and stale animations, return visits, Reduced Motion, dispatch failures, unmounts, and independent/stale/failed data loads. |

The execution path is now:

`press → one synchronous /chat dispatch → navigator screen fade and focus → initial timeline publication → optional pins`

Optional native measurement and icon animation run alongside this path. Neither can gate route dispatch or screen visibility. Existing pagination order, rich-text/editor storage, attachments, draft persistence, database initialization and offline behavior remain in their established implementations. No new dependencies or diagnostics were added.

## C. Automated verification

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm test`: **384 tests passed, 0 failed**. This includes the existing repository, editor, backup and pagination suites plus the navigation/load regression tests; no separate integration framework was introduced.
- `npm run check:localization`: passed for **14 bundled languages and 1,558 English keys**; no missing keys or placeholder mismatches.
- No measured runtime performance numbers are available. A synchronous dispatch assertion establishes code ordering, not device latency or animation smoothness.

## D. Manual checklist — Pending User Verification

Use the updated development build on an Android or iOS phone. Begin with existing data and an unsent draft; no reset or database cleanup is needed. Test a fresh app launch as well as a return visit. Observe whether the tap gives immediate feedback, Chat appears without a blank scene, and messages remain available.

Every item below is **Pending User Verification**:

### Navigation

- [ ] Cold launch → tap the floating Chat icon once.
- [ ] Notes/Cards → Chat → Back; repeat using the Boards view.
- [ ] Calendar → Chat → Back.
- [ ] Attachments → Chat → Back.
- [ ] Spaces → Chat through its existing navigation control → Back.
- [ ] Archive and Search → Chat → Back; confirm the originating screen returns.
- [ ] Rapidly tap Chat repeatedly; expect one visit and no duplicate route actions.
- [ ] Go back while the entrance animation is running, then open Chat again.
- [ ] Repeat tab changes and background/resume cycles; confirm no lost navigation or blank screen.

### Performance and data

- [ ] Observe immediate visual response and smooth icon lift/screen fade; report a visible pause or stutter.
- [ ] Open an account/database with substantial history and many pinned notes; confirm history appears without waiting for the entire pinned list.
- [ ] Scroll upward through multiple older pages; verify stable ordering and no scroll jump.
- [ ] Return to latest, then reopen Chat; verify no unwanted older-history fetch/jump during initial positioning.
- [ ] Open photo, audio, video and file messages through their existing controls.
- [ ] Open and close fullscreen Chat repeatedly.
- [ ] Background the app and return to Chat; verify existing messages, pin actions and composer responsiveness.
- [ ] Enable Reduced Motion and repeat navigation; expect navigation without the lifting animation.

### Editor and existing workflows

- [ ] Type text, insert numbered lists, bullet lists and checkboxes; toggle checklist items.
- [ ] Delete across formatted blocks; delete all content and confirm top alignment.
- [ ] Save/send a temporary test note; edit and reopen it to confirm formatting persists.
- [ ] Leave an unsent draft, change screens, return and restart; confirm expected draft persistence.
- [ ] Move a temporary test note to a Board and a Space; verify its original Chat behavior remains correct.
- [ ] Create/edit a reminder and use Chat search on a temporary test note.
- [ ] Check backup export through the normal workflow. Restore only in a disposable test installation if testing restore; no restore is required on your primary data to evaluate navigation.

### Appearance and localization

- [ ] Switch light/dark themes; repeat opening Chat and Back.
- [ ] Apply a custom header photo, dismiss the editor, then tap Chat; repeat after replacing/removing the photo.
- [ ] Switch English and another language; confirm route, history and draft state remain correct.
- [ ] Switch Arabic RTL; verify icon touch position, drawer navigation, composer and Back.
- [ ] Restart in the selected appearance/language and reopen Chat.

If an issue remains, report the starting screen, cold versus repeat visit, appearance/language, whether the icon reacts, whether a header/composer appears, and whether the failure happens before or after messages appear. A short recording is useful; note contents are not needed.

## E. Final status

**Ready for Manual Testing.** Source fixes and available code-level checks are complete. Device interaction, animation, runtime performance and final acceptance remain **Pending User Verification**.


## F. iOS whole-screen blank follow-up (2026-10-18)

The user reports an intermittent entirely blank scene after tapping Chat, with
neither its header nor composer visible. The existing Chat JSX renders both
while the timeline loads, so a slow timeline query alone does not explain that
symptom. No matching device console trace or reproduced failure was captured;
the exact runtime cause remains unconfirmed.

The installed Expo Router bottom-tabs implementation applies fade opacity to
the complete scene and derives inactive native-screen detachment from animated
progress. The iOS native screen container removes/reinserts child view
controllers as their activity states change. The preceding icon-transition
fixes do not remove either of these navigator-level visibility dependencies.

A focused iOS workaround now disables tab scene fading and native inactive-screen
detachment. Focus controls visibility with ordinary persistent views instead.
The floating Chat icon animation, lazy first mount, tab route/history identities,
drafts, timeline queries, theme, and editor remain in place. Android retains its
existing fade and native detachment. The root Stack is unchanged. The visual
tradeoff on iOS is an immediate tab scene change rather than a full-scene fade;
already-visited native view trees also remain retained, which may use more memory.
This does not eagerly load unvisited tabs or reset Chat data.

Changed files for this follow-up:

- `src/app/(tabs)/_layout.tsx`: iOS navigator visibility workaround and development
  tab focus/blur/transition diagnostics.
- `src/components/navigation/chat-transition.tsx`: development tap, dispatch,
  duplicate-request, and dispatch-failure diagnostics.
- `src/app/(tabs)/chat.native.tsx`: development focus and root-layout diagnostics.
- This report.

Logs use `[Chat navigation]` and include only route names and layout dimensions;
they exclude message text, draft text, query parameters, and attachments. A focus
or layout log does not prove the native scene is visibly displayed.

Validation: TypeScript, ESLint for the three touched source files, and diff
whitespace checks passed. No automated behavior tests, app launches, or device
interaction tests were performed for this follow-up. No native rebuild is needed
for the patch; the installed binary must receive the updated JavaScript.

Manual acceptance remains pending:

1. Cold launch, tap Chat, and confirm header, composer, and history appear.
2. Repeat Chat → Back → Chat from Notes, Calendar, Attachments, Archive, and
   Search, including rapid taps and immediately going back after opening.
3. Repeat after background/resume, keyboard dismissal, and closing the custom
   header editor. Confirm saved header and Chat appearance are unchanged.
4. Keep an unsent draft while switching screens and verify that it survives.
5. Repeat the core navigation on Android to check existing fade/icon behavior.
6. If the entire screen is still blank, collect `[Chat navigation]` output and
   Xcode's Chits console errors for that tap. State whether Back or relaunch
   recovers it. No database reset, reinstall, or data deletion is required.

Status: iOS navigation workaround implemented; exact cause and physical-device
resolution remain pending device evidence.
