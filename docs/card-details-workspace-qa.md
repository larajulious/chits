# Card Details — paper workspace

The native `/card/[id]` screen now puts the editable card title and board/column
context above the existing rich note renderer. The room header, dotted desk,
theme settings, original content editor, attachment viewers, reminder editor,
repository calls, confirmations, and navigation destinations remain in use.
No schema, stored-content representation, or dependency was changed by this work.

Content uses the existing NotePaper surface with quiet depth and theme-aware ink.
Supporting sections use rounded paper surfaces. Subtasks show translated progress,
an animated checkbox, and a 32-point static existing mascot only when all are done.
Checkbox state remains inside CardSubtasks and retains its existing serialized
write queue, failure reload, order, and action menu.

Reminders show the actual date/time and permission/overdue status. Connected Notes
uses its existing compact preview panel and link action. Metadata uses two columns,
stacking on narrow screens or with enlarged text. Existing media handlers are
retained, including the attachment menus. Comments show their local source (You),
text, timestamps, and existing edit/copy/delete options. The shared KeyboardPane
keeps the persistent composer above the keyboard; successful sends reveal the
new comment after layout rather than scrolling past it into Card Actions.

Actions are grouped under Sharing, Organization, and Card management. Delete has
a separate surface and retains its destructive confirmation. Hidden content keeps
its existing cover and temporary-reveal behavior. The default screen identity is
18 points; the note title is 30 points. At narrow widths with enlarged text they
adapt while continuing to respect system font scaling. AppHeader gained an optional
titleStyle prop used only here; its other callers keep their existing defaults.

Opening uses a short native fade/slide over the desk background and the shared
title reveal. Reduced motion disables those transitions and the checkbox scale.
Back still pops the existing route without replacing the board or its scroll state.
This is not a shared-element implementation.

## Validation on 2026-11-04

- `npm test`: **678 passed**, no failures or skips.
- `npx tsc --noEmit`: passed.
- Focused ESLint on the changed screen, subtasks, header, and fixture: passed.
- Localization audit: all 14 catalogs pass, including the six new labels.
- Scoped `git diff --check`: passed.
- Android emulator, 411-point width: light/Classic and dark/Sticky with rose accent;
  rich paragraphs, bullets, saved checklist, inline image preview, connected-note
  preview, PDF filename/menu layout, reminder status, metadata, comments, and actions.
- Android interaction: subtask completion/progress/all-complete mascot; inline
  photo preview opening and dismissal; comment typing with keyboard visible;
  successful send with both comments visible above the composer.
- Android at 320-point width, 140% text, and reduced motion: long title, wrapped
  content toolbar, stacked metadata, attachment row, and persistent composer.
- Fixture note data used disposable cache SQLite databases, separate from chits.db.
  An in-memory database cannot support the repository's exclusive transactions
  across separate connections. Temporary fixture route and QA files were removed.
  Emulator size, font scale, and animator duration were restored.

Screenshots from the local run:

- [Light content](/tmp/chits-card-light-final.png)
- [Dark with rose accent](/tmp/chits-card-dark-final.png)
- [Subtasks and reminder](/tmp/chits-card-light-middle.png)
- [Metadata and attachment](/tmp/chits-card-lower-sections.png)
- [Keyboard and draft](/tmp/chits-card-keyboard-verified.png)
- [Successful send and scroll](/tmp/chits-card-comment-sent.png)
- [Grouped actions](/tmp/chits-card-actions.png)
- [320-point width, 140% text](/tmp/chits-card-small-final.png)
- [Stacked metadata at enlarged text](/tmp/chits-card-small-sections.png)

## Remaining native acceptance

iOS and physical-device interaction, screen readers, native-language review of the
new labels, large media libraries, audio/video playback, external downloads/sharing,
notification delivery, and release-build acceptance were not validated in this run.
The fixture does not exercise routes into the full-screen content editor, Focus,
Chat, Revisit, or a real board; those destinations still use the app database.
Persistence and notification regression tests passed, but they do not replace
those device checks. The iOS simulator remained behind an existing system Open
in Chits dialog, so no iOS visual acceptance is claimed.

Development runs emitted the existing getId deprecation, require-cycle, and
state-update-before-mount warnings. Fast Refresh of the shared primitives also
required a fresh launch to rebuild drawer context. Fixture initialization was
corrected to use isolated file databases; no migration change was needed.

To repeat the visual check, temporarily copy
`tests/native/card-workspace.fixture.tsx` to `src/app/card-workspace-qa.tsx` and open
`chits:///card-workspace-qa?id=workspace-qa`. Parameters include `mode=dark`,
`accent=rose`, `style=sticky`, `long=1`, `hidden=1`, and `empty=1`.
Remove the route, the `card-workspace-qa` cache directory, and the two
`card-workspace-qa` media files in Documents after testing.

Expo references inspected: [SDK 57](https://docs.expo.dev/versions/v57.0.0/),
[Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/), and
[FileSystem legacy](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem-legacy/).
