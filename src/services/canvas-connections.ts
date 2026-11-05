import { addToCanvasIndex, boundsOf, CANVAS_HALF, createCanvasIndex, queryCanvasIndex, stableUnit, type CanvasIndex, type CanvasPosition, type CanvasRect, type CanvasSize } from './note-canvas';

export type CanvasLink = { note_a: string; note_b: string };
export type GraphNote = CanvasSize & { key: string; tilt?: number };
export type ConnectionVisibility = 'selected' | 'all' | 'hidden';
export type Point = { x: number; y: number };
export type Curve = { start: Point; c1: Point; c2: Point; end: Point };
const GAP = 28;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Native SVG rasterizes its own bounds, even when the camera shrinks it. */
export function connectionSurface(rect: CanvasSize, pixelRatio: number) {
  const resolution = Math.min(1, 2048 / (Math.max(rect.width, rect.height) * Math.max(1, pixelRatio)));
  return { width: rect.width * resolution, height: rect.height * resolution, scale: 1 / resolution };
}

/** The existing model is an undirected canonical pair, never a second link store. */
export function connectionGraph(keys: Iterable<string>, links: readonly CanvasLink[]) {
  const graph = new Map([...keys].sort(compare).map((key) => [key, new Set<string>()]));
  for (const { note_a: a, note_b: b } of links) {
    if (a === b || !graph.has(a) || !graph.has(b)) continue;
    graph.get(a)!.add(b); graph.get(b)!.add(a);
  }
  return graph;
}

export function connectionGroup(graph: Map<string, Set<string>>, root: string) {
  if (!graph.has(root)) return [];
  const queue = [root]; const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) for (const key of [...graph.get(queue[i])!].sort(compare)) {
    if (!seen.has(key)) { seen.add(key); queue.push(key); }
  }
  return queue;
}

/** Rotation-aware bounds also leave room for the papers' shadows. */
export function paperBounds(note: CanvasRect & { tilt?: number }): CanvasRect {
  'worklet';
  const radians = (note.tilt ?? 0) * Math.PI / 180;
  const width = Math.abs(Math.cos(radians)) * note.width + Math.abs(Math.sin(radians)) * note.height;
  const height = Math.abs(Math.sin(radians)) * note.width + Math.abs(Math.cos(radians)) * note.height;
  return { x: note.x + (note.width - width) / 2, y: note.y + (note.height - height) / 2, width, height };
}

function freeSpot(note: GraphNote, center: Point, occupied: CanvasIndex<CanvasRect>): CanvasPosition {
  const envelope = paperBounds({ ...note, x: 0, y: 0 });
  if (envelope.width + GAP * 2 > CANVAS_HALF * 2 || envelope.height + GAP * 2 > CANVAS_HALF * 2) throw new Error('Group exceeds canvas bounds');
  const origin = { x: Math.round(Math.max(-CANVAS_HALF + GAP - envelope.x, Math.min(CANVAS_HALF - GAP - envelope.x - envelope.width, center.x - note.width / 2))), y: Math.round(Math.max(-CANVAS_HALF + GAP - envelope.y, Math.min(CANVAS_HALF - GAP - envelope.y - envelope.height, center.y - note.height / 2))) };
  const trySpot = (dx: number, dy: number) => {
    const pos = { x: origin.x + dx * 48, y: origin.y + dy * 48, z: 0 };
    const box = paperBounds({ ...note, ...pos });
    if (box.x - GAP < -CANVAS_HALF || box.y - GAP < -CANVAS_HALF || box.x + box.width + GAP > CANVAS_HALF || box.y + box.height + GAP > CANVAS_HALF) return null;
    if (queryCanvasIndex(occupied, { x: box.x - GAP, y: box.y - GAP, width: box.width + GAP * 2, height: box.height + GAP * 2 }).length) return null;
    return pos;
  };
  const first = trySpot(0, 0); if (first) return first;
  for (let ring = 1; ring < 1700; ring++) for (let side = -ring; side <= ring; side++) {
    for (const [dx, dy] of [[side, -ring], [ring, side], [side, ring], [-ring, side]]) {
      const spot = trySpot(dx, dy); if (spot) return spot;
    }
  }
  // Never persist an overlapping/clamped fallback when the finite world is full.
  throw new Error('No free canvas position');
}

function radialGroup(group: string[], root: string, graph: Map<string, Set<string>>, notes: Map<string, GraphNote>, occupied: CanvasIndex<CanvasRect>, anchor: CanvasPosition) {
  const result = new Map<string, CanvasPosition>([[root, anchor]]);
  const rootNote = notes.get(root)!;
  addToCanvasIndex(occupied, paperBounds({ ...rootNote, ...anchor }));
  const depth = new Map([[root, 0]]); const queue = [root];
  for (let i = 0; i < queue.length; i++) for (const key of [...graph.get(queue[i])!].sort(compare)) {
    if (!depth.has(key)) { depth.set(key, depth.get(queue[i])! + 1); queue.push(key); }
  }
  const step = Math.max(...group.map((key) => Math.hypot(notes.get(key)!.width, notes.get(key)!.height))) + GAP * 2;
  const levels = new Map<number, string[]>();
  for (const key of queue.slice(1)) { const level = depth.get(key)!; const items = levels.get(level) ?? []; items.push(key); levels.set(level, items); }
  let previousRadius = 0;
  const compactRadius = Math.max(3, Math.sqrt(group.length)) * step;
  for (const [level, keys] of levels) {
    const baseRadius = Math.min(previousRadius + step, compactRadius);
    let ring = 0; let ringStart = 0; let capacity = Math.max(6, Math.floor(Math.PI * 2 * baseRadius / step));
    keys.forEach((key, i) => {
      if (i - ringStart >= capacity) { ring++; ringStart = i; capacity = Math.max(6, Math.floor(Math.PI * 2 * (baseRadius + ring * step) / step)); }
      const count = Math.min(capacity, keys.length - ringStart);
      const radius = baseRadius + ring * step;
      const angle = -Math.PI / 2 + (i - ringStart) * Math.PI * 2 / count + (level - 1) * 0.18;
      const note = notes.get(key)!;
      const spot = freeSpot(note, { x: anchor.x + rootNote.width / 2 + Math.cos(angle) * radius, y: anchor.y + rootNote.height / 2 + Math.sin(angle) * radius }, occupied);
      result.set(key, spot); addToCanvasIndex(occupied, paperBounds({ ...note, ...spot }));
    });
    previousRadius = baseRadius + ring * step;
  }
  return result;
}

/** Only missing keys are returned. All saved positions are immutable obstacles. */
export function placeConnectedNotes(list: readonly GraphNote[], links: readonly CanvasLink[], saved: ReadonlyMap<string, CanvasPosition>, center: Point = { x: 0, y: 0 }) {
  const notes = new Map(list.map((note) => [note.key, note]));
  const graph = connectionGraph(notes.keys(), links);
  const occupied = createCanvasIndex(list.flatMap((note) => { const pos = saved.get(note.key); return pos ? [paperBounds({ ...note, ...pos })] : []; }));
  const result = new Map<string, CanvasPosition>(); const seen = new Set<string>();
  const rowWidth = Math.max(800, Math.sqrt(list.length) * 280);
  let cursorX = center.x; let cursorY = center.y; let rowHeight = 0;
  for (const key of graph.keys()) {
    if (seen.has(key)) continue;
    const group = connectionGroup(graph, key); group.forEach((member) => seen.add(member));
    const existing = group.filter((member) => saved.has(member));
    if (existing.length) {
      const queue = [...existing].sort(compare); const visited = new Set(queue);
      for (let i = 0; i < queue.length; i++) {
        const parentKey = queue[i]; const parent = notes.get(parentKey)!; const pos = saved.get(parentKey) ?? result.get(parentKey)!;
        for (const child of [...graph.get(parentKey)!].sort(compare)) {
          if (visited.has(child)) continue;
          visited.add(child); queue.push(child);
          const note = notes.get(child)!; const angle = stableUnit(child) * Math.PI * 2;
          const distance = (Math.hypot(parent.width, parent.height) + Math.hypot(note.width, note.height)) / 2 + GAP * 2;
          const spot = freeSpot(note, { x: pos.x + parent.width / 2 + Math.cos(angle) * distance, y: pos.y + parent.height / 2 + Math.sin(angle) * distance }, occupied);
          result.set(child, spot); addToCanvasIndex(occupied, paperBounds({ ...note, ...spot }));
        }
      }
    } else {
      const root = [...group].sort((a, b) => graph.get(b)!.size - graph.get(a)!.size || compare(a, b))[0];
      const local = radialGroup(group, root, graph, notes, createCanvasIndex([]), { x: 0, y: 0, z: 0 });
      const box = boundsOf(group.map((member) => paperBounds({ ...notes.get(member)!, ...local.get(member)! })))!;
      if (cursorX > center.x && cursorX + box.width > center.x + rowWidth) { cursorX = center.x; cursorY += rowHeight + 140; rowHeight = 0; }
      const origin = freeSpot({ ...box, key: root }, { x: cursorX + box.width / 2, y: cursorY + box.height / 2 }, occupied);
      cursorX += box.width + (group.length > 1 ? 140 : 48); rowHeight = Math.max(rowHeight, box.height);
      for (const member of group) {
        const pos = local.get(member)!; const spot = { x: pos.x + origin.x - box.x, y: pos.y + origin.y - box.y, z: 0 };
        result.set(member, spot); addToCanvasIndex(occupied, paperBounds({ ...notes.get(member)!, ...spot }));
      }
      // Reserve the group's breathing room for subsequent independent groups.
      if (group.length > 1) addToCanvasIndex(occupied, { ...box, x: origin.x - 40, y: origin.y - 40, width: box.width + 80, height: box.height + 80 });
    }
  }
  return result;
}

export function arrangeConnectedNotes(list: readonly GraphNote[], links: readonly CanvasLink[], positions: ReadonlyMap<string, CanvasPosition>, root: string) {
  const notes = new Map(list.map((note) => [note.key, note])); const graph = connectionGraph(notes.keys(), links);
  const group = connectionGroup(graph, root); const members = new Set(group); const anchor = positions.get(root);
  if (!anchor || group.length < 2) return new Map<string, CanvasPosition>();
  const occupied = createCanvasIndex(list.flatMap((note) => { const pos = positions.get(note.key); return !members.has(note.key) && pos ? [paperBounds({ ...note, ...pos })] : []; }));
  const result = radialGroup(group, root, graph, notes, occupied, anchor);
  for (const [key, spot] of result) spot.z = positions.get(key)?.z ?? 0;
  return result;
}

/** Ray intersection in the paper's rotated local coordinates. */
function edgeAnchor(rect: CanvasRect & { tilt?: number }, target: Point) {
  'worklet';
  const angle = (rect.tilt ?? 0) * Math.PI / 180; const cos = Math.cos(angle); const sin = Math.sin(angle);
  const cx = rect.x + rect.width / 2; const cy = rect.y + rect.height / 2;
  const dx = target.x - cx; const dy = target.y - cy;
  const lx = cos * dx + sin * dy; const ly = -sin * dx + cos * dy;
  const scale = 1 / Math.max(Math.abs(lx) / (rect.width / 2), Math.abs(ly) / (rect.height / 2), 0.0001);
  const nx = Math.abs(lx) / rect.width >= Math.abs(ly) / rect.height ? Math.sign(lx) || 1 : 0;
  const ny = nx ? 0 : Math.sign(ly) || 1;
  return { point: { x: cx + (cos * lx - sin * ly) * scale, y: cy + (sin * lx + cos * ly) * scale }, normal: { x: cos * nx - sin * ny, y: sin * nx + cos * ny } };
}

export function connectionCurve(a: CanvasRect & { tilt?: number }, b: CanvasRect & { tilt?: number }): Curve {
  'worklet';
  const from = edgeAnchor(a, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const to = edgeAnchor(b, { x: a.x + a.width / 2, y: a.y + a.height / 2 });
  const bend = Math.min(180, Math.max(28, Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y) * 0.35));
  return { start: from.point, c1: { x: from.point.x + from.normal.x * bend, y: from.point.y + from.normal.y * bend }, c2: { x: to.point.x + to.normal.x * bend, y: to.point.y + to.normal.y * bend }, end: to.point };
}

export function curvePath(curve: Curve, offset = 0) {
  'worklet';
  return `M${curve.start.x + offset},${curve.start.y + offset} C${curve.c1.x + offset},${curve.c1.y + offset} ${curve.c2.x + offset},${curve.c2.y + offset} ${curve.end.x + offset},${curve.end.y + offset}`;
}

export function curveBounds(curve: Curve): CanvasRect {
  const points = [curve.start, curve.c1, curve.c2, curve.end];
  const x = Math.min(...points.map((p) => p.x)); const y = Math.min(...points.map((p) => p.y));
  return { x: x - 24, y: y - 24, width: Math.max(...points.map((p) => p.x)) - x + 48, height: Math.max(...points.map((p) => p.y)) - y + 48 };
}

/** Wide screen-space hit target; called after a tap, never while panning. */
export function curveHit(curve: Curve, point: Point, tolerance: number) {
  let previous = curve.start;
  for (let i = 1; i <= 32; i++) {
    const t = i / 32; const u = 1 - t;
    const next = { x: u ** 3 * curve.start.x + 3 * u * u * t * curve.c1.x + 3 * u * t * t * curve.c2.x + t ** 3 * curve.end.x, y: u ** 3 * curve.start.y + 3 * u * u * t * curve.c1.y + 3 * u * t * t * curve.c2.y + t ** 3 * curve.end.y };
    const dx = next.x - previous.x; const dy = next.y - previous.y;
    const f = Math.max(0, Math.min(1, ((point.x - previous.x) * dx + (point.y - previous.y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(point.x - previous.x - f * dx, point.y - previous.y - f * dy) <= tolerance) return true;
    previous = next;
  }
  return false;
}
