import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createSpaceRepository } = await loadModule('src/db/repositories');
const { loadStickyWidgetRows } = await loadModule('src/features/sticky-widget/data');
const { stickyWidgetSnapshot, stickyLines, thoughtLines, widgetLayout, resolveWidgetSpace, stickyWidgetURL, withoutNulls, MAX_STICKY_CHARS, FALLBACK_BOARD } = await loadModule('src/features/sticky-widget/snapshot');
const { parseBoardSize } = await loadModule('src/features/sticky-widget/board-size');
const { paperColor, PAPER_INK, magnetColor, noteSeed } = await loadModule('src/constants/spaces-theme');
const { fromUnit, STICKY_SIZE } = await loadModule('src/constants/spaces');

const labels = { hidden: 'Hidden Chit', voice: 'Voice note', choose: 'Choose a Space' };
const PINK = '#FFC7CC';

async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  return db;
}
async function thought(db, id, text, extra = {}) {
  await db.runAsync("INSERT INTO messages (id,text,type,created_at,updated_at,archived_at,deleted_at,is_hidden_content,content_json) VALUES (?,?,'text',1,1,?,?,?,?)", id, text, extra.archived ?? null, extra.deleted ?? null, extra.hidden ?? 0, extra.content ?? null);
}
async function card(db, id, title, messages) {
  await db.runAsync("INSERT OR IGNORE INTO boards(id,name,created_at,updated_at) VALUES ('board','Board',1,1)");
  await db.runAsync("INSERT OR IGNORE INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('col','board','Column',0,1,1)");
  await db.runAsync("INSERT INTO cards(id,board_id,column_id,title,position,created_at,updated_at) VALUES (?,'board','col',?,0,1,1)", id, title);
  for (const [position, message] of messages.entries()) await db.runAsync('INSERT INTO card_messages(card_id,message_id,position) VALUES (?,?,?)', id, message, position);
}
const BOARD = { width: 390, height: 612 };
const snapshotOf = async (db, board = BOARD) => stickyWidgetSnapshot(await loadStickyWidgetRows(db), { labels, empty: (name) => `Nothing here yet. Stick a note on your ${name}.`, locale: 'en', rtl: false, board });
const spaceOf = (snapshot, id) => snapshot.spaces.find((space) => space.id === id);

test('every Space is in the snapshot, with its pin, its own link and its empty words', async t => {
  const db = await fixture(t);
  const { snapshot } = await snapshotOf(db);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.ink, PAPER_INK);
  assert.deepEqual(snapshot.board, BOARD);
  assert.deepEqual((await snapshotOf(db, null)).snapshot.board, FALLBACK_BOARD);
  assert.deepEqual(snapshot.spaces.map((space) => [space.id, space.pin, space.url, space.notes.length]), [
    ['fridge', 'magnet', 'chits:///sticky?space=fridge', 0], ['desk', 'tape', 'chits:///sticky?space=desk', 0],
    ['cork', 'pushpin', 'chits:///sticky?space=cork', 0], ['wall', 'washi', 'chits:///sticky?space=wall', 0],
  ]);
  assert.equal(spaceOf(snapshot, 'fridge').empty, 'Nothing here yet. Stick a note on your Fridge.');
});

test('a pink sticky on the Fridge is on the Fridge widget: same pink, same spot, same tilt, the board stacking order', async t => {
  const db = await fixture(t);
  const spaces = createSpaceRepository(db);
  await thought(db, 'groceries', 'Buy groceries');
  await thought(db, 'second', 'Call mum');
  const { placement } = await spaces.stick('thought', 'groceries', 'fridge');
  await spaces.setColor(placement.id, PINK);
  await spaces.savePosition(placement.id, { x: 0.25, y: 0.75 });
  await spaces.stick('thought', 'second', 'fridge');
  await spaces.bringToFront(placement.id);
  const fridge = spaceOf((await snapshotOf(db)).snapshot, 'fridge');
  assert.deepEqual(fridge.notes.map((note) => note.id), ['second', 'groceries'], 'back to front');
  const note = fridge.notes[1];
  // Its spot on the user's board, by the board's own math.
  const spot = fromUnit({ x: 0.25, y: 0.75 }, BOARD);
  assert.deepEqual([note.left, note.top], [Math.round(spot.x * 10) / 10, Math.round(spot.y * 10) / 10]);
  assert.equal(note.tilt, placement.rotation);
  assert.deepEqual([note.base, note.curl], [paperColor(PINK).base, paperColor(PINK).curl]);
  assert.equal(note.pinColor, magnetColor(noteSeed(placement.id)));
  assert.deepEqual(note.lines, [{ t: 'Buy groceries', s: 'p' }]);
  assert.equal(note.url, 'chits:///sticky?kind=thought&id=groceries');
});

test('moving a note takes it to the other Space widget; edits, deletes and archives follow', async t => {
  const db = await fixture(t);
  const spaces = createSpaceRepository(db);
  for (const id of ['moving', 'gone', 'shelved', 'edited']) { await thought(db, id, id); await spaces.stick('thought', id, 'desk'); }
  const { placement } = await spaces.stick('thought', 'moving', 'desk');
  await spaces.moveToSpace(placement.id, 'wall');
  await db.runAsync("UPDATE messages SET deleted_at = 2 WHERE id = 'gone'");
  await db.runAsync("UPDATE messages SET archived_at = 2 WHERE id = 'shelved'");
  await db.runAsync("UPDATE messages SET text = 'edited words' WHERE id = 'edited'");
  const { snapshot } = await snapshotOf(db);
  assert.deepEqual(spaceOf(snapshot, 'desk').notes.map((note) => note.id), ['edited']);
  assert.equal(spaceOf(snapshot, 'desk').notes[0].lines[0].t, 'edited words');
  assert.deepEqual(spaceOf(snapshot, 'wall').notes.map((note) => note.id), ['moving']);
});

test('a note hidden in Chat is covered: no words, caption or label anywhere in the snapshot', async t => {
  const db = await fixture(t);
  const spaces = createSpaceRepository(db);
  await thought(db, 'secret', 'SECRET PIN 1234', { hidden: 1 });
  await thought(db, 'inner', 'CARD SECRET', { hidden: 1 });
  await card(db, 'private-card', 'PRIVATE TITLE', ['inner']);
  await spaces.stick('thought', 'secret', 'cork');
  await spaces.stick('card', 'private-card', 'cork');
  const { snapshot } = await snapshotOf(db);
  for (const note of spaceOf(snapshot, 'cork').notes) {
    assert.equal(note.hidden, true);
    assert.deepEqual(note.lines, []);
    assert.equal(note.label, 'Hidden Chit');
  }
  const serialized = JSON.stringify(snapshot);
  for (const secret of ['SECRET', '1234', 'PRIVATE']) assert.ok(!serialized.includes(secret), secret);
});

test('a card shows its title, then its thoughts with checklists, numbering and headings', async t => {
  const db = await fixture(t);
  const content = JSON.stringify([
    { type: 'text', text: 'Shopping', heading: 1 },
    { type: 'text', text: 'Milk', list: { kind: 'checklist', id: 'c', checked: true } },
    { type: 'text', text: 'Eggs', list: { kind: 'checklist', id: 'c', checked: false } },
    { type: 'text', text: 'Soap', list: { kind: 'numbered', id: 'n' } },
  ]);
  await thought(db, 'lead', 'Shopping\n\nMilk\n\nEggs\n\nSoap', { content });
  await thought(db, 'second', 'Also   the bank');
  await card(db, 'weekend', 'Weekend', ['lead', 'second']);
  await createSpaceRepository(db).stick('card', 'weekend', 'fridge');
  const [note] = spaceOf((await snapshotOf(db)).snapshot, 'fridge').notes;
  assert.deepEqual(note.lines, [
    { t: 'Weekend', s: 'h' }, { t: 'Shopping', s: 'h' }, { t: '☑ Milk', s: 'x' }, { t: '☐ Eggs', s: 'c' }, { t: '1. Soap', s: 'b' }, { t: 'Also the bank', s: 'p' },
  ]);
  assert.equal(note.url, stickyWidgetURL('card', 'weekend'));
});

test('words are bounded, and a title the note only repeats is written once, as on the board', () => {
  assert.deepEqual(stickyLines('Plan', [{ text: 'Plan\nmore', content: null }]), [{ t: 'Plan', s: 'p' }, { t: 'more', s: 'p' }]);
  assert.deepEqual(thoughtLines('  a  b \n\n\n c ', null), [{ t: 'a b', s: 'p' }, { t: 'c', s: 'p' }]);
  const lines = stickyLines(null, [{ text: Array.from({ length: 40 }, (_, i) => `line ${i} ${'word '.repeat(20)}`).join('\n'), content: null }]);
  assert.ok(lines.reduce((sum, line) => sum + line.t.length, 0) <= MAX_STICKY_CHARS + 1);
  assert.ok(lines.at(-1).t.endsWith('…'));
});

test('a photo note goes up as a print: the publisher gets the photo, the snapshot never gets its path', async t => {
  const db = await fixture(t);
  await thought(db, 'beach', 'Beach day');
  await db.runAsync("INSERT INTO attachments (id,message_id,type,storage_path,original_name,mime_type,size,duration,width,height,created_at) VALUES ('photo1','beach','photo','attachments/private/photo1.jpg','p.jpg','image/jpeg',10,NULL,4000,3000,1)");
  await createSpaceRepository(db).stick('thought', 'beach', 'wall');
  const { snapshot, photos } = await snapshotOf(db);
  const [note] = spaceOf(snapshot, 'wall').notes;
  assert.equal(note.object, 'print');
  assert.deepEqual(note.media, { type: 'photo', caption: 'Beach day', duration: null, image: null, attachmentId: 'photo1' });
  assert.deepEqual(photos, [{ attachmentId: 'photo1', storagePath: 'attachments/private/photo1.jpg', width: 4000, height: 3000 }]);
  assert.ok(!JSON.stringify(snapshot).includes('attachments/private'));
});

// iOS keeps widget props in UserDefaults, which takes only property lists: one
// null and the whole write is dropped, leaving the widget a bare Space.
test('what iOS stores is a property list: no nulls anywhere, only strings, finite numbers, booleans, arrays and objects', async t => {
  const db = await fixture(t);
  const spaces = createSpaceRepository(db);
  await thought(db, 'plain', 'Buy groceries');
  await thought(db, 'voice', '');
  await db.runAsync("INSERT INTO attachments (id,message_id,type,storage_path,duration,created_at) VALUES ('a1','voice','audio','v.m4a',NULL,1)");
  await thought(db, 'pic', '');
  await db.runAsync("INSERT INTO attachments (id,message_id,type,storage_path,width,height,created_at) VALUES ('a2','pic','photo','p.jpg',NULL,NULL,1)");
  await thought(db, 'hidden', 'x', { hidden: 1 });
  for (const id of ['plain', 'voice', 'pic', 'hidden']) await spaces.stick('thought', id, 'fridge');
  const { snapshot } = await snapshotOf(db);
  assert.ok(JSON.stringify(snapshot).includes('null'), 'the fixture has nulls to remove');
  const stored = withoutNulls(snapshot);
  const plist = (value, where) => {
    if (Array.isArray(value)) return value.forEach((item, index) => plist(item, `${where}[${index}]`));
    if (value && typeof value === 'object') return Object.entries(value).forEach(([key, item]) => plist(item, `${where}.${key}`));
    assert.ok(typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)), `${where} is ${value}`);
  };
  plist(stored, 'snapshot');
  const fridge = stored.spaces.find((space) => space.id === 'fridge');
  assert.deepEqual(fridge.notes.map((note) => note.id), ['plain', 'voice', 'pic', 'hidden']);
  assert.equal(fridge.notes[0].media, undefined);
  assert.equal(fridge.notes[2].media.image, undefined);
});

test('a widget is the board in miniature: one scale for every note, fitted and centered', () => {
  const notes = [{ id: 'a', left: 8, top: 16 }, { id: 'b', left: 240, top: 60 }, { id: 'c', left: 30, top: 440 }, { id: 'd', left: 150, top: 300 }];
  for (const [width, height] of [[148, 148], [321, 148], [321, 324], [600, 900]]) {
    const placed = widgetLayout(notes, width, height);
    const scale = placed[0].scale;
    assert.ok(scale > 0 && scale <= 1);
    for (const a of placed) for (const b of placed) {
      // Same gaps as on the board, times one factor: the arrangement is unchanged.
      assert.ok(Math.abs((b.left - a.left) - (b.note.left - a.note.left) * scale) < 1e-9);
      assert.ok(Math.abs((b.top - a.top) - (b.note.top - a.note.top) * scale) < 1e-9);
    }
    for (const item of placed) assert.ok(item.left >= 0 && item.top >= 0 && item.left + item.width <= width + 1e-9 && item.top + item.height <= height + 1e-9, `${width}x${height} ${item.note.id}`);
    assert.equal(placed[0].width, STICKY_SIZE.width * scale);
  }
  // Never drawn larger than on the board, and centered.
  const [single] = widgetLayout([{ id: 'one', left: 100, top: 100 }], 321, 324);
  assert.equal(single.scale, 1);
  assert.ok(Math.abs(single.left + single.width / 2 - 321 / 2) < 1e-9);
  assert.deepEqual(widgetLayout([], 148, 148), []);
  assert.equal(resolveWidgetSpace('cork'), 'cork');
  assert.equal(resolveWidgetSpace('garage'), 'fridge');
  assert.deepEqual(parseBoardSize('390x612'), { width: 390, height: 612 });
  assert.equal(parseBoardSize('390x'), null);
});

// expo-widgets turns the layout into a source string that the widget's engine
// evaluates with @expo/ui as globals. The string's escapes are read twice on
// the way, so a backslash in the layout breaks it, and only on a device.
test('the iOS layout survives the widget transform and draws every Space at every size', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(new URL('../package.json', import.meta.url));
  const babel = require('@babel/core');
  const file = new URL('../src/features/sticky-widget/widget.tsx', import.meta.url).pathname;
  const { code } = babel.transformFileSync(file, { babelrc: false, configFile: false, filename: file, presets: ['babel-preset-expo'], caller: { name: 'metro', platform: 'ios', isDev: false, bundler: 'metro' } });
  let source;
  new Function('exports', 'require', code)({}, (name) => name === 'expo-widgets' ? { createWidget: (_name, layout) => { source = layout; return {}; } } : {});
  assert.equal(typeof source, 'string');
  const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  const globals = { _jsx: jsx, _jsxs: jsx, _Fragment: 'fragment' };
  for (const name of ['Circle', 'HStack', 'Image', 'Link', 'Rectangle', 'Spacer', 'Text', 'VStack', 'ZStack']) globals[name] = (props) => ({ type: name, props });
  const modifier = (name) => (...args) => ({ $type: name, args });
  // Anything the engine doesn't define (an outer constant, an import) throws here as it would there.
  const scope = new Proxy(globals, { has: () => true, get: (target, key) => key in target ? target[key] : key in globalThis ? globalThis[key] : typeof key === 'string' && /^[a-z]/.test(key) ? modifier(key) : undefined });
  const layout = new Function('scope', `with (scope) { return (${source}); }`)(scope);
  const walk = (node, visit) => { if (!node || typeof node !== 'object') return; visit(node); [].concat(node.props?.children ?? []).forEach((child) => walk(child, visit)); };
  const find = (tree, type) => { const out = []; walk(tree, (node) => { if (node.type === type) out.push(node); }); return out; };
  const texts = (tree) => find(tree, 'Text').map((node) => [].concat(node.props.children).join(''));
  const urls = (tree) => { const out = []; walk(tree, (node) => (node.props?.modifiers ?? []).forEach((m) => { if (m.$type === 'widgetURL') out.push(m.args[0]); })); return out; };
  const note = (id, x, y, extra) => ({ key: `thought:${id}`, kind: 'thought', id, left: 8 + x * 245, top: 16 + y * 437, label: id, object: 'paper', paper: 'sticky', base: '#FFB8C2', curl: '#F09AA8', pinColor: '#E04B2A', tilt: 2, tapeTilt: 3, hidden: false, lines: [{ t: id, s: 'p' }], images: 0, media: null, url: `chits:///sticky?kind=thought&id=${id}`, ...extra });
  const space = (id, pin, notes) => ({ id, name: id, pin, empty: `Nothing on ${id}`, url: `chits:///sticky?space=${id}`, notes });
  const snapshot = { version: 1, board: { width: 393, height: 587 }, ink: '#2A2622', locale: 'en', rtl: false, labels, spaces: [
    space('fridge', 'magnet', [
      ...Array.from({ length: 8 }, (_, i) => note(`extra${i}`, i / 8, 1 - i / 8)),
      note('list', 0, 0, { paper: 'index', images: 2, lines: [{ t: 'To *do*', s: 'h' }, { t: '☑ Milk', s: 'x' }, { t: '☐ [Eggs]', s: 'c' }] }),
      note('receipt', 1, 0, { paper: 'receipt' }), note('secret', 0, 1, { hidden: true, lines: [] }),
      note('photo', 1, 1, { object: 'print', lines: [], media: { type: 'photo', caption: 'Beach', duration: null, image: 'file:///group/sticky-a.jpg', attachmentId: 'a' } }),
      note('video', 0.5, 0.5, { object: 'print', lines: [], media: { type: 'video', caption: null, duration: null, image: null, attachmentId: 'b' } }),
      note('voice', 0.3, 0.2, { object: 'cassette', lines: [], media: { type: 'audio', caption: null, duration: '1:23', image: null, attachmentId: 'c' } }),
    ]),
    space('desk', 'tape', [note('essay', 0.2, 0.3)]), space('cork', 'pushpin', [note('trip', 0.7, 0.4)]), space('wall', 'washi', []),
  ] };
  // The layout draws what iOS stores: the snapshot without its nulls.
  const stored = withoutNulls(snapshot);
  // How SwiftUI lays these out, checked on every tree: no NaN or infinite sizes
  // reach it, a top-leading stack with a fixed frame is pinned there (a frame
  // centers its content by default), and padding never sits outside a fixed frame.
  const swiftUI = (tree, where) => walk(tree, (node) => {
    const modifiers = node.props?.modifiers ?? [];
    const numbers = (value) => (typeof value === 'number' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(numbers) : []);
    for (const m of modifiers) for (const value of numbers(m.args)) assert.ok(Number.isFinite(value) || value === Infinity, `${where}: ${m.$type} got ${value}`);
    const fixed = modifiers.findIndex((m) => m.$type === 'frame' && (typeof m.args[0]?.width === 'number' || typeof m.args[0]?.height === 'number') && m.args[0]?.maxWidth === undefined);
    if (fixed >= 0) assert.ok(!modifiers.slice(fixed + 1).some((m) => m.$type === 'padding'), `${where}: padding after a fixed frame on ${node.type}`);
    if (node.type === 'ZStack' && node.props.alignment === 'topLeading' && fixed >= 0 && typeof modifiers[fixed].args[0].width === 'number' && typeof modifiers[fixed].args[0].height === 'number') {
      assert.equal(modifiers[fixed].args[0].alignment, 'topLeading', `${where}: a top-leading ZStack's fixed frame must pin it top-leading`);
    }
  });
  // A snapshot from before notes carried their board spot still draws.
  const older = { ...stored, spaces: stored.spaces.map((item) => ({ ...item, notes: item.notes.map(({ left: _left, top: _top, ...rest }) => ({ ...rest, x: 0.5, y: 0.5 })) })) };
  for (const widgetFamily of ['systemSmall', 'systemMedium', 'systemLarge']) {
    for (const spaceId of ['fridge', 'desk', 'cork', 'wall', 'garage', undefined]) {
      const tree = layout(stored, { widgetFamily, configuration: { space: spaceId } });
      assert.deepEqual(urls(tree), [`chits:///sticky?space=${['desk', 'cork', 'wall'].includes(spaceId) ? spaceId : 'fridge'}`]);
      swiftUI(tree, `${widgetFamily} ${spaceId}`);
      swiftUI(layout(older, { widgetFamily, configuration: { space: spaceId } }), `older ${widgetFamily} ${spaceId}`);
    }
    swiftUI(layout(undefined, { widgetFamily, configuration: { space: 'desk' } }), `${widgetFamily} unpublished`);
  }
  // Every note (a full Space is twelve), placed exactly where the shared miniature math puts it.
  const fridgeNotes = stored.spaces[0].notes.slice(-12);
  const small = layout(stored, { widgetFamily: 'systemSmall', configuration: { space: 'fridge' } });
  assert.equal(find(small, 'Link').length, 0);
  const stickies = find(small, 'ZStack').filter((node) => node.props.modifiers?.[0]?.args?.[0]?.alignment === 'topLeading' && node.props.modifiers.some((m) => m.$type === 'rotationEffect'));
  const expected = widgetLayout(fridgeNotes, 148, 148);
  assert.equal(stickies.length, 12);
  stickies.forEach((sticky, index) => {
    const place = sticky.props.modifiers.find((m) => m.$type === 'offset').args[0];
    assert.ok(Math.abs(place.x - expected[index].left) < 1e-9 && Math.abs(place.y - expected[index].top) < 1e-9, `small ${index}`);
  });
  const large = layout(stored, { widgetFamily: 'systemLarge', configuration: { space: 'fridge' } });
  const links = find(large, 'Link');
  assert.equal(links.length, 12);
  const largeExpected = widgetLayout(fridgeNotes, 321, 324);
  links.forEach((link, index) => {
    const place = link.props.modifiers.find((m) => m.$type === 'offset').args[0];
    assert.ok(Math.abs(place.x - largeExpected[index].left) < 1e-9 && Math.abs(place.y - largeExpected[index].top) < 1e-9, `large ${index}`);
  });
  const words = texts(large);
  assert.ok(words.includes(`${String.fromCharCode(8203)}**To \\*do\\***\n☑ ~~Milk~~\n☐ \\[Eggs\\]`), JSON.stringify(words));
  assert.ok(words.includes('Hidden Chit'));
  assert.ok(!words.some((text) => text.includes('secret')));
  assert.deepEqual(texts(layout(stored, { widgetFamily: 'systemMedium', configuration: { space: 'wall' } })), ['Nothing on wall']);
});
