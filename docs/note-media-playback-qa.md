# Notes media playback

Manual verification only; no builds, tests, lint or typecheck were run.

Changes: video previews open the existing native video viewer. Recording
previews use Chits' existing cassette artwork and open a cassette player with
play/pause, elapsed time and progress. Both previews provide a separate Edit
button using the existing note-opening handler. Players mount only when opened.
Canvas audio cards reserve space for the cassette and its controls. Stored
attachments, note content, edit routes and save handlers are unchanged.

On Android and iOS, check both Notes grid/list and the Notes free board:

1. For a video note, tap the preview/Play icon. It should open playback, not the
   editor. Try pause, seek, fullscreen and Close/Android Back. Then tap Edit and
   confirm the existing editor opens with the same note and video.
2. For a recording, confirm the cassette, duration, Play and Edit are visible.
   Tap the cassette or Play. Playback should start in the cassette viewer. Check
   pause/resume, replay after the end, elapsed time/progress and reel animation.
   Close it and verify the sound stops. Background the app while playing: audio
   should pause. With reduced motion, the reels should remain still.
3. Tap Edit on a recording, change its text, save, and reopen playback. The
   original recording should still be there. Cancel an edit as well.
4. On the free board, test Play and Edit while zoomed in. Hold, drag and pan near
   the controls; actions must not fire after a pan. Check long holds on controls
   and on the card body. When zoomed far out, zoom in to access full controls.
   Confirm the enlarged recording cards do not clip their footer or controls.
5. Check missing media: Play should show Unavailable without opening an editor
   or changing the note. Check hidden notes do not expose media before reveal.
6. Check photos, checklist ticks, overflow actions, filters and My order dragging.
   In My order, hold the card body to arrange it; Play and Edit should remain
   usable as separate taps. Use a
   screen reader to check that Play and Edit are separate accessible actions.

The leading attachment remains the card preview, using the existing media
selection rule. Other attachments remain accessible through the existing editor.
