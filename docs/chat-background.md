# Chat background

Chits has three photo-background entry points. Photo and card actions use `ChatBackgroundPreview`; Chat Appearance keeps its preview inline.

| Entry | Exact placement | Actions |
| --- | --- | --- |
| Fullscreen photo | Upper-right overflow, with an inset-aware close control at upper left | Set as Chat Background; Save to Photos on iOS / Download on Android; Share; Delete |
| Card Details | Ellipsis on the selected photo, including photos from linked thoughts and photos added directly to the card | View; Save to Photos / Download; Use as Chat Background; Delete Attachment |
| Settings | CHAT APPEARANCE section below the existing APPEARANCE section, then Background | Inline preview; Choose from Attachments; Choose from Device; appearance controls; Remove Background; Reset to Default |

The Settings row shows a thumbnail for a custom photo. Without one, it shows Default and “Choose a photo to personalize your chat.” Choosing from Attachments opens the existing library in photo-only selection mode. Selecting a photo returns directly to the inline Chat Appearance preview; canceling the picker reopens Chat Appearance with the saved background. The library's Set as Chat Background action also uses this inline preview. Attachment and device selections show Use as Background and Cancel below the inline controls, and saving stays on Chat Appearance. Applying from the fullscreen photo viewer closes that viewer.

## Preview and readability

Chat Appearance uses the same `ChatBackgroundLayer` as Chat for image cropping, dimming, and background-only blur. Its rounded preview contains exactly one real quick-thought bubble reading “Your chat will look like this,” near the lower edge, without metadata or actions. It has no expand control, Current Background bar, or separate preview screen. Selected device photos, dim changes, blur changes, removal, and reset update this preview in place. Unsaved device photos are cleaned up on cancellation, replacement, or dismissal.

Photo and card previews reuse Chits' actual header surface, quick thought bubbles, structured note cards, timestamps, and composer surface in the current app appearance. Their example notes contain no stored user content. The sample notes scroll inside the scene while the header and composer stay visible. Dim and blur controls sit below the scene, with Use as Background and Cancel in the bottom action area.

New photos start at 35% dim with blur off. The slider updates continuously; blur updates immediately. Reopening the current photo retains its saved style and shows Current Chat Background. Settings adjustments save on slider release or blur change. Reset to Default uses the same confirmation as removal.

The image and black dim overlay render behind the timeline. Text, cards, header controls, and composer retain normal opacity. External timestamps and the empty-chat prompt receive readable themed surfaces when a custom background is active. No image editing or theme catalog is added. Automatic image-brightness analysis is not included.

## Local storage and deletion

The existing SQLite `app_settings` table stores one background record with a relative storage path and its dim/blur values. Attachment photos keep their original attachment reference. Device photos use dedicated app-owned `chits-attachments/backgrounds/` storage through Chits' existing photo intake pipeline; picker URIs are never persisted. Device reselection checks the system asset ID and a source-file fingerprint before making another copy.

Canceling a new device selection removes its staged copy. Changing or removing an applied device background cleans up its owned asset. Removing an attachment background clears only the setting and preserves the original attachment and text. Existing backup archives include the setting and app-owned attachment directory.

Deleting the active photo warns “This photo is currently your chat background.” Confirmation uses Remove Background & Delete. The background reference is cleared in the same transaction that deletes the attachment, before physical file cleanup. Shared paths are checked across both message and card attachment tables. Whole-thought and whole-card deletion also clear affected background references.

Native action-sheet callbacks run after dismissal completes so another preview or confirmation can present safely. The photo viewer and its preview share one native modal host.

## Verification

The subsequent attachment-picker return to inline Chat Appearance passed TypeScript and changed-file ESLint checks. Device testing of that handoff is left for manual review.

The inline Chat Appearance update was reviewed on September 28, 2026. TypeScript, all 73 Node tests, and both native builds passed; lint reported only the two existing Settings warnings. Android 13 emulator and iPhone 17 / iOS 26.5 simulator checks covered device selection without leaving Chat Appearance, dim/blur changes, saving and reopening the saved style, removal/reset, and cancellation. Android also verified the preserved attachment chooser, one passive sample bubble, staged-photo cleanup, and normal Chat back navigation. Screenshots confirmed that background blur leaves the bubble sharp. Separate QA application IDs kept the existing installed app and its data untouched.

Reviewed on September 28, 2026, using separate QA application IDs and fixture data. The existing installed app and its data were preserved.

- TypeScript passed. All 68 Node tests passed, including actual SQLite persistence, atomic deletion, shared-path protection, stale attachment handling, and device reselection.
- Lint passed with two existing unused-variable warnings in Settings. Both native application builds succeeded.
- iPhone 17 simulator, iOS 26.5: all five requested flows passed. Additional UI checks passed for dim adjustment, dark appearance, and a composer above the open keyboard. Cold launch restored the background.
- Android 16 physical device: Card Details and fullscreen photo flows passed. A system-picked device background survived source-gallery deletion, a cold launch, and a QA app update. Keyboard and empty-chat readability were visually checked.
- Android 13 emulator: attachment selection, preview cancellation, and application passed. Removal and active-photo deletion were reviewed with Wi-Fi and mobile data disabled. Device-photo reselection reused the same saved reference with exactly one owned background asset; the background also survived an emulator OS reboot after its gallery source was deleted.

Physical phone reboot, a physical iPhone, and full VoiceOver/TalkBack review remain unverified. The web build retains the existing navigation-only preview.
