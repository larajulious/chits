# Images after Classic / Sticky changes

The failure was reproduced on Android with the actual `MessageRow` renderer:
images and captions disappeared inside the card, but its background and border
remained visible. The URI and file bytes did not change. Native accessibility
nodes and layout boxes still existed; an accessibility-only test missed the bug.

The painted media surface combined `overflow: hidden` with a rounded background
and border that change with the app style. Restyling that native clipping surface
could hide the entire descendant subtree. Turning off FlatList clipping, or
preventing flattening of the row wrapper, did not resolve it. Removing clipping
from that painted view did. The final implementation keeps the rounded mask in a
separate, borderless native content view and leaves the painted border/background
on the outer Pressable. This retains rounded images, the outline and bottom edge.

Restarting rebuilt native surfaces with the saved style on their first layout;
it did not repair image files. The fix leaves sources, caching, image components,
message IDs, SQLite, pagination and scroll anchoring intact. There is one stable
content wrapper per mounted media message. List virtualization and native
`removeClippedSubviews` retain their existing configuration.

## Runtime verification

A disposable iPhone simulator (iOS 27) and Pixel 7 Android emulator (API 33) used
`tests/native/chat-style-images.fixture.tsx`, which renders a 90-message history
through the production message renderer and ThemeProvider. The fixture includes
ordinary photos, text and interleaved images, and multi-photo card mosaics. It uses
app-owned local storage through the same resolver as gallery, clipboard and
restored images; these media-import paths also retain their persistence tests.

Before the fix, Android captures contained **zero** cyan fixture pixels after
some style changes. The card outline remained. With the separate mask, all
repeated-switch captures on both platforms retained visible fixture pixels.
All 32 post-fix screenshot checks passed, including settings / return, multi-photo
mosaics and switches with the keyboard open on both platforms. Screenshots, rather than
only labels or `onLoad`, verify that actual image pixels are displayed.

To repeat on disposable test devices:

1. Temporarily copy the fixture to `src/app/style-image-qa.native.tsx`, and add a
   `src/app/style-image-qa.tsx` web fallback exporting a component returning null.
2. Copy `assets/images/react-logo.png` to the test app's document directory at
   `chits-attachments/chat/style-qa.png`. Finish/skip onboarding, then open
   `chits:///style-image-qa` in that test app.
3. Run `maestro --udid DEVICE_ID test tests/native/chat-style-images.yaml`.
   The native mask is exercised across repeated switches, light/dark and scrolling.
4. Run `python3 tests/native/check-chat-style-images.py SCREENSHOT_DIRECTORY` on
   Maestro's `takeScreenshot` folder. A blank native card must fail this check.
5. Verify settings / return and switches with the keyboard open, including
   photos/mosaics scrolled offscreen and returned into view. Remove the temporary
   routes and test devices after the check.

The production change is only in `src/components/chat/message-row.native.tsx`.
Native fixture tests establish the reproduced rendering fix; physical-device
OEM/OS variations and a production-scale scrolling benchmark are separate QA.
