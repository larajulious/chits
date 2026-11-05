# Shared header controls

Checked 2026-11-04 in the Expo SDK 57 checkout. Existing local work was retained.

Screen header controls now use the Boards/board-columns filled 46dp button,
including AppHeader in both visual styles, Settings, Backup, Calendar, Chat,
Spaces, Plan My Day and photo/PDF viewers. Note picker close controls and the
column-management header also use it. Multi-button header widths and gaps were
adjusted. Tile ink follows the theme, and press scaling respects reduced motion.
Existing labels, hints, disabled/expanded states and action handlers are retained.

The decorative PaperDesk edge overlay and its API were removed, including its
remaining Settings and board-details callers. Functional content, search rows
and sheet handles are retained. Calendar puts its date navigation in a compact
second row so the filled controls and month title have enough space.

Validation:

- TypeScript passed with `npx tsc --noEmit`.
- Focused ESLint found no errors. The existing missing `loadCandidates` effect
  dependency warning in `spaces/note-picker.tsx` remains outside this change.
- 104 existing Settings, theme, header scene/photo, Chat transition and Calendar
  tests passed.
- Android emulator: Settings has matching filled controls and no empty edge strip;
  Calendar fits its actions and the next-month arrow changes November to December;
  Chat displays matching back/overflow controls. No notes or boards were created.

Screenshots:

- [Settings](/tmp/chits-headers-settings.png)
- [Calendar](/tmp/chits-headers-calendar.png)
- [Calendar after next month](/tmp/chits-headers-calendar-next.png)
- [Chat](/tmp/chits-headers-chat.png)

The temporary dark-mode fixture route did not load reliably in this Metro
session and was removed. Dark mode has source/theme-test coverage here; a fresh
dark native screenshot, iOS, physical devices, screen-reader interaction and
viewer-specific interaction remain unverified. Existing development startup
warnings are recorded in `boards-mascot-qa.md`.
