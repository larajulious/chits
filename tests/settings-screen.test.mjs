import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { contrast } from '../src/constants/style-tokens.ts';
import { settingsSurfaces } from '../src/components/settings/settings-surfaces.ts';
import { loadModule } from './helpers/backup-runtime.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const screen = read('src/app/settings.tsx');
const rows = read('src/components/settings/settings-rows.tsx');
const privacy = read('src/features/anywhere/privacy-settings.tsx');
const kit = read('src/components/desk/paper-desk.tsx') + read('src/components/desk/desk-surface.tsx');
const deskFor = (scheme) => kit.match(new RegExp(`${scheme}: \\{ desk: '(#\\w+)'.*?ink: '(#\\w+)'`)).slice(1, 3);

const { CHITS_THEMES } = await loadModule('src/constants/chits-themes');
const palettes = Object.entries(CHITS_THEMES).filter(([, theme]) => theme.palette).flatMap(([id, theme]) => [[id, 'light', theme.palette.light], [id, 'dark', theme.palette.dark]]);
palettes.push(['default', 'light', { cardPaper: '#FFFDF6', textPrimary: '#24231F', textSecondary: '#5F5C52', accent: '#FBE47E', accentText: '#24231F' }]);
palettes.push(['default', 'dark', { cardPaper: '#211F19', textPrimary: '#F7F5EB', textSecondary: '#CBC5B4', accent: '#FBE47E', accentText: '#24231F' }]);

for (const [id, scheme, tokens] of palettes) {
  test(`${id} ${scheme}: sections stand apart from the desk and read clearly`, () => {
    const [desk, ink] = deskFor(scheme);
    const surfaces = settingsSurfaces(scheme, tokens, ink);
    assert.ok(contrast(tokens.textPrimary, surfaces.surface) >= 4.5, 'labels');
    assert.ok(contrast(tokens.textSecondary, surfaces.surface) >= 4.5, 'values and descriptions');
    assert.ok(contrast(surfaces.switchOff, surfaces.surface) >= 1.7, 'a switch that is off is visible');
    assert.ok(contrast(surfaces.thumbOff, surfaces.switchOff) >= 2, 'its thumb stands out from its track');
    assert.ok(contrast(tokens.accentText, tokens.accent) >= 4.5, 'the thumb of a switch that is on stands out from its track');
    assert.notEqual(surfaces.surface, desk);
  });
}

test('dark sections lift off the desk instead of melting into it', () => {
  const [desk, ink] = deskFor('dark');
  const surface = settingsSurfaces('dark', { cardPaper: '#211F19', textPrimary: '#F7F5EB' }, ink).surface;
  assert.ok(contrast(surface, desk) >= 1.15, `${surface} on ${desk}`);
  assert.ok(contrast('#211F19', desk) < 1.05, 'the plain paper really was indistinguishable');
});

test('every setting is still on the screen', () => {
  for (const setting of ["'settings.language'", "'settings.editNotespaceName'", "'spin.title'", "'settings.showChitsSpin'", '"settings.chitsSuggestions"', "'focus.settings'", "'focus.history'", "'appearancetheme.theme'", "'settings.style'", "'settings.appAppearance'", "'settings.accentColor'", "'backup.backupRestore'", 'ChatAppearanceSettings compact', 'WidgetPrivacySettings', 'EditNoteSpaceNameSheet', 'LanguagePicker']) assert.ok(screen.includes(setting), setting);
  assert.match(screen, /IconButton label=\{tr\("archive\.openNavigation"\)\}/, 'the menu stays');
  assert.match(screen, /IconButton label=\{tr\("settings\.closeSettings"\)\}/, 'close stays');
});

test('settings still save the way they did, with no Save step', () => {
  assert.match(screen, /spinRepository\.setVisibility\(value\)/);
  assert.match(screen, /ORGANIZATION_ENABLED_KEY, enabled \? 'true' : 'false'/);
  assert.doesNotMatch(screen, /tr\([^)]*[Ss]ave\b[^)]*\)\s*\}\s*onPress/);
});

test('one tap can only reach one handler on a toggle row', () => {
  const toggle = rows.slice(rows.indexOf('export function SettingsToggleRow'), rows.indexOf('/** Plain explanatory text'));
  assert.match(toggle, /onPress=\{\(\) => onChange\(!value\)\}/);
  assert.match(toggle, /pointerEvents="none"[^>]*>\s*<Switch/, 'the switch only shows the state');
  assert.doesNotMatch(toggle, /onValueChange/);
  assert.match(toggle, /accessibilityRole="switch"/);
  assert.match(toggle, /accessibilityState=\{\{ checked: value, disabled \}\}/);
});

test('widget privacy keeps its rules and stays free of the mascot', () => {
  assert.match(privacy, /change\(enabled \? 'titles' : 'hidden'\)/);
  assert.match(privacy, /change\(enabled \? 'previews' : 'titles'\)/);
  assert.match(privacy, /disabled=\{busy \|\| privacy === 'hidden'\}/, 'previews need titles');
  assert.match(privacy, /tr\('anywhere\.warning'\)/);
  assert.doesNotMatch(privacy, /Mascot|mascot|Chits[A-Z]/);
});

test('a backup is only confirmed from the value written after it was really saved', () => {
  const backup = read('src/app/backup.native.tsx');
  assert.ok(backup.indexOf('if (!saved)') < backup.indexOf("'last_backup_at'"), 'the date is only written once the file is saved');
  assert.match(screen, /saved > lastBackupSeen\.current/);
});

test('Chits in Settings is still, silent, and only reacts to a real change', () => {
  const preview = read('src/components/settings/appearance-preview.tsx');
  assert.match(preview, /entrance: false, idle: false/);
  assert.match(preview, /if \(paused \|\| !focused \|\| reacted\.current === look\) return;/);
  assert.doesNotMatch(preview, /SpeechBubble/);
  assert.equal((screen.match(/<AppearancePreview/g) ?? []).length, 1, 'one appearance of Chits on the whole screen');
  assert.doesNotMatch(preview, /createContext|setTheme|setStyle/, 'it reads the real theme rather than its own copy');
});

test('section headings share one capitalization in every language', () => {
  assert.match(screen, /<SettingsSection title="Chits">/);
  for (const language of ['en', 'de', 'fr', 'es', 'it', 'pt-BR', 'id', 'tr', 'vi', 'fil']) {
    const catalog = JSON.parse(read(`src/localization/locales/${language}.json`));
    for (const key of ['settings.general', 'settings.appearance', 'settings.data']) assert.notEqual(catalog[key], catalog[key].toLocaleUpperCase(language), `${language} ${key}`);
  }
});

test('Settings uses the Welcome type, but the preview keeps the real Style font', () => {
  assert.match(rows, /<AppText family=\{fonts\.text\} style=\{\[styles\.label/);
  assert.match(screen, /variant="title" family=\{fonts\.display\}/);
  assert.doesNotMatch(read('src/components/settings/appearance-preview.tsx'), /family=/, 'it shows what Style really does');
});


test('board drag keeps its proven structure', () => {
  const board = read('src/app/board/[id].native.tsx');
  assert.match(board, /activateAfterLongPress\(320\)/);
  assert.match(board, /scale: 1 \+ liftProgress\.get\(\) \* 0\.022/);
  assert.match(board, /cardDragging: \{ zIndex: 30/);
  assert.match(board, /dropTargetColumn: \{ borderWidth: 2, borderStyle: 'dashed' \}/);
});

test('every header title gets the paper tag, and only with a title', () => {
  const primitives = read('src/components/ui/primitives.tsx');
  assert.match(primitives, /\{title \? <HeaderTitleTag>/);
});

test('a board with no color of its own is tinted from the accent, not its dark text shade', () => {
  assert.match(read('src/components/boards/board-list-item.native.tsx'), /board\.accent \?\? tokens\.accent;/);
});

test('empty states use the agreed copy and quiet Chits until tapped, compact in columns', () => {
  assert.match(read('src/components/notes/notes-listing.native.tsx'), /workspace\.quietTitle/);
  assert.match(read('src/components/boards/boards-listing.native.tsx'), /workspace\.noBoardsTitle/);
  const board = read('src/app/board/[id].native.tsx');
  assert.match(board, /boardEmpty \? <OnboardingMascot still size=\{76\}/, 'one Chits for an empty board, none per column');
  assert.match(board, /columns\.every\(\(column\) => columnCardCount\(column, 0\) === 0\)/, 'an unloaded column cannot make a full board look empty');
  assert.match(read('src/components/ui/empty-state.tsx'), /interactive enableIdleAnimation=\{false\}/);
});


test('Default\'s header is the desk Chits sits on, and a custom photo still replaces it', () => {
  const provider = read('src/components/theme-provider.tsx');
  assert.match(provider, /deskHeader = identity === 'default' && !\(customHeader && !headerPhotoFailed\)/);
  assert.match(provider, /headerPhoto = customHeader && !headerPhotoFailed \? customHeader : null/);
  const bar = read('src/components/ui/top-bar.tsx');
  // The photo is checked first, so a preview or a saved photo wins over the desk.
  assert.ok(bar.indexOf('if (photo) return') < bar.indexOf('if (deskHeader) return'));
  // No hairline where the header meets the page, and dots that line up across the join.
  assert.match(bar, /deskHeader\) return \{ ink: desk\.ink, inkMuted: desk\.inkMuted, border: 'transparent'/);
  // A band doesn't reach under a border, so a see-through one would show the screen behind as a hairline.
  assert.match(read('src/components/ui/primitives.tsx'), /borderBottomWidth: border === 'transparent' \? 0 : StyleSheet\.hairlineWidth/);
  assert.match(bar, /deskDots: \{ position: 'absolute', left: 0, right: 0, bottom: 0, height: DOT_SPACING \* \d+, transform: \[\{ scaleY: -1 \}\] \}/);
});

test('note cards are the same rounded, level paper as the Boards list', () => {
  const card = read('src/components/boards/card-list-row.native.tsx');
  assert.match(card, /radius = styleTokens\.button\.radius/);
  assert.match(card, /backgroundColor: paper, borderRadius: radius/);
  assert.match(card, /transform: \[\{ scale: press\.get\(\) \}\]/);
  assert.doesNotMatch(card, /borderStyle: 'dashed'/);
});

test('Revisit\'s overview is Chits\' page, and its settings use the shared rows', () => {
  const screen = read('src/app/revisit.native.tsx');
  assert.match(screen, /<RevisitStage title=\{headerTitle\}/);
  assert.match(screen, /<SettingsToggleRow label=\{tr\("revisit\.enableRevisitSuggestions"\)\}/);
  assert.match(screen, /<SettingsRow label=\{tr\("revisit\.minimumInactivity"\)\}/);
  // A section with nothing in it isn't shown, so the page never lists empty headings.
  assert.match(screen, /if \(!suggestions\.length\) return null;/);
  // Actions and headings on the stage's sheet dress as paper, not as a theme page.
  assert.match(read('src/features/revisit/revisit-stage.tsx'), /<OnTheDesk>\{children\}<\/OnTheDesk>/);
});

test('the side panel is the desk over a sheet of paper, one layout for every style, without Chits', () => {
  const drawer = read('src/components/navigation/app-drawer.native.tsx');
  const hero = read('src/components/navigation/drawer-hero.tsx');
  assert.match(drawer, /<DrawerHero title=\{appTitle\}/);
  assert.doesNotMatch(drawer, /DrawerCard|InCardContext|LabelTape|style === 'classic'/);
  assert.doesNotMatch(drawer + hero, /Mascot/);
});

test('the side panel footer is one row of labelled icons', () => {
  const drawer = read('src/components/navigation/app-drawer.native.tsx');
  assert.match(drawer, /<StyleButton value=\{style\}/);
  assert.match(drawer, /destination=\{gettingStartedDestination\}[^>]*iconOnly/);
  assert.match(drawer, /destination=\{settingsDestination\}[^>]*iconOnly/);
  // Footer names are visible as well as available to screen readers.
  assert.match(drawer, /accessibilityLabel=\{tr\("settings\.style"\)\}/);
  assert.match(drawer, /styles\.dockLabel/);
  assert.match(drawer, /APP_STYLES\.map\(option/);
  assert.match(drawer, /onPress=\{\(\) => chooseStyle\(option\)\}/);
  assert.doesNotMatch(drawer, /const nextStyle|APP_STYLES\[\(APP_STYLES\.indexOf/);
});
