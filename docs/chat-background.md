# Chat background

Chits has three photo-background entry points. Each opens the same `ChatBackgroundPreview` before saving a selection.

| Entry | Exact placement | Actions |
| --- | --- | --- |
| Fullscreen photo | Upper-right overflow, with an inset-aware close control at upper left | Set as Chat Background; Save to Photos on iOS / Download on Android; Share; Delete |
| Card Details | Ellipsis on the selected photo, including photos from linked thoughts and photos added directly to the card | View; Save to Photos / Download; Use as Chat Background; Delete Attachment |
| Settings | CHAT APPEARANCE section below the existing APPEARANCE section, then Background | Current Background; Choose from Attachments; Choose from Device; appearance controls; Remove Background; Reset to Default |

The Settings row shows a thumbnail for a custom photo. Without one, it shows Default and “Choose a photo to personalize your chat.” Choosing from Attachments opens the existing library in photo-only selection mode. Applying returns to Chat; canceling the preview leaves the selection unchanged. Applying from the fullscreen viewer closes that viewer.

## Preview and readability

The preview reuses Chits' actual header surface, quick thought bubbles, structured note cards, timestamps, and composer surface in the current app appearance. Its example notes contain no stored user content. The sample notes scroll inside the scene while the header and composer stay visible. Dim and blur controls sit below the scene, with Use as Background and Cancel in the bottom action area.

New photos start at 35% dim with blur off. The slider updates continuously; blur updates immediately. Reopening the current photo retains its saved style and shows Current Chat Background. Settings adjustments save on slider release or blur change. Reset to Default uses the same confirmation as removal.

The image and black dim overlay render behind the timeline. Text, cards, header controls, and composer retain normal opacity. External timestamps and the empty-chat prompt receive readable themed surfaces when a custom background is active. No image editing or theme catalog is added. Automatic image-brightness analysis is not included.

## Local storage and deletion

The existing SQLite `app_settings` table stores one background record with a relative storage path and its dim/blur values. Attachment photos keep their original attachment reference. Device photos use dedicated app-owned `chits-attachments/backgrounds/` storage through Chits' existing photo intake pipeline; picker URIs are never persisted. Device reselection checks the system asset ID and a source-file fingerprint before making another copy.

Canceling a new device selection removes its staged copy. Changing or removing an applied device background cleans up its owned asset. Removing an attachment background clears only the setting and preserves the original attachment and text. Existing backup archives include the setting and app-owned attachment directory.

Deleting the active photo warns “This photo is currently your chat background.” Confirmation uses Remove Background & Delete. The background reference is cleared in the same transaction that deletes the attachment, before physical file cleanup. Shared paths are checked across both message and card attachment tables. Whole-thought and whole-card deletion also clear affected background references.

Native action-sheet callbacks run after dismissal completes so another preview or confirmation can present safely. The photo viewer and its preview share one native modal host.

## Verification

Reviewed on September 28, 2026, using separate QA application IDs and fixture data. The existing installed app and its data were preserved.

- TypeScript passed. All 68 Node tests passed, including actual SQLite persistence, atomic deletion, shared-path protection, stale attachment handling, and device reselection.
- Lint passed with two existing unused-variable warnings in Settings. Both native application builds succeeded.
- iPhone 17 simulator, iOS 26.5: all five requested flows passed. Additional UI checks passed for dim adjustment, dark appearance, and a composer above the open keyboard. Cold launch restored the background.
- Android 16 physical device: Card Details and fullscreen photo flows passed. A system-picked device background survived source-gallery deletion, a cold launch, and a QA app update. Keyboard and empty-chat readability were visually checked.
- Android 13 emulator: attachment selection, preview cancellation, and application passed. Removal and active-photo deletion were reviewed with Wi-Fi and mobile data disabled. Device-photo reselection reused the same saved reference with exactly one owned background asset; the background also survived an emulator OS reboot after its gallery source was deleted.

Physical phone reboot, a physical iPhone, and full VoiceOver/TalkBack review remain unverified. The web build retains the existing navigation-only preview.
