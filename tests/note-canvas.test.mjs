import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';
import {
  boundsOf, canvasCardFrame, canvasRangeKey, canvasTilt, CANVAS_HALF, CANVAS_MAX_TILT, clampCamera, clampToWorld, clampZoom, createCanvasIndex, fitCamera, floorZoom, focusCamera, frameCamera, homeCamera,
  LITE_ZOOM, MAX_ZOOM, MIN_ZOOM, nextTapZoom, noteAtPoint, openingCamera, panLimits, parseCanvasPrefs, parseCanvasRange, placeBoard, placeNear, queryCanvasIndex, zoomAround,
} from '../src/services/note-canvas.ts';

const { createNoteCanvasRepository } = await loadModule('src/db/note-canvas-repository');
const { createNoteOrderRepository } = await loadModule('src/db/note-order-repository');

const VIEW = { width: 390, height: 520 };
const note = (index) => ({ key: `card:${index}`, width: [168, 196, 228, 216][index % 4], height: 110 + (index * 37) % 170 });
const notes = (count) => Array.from({ length: count }, (_, index) => note(index));
const rects = (list, placed) => list.map((entry) => ({ ...entry, ...placed.get(entry.key) }));
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const blank = { title: null, body: null, hidden: false, rows: 0, moreRows: false, progress: false, picture: null, audio: false, file: false, reminder: false };

test('the first arrangement is deterministic, whatever the run', () => {
  assert.deepEqual([...placeBoard(notes(60))], [...placeBoard(notes(60))]);
});

test('the first arrangement never overlaps two notes', () => {
  for (const count of [1, 2, 7, 60, 400]) {
    const list = rects(notes(count), placeBoard(notes(count)));
    for (let a = 0; a < list.length; a += 1) for (let b = a + 1; b < list.length; b += 1) assert.ok(!overlaps(list[a], list[b]), `${list[a].key} over ${list[b].key} of ${count}`);
  }
});

test('the first arrangement keeps the sort order: the top of the list starts at the top left', () => {
  const placed = placeBoard(notes(40));
  assert.equal(placed.get('card:0').y, 0);
  assert.ok(placed.get('card:0').x < 60);
  // Later notes never land above where earlier ones in their column ended.
  const list = rects(notes(40), placed);
  assert.ok(list.slice(0, 8).reduce((sum, entry) => sum + entry.y, 0) < list.slice(-8).reduce((sum, entry) => sum + entry.y, 0));
});

test('the first arrangement is loose, not a grid', () => {
  const placed = [...placeBoard(notes(60)).values()];
  assert.ok(new Set(placed.map((spot) => spot.x)).size > 30, 'notes wander inside their lanes');
  assert.ok(new Set(placed.map((spot) => spot.y)).size > 30, 'rows do not line up');
});

test('a huge board stays roughly square, and inside the world where touches reach it', () => {
  for (const count of [200, 2000, 8000]) {
    const bounds = boundsOf(rects(notes(count), placeBoard(notes(count))));
    assert.ok(bounds.width / bounds.height > 0.5 && bounds.width / bounds.height < 2, `${count}: ${bounds.width} x ${bounds.height}`);
    assert.ok(bounds.x + bounds.width < CANVAS_HALF && bounds.y + bounds.height < CANVAS_HALF, `${count} notes leave the world`);
  }
});

test('a new note lands near the view without covering anything', () => {
  const list = rects(notes(30), placeBoard(notes(30)));
  const index = createCanvasIndex(list);
  const center = { x: 400, y: 300 };
  const size = { width: 196, height: 140 };
  const spot = placeNear(size, center, index);
  const rect = { ...spot, ...size };
  assert.ok(list.every((entry) => !overlaps(entry, rect)));
  assert.equal(placeNear(size, center, index).x, spot.x, 'the same board gives the same spot');
  assert.ok(Math.hypot(spot.x - center.x, spot.y - center.y) < 1500);
});

test('a new note lands in full view when there is room, and past it when there is not', () => {
  const visible = { x: 0, y: 0, width: 360, height: 500 };
  const size = { width: 168, height: 110 };
  const crowded = createCanvasIndex([{ x: 90, y: 150, width: 180, height: 200 }]);
  const spot = placeNear(size, { x: 180, y: 250 }, crowded, visible);
  assert.ok(spot.x >= 0 && spot.y >= 0 && spot.x + size.width <= 360 && spot.y + size.height <= 500, JSON.stringify(spot));
  const full = createCanvasIndex([{ x: -50, y: -50, width: 460, height: 600 }]);
  const outside = placeNear(size, { x: 180, y: 250 }, full, visible);
  assert.ok(!overlaps({ ...outside, ...size }, { x: -50, y: -50, width: 460, height: 600 }));
});

test('a new note on an empty stretch goes right at the center', () => {
  const spot = placeNear({ width: 100, height: 60 }, { x: 500, y: 500 }, createCanvasIndex([]));
  assert.deepEqual(spot, { x: 450, y: 470 });
});

test('note sizes follow their content', () => {
  const short = canvasCardFrame({ ...blank, body: 'Milk' });
  const long = canvasCardFrame({ ...blank, title: 'Trip', body: 'word '.repeat(120) });
  const photo = canvasCardFrame({ ...blank, picture: 16 / 9 });
  const tall = canvasCardFrame({ ...blank, picture: 3 / 4 });
  const list = canvasCardFrame({ ...blank, title: 'Packing', rows: 4, moreRows: true, progress: true });
  assert.ok(long.width > short.width && long.height > short.height);
  assert.ok(tall.pictureHeight > photo.pictureHeight, 'a portrait photo gets a taller frame');
  assert.ok(list.height > short.height);
});

test('a very long note is condensed to a bounded preview', () => {
  const huge = canvasCardFrame({ ...blank, title: 'x'.repeat(4000), body: 'y\n'.repeat(4000) });
  assert.equal(huge.titleLines, 2);
  assert.equal(huge.bodyLines, 5);
  assert.ok(huge.height < 280);
});

test('larger text makes taller notes, up to the cap', () => {
  const input = { ...blank, title: 'A title', body: 'Some words for the note to hold on to.' };
  assert.ok(canvasCardFrame(input, 1.3).height > canvasCardFrame(input, 1).height);
  assert.equal(canvasCardFrame(input, 3).height, canvasCardFrame(input, 1.3).height);
});

test('tilt stays subtle and belongs to the note', () => {
  for (let index = 0; index < 200; index += 1) assert.ok(Math.abs(canvasTilt(`card:${index}`)) <= CANVAS_MAX_TILT);
  assert.equal(canvasTilt('card:7'), canvasTilt('card:7'));
});

test('pinching holds the world point under the fingers still', () => {
  const camera = { x: -120, y: 80, zoom: 0.8 };
  const focal = { x: 210, y: 300 };
  const world = { x: (focal.x - camera.x) / camera.zoom, y: (focal.y - camera.y) / camera.zoom };
  for (const zoom of [0.5, 1, 1.37, 2]) {
    const next = zoomAround(camera, zoom, focal.x, focal.y);
    assert.ok(Math.abs(world.x * next.zoom + next.x - focal.x) < 1e-9);
    assert.ok(Math.abs(world.y * next.zoom + next.y - focal.y) < 1e-9);
  }
});

test('a dropped note lands in the same world spot at any zoom', () => {
  for (const zoom of [0.5, 1, 2]) {
    const camera = { x: 40, y: -60, zoom };
    const finger = { x: 200, y: 260 };
    const grab = { x: 30, y: 12 };
    const dropped = { x: (finger.x - camera.x) / zoom - grab.x, y: (finger.y - camera.y) / zoom - grab.y };
    assert.ok(Math.abs((dropped.x + grab.x) * zoom + camera.x - finger.x) < 1e-9, 'the grip stays under the finger');
    assert.ok(Math.abs((dropped.y + grab.y) * zoom + camera.y - finger.y) < 1e-9);
  }
});

test('zoom stays in range, and Fit All can reach past the pinch floor only when it has to', () => {
  assert.equal(clampZoom(0.1), MIN_ZOOM);
  assert.equal(clampZoom(9), MAX_ZOOM);
  const small = boundsOf([{ x: 0, y: 0, width: 300, height: 300 }]);
  const huge = boundsOf([{ x: 0, y: 0, width: 4000, height: 5000 }]);
  assert.equal(floorZoom(small, VIEW), MIN_ZOOM);
  assert.ok(floorZoom(huge, VIEW) < MIN_ZOOM);
  assert.equal(clampZoom(0.01, floorZoom(huge, VIEW)), floorZoom(huge, VIEW));
});

test('Fit All frames every note, and does not blow up a small board', () => {
  const bounds = { x: -200, y: 100, width: 1400, height: 1800 };
  const camera = fitCamera(bounds, VIEW);
  const left = bounds.x * camera.zoom + camera.x;
  const top = bounds.y * camera.zoom + camera.y;
  assert.ok(left >= 0 && left + bounds.width * camera.zoom <= VIEW.width);
  assert.ok(top >= 0 && top + bounds.height * camera.zoom <= VIEW.height);
  assert.equal(fitCamera({ x: 0, y: 0, width: 100, height: 100 }, VIEW).zoom, 1);
});

test('Reset View returns to the start of the board at actual size', () => {
  const camera = homeCamera({ x: 500, y: 300, width: 900, height: 900 }, VIEW);
  assert.equal(camera.zoom, 1);
  assert.equal(camera.x, 20 - 500);
  assert.equal(camera.y, 20 - 300);
});

test('a small board opens whole, and a big one opens at its start', () => {
  assert.deepEqual(openingCamera({ x: 0, y: 0, width: 480, height: 500 }, VIEW), fitCamera({ x: 0, y: 0, width: 480, height: 500 }, VIEW));
  assert.equal(openingCamera({ x: 0, y: 0, width: 4000, height: 4000 }, VIEW).zoom, 1);
});

test('a filter first seen keeps the zoom where its notes allow, and always shows them', () => {
  const near = frameCamera({ x: 2000, y: 2000, width: 200, height: 200 }, VIEW, 0.8);
  assert.equal(near.zoom, 0.8, 'no reason to change the zoom');
  assert.ok(2000 * near.zoom + near.x > 0 && 2000 * near.zoom + near.x < VIEW.width);
  const spread = frameCamera({ x: 0, y: 0, width: 9000, height: 9000 }, VIEW, 1);
  assert.equal(spread.zoom, MIN_ZOOM);
  assert.equal(spread.x, 20);
});

test('going to a note centers it, never shrinks the view to do it, and reads at actual size', () => {
  const rect = { x: 3000, y: -500, width: 200, height: 150 };
  const camera = focusCamera(rect, VIEW, 0.6);
  assert.equal(camera.zoom, 1);
  assert.equal((rect.x + rect.width / 2) * camera.zoom + camera.x, VIEW.width / 2);
  assert.equal((rect.y + rect.height / 2) * camera.zoom + camera.y, VIEW.height / 2);
  assert.equal(focusCamera(rect, VIEW, 1.5).zoom, 1.5, 'a closer view stays closer');
});

test('a double tap steps in, then back out', () => {
  assert.equal(nextTapZoom(0.5), 1);
  assert.equal(nextTapZoom(1), 1.5);
  assert.equal(nextTapZoom(1.5), MAX_ZOOM);
  assert.equal(nextTapZoom(MAX_ZOOM), 1);
});

test('the camera cannot leave the world, and notes cannot be dropped out of it', () => {
  const clamped = clampCamera({ x: 99999, y: -99999, zoom: 1 }, VIEW);
  assert.equal(clamped.x, CANVAS_HALF);
  assert.equal(clamped.y, VIEW.height - CANVAS_HALF);
  assert.deepEqual(clampToWorld(99999, -99999, { width: 200, height: 100 }), { x: CANVAS_HALF - 200, y: -CANVAS_HALF });
});

test('a fling can never lose the board: its edge stops around the middle of the screen', () => {
  for (const zoom of [0.5, 1, 2]) {
    const [min, max] = panLimits(zoom, VIEW.width, 0, 3000, 0);
    assert.ok(min < max);
    assert.ok(0 * zoom + max <= VIEW.width * 0.6, 'the left edge cannot be pulled past the middle');
    assert.ok(3000 * zoom + min >= VIEW.width * 0.4, 'nor the right edge');
  }
});

test('a note dragged outward widens the reach, and a camera left outside stays put', () => {
  assert.ok(panLimits(1, VIEW.width, 0, 6000, 0)[0] < panLimits(1, VIEW.width, 0, 3000, 0)[0]);
  const [min, max] = panLimits(1, VIEW.width, 0, 3000, 9000);
  assert.equal(max, 9000);
  assert.ok(min < max);
});

test('the view range only changes when the camera crosses a cell', () => {
  const key = canvasRangeKey(0, 0, 1, VIEW.width, VIEW.height);
  let changes = 0;
  let previous = key;
  for (let x = 0; x > -320; x -= 1) {
    const next = canvasRangeKey(x, 0, 1, VIEW.width, VIEW.height);
    if (next !== previous) changes += 1;
    previous = next;
  }
  assert.ok(changes <= 2, `${changes} updates across 320 frames of panning`);
});

test('the view range covers the screen, and says when notes are too small to read', () => {
  const camera = { x: -1000, y: -700, zoom: 0.5 };
  const { rect, lite } = parseCanvasRange(canvasRangeKey(camera.x, camera.y, camera.zoom, VIEW.width, VIEW.height));
  assert.equal(lite, false);
  assert.ok(rect.x <= -camera.x / camera.zoom && rect.y <= -camera.y / camera.zoom);
  assert.ok(rect.x + rect.width >= (VIEW.width - camera.x) / camera.zoom);
  assert.ok(rect.y + rect.height >= (VIEW.height - camera.y) / camera.zoom);
  assert.equal(parseCanvasRange(canvasRangeKey(0, 0, LITE_ZOOM - 0.01, VIEW.width, VIEW.height)).lite, true);
});

test('only notes near the view are found, however many are on the board', () => {
  const list = rects(notes(5000), placeBoard(notes(5000)));
  const index = createCanvasIndex(list);
  const started = performance.now();
  const near = queryCanvasIndex(index, { x: 0, y: 0, width: 640, height: 960 });
  assert.ok(performance.now() - started < 50);
  assert.ok(near.length > 0 && near.length < 40, `${near.length} of 5000`);
  const seen = new Set(near);
  assert.equal(seen.size, near.length, 'a note spanning cells is found once');
  for (const entry of list) if (overlaps(entry, { x: 0, y: 0, width: 640, height: 960 })) assert.ok(seen.has(entry));
});

test('a touch finds the top note, including across a cell edge', () => {
  const low = { key: 'low', x: 300, y: 300, width: 200, height: 200, z: 1 };
  const high = { key: 'high', x: 340, y: 340, width: 200, height: 200, z: 5 };
  const index = createCanvasIndex([low, high]);
  assert.equal(noteAtPoint(index, 400, 400).key, 'high');
  assert.equal(noteAtPoint(index, 310, 310).key, 'low');
  assert.equal(noteAtPoint(index, 100, 100), null);
});

test('saved view preferences survive damage', () => {
  assert.deepEqual(parseCanvasPrefs(null), { miniMap: true, hintDone: false, views: {} });
  assert.deepEqual(parseCanvasPrefs('{broken'), { miniMap: true, hintDone: false, views: {} });
  const saved = parseCanvasPrefs(JSON.stringify({ miniMap: false, hintDone: true, views: { all: { x: 1, y: 2, zoom: 0.7 }, bad: { x: 'a', y: 2, zoom: 1 }, zero: { x: 1, y: 2, zoom: 0 } } }));
  assert.equal(saved.miniMap, false);
  assert.equal(saved.hintDone, true);
  assert.deepEqual(saved.views, { all: { x: 1, y: 2, zoom: 0.7 } });
});

test('the board never rerenders per frame: the camera stays off React state', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const canvas = read('src/components/notes/notes-canvas.native.tsx');
  const gestures = read('src/components/notes/use-canvas-gestures.ts');
  assert.match(canvas, /runOnJS\(setRangeKey\)/);
  assert.match(canvas, /next !== previous/);
  // Everything that runs per frame stays on the UI thread: each handler body up to the next one.
  for (const handler of gestures.matchAll(/\.(onUpdate|onChange)\(([^]*?)\n\s*\.on/g)) assert.doesNotMatch(handler[2], /runOnJS/, handler[1]);
});

test('a flight reports settled from its own timer, never from an axis that may already be there', () => {
  const camera = readFileSync(new URL('../src/components/notes/use-canvas-camera.ts', import.meta.url), 'utf8');
  assert.match(camera, /flight\.set\(withTiming\(1, FLIGHT, \(finished\)/);
  for (const axis of ['x', 'y', 'zoom']) assert.match(camera, new RegExp(`${axis}\\.set\\(withTiming\\(next\\.${axis}, FLIGHT\\)\\);`));
});

test('screen readers keep the list, which reaches every note', () => {
  const home = readFileSync(new URL('../src/app/(tabs)/index.native.tsx', import.meta.url), 'utf8');
  assert.match(home, /const listOnly = useScreenReader\(\)/);
  assert.match(home, /const showBoard = !listOnly && noteLayout === 'board'/);
  assert.match(home, /board=\{!showBoard \? null : /);
  assert.match(home, /viewMode === 'cards' && !listOnly \? <IconButton label=\{tr\(showBoard \? 'notesCanvas\.showGrid'/);
});

async function database(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  return db;
}
const addThought = (db, id) => db.runAsync("INSERT INTO messages(id,text,type,created_at,updated_at) VALUES (?, 'Keep these words', 'text', 1, 2)", id);

test('upgrading an existing install adds the board and touches no note', async (t) => {
  const db = await database(t);
  await addThought(db, 'old');
  const before = await db.getFirstAsync('SELECT * FROM messages');
  await db.execAsync('DROP TABLE note_canvas_positions; PRAGMA user_version = 33;');
  await migration.migrateDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, migration.LATEST_SCHEMA_VERSION);
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM messages'), before);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM note_canvas_positions')).n, 0);
});

test('generated spots never replace a saved one', async (t) => {
  const db = await database(t);
  await addThought(db, 'a');
  const repo = createNoteCanvasRepository(db);
  await repo.savePosition('thought:a', { x: 10, y: 20, z: 3 });
  await repo.savePlacements([['thought:a', { x: 999, y: 999, z: 0 }]]);
  assert.deepEqual((await repo.load()).positions.get('thought:a'), { x: 10, y: 20, z: 3 });
});

test('a dragged note survives a reload, and saving a spot writes no note', async (t) => {
  const db = await database(t);
  await addThought(db, 'a');
  const before = await db.getFirstAsync('SELECT * FROM messages');
  const repo = createNoteCanvasRepository(db);
  await repo.savePosition('thought:a', { x: 1, y: 2, z: 0 });
  await repo.savePosition('thought:a', { x: -340.5, y: 88, z: 7 });
  assert.deepEqual((await createNoteCanvasRepository(db).load()).positions.get('thought:a'), { x: -340.5, y: 88, z: 7 });
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM messages'), before);
});

test('the view is stored with other preferences and comes back', async (t) => {
  const db = await database(t);
  const repo = createNoteCanvasRepository(db);
  await repo.savePrefs({ miniMap: false, hintDone: true, views: { all: { x: -40, y: 12, zoom: 0.8 }, board: { x: 3, y: 4, zoom: 1.2 } } });
  const { prefs } = await repo.load();
  assert.deepEqual(prefs, { miniMap: false, hintDone: true, views: { all: { x: -40, y: 12, zoom: 0.8 }, board: { x: 3, y: 4, zoom: 1.2 } } });
});

test('a thought filed into a card stays where it was, and an archived note keeps its spot', async (t) => {
  const db = await database(t);
  await addThought(db, 'filed');
  await addThought(db, 'archived');
  await db.execAsync("UPDATE messages SET archived_at = 5 WHERE id = 'archived'");
  await db.execAsync("INSERT INTO boards(id,name,created_at,updated_at) VALUES ('b','Board',1,1); INSERT INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('col','b','Notes',0,1,1); INSERT INTO cards(id,board_id,column_id,position,created_at,updated_at) VALUES ('c','b','col',0,1,1); INSERT INTO card_messages(card_id,message_id,position) VALUES ('c','filed',0);");
  const repo = createNoteCanvasRepository(db);
  await repo.savePosition('thought:filed', { x: 50, y: 60, z: 2 });
  await repo.savePosition('thought:archived', { x: 70, y: 80, z: 0 });
  const { positions } = await repo.load();
  assert.deepEqual(positions.get('card:c'), { x: 50, y: 60, z: 2 });
  assert.deepEqual(positions.get('thought:archived'), { x: 70, y: 80, z: 0 });
});

test('a note deleted for good lets go of its spot', async (t) => {
  const db = await database(t);
  await addThought(db, 'kept');
  const repo = createNoteCanvasRepository(db);
  await repo.savePosition('thought:kept', { x: 1, y: 1, z: 0 });
  await repo.savePosition('thought:gone', { x: 2, y: 2, z: 0 });
  await repo.savePosition('card:gone', { x: 3, y: 3, z: 0 });
  assert.deepEqual([...(await repo.load()).positions.keys()], ['thought:kept']);
});

test('Notes opens on the board until the grid is chosen, and remembers the choice', async (t) => {
  const db = await database(t);
  const repo = createNoteOrderRepository(db);
  assert.equal((await repo.load()).layout, 'board');
  await repo.setLayout('grid');
  assert.equal((await createNoteOrderRepository(db).load()).layout, 'grid');
  await repo.setLayout('board');
  assert.equal((await repo.load()).layout, 'board');
});

test('the Notes screen no longer carries the Focus and Spin banner, and Boards still does', () => {
  const home = readFileSync(new URL('../src/app/(tabs)/index.native.tsx', import.meta.url), 'utf8');
  assert.match(home, /footer=\{<GettingStartedCard \/>\}\s+board=/);
  assert.match(home, /onCreate=\{openCreate\}[^]*?footer=\{<><FocusCardsBanner \/><GettingStartedCard \/><\/>\}/);
});

test('the board controls sit in the bottom left, level with Chat, and open over the dock', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const controls = read('src/components/notes/canvas-camera-controls.tsx');
  assert.match(controls, /\[PHYSICAL_LEFT\]: Math\.max\(spacing\.md, insets\.left \+ spacing\.sm\)/);
  assert.match(controls, /floatingCompanionBottom\(insets\.bottom, styleTokens\.chat\.height, BUTTON \+ 2\)/);
  const canvas = read('src/components/notes/notes-canvas.native.tsx');
  assert.ok(canvas.indexOf('<CanvasCameraControls') > canvas.indexOf('styles.dock'), 'it opens over the dock, not under it');
});
