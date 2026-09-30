# Chits onboarding implementation report

Baseline: commit `37b3e10`. The first-run gate and welcome screen were already committed in `0cfba9b` and `8ce5a3d`; this continuation completed the remaining flow.

## Added files

- `ONBOARDING_AUDIT.md` — the previous agent's read-only audit.
- `src/app/onboarding/welcome.native.tsx`, `welcome.tsx`, `setup.native.tsx`, `setup.tsx`, `index.native.tsx`, `index.tsx` — native routes and web placeholders.
- `src/features/onboarding/storage.ts`, `tour.ts`, `strings.ts`, `checklist.ts`, `board-setup.ts` — versioned keys, tour state, copy, observed checklist, and user-triggered board creation.
- `src/features/onboarding/onboarding-layer.native.tsx`, `onboarding-layer.tsx` — first-run gate, real Chat and Board guidance, web no-op.
- `src/features/onboarding/components/chat-to-card-illustration.tsx`, `checklist-card.tsx` — themed illustration and checklist.
- `src/features/onboarding/screens/web-placeholder.tsx`, `welcome-screen.tsx`, `setup-screen.tsx`, `hub-screen.tsx` — tour screens.
- `tests/onboarding-first-run.test.mjs`, `tests/onboarding-flow.test.mjs` — new tests only.
- `ONBOARDING_REPORT.md` — this report.

## Existing files touched

- `src/app/_layout.tsx` — mounts the first-run check and overlay under the existing database/theme providers.
- `src/app/(tabs)/chat.native.tsx` — accepts an optional starter-chip prefill in the real composer without replacing typed text; preserves a current draft if the asynchronous saved-draft read completes later.
- `src/app/(tabs)/index.native.tsx` — inserts the dismissible checklist above the existing Notes content.
- `src/components/navigation/app-drawer.native.tsx` — one Getting started row above Settings in the native drawer.
- `src/components/navigation/app-drawer.tsx` — the same row in the web preview drawer.

The exact diff of these existing files from the pre-onboarding baseline follows below. No existing test, string, style, model, migration, dependency, permission, network call, or analytics code was removed or edited. Existing route registrations and normal note, board, reminder, Space, backup, and theme actions remain in their original modules. The new entry points and composer prefill are additive. Static checks cannot prove every native interaction unchanged.

## What the tour does

Fresh installs with no prior note, board, or non-onboarding setting see Welcome once. Existing installs are marked as existing users and do not get an automatic tour. Welcome opens the real Chat or existing Backup & Restore screen. Starter chips fill the real composer; sending remains the user's action. The tour observes the saved message, shows a short confirmation, then uses Chat's existing message focus/highlight and a themed guide. Try it opens the existing Add to Board flow with that note selected. Its existing board route highlights the new card. Quick setup creates only the boards the user selects, with Chits' existing default Notes column, and reuses matching board names. The checklist reads real persisted state and latches reminder/Space achievements after those records are removed. The drawer hub offers replay, the checklist, and Reset tips. Replay never creates or moves data on its own.

## Adapted or skipped steps

- Exact cutout around the underlying Chat bubble: adapted to Chat's existing message scroll/highlight plus a themed preview in the guide. Measuring the row's screen frame would require a larger change to the existing Chat renderer.
- Chat empty-state wording: shown in a tour card over the real Chat. The existing empty-state string was left unchanged.
- Create Personal shortcut: the guide suggests Personal and opens the existing Add to Board sheet, where the person chooses or creates a board. No board is created by the coach mark itself.
- Board templates: not built; Chits creates its existing single Notes column.
- Document scanning: not built; requires a new product feature.
- Reminder permission explainer: skipped because inserting it before the existing Save-time permission request would change the reminder flow.
- Natural-language date detection: skipped as instructed.
- Trust wording uses “saved on this phone” because device backup and user export can copy app data.

## Verification

- `npm test`: 132 passed, 0 failed.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed.
- `npx expo export --platform ios`: passed.
- `npx expo export --platform android`: passed.
- `git diff --check`: passed.

No native screen interaction, VoiceOver/TalkBack pass, device backup restore, or physical device layout test was performed in this continuation.

## Manual QA on disposable iOS and Android installs

1. Fresh install: Welcome appears once. Skip reaches normal Chat. Kill and reopen mid-tour; no overlay traps the app.
2. Start writing: each chip fills the real composer only. Edit the draft, send it yourself, and confirm the saved message and brief confirmation appear.
3. Try it: the note is selected in Unorganized. Create Personal through the existing sheet, add it, and verify the board opens with the card highlighted. Back to chat and Continue both work.
4. Quick setup: select boards, create, then replay and check there are no duplicate Personal boards. Skip creates none.
5. Checklist: send a note, add a card, set a reminder, and stick a note in a Space. Check automatic ticks. Dismiss on Notes, then reopen from the drawer hub.
6. Hub: Replay the tour with existing content and verify no note or board appears without a normal user action. Reset tips and verify other settings and content remain.
7. Restore an older backup and check it does not force onboarding. Check a fresh deep link to a card or reminder does not get interrupted by Welcome.
8. Check light/dark and several personality themes, large text, VoiceOver/TalkBack focus and labels, small/large phones, and portrait tablet compatibility. The app currently locks orientation to portrait.

## Existing-file diff

```diff
diff --git a/src/app/(tabs)/chat.native.tsx b/src/app/(tabs)/chat.native.tsx
index 7a5758b..ec169b1 100644
--- a/src/app/(tabs)/chat.native.tsx
+++ b/src/app/(tabs)/chat.native.tsx
@@ -231,7 +231,7 @@ function QuickFilterRow({ pinned, onSelect }: { pinned: Message[]; onSelect: (me
 export default function ChatScreen() {
   const database = useSQLiteContext();
   const repository = useMemo(() => createMessageRepository(database), [database]);
-  const { messageId } = useLocalSearchParams<{ messageId?: string }>();
+  const { messageId, prefill } = useLocalSearchParams<{ messageId?: string; prefill?: string }>();
   const router = useRouter();
   const { tokens: theme, topBar } = useTheme();
   const { confirm } = useAppDialog();
@@ -462,7 +462,7 @@ export default function ChatScreen() {
   useEffect(() => {
     let active = true;
     void database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_draft_text')
-      .then((row) => { if (active && row?.value) setDraft(row.value); })
+      .then((row) => { if (active && row?.value) setDraft((current) => current.trim() ? current : row.value); })
       .catch(() => undefined);
     return () => { active = false; };
   }, [database]);
@@ -472,6 +472,16 @@ export default function ChatScreen() {
     }, 400);
     return () => clearTimeout(timer);
   }, [database, draft]);
+  // Onboarding's starter chips arrive as ?prefill=…: fill an empty composer (never
+  // replace typed text), then clear the param so the same chip works again.
+  useEffect(() => {
+    if (!prefill) return;
+    const frame = requestAnimationFrame(() => {
+      setDraft((current) => (current.trim() ? current : prefill));
+      router.setParams({ prefill: undefined });
+    });
+    return () => cancelAnimationFrame(frame);
+  }, [prefill, router]);
 
   useEffect(() => () => { const pending = attachmentDraftRef.current; if (pending) void pending.remove().catch(() => undefined); }, []);
   useEffect(() => () => {
diff --git a/src/app/(tabs)/index.native.tsx b/src/app/(tabs)/index.native.tsx
index bba2a5c..d7f9e12 100644
--- a/src/app/(tabs)/index.native.tsx
+++ b/src/app/(tabs)/index.native.tsx
@@ -33,6 +33,7 @@ import { shareNoteHref } from '@/services/share-note-source';
 import { resolveBoardIcon, type BoardIconName } from '@/constants/board-appearance';
 import { radii, spacing } from '@/constants/theme';
 import { createBoardRepository, createMessageRepository } from '@/db/repositories';
+import { GettingStartedCard } from '@/features/onboarding/components/checklist-card';
 import type { Board, CardListItem, MessageType } from '@/db/types';
 import { removeCardAttachmentFile } from '@/services/card-attachment-storage';
 import { spaceNoteAction } from '@/components/spaces/space-note-action';
@@ -483,6 +484,8 @@ export default function BoardsScreen() {
         )}
       />
 
+      <GettingStartedCard onHome />
+
       {!ready ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null) : (
       <View style={styles.flex}>
         <View style={styles.switchWrap}>
diff --git a/src/app/_layout.tsx b/src/app/_layout.tsx
index fd0bfcb..3fc2adc 100644
--- a/src/app/_layout.tsx
+++ b/src/app/_layout.tsx
@@ -14,6 +14,7 @@ import { ChatBackgroundProvider } from '@/components/chat/chat-background-provid
 import { DatabaseProvider } from '@/db/provider';
 import { consumeResetNotice, subscribeToAppReset } from '@/services/app-reset';
 import { observeReminderNotifications, registerReminderDatabase, requestReminderSync } from '@/services/reminders';
+import { OnboardingLayer } from '@/features/onboarding/onboarding-layer';
 
 // Shows the message a reset asked for (e.g. "Restore complete") once the fresh
 // tree — with its reopened database — has mounted.
@@ -77,6 +78,7 @@ function ThemedApp() {
             <Stack.Screen name="spaces/share" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
             <Stack.Screen name="pinned" />
           </Stack>
+          <OnboardingLayer />
         </AppDrawerProvider>
       </View>
     </AppDialogProvider>
diff --git a/src/components/navigation/app-drawer.native.tsx b/src/components/navigation/app-drawer.native.tsx
index 63c1e9d..2d25e0a 100644
--- a/src/components/navigation/app-drawer.native.tsx
+++ b/src/components/navigation/app-drawer.native.tsx
@@ -53,7 +53,7 @@ type ContextItem = {
   accessibilityContext: string | null;
 };
 type IconName = ComponentProps<typeof Ionicons>['name'];
-type Destination = { label: string; path: '/' | '/spaces/pick' | '/archive' | '/settings'; icon: IconName };
+type Destination = { label: string; path: '/' | '/spaces/pick' | '/archive' | '/settings' | '/onboarding'; icon: IconName };
 
 const DrawerContext = createContext<DrawerContextValue | null>(null);
 // Boards, Chat, and Attachments are the 3 items in the bottom navigation (see
@@ -69,6 +69,7 @@ const boardsDestination: Destination = { label: 'Notes', path: '/', icon: 'reade
 const spacesDestination: Destination = { label: 'Spaces', path: '/spaces/pick', icon: 'magnet-outline' };
 const archiveDestination: Destination = { label: 'Archive', path: '/archive', icon: 'archive-outline' };
 const settingsDestination: Destination = { label: 'Settings', path: '/settings', icon: 'settings-outline' };
+const gettingStartedDestination: Destination = { label: 'Getting started', path: '/onboarding', icon: 'compass-outline' };
 
 export function useAppDrawer() {
   const context = useContext(DrawerContext);
@@ -336,6 +337,7 @@ function DrawerContent({ close, isOpen }: { close: () => void; isOpen: boolean }
       {/* Settings is app chrome, not a place your notes live — it stays pinned
           to the bottom instead of sitting in the list of destinations. */}
       <View style={[styles.footer, { borderTopColor: tokens.borderSubtle }]}>
+        <NavigationRow destination={gettingStartedDestination} pathname={pathname} close={close} />
        <NavigationRow destination={settingsDestination} pathname={pathname} close={close} />
      </View>
```
       <Toast message={toast} />
diff --git a/src/components/navigation/app-drawer.tsx b/src/components/navigation/app-drawer.tsx
index d442caa..87de42b 100644
--- a/src/components/navigation/app-drawer.tsx
+++ b/src/components/navigation/app-drawer.tsx
@@ -9,7 +9,7 @@ import { spacing } from '@/constants/theme';
 
 type DrawerContextValue = { openDrawer: () => void; closeDrawer: () => void };
 type IconName = ComponentProps<typeof Ionicons>['name'];
-type Destination = { label: string; path: '/' | '/archive' | '/settings'; icon: IconName };
+type Destination = { label: string; path: '/' | '/archive' | '/settings' | '/onboarding'; icon: IconName };
 
 const DrawerContext = createContext<DrawerContextValue | null>(null);
 // Boards, Chat, and Attachments are the 3 items in the bottom navigation; Archive
@@ -19,6 +19,7 @@ const DrawerContext = createContext<DrawerContextValue | null>(null);
 const boardsDestination: Destination = { label: 'Notes', path: '/', icon: 'reader-outline' };
 const archiveDestination: Destination = { label: 'Archive', path: '/archive', icon: 'archive-outline' };
 const settingsDestination: Destination = { label: 'Settings', path: '/settings', icon: 'settings-outline' };
+const gettingStartedDestination: Destination = { label: 'Getting started', path: '/onboarding', icon: 'compass-outline' };
 
 export function useAppDrawer() {
   const context = useContext(DrawerContext);
@@ -77,6 +78,7 @@ function DrawerContent({ close }: { close: () => void }) {
         <NavigationRow destination={archiveDestination} pathname={pathname} close={close} />
       </ScrollView>
       <View style={[styles.footer, { borderTopColor: tokens.borderSubtle }]}>
+        <NavigationRow destination={gettingStartedDestination} pathname={pathname} close={close} />
         <NavigationRow destination={settingsDestination} pathname={pathname} close={close} />
       </View>
     </SafeAreaView>
