# Pull to create a note

This replaces the Notes header's pull-to-refresh action. The existing elastic
header and mascot animation remain; pull completion opens AddNoteSheet with a
blank text draft in fullscreen, skipping its type/template chooser and focusing the editor.
The Write button retains its chooser. Nothing is reloaded or persisted until
the user submits the note.

Manual verification on iOS and Android (not run):

1. At the top of Notes, pull until “Release to create a note” appears, then
   release. Check that a fullscreen blank editor opens once with the keyboard, without a
   type/template chooser, and the header
   springs back underneath it. Try slow pulls, fast pulls, and repeated pulls.
2. Cancel the composer. Check that the note count and stored notes are unchanged,
   the header and filter rail have returned, and another pull can open it again.
3. Create a note and submit it. Check that it appears through the existing save
   flow and only one note is saved. Try the Write button too.
4. Release below the threshold, or cross it and drag back below before releasing.
   The header should return without opening the composer.
5. Check both the note grid and free board. On the free board, initiate the pull
   from the hero; note dragging and canvas panning should still work. On the grid,
   ordinary scrolling away from the top should not open a composer.
6. Check filter tabs, mascot speech, reduced motion, screen-reader threshold
   announcements, backgrounding during a pull, and returning to Notes. No refresh
   loading label or refresh error should appear.

Validation performed: source review and `git diff --check`. No builds or tests
were run. The existing native mascot fixture now uses its draft-open callback
for pull completion instead of a simulated refresh.
