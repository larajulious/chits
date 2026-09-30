# Chits — Onboarding Audit (Phase 0, read-only)

Audited at commit `37b3e10` (clean `main`). No source files were modified; this document is the only file created.

**Baseline, recorded before any change:** `npm test` → 122/122 pass · `npx expo lint` → exit 0 · `npx tsc --noEmit` → exit 0.

---

## A. Stack & structure

| Area | What Chits uses | Where |
|---|---|---|
| Framework | Expo SDK 57 (`expo ~57.0.25`), React Native 0.86.3, React 19.2, React Compiler on (`experiments.reactCompiler`) | `package.json`, `app.json` |
| Language | TypeScript 6 (`strict`), path alias `@/*` → `src/*`, `moduleSuffixes: [.native, .web, ""]` | `tsconfig.json` |
| Navigation | **expo-router 57** (file-based, typed routes). Root `Stack` in `src/app/_layout.tsx` (`headerShown:false`, fade). Tabs group `src/app/(tabs)/_layout.tsx`: `index` (Notes/Boards home), `chat`, `attachments`, `archive`, `search`, with a custom `BottomNav` and `ChatTransitionProvider` (balloon animation into Chat) | `src/app/**` |
| Platform split | Each real screen is `*.native.tsx`, with a `*.tsx` web stub (web is a non-persistent preview; `db/provider.web.tsx` provides **no** SQLite) | e.g. `unorganized.native.tsx` + `unorganized.tsx` |
| State management | No global store. Local `useState` per screen, React context providers (Theme, ChatBackground, AppDialog, AppDrawer, ChatTransition), and tiny pub/sub modules for change signals (`services/space-changes.ts`, `services/attachment-changes.ts`, `subscribeToReminderChanges` in `services/reminders.native.ts`, `services/app-reset.ts`) | |
| Persistence | **expo-sqlite**, one DB `chits.db`, versioned migrations via `PRAGMA user_version` (currently v21) in `src/db/migrations.ts`; repositories in `src/db/repositories.ts` (`createMessageRepository`, `createBoardRepository`, `createReminderRepository`, `createSpaceRepository`, `createAttachmentRepository`) | `src/db/*` |
| Key-value prefs | **`app_settings (key TEXT PK, value TEXT, updated_at INTEGER)`** (migration v8). Upsert idiom `INSERT … ON CONFLICT(key) DO UPDATE`. Existing keys: `app_theme`, `chat_color_theme`, `app_appearance`, `chat_title`, `chat_draft_text`, `chat_background`, `last_backup_at`, selected-space key. No AsyncStorage/MMKV in the project. | `theme-provider.tsx`, `settings.tsx`, `chat.native.tsx`, `db/chat-background.ts` |
| Theming | `ThemeProvider` → `useTheme()` gives `tokens` (`AppPalette`: background, surface, surfaceElevated, textPrimary/Secondary/Muted, borderSubtle, accent, accentSoft, accentStrong, accentText, accentBorder, danger, success, bubble, bubbleText, chatBackground, cardPaper, cardBase), `look` (heading font/weight), `scheme`, `topBar`. 22 identities (`default, faith, casual, corporate, love, friends, boss, stranger, motivation, calm, creative, cute, christmas, spooky, new-year, midnight, boomers, gen-x, millennials, gen-z, gen-alpha, game-changer`) × light/dark/system; Default also has 12 accent colors. Spacing/radii/touch-target constants in `src/constants/theme.ts` (`layout.minimumTouchTarget = 44`). | `src/components/theme-provider.tsx`, `src/constants/theme.ts`, `src/constants/chits-themes.ts` |
| UI kit | `src/components/ui/primitives.tsx`: `Screen`, `AppHeader`, `BackHeader`, `IconButton`, `PrimaryButton`, `SecondaryButton`, `EmptyState`, `Toast`, `FloatingSurface`, `BottomSheetSurface`, `SectionHeader`, `ListRow`; `form-sheet.tsx`, `chits-loader.tsx`; icons `@expo/vector-icons/Ionicons`; animation: `react-native-reanimated` 4 + RN `Animated`/`LayoutAnimation`; reduce-motion read via `AccessibilityInfo` in drawer & chat transition | |
| i18n | **None.** All copy is inline English string literals. No i18n library, no string catalog. | — |
| Analytics/logging | **None.** No network calls anywhere in `src/` (no `fetch`, no URLs, no SDKs). Only `console.warn` in the DB error boundary. | — |
| Tests | `node --test tests/*.test.mjs` (Node 24, native TS type-stripping). Two styles: (1) **source-contract** tests that `readFileSync` a component and regex-assert on it; (2) **logic** tests that import pure `.ts` modules (relative imports only — Node can't resolve `@/`) and run SQL against `node:sqlite` `DatabaseSync`. No Jest / React Native Testing Library → no rendered-component tests exist. | `tests/*.mjs` |
| Run / build / test | `npm start` (dev server) · `npm run ios` / `npm run android` (`expo run:*`, dev build) · EAS profiles in `eas.json` · `npm test` · `npm run lint` (`expo lint`) · `npx tsc --noEmit` | |
| Device targets | **Portrait only** (`app.json orientation: portrait`; iOS plist Portrait + UpsideDown). **iPhone only** (`TARGETED_DEVICE_FAMILY = 1`; iPad runs it in compatibility mode). Android tablets run it portrait-locked. | `app.json`, `ios/Chits.xcodeproj` |

## B. Feature inventory

| Feature | Status | Files · components · public functions |
|---|---|---|
| **Self-chat: send a text note** | EXISTS | `src/app/(tabs)/chat.native.tsx` → `ChatScreen.send()` → `createMessageRepository(db).createText(text)` / `.createAttachmentMessage(...)`. Route `/chat`; `/chat?messageId=<id>` scrolls to and temporarily highlights (`focusedId`) a message. |
| Message composer | EXISTS | Inside `ChatScreen` (not a separate component): `TextInput` (placeholder "Message note...", a11y "Message note"), `draft` state is **internal**; persisted to `app_settings.chat_draft_text` (debounced 400 ms) and restored **only on mount**. `ChatComposerSurface`, `AttachmentPicker`, `AttachmentDraftPreview`. There is **no external API to prefill the composer.** |
| Starter / empty state | EXISTS | `ChatScreen`: `<EmptyState title="What’s on your mind?" description="Send yourself anything. You can organize it later." />` when the feed is empty. |
| Attachments — photos, videos | EXISTS | `src/components/chat/attachment-picker.native.tsx` (system picker via expo-image-picker; no permission needed). **No camera capture** (`cameraPermission: false`). |
| Attachments — voice recordings | EXISTS | Same picker, "Audio" → `expo-audio` recorder; mic permission via `ensureMicrophonePermission()` on tap. |
| Attachments — files / PDFs | EXISTS | Picker "File" (expo-document-picker); PDF viewer `src/components/pdf/pdf-viewer.native.tsx` + native module `modules/chits-attachments`. |
| Document scanning | **MISSING** | No scanner anywhere. |
| Long-press chat message → move to board | EXISTS (2-step) | Long-press (350 ms) a bubble → `MessageActions` sheet (`src/components/chat/message-actions.tsx`) → **"Add to Board"** (or "Go to <Board>" if already organized) → `router.push('/unorganized?messageId=<id>')` → Unorganized screen with that message **pre-selected** → user taps **"Add to board"** pill → `AddToBoardSheet` (pick board → pick column, or "Create a board"/"Create new board" → name → "Create and add 1 note") → `organizeMessages()` → `router.push('/board/<id>?highlightColumnId=…&highlightCardId=…')`. All in `src/app/unorganized.native.tsx`. |
| Boards, columns, cards | EXISTS | `createBoardRepository`: `create({name, icon?, accent?})`, `listActive()`, `organizeMessages(boardId, messageIds, columnId?)`, `addColumn`, `moveCard`, `markOpened`, etc. Screens: home `src/app/(tabs)/index.native.tsx` (Boards \| Cards switcher, "Create board" `FormSheet`), `src/app/board/[id].native.tsx`, `src/app/card/[id].native.tsx`. |
| Creating a board | EXISTS | `boardRepository.create(...)` from home (`createBoard`) and from `AddToBoardSheet` (`createBoardAndOrganize`). Side effect: inserts a **"Board created"** timeline event that appears as a bubble in Chat. |
| Board templates / default columns | PARTIAL | No templates. Every new board gets exactly **one column named "Notes"** (asserted by `tests/default-board-column.test.mjs`). |
| Drag & drop of cards | EXISTS | `board/[id].native.tsx`: long-press card or drag handle (`Gesture.Pan().activateAfterLongPress(200)`), cross-column moves, plus a11y actions (increment/decrement, move prev/next column) → `moveCard()`. |
| Reminders on cards | EXISTS | Card Details "Remind me" row → `ReminderSheet` (`src/components/reminders/reminder-sheet.native.tsx`) → Save → `setCardReminder()` (`src/services/reminders.native.ts`). One reminder per card (`card_reminders`); **a fired reminder's row is deleted by the sync**. `subscribeToReminderChanges()` emits on set/remove/fire. |
| When notification permission is requested | — | **Only on Save in the ReminderSheet**, inside `setCardReminder()` → `ensureNotificationPermission()` → `resolvePermission()` (asks at most once; `blocked` → `showPermissionSettingsPrompt`). Never on launch/mount. |
| Search | EXISTS | Global: `src/app/(tabs)/search.native.tsx` (`boardRepository.search`), opened from the drawer header icon. Chat-header search: `messageRepository.searchTimeline`. |
| Hidden notes ("Hidden Chits") | EXISTS | `messages.is_hidden_content`; "Hide content"/"Show content"/"Reveal" in `MessageActions`; `setHiddenContent()`; covered rendering in `message-row.native.tsx`, boards, spaces, search. |
| Pinned notes | EXISTS | "Pin"/"Unpin" in `MessageActions` (`messages.pinned`); boards/cards pin; PINNED + RECENT sections in the drawer. |
| Spaces (fridge, desk, cork board, wall) | EXISTS | `src/app/spaces/{index,pick,share}.native.tsx`, `createSpaceRepository` (`space_placements`, 12 notes per space), "Stick to Fridge…" action in `MessageActions` via `spaceNoteAction()`, drawer row "Spaces" with count badge, `subscribeToSpaceChanges()`. Route `/pinned` redirects to `/spaces`. |
| App themes | EXISTS | `src/app/appearance-theme.tsx`, Settings → Appearance. |
| Shareable note images | EXISTS | "Share Note" in `MessageActions` → `src/app/share-note.native.tsx`; Spaces share `spaces/share.native.tsx`. |
| Backup export / restore | EXISTS | `src/app/backup.native.tsx` (route `/backup`, from Settings → DATA). `.chitsbackup` zip = full `chits.db` (**including `app_settings`**) + attachments. Restore → `triggerAppReset()` remounts the whole tree with the restored DB. |
| Side panel / drawer | EXISTS | **`src/components/navigation/app-drawer.native.tsx`** (`AppDrawerProvider`, `useAppDrawer().openDrawer`). Opened by the hamburger `MenuIcon` in headers or a left-edge swipe. Items are `Destination` constants `{ label, path, icon }` rendered by `NavigationRow` (single-line label, optional badge — **no secondary-line support**). Order: header ("<NoteSpace name>" + Search icon) → scroll list: **Notes** (`/`), **Spaces** (`/spaces/pick`), **Archive** (`/archive`), divider, PINNED, RECENT → footer (pinned to bottom): **Settings** (`/settings`). `Destination.path` is a closed string-literal union. Web fallback: `app-drawer.tsx`. |
| Existing tips / coach marks / "what's new" / first-launch logic | **MISSING** | None. The only "first time" logic is Spaces opening on Pick a Space until a space is chosen. |

## C. Detecting a fresh install safely

Evaluate **once**, after the DB is migrated (inside the tree, under `SQLiteProvider`), before anything else writes to `app_settings`:

1. If `app_settings` has any `onboarding.*` key → the decision was already made; obey it (never re-evaluate).
2. Otherwise treat as **fresh** only if **all** are zero (counting archived and soft-deleted rows too):
   - `SELECT COUNT(*) FROM messages` (any `deleted_at`/`archived_at`)
   - `SELECT COUNT(*) FROM boards` (incl. archived)
   - `SELECT COUNT(*) FROM app_settings WHERE key NOT LIKE 'onboarding.%'` — any setting at all (theme, chat title, draft, background, last backup) proves prior use.
3. Write the decision immediately: `onboarding.version = 1` and `onboarding.firstRun = 'shown' | 'existing-user'`. An existing user is thereby marked once and is never re-evaluated, even if they later delete everything.

Why this is safe: on a genuine first launch nothing writes `app_settings` before the gate runs (the theme is only read; `chat_draft_text` is written only after Chat mounts, and the initial tab is Notes). A user who updates always has at least one message, board or setting. The one indistinguishable case is someone with **zero** data and **zero** settings, who loses nothing by seeing the tour.

Restore interaction: a restored backup replaces `app_settings` with the backup's copy. An old backup has no `onboarding.*` keys but has data, so step 2 marks it `existing-user`. A newer backup carries its own onboarding state across.

## D. Risk list

| Risk | Why | Mitigation |
|---|---|---|
| Startup sequence | `DatabaseProvider` shows loaders until migration finishes; `ThemeProvider` reads settings synchronously; `ResetNotice`/`ReminderCoordinator` run on mount. | Gate mounts **inside** `ThemedApp`, runs async after first frame, never blocks rendering; any error means "don't show onboarding". |
| Cold-start notification / deep link | `ReminderCoordinator` pushes `/card/<id>` on a notification tap; `chits://` links land on arbitrary routes. | Gate only redirects when the current path is the default `/`; otherwise it defers (a fresh install has no reminders anyway). |
| Navigation stack | Welcome pushed over `/`; the tabs keep Chat mounted; Chat is normally entered via the balloon transition. | `router.navigate('/chat')` is already used elsewhere (share-note, card, spaces), so it's a supported entry. Hardware back / swipe from Welcome = Skip. |
| Overlays trapping the user | A root overlay could sit above screens and block input after a crash or kill. | Overlays are `pointerEvents="box-none"` except the explicit coach mark, which always has Skip plus Android back. Tour stage is persisted; **a tour interrupted by kill/restart is ended, never resumed behind an overlay** (the checklist stays available). |
| Modal stacking (iOS) | `MessageActions`, `AddToBoardSheet`, `ReminderSheet`, drawer and dialogs are RN `Modal`s; iOS can't present two at once. | Onboarding uses in-tree absolute overlays, not `Modal`, except while no other sheet can be open (Welcome/Hub are routes). |
| Restore / app reset | `triggerAppReset` remounts everything and swaps `app_settings`. | Onboarding state is read fresh from the DB on mount; no module-level caches that survive a reset. |
| Theme switching | 22 identities × light/dark, some with custom top bars and wallpapers. | Colors only from `useTheme().tokens`; header via existing `AppHeader`/`TopBarBackground`; no hard-coded palette. |
| Existing source-contract tests | `tests/drawer-recent-items.test.mjs` regex-reads `app-drawer.native.tsx`; `chat-pin` / `chat-privacy-cover` read `chat.native.tsx`, `index.native.tsx`, `unorganized.native.tsx`. | Insert-only edits that don't alter any matched line; the full suite is re-run after every commit. |
| Side effects of "existing actions" | `boardRepository.create()` adds a "Board created" bubble to Chat; Quick setup with 3 boards → 3 bubbles. | That's the app's normal behavior. The UI copy says so, and nothing is created without a tap. |
| Backups carry onboarding keys | `app_settings` is inside `.chitsbackup`. | Harmless: the keys are small and versioned; "Reset tips" deletes only `onboarding.*`. |
| Web build | `useSQLiteContext` throws on web (no provider). | Every onboarding route gets a `*.tsx` web stub following the existing pattern; the root layer is a no-op on web. |
| Tablets / landscape | App is portrait-locked and iPhone-only. | Layouts use `maxWidth` (`layout.maxContentWidth = 720`) + flex so iPad compatibility mode and large Android phones/tablets still look right. Landscape isn't reachable today; nothing is built for it. |
| Accessibility | Dimmed coach mark must not trap VoiceOver/TalkBack focus. | `accessibilityViewIsModal` on the tip card, labelled buttons, ≥44pt targets, `AccessibilityInfo.isReduceMotionEnabled` → no animation, text scales with system font size (no fixed heights). |

## E. Proposed file plan

### New files (all onboarding code in `src/features/onboarding/`)

| File | Purpose |
|---|---|
| `src/features/onboarding/keys.ts` | Key names (`onboarding.version`, `onboarding.firstRun`, `onboarding.tour`, `onboarding.checklist`, `onboarding.checklistDismissed`, `onboarding.completedAt`), `ONBOARDING_VERSION = 1`. |
| `src/features/onboarding/state.ts` | Pure logic, **relative imports only** so Node tests can import it: fresh-install decision, tour state machine (`welcome → first-note → aha → moved → setup → done/skipped`), checklist derivation + latching, "Personal"-board reuse rule. Takes a minimal DB interface (`getFirstAsync`/`runAsync`) so tests can pass `node:sqlite`. |
| `src/features/onboarding/storage.ts` | Reads/writes `app_settings` `onboarding.*` rows only; `resetOnboardingKeys()` = `DELETE FROM app_settings WHERE key LIKE 'onboarding.%'`. |
| `src/features/onboarding/strings.ts` | Every onboarding string under a namespaced key (see Q3). |
| `src/features/onboarding/onboarding-layer.native.tsx` + `onboarding-layer.tsx` (web no-op) | Mounted once at the root: runs the first-run gate, watches `usePathname()` + `subscribeToSpaceChanges` / `subscribeToReminderChanges` to advance the tour and tick the checklist, renders the chat overlay, coach mark and "That's the whole trick" card. |
| `src/features/onboarding/components/*.tsx` | `WelcomeView`, `StarterChips`, `CoachMark`, `WholeTrickCard`, `QuickSetupView`, `ChecklistCard`, `HubView`, `ChatToCardIllustration` (built from `View`s + theme tokens; no new assets). |
| `src/app/onboarding/welcome.native.tsx` + `welcome.tsx` | Route shell for Step 1. |
| `src/app/onboarding/setup.native.tsx` + `setup.tsx` | Route shell for Step 4. |
| `src/app/onboarding/index.native.tsx` + `index.tsx` | Route shell for the Onboarding hub (`/onboarding`). |
| `tests/onboarding-*.test.mjs` | New tests (see Phase 2 in the brief). |
| `ONBOARDING_REPORT.md` | Final report (Phase 2). |

### Existing files that must be touched (insert-only unless noted)

**1. `src/app/_layout.tsx` — first-run gate + overlay host (guardrail 3a/3c).**
```diff
 import { observeReminderNotifications, registerReminderDatabase, requestReminderSync } from '@/services/reminders';
+import { OnboardingLayer } from '@/features/onboarding/onboarding-layer';
 …
             <Stack.Screen name="pinned" />
           </Stack>
+          <OnboardingLayer />
         </AppDrawerProvider>
```
The new routes auto-register with expo-router and inherit the root `screenOptions`, so no `Stack.Screen` lines are strictly needed. It sits inside `AppDrawerProvider` so the drawer's `Modal` stays above it.

**2. `src/components/navigation/app-drawer.native.tsx` — ONE new item (guardrail 3b).**
```diff
-type Destination = { label: string; path: '/' | '/spaces/pick' | '/archive' | '/settings'; icon: IconName };
+type Destination = { label: string; path: '/' | '/spaces/pick' | '/archive' | '/settings' | '/onboarding'; icon: IconName };
 …
 const settingsDestination: Destination = { label: 'Settings', path: '/settings', icon: 'settings-outline' };
+const gettingStartedDestination: Destination = { label: 'Getting started', path: '/onboarding', icon: 'compass-outline' };
 …
       <View style={[styles.footer, { borderTopColor: tokens.borderSubtle }]}>
+        <NavigationRow destination={gettingStartedDestination} pathname={pathname} close={close} />
         <NavigationRow destination={settingsDestination} pathname={pathname} close={close} />
```
Notes: (a) widening the `path` union is the one edit to an existing line (see Q6). (b) `NavigationRow` has no secondary line, so no "Tour & tips" subtitle; adding one would restyle the row. (c) Placement: in the bottom footer, directly above Settings. This adds ~52pt to the footer and slightly shortens the scroll list above it. Nothing is moved or restyled. The web `app-drawer.tsx` is left untouched.

**3. (Needs your approval, Q1) `src/app/(tabs)/chat.native.tsx` — composer prefill hook.** Outside guardrail 3's list, but Step 2's chips can't prefill the composer without it:
```diff
-  const { messageId } = useLocalSearchParams<{ messageId?: string }>();
+  const { messageId, prefill } = useLocalSearchParams<{ messageId?: string; prefill?: string }>();
+  useEffect(() => { if (prefill) setDraft((current) => current.trim() ? current : prefill); }, [prefill]);
```
(The `useEffect` goes after `draft` is declared. It never overwrites text the user already typed.)

**4. (Needs your approval, Q2) `src/app/(tabs)/index.native.tsx` — checklist card on home.** One import and one `<GettingStartedCard />` line at the top of the Notes screen's scroll content. The card renders `null` when dismissed or complete.

## F. Spec → reality mapping

| Spec step | Verdict | How it maps |
|---|---|---|
| **1 Welcome** — icon, illustration, headline, body | BUILD | New route `/onboarding/welcome`; `assets/images/app_icon.png`; illustration drawn from Views + tokens. |
| 1 Trust lines | BUILD (wording, Q7) | "No account needed": true (no auth). "Works offline": true (zero network code). "Your notes stay on this phone" is **not strictly true**: Android `allowBackup="true"` lets Google Auto Backup copy app data, iOS device backups include it, and users can export `.chitsbackup` files. Recommend "Your notes are saved on this phone". |
| 1 "Start writing" → real chat | BUILD | `router.navigate('/chat')` (existing pattern). |
| 1 "Restore from a backup" | BUILD | Restore exists → `router.push('/backup')` (existing screen, unchanged). |
| **2 Empty-state copy** ("This is your space…") | ADAPT | Chat's own empty state can't change (additive only). The copy shows in an onboarding card over Chat's empty area (themed surface), only during the tour. |
| 2 Starter chips that prefill the composer | **BUILD only with Q1 approval, otherwise SKIP** | The composer's `draft` is private to `ChatScreen`; no existing entry point accepts text. |
| 2 "Saved · only on this phone" after first send | ADAPT | No "message sent" event exists. While the tour waits for the first note and Chat is on screen, the layer checks `SELECT id FROM messages ORDER BY created_at DESC LIMIT 1` on a light ~1 s interval, then shows a `Toast`-style confirmation. Copy per Q7: "Saved on this phone". |
| **3 Coach mark spotlighting the first message** | ADAPT | A pixel-exact cutout needs the row's on-screen frame from inside `ChatScreen`. Instead: `router.navigate('/chat?messageId=<id>')` uses Chat's **existing** scroll-to + highlight, then a dimmed tip card at the bottom repeats the message in a themed bubble. |
| 3 Tip copy | ADAPT | Real gesture: long-press → **"Add to Board"**. Body: "Long-press any message, then tap Add to Board. Your chat stays simple." |
| 3 "Try it" → existing move-to-board UI | BUILD | `router.push('/unorganized?messageId=<id>')`, exactly what Chat's "Add to Board" does (message comes pre-selected). |
| 3 No board yet → suggest "Personal" | ADAPT (Q5) | The existing sheet's "Create a board" name field can't be prefilled. Proposal: the coach mark offers **"Create ‘Personal’ and add"**, which on tap runs the same calls as `createBoardAndOrganize` (`create({name:'Personal'})` → `organizeMessages` → `goToDestination`-style push), reusing an active board named "Personal" if one exists. The second button, "Choose a board", goes to the normal flow. **Not offered in replay mode.** Default single "Notes" column; no templates. |
| 3 Open board with card highlighted | BUILD | Existing `/board/<id>?highlightColumnId=…&highlightCardId=…`. |
| 3 "That's the whole trick" card | BUILD | The layer notices the path change to `/board/…` while the tour's message now has a `card_messages` row, and shows the card with "Back to chat" / "Continue". |
| **4 Quick setup** chips → boards | BUILD (default columns) | `boardRepository.create({name})` exists. Each chosen chip creates one board with the default "Notes" column (no templates). "Personal" is reused if it exists (case-insensitive, active boards). Visible Skip. Each board adds a normal "Board created" bubble to Chat. |
| **5 Checklist** card on home | **BUILD with Q2 approval; otherwise ADAPT** (hub only) | Items, all observed without changing features: (1) first note = any message exists; (2) turned into a card = any `card_messages` row; (3) reminder = reminders exist → `subscribeToReminderChanges` + a `card_reminders` row, **latched** into `onboarding.checklist` because fired reminders delete their row; (4) Spaces exist → `subscribeToSpaceChanges` + any `space_placements` row, "NEW" badge. Deep links: `/chat`, `/unorganized`, most recent card `/card/<id>` (else `/`), `/spaces/pick`. X dismisses; reopen from the hub. |
| Contextual reminder explainer before the permission prompt | **SKIP** (recommended) | The prompt fires inside `setCardReminder()` on Save in `ReminderSheet`. Putting an explainer before it means changing `card/[id].native.tsx` or the sheet. A floating tip on the first Card Details visit is possible but would overlap the card UI; not recommended for v1. |
| Natural-language dates | SKIP (spec says don't) | — |
| **Side panel "Getting started"** | BUILD | Drawer edit #2. |
| Hub: Replay tour | BUILD | Steps 1–3 with `mode: 'replay'`: nothing auto-created, the "Create ‘Personal’" shortcut hidden, the coach mark uses the latest existing message or a clearly labelled "Example" illustration. |
| Hub: Checklist (even if dismissed) | BUILD | Same `ChecklistCard`, always shown in the hub. |
| Hub: Reset tips | BUILD | Deletes only `onboarding.%` keys, then writes `onboarding.version=1` + `firstRun='existing-user'` back so a reset never re-triggers the automatic first-run flow for someone with data. |
| Versioning | BUILD | `onboarding.version = 1`. |

---

## Open questions — I'm stopping here for your decisions

1. **Composer prefill (Step 2 chips).** Allow the 2-line, insert-only change to `chat.native.tsx` shown in E.3 (new optional `prefill` route param)? *Recommended: yes.* The alternative is to SKIP the chips.
2. **Checklist placement (Step 5).** Allow a 1-line `<GettingStartedCard />` insertion on the home screen (`index.native.tsx`)? *Recommended: yes.* The alternative is showing the checklist only in the hub.
3. **i18n.** Chits has no i18n system. OK to keep all new strings in `src/features/onboarding/strings.ts` under namespaced keys, with no new dependency, so they can move into a real i18n system later? *Recommended: yes.*
4. **Tests.** No component test runner exists, and Jest/RNTL would be new dependencies. OK to cover the required scenarios with the repo's existing style: `node:test` logic tests on `state.ts` against `node:sqlite`, plus source-contract tests, with rendering covered by the manual QA checklist? *Recommended: yes.*
5. **"Create ‘Personal’ and add" shortcut (Step 3).** On explicit tap, onboarding calls the existing `boardRepository.create` + `organizeMessages` (the same calls the Unorganized screen makes). Acceptable, or should "Try it" only ever route into the existing Unorganized flow where the user types the name?
6. **Drawer type union.** Widening `Destination.path` to include `'/onboarding'` edits one existing line. Acceptable? The alternative is a separate type for the new row, which duplicates `NavigationRow`, so I'd avoid it.
7. **Privacy copy.** Use "Your notes are saved on this phone" and "Saved on this phone" instead of "stay on this phone" / "only on this phone", because Android Auto Backup / iOS device backups / user exports can copy the data?
