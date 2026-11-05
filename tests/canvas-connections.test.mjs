import assert from 'node:assert/strict';
import test from 'node:test';
import { arrangeConnectedNotes, connectionCurve, connectionGraph, connectionGroup, connectionSurface, curveBounds, curveHit, curvePath, paperBounds, placeConnectedNotes } from '../src/services/canvas-connections.ts';
import { CANVAS_HALF, parseCanvasPrefs } from '../src/services/note-canvas.ts';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createNoteCanvasRepository } = await loadModule('src/db/note-canvas-repository');
const { createRevisitRepository } = await loadModule('src/db/revisit-repository');
const makeNotes = (n) => Array.from({ length: n }, (_, i) => ({ key: `thought:${String(i).padStart(4, '0')}`, width: 168 + i % 4 * 20, height: 104 + i % 5 * 38, tilt: i % 3 - 1 }));
const link = (a, b) => ({ note_a: a.key, note_b: b.key });
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
function collisionFree(notes, positions) {
  const boxes = notes.map((note) => paperBounds({ ...note, ...positions.get(note.key) }));
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]; assert.ok(a.x >= -CANVAS_HALF && a.y >= -CANVAS_HALF && a.x + a.width <= CANVAS_HALF && a.y + a.height <= CANVAS_HALF);
    for (let j = i + 1; j < boxes.length; j++) assert.equal(overlap(a, boxes[j]), false, `${notes[i].key} overlaps ${notes[j].key}`);
  }
}

test('graph ignores self links, duplicates and unavailable endpoints; cycles terminate', () => {
  const notes = makeNotes(5); const [a, b, c] = notes;
  const graph = connectionGraph(notes.map((note) => note.key), [link(a, b), link(b, a), link(b, c), link(c, a), link(a, a), { note_a: a.key, note_b: 'missing' }]);
  assert.equal(graph.get(a.key).size, 2);
  assert.deepEqual(new Set(connectionGroup(graph, a.key)), new Set([a.key, b.key, c.key]));
  assert.deepEqual(connectionGroup(graph, 'missing'), []);
});

test('first placement is deterministic even if SQL/input order changes; clusters and papers never overlap', () => {
  const notes = makeNotes(80);
  const links = notes.slice(1, 18).map((note) => link(notes[0], note)).concat(notes.slice(21, 37).map((note, i) => link(notes[20 + i], note)));
  const placed = placeConnectedNotes(notes, links, new Map());
  const reordered = placeConnectedNotes([...notes].reverse(), [...links].reverse(), new Map());
  for (const [key, pos] of placed) assert.deepEqual(reordered.get(key), pos);
  collisionFree(notes, placed);
});

test('new notes join saved neighbors; existing coordinates/z remain byte-for-byte unchanged', () => {
  const notes = makeNotes(8); const saved = new Map([[notes[0].key, { x: 14100, y: -10300, z: 27 }], [notes[4].key, { x: -2200, y: 4000, z: 10 }]]);
  const snapshot = JSON.stringify([...saved]);
  const links = [link(notes[0], notes[1]), link(notes[1], notes[2]), link(notes[1], notes[3]), link(notes[4], notes[5])];
  const added = placeConnectedNotes(notes, links, saved);
  assert.equal(JSON.stringify([...saved]), snapshot); assert.equal(added.has(notes[0].key), false); assert.equal(added.has(notes[4].key), false);
  assert.ok(Math.hypot(added.get(notes[1].key).x - saved.get(notes[0].key).x, added.get(notes[1].key).y - saved.get(notes[0].key).y) < 1200);
  collisionFree(notes, new Map([...saved, ...added]));
  assert.equal(placeConnectedNotes(notes, [...links, link(notes[0], notes[4])], new Map([...saved, ...added])).size, 0, 'new links never trigger placement of saved notes');
});

test('arrange fixes the selected anchor, moves only its component, avoids unrelated papers and preserves z', () => {
  const notes = makeNotes(24); const links = notes.slice(1, 8).map((note) => link(notes[0], note)).concat([link(notes[7], notes[8])]);
  const saved = placeConnectedNotes(notes, [], new Map()); const original = JSON.stringify([...saved]);
  const changed = arrangeConnectedNotes(notes, links, saved, notes[0].key);
  assert.deepEqual(changed.get(notes[0].key), saved.get(notes[0].key));
  assert.equal(changed.size, 9); assert.equal(changed.has(notes[10].key), false);
  for (const [key, pos] of changed) assert.equal(pos.z, saved.get(key).z);
  assert.equal(JSON.stringify([...saved]), original);
  collisionFree(notes, new Map([...saved, ...changed]));
});

test('mixed-size 1,000-note chains, stars and unlinked boards remain collision-free and bounded', () => {
  const notes = makeNotes(1000);
  for (const links of [[], notes.slice(1).map((note, i) => link(notes[i], note)), notes.slice(1).map((note) => link(notes[0], note))]) collisionFree(notes, placeConnectedNotes(notes, links, new Map()));
});

test('a saved anchor near the world edge stays fixed and new neighbors stay within bounds', () => {
  const notes = makeNotes(6); const anchor = { x: CANVAS_HALF - 260, y: -CANVAS_HALF + 40, z: 1 }; const saved = new Map([[notes[0].key, anchor]]);
  const placed = placeConnectedNotes(notes, notes.slice(1).map((note) => link(notes[0], note)), saved);
  collisionFree(notes, new Map([...saved, ...placed])); assert.deepEqual(saved.get(notes[0].key), anchor);
});

test('curves attach to card edges in all directions, account for rotation, and transform with the world', () => {
  const a = { x: 0, y: 0, width: 200, height: 120 };
  for (const b of [{ ...a, x: 400 }, { ...a, x: -400 }, { ...a, y: 400 }, { ...a, y: -400 }]) {
    const curve = connectionCurve(a, b);
    assert.ok(curve.start.x === 0 || curve.start.x === 200 || curve.start.y === 0 || curve.start.y === 120);
    assert.ok(!curvePath(curve).includes('NaN'));
    const translated = connectionCurve({ ...a, x: a.x + 500, y: a.y - 400 }, { ...b, x: b.x + 500, y: b.y - 400 });
    assert.equal(translated.start.x, curve.start.x + 500); assert.equal(translated.end.y, curve.end.y - 400);
  }
  const rotated = connectionCurve({ ...a, tilt: 25 }, { ...a, x: 500, y: 180 });
  const angle = -25 * Math.PI / 180; const dx = rotated.start.x - 100; const dy = rotated.start.y - 60;
  assert.ok(Math.abs(Math.abs(Math.cos(angle) * dx - Math.sin(angle) * dy) - 100) < 0.001 || Math.abs(Math.abs(Math.sin(angle) * dx + Math.cos(angle) * dy) - 60) < 0.001);
});

test('curve culling includes a link crossing the viewport with both endpoints outside; tap target stays wider than ink', () => {
  const curve = connectionCurve({ x: -500, y: 0, width: 100, height: 100 }, { x: 500, y: 0, width: 100, height: 100 });
  const bounds = curveBounds(curve); assert.ok(overlap(bounds, { x: -50, y: 0, width: 100, height: 100 }));
  assert.ok(curveHit(curve, { x: 0, y: 69 }, 22)); assert.equal(curveHit(curve, { x: 0, y: 100 }, 22), false);
});

test('visibility is optional and backward compatible with saved canvas preferences', () => {
  assert.equal(parseCanvasPrefs('{"connections":"all"}').connections, 'all');
  assert.equal(parseCanvasPrefs('{"connections":"hidden"}').connections, 'hidden');
  assert.equal(parseCanvasPrefs('{"connections":"surprise"}').connections, undefined);
  assert.deepEqual(parseCanvasPrefs(null), { miniMap: true, hintDone: false, views: {} });
});

test('Focus and Fit All never allocate a world-sized Android SVG bitmap at high pixel densities', () => {
  for (const zoom of [0.1, 0.2, 0.5, 1, 2]) for (const ratio of [1, 2.75, 3, 4, 5]) {
    const world = { width: 1200 / zoom, height: 1800 / zoom }; const surface = connectionSurface(world, ratio);
    assert.ok(surface.width * ratio <= 2048.001 && surface.height * ratio <= 2048.001);
    assert.ok(Math.abs(surface.width * surface.scale - world.width) < 0.001);
    assert.ok(Math.abs(surface.height * surface.scale - world.height) < 0.001);
  }
});

async function database(t) {
  const env = runtime(); t.after(() => env.cleanup()); const db = await env.sqlite.openDatabaseAsync('chits.db'); await migration.migrateDatabase(db);
  for (const id of ['a', 'b', 'c']) await db.runAsync("INSERT INTO messages(id,text,type,created_at,updated_at) VALUES (?, 'Original content', 'text', 1, 2)", id);
  return db;
}
test('arrange and Undo round-trip atomically without changing note or relationship records', async (t) => {
  const db = await database(t); const repo = createNoteCanvasRepository(db); const links = createRevisitRepository(db);
  await links.link('thought:a', 'thought:b', 'reference');
  const before = new Map([['thought:a', { x: 10, y: 20, z: 3 }], ['thought:b', { x: 400, y: 30, z: 8 }]]);
  const after = new Map([['thought:a', before.get('thought:a')], ['thought:b', { x: 250, y: 300, z: 8 }]]);
  await repo.savePlacements([...before]); const content = await db.getAllAsync('SELECT * FROM messages'); const relationships = await links.relationships();
  await repo.saveArrangement(before, after); assert.deepEqual((await repo.load()).positions, after);
  await repo.saveArrangement(after, before); assert.deepEqual((await repo.load()).positions, before);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM messages'), content); assert.deepEqual(await links.relationships(), relationships);
  await links.unlink('thought:a', 'thought:b'); assert.equal((await links.relationships()).length, 0); assert.deepEqual(await db.getAllAsync('SELECT * FROM messages'), content);
});
test('stale Undo is rejected as one transaction and never overwrites a subsequent drag', async (t) => {
  const db = await database(t); const repo = createNoteCanvasRepository(db);
  const before = new Map([['thought:a', { x: 10, y: 20, z: 3 }], ['thought:b', { x: 400, y: 30, z: 8 }]]);
  const after = new Map([['thought:a', { x: 200, y: 200, z: 3 }], ['thought:b', { x: 500, y: 600, z: 8 }]]);
  await repo.savePlacements([...before]); await repo.saveArrangement(before, after);
  await repo.savePosition('thought:b', { x: 900, y: 1000, z: 20 }); const snapshot = (await repo.load()).positions;
  await assert.rejects(repo.saveArrangement(after, before), /positions changed/);
  assert.deepEqual((await repo.load()).positions, snapshot);
});

test('an arrangement write failure rolls back every affected coordinate', async (t) => {
  const db = await database(t); const repo = createNoteCanvasRepository(db);
  const before = new Map([['thought:a', { x: 10, y: 20, z: 3 }], ['thought:b', { x: 400, y: 30, z: 8 }]]);
  const after = new Map([['thought:a', { x: 200, y: 200, z: 3 }], ['thought:b', { x: 500, y: 600, z: 8 }]]);
  await repo.savePlacements([...before]);
  await db.execAsync("CREATE TRIGGER qa_arrangement_failure BEFORE UPDATE ON note_canvas_positions WHEN NEW.note_key = 'thought:b' BEGIN SELECT RAISE(ABORT, 'arrangement write failed'); END;");
  await assert.rejects(repo.saveArrangement(before, after), /arrangement write failed/);
  assert.deepEqual((await repo.load()).positions, before);
});
