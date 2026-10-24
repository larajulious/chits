#!/usr/bin/env node
// Draws Default's time-of-day header scenes: one room (wall, sticky notes,
// a window onto hills, a desk, a plant and a lamp) lit six ways. Every scene
// shares the exact same geometry so the app can crossfade neighbors without
// ghosting; only colors and light change. The skies are left plain because
// clouds, moon and stars are animated over the window panes in the app.
//
// Renders with headless Chrome and encodes with cwebp:
//   node scripts/generate-header-scenes.mjs [--preview <dir>]
//
// Also measures each finished picture and writes the numbers the app needs
// (pane geometry, luminance) to src/constants/header-scenes.generated.ts.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const W = 2170;
const H = 725;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = resolve(import.meta.dirname, '../assets/images/header-scenes');
const STATS_FILE = resolve(import.meta.dirname, '../src/constants/header-scenes.generated.ts');

// ── Layout (shared by every scene; written out for the app's animated sky) ──

const DESK_TOP = 585;
const FRAME = { x: 1180, y: 64, w: 460, h: 446 };
const PANES = [
  { x: 1204, y: 88, w: 198, h: 191 }, { x: 1418, y: 88, w: 198, h: 191 },
  { x: 1204, y: 295, w: 198, h: 191 }, { x: 1418, y: 295, w: 198, h: 191 },
];
const LAMP_MOUTH = { x: 1775, y: 477 };

const NOTE_COLORS = { yellow: '#FBE27A', pink: '#F7A9B6', mint: '#B8E2C8', blue: '#B9D3F2' };
const NOTES = [
  { x: 150, y: 118, s: 104, r: -10, c: 'yellow', tape: true },
  { x: 515, y: 64, s: 90, r: 7, c: 'pink' },
  { x: 865, y: 168, s: 82, r: -5, c: 'mint' },
  { x: 1960, y: 112, s: 108, r: 9, c: 'pink', tape: true },
  { x: 2088, y: 318, s: 90, r: -7, c: 'yellow' },
  { x: 1015, y: 58, s: 70, r: 12, c: 'blue' },
];

// ── The six lights ──────────────────────────────────────────────────────────

const SCENES = {
  dawn: {
    sky: ['#8FA6D6', '#C9B3D9', '#F8C6B4'], farHill: '#C7B5D0', nearHill: '#A898BC', tree: '#8C7EA6',
    glow: { x: 1250, y: 486, r: 280, color: '#FFD2B3', o: 0.85 },
    overlay: '#FAE8E2', beam: { color: '#FFE6DA', o: 0.55 }, patch: { color: '#FFD9C8', o: 0.35 }, lamp: 0,
  },
  morning: {
    sky: ['#7FB8EA', '#A9D3F3', '#E3F2FB'], farHill: '#B8D8C4', nearHill: '#95C2A3', tree: '#73A585',
    overlay: '#FFFFFF', beam: { color: '#FFFBEC', o: 0.85 }, patch: { color: '#FFF6DC', o: 0.5 }, lamp: 0,
  },
  afternoon: {
    sky: ['#4F9BE0', '#86C1EE', '#CDE8F8'], farHill: '#ADD2B5', nearHill: '#85B892', tree: '#649C74',
    overlay: '#FFF8EC', beam: { color: '#FFF3CF', o: 0.9 }, patch: { color: '#FFF0C4', o: 0.55 }, lamp: 0,
  },
  golden: {
    sky: ['#8FAFD6', '#F2B98A', '#FFD79A'], farHill: '#E0AE92', nearHill: '#C38C74', tree: '#A0705E',
    sun: { x: 1522, y: 418, r: 36, color: '#FFF0C2' }, glow: { x: 1522, y: 418, r: 320, color: '#FFE2A6', o: 0.9 },
    overlay: '#FFE7CC', beam: { color: '#FFD08C', o: 0.6 }, patch: { color: '#FFC88A', o: 0.5 }, lamp: 0,
  },
  evening: {
    sky: ['#2E3270', '#6B4F8F', '#C98BA0'], farHill: '#5A4A78', nearHill: '#3E3460', tree: '#2F284C',
    overlay: '#77719F', beam: { color: '#C9B8E6', o: 0.12 }, patch: { color: '#C9B8E6', o: 0.1 }, lamp: 0.8,
  },
  night: {
    sky: ['#0B1430', '#16244A', '#2A3B66'], farHill: '#1F2A4C', nearHill: '#141C36', tree: '#0E1428',
    overlay: '#454F80', beam: { color: '#AFC3FF', o: 0.14 }, patch: { color: '#B8C8FF', o: 0.18 }, lamp: 1,
  },
};

// ── Drawing ─────────────────────────────────────────────────────────────────

const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

// Light from an unseen window up and to the left, falling across the wall.
function wallBeams() {
  const map = (u, v) => [60 + u + v * 0.9, -40 + v];
  const shapes = [];
  for (const c of [0, 1]) for (const r of [0, 1]) {
    const u0 = c * 330, u1 = u0 + 300, v0 = r * 300, v1 = v0 + 270;
    shapes.push(`<polygon points="${pts([map(u0, v0), map(u1, v0), map(u1, v1), map(u0, v1)])}"/>`);
  }
  return shapes.join('');
}

// The visible window's panes thrown forward onto the desk.
function deskPatch() {
  return [[1214, 1396], [1424, 1606]].map(([a, b]) =>
    `<polygon points="${pts([[a + 10, DESK_TOP + 6], [b - 10, DESK_TOP + 6], [b + 70, H], [a + 40, H]])}"/>`).join('');
}

function note({ x, y, s, r, c, tape }, i) {
  const h = s / 2;
  return `<g transform="translate(${x} ${y}) rotate(${r})" filter="url(#noteShadow)">
    <rect x="${-h}" y="${-h}" width="${s}" height="${s}" rx="4" fill="url(#note-${c})"/>
    <rect x="${-h}" y="${-h}" width="${s}" height="${s * 0.2}" rx="4" fill="#000" opacity="0.045"/>
    <path d="M ${h} ${h - s * 0.16} L ${h} ${h} L ${h - s * 0.16} ${h} Z" fill="#000" opacity="0.06"/>
    ${tape ? `<rect x="${-s * 0.22}" y="${-h - 10}" width="${s * 0.44}" height="20" rx="2" fill="#FFFFFF" opacity="0.55" transform="rotate(${i % 2 ? 4 : -3})"/>` : ''}
  </g>`;
}

// Deterministic wood grain.
function grain() {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lines = [];
  for (let i = 0; i < 16; i++) {
    const y = DESK_TOP + 12 + i * 8.4 + rand() * 4;
    const x0 = rand() * 300 - 200, len = 700 + rand() * 1100, wobble = 2 + rand() * 4;
    lines.push(`<path d="M ${x0} ${y} C ${x0 + len * 0.3} ${y - wobble} ${x0 + len * 0.6} ${y + wobble} ${x0 + len} ${y}"/>`);
    lines.push(`<path d="M ${x0 + len + 120} ${y + 3} C ${x0 + len + 500} ${y + wobble} ${x0 + len + 900} ${y - wobble} ${W + 50} ${y + 2}"/>`);
  }
  return lines.join('');
}

function scene(s) {
  const [s0, s1, s2] = s.sky;
  const lamp = s.lamp;
  const paneRects = PANES.map((p) => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3E7D7"/><stop offset="1" stop-color="#E9D9C5"/></linearGradient>
    <linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EDCB9F"/><stop offset="1" stop-color="#DBAD7B"/></linearGradient>
    <linearGradient id="contact" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A5030" stop-opacity="0"/><stop offset="1" stop-color="#7A5030" stop-opacity="0.13"/></linearGradient>
    <linearGradient id="sky" x1="0" y1="${FRAME.y}" x2="0" y2="${FRAME.y + FRAME.h}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${s0}"/><stop offset="0.55" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/>
    </linearGradient>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1EAE0"/></linearGradient>
    <linearGradient id="pot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D98A62"/><stop offset="1" stop-color="#B9694A"/></linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F7D35E"/><stop offset="1" stop-color="#E0AE2E"/></linearGradient>
    ${Object.entries(NOTE_COLORS).map(([k, v]) => `<linearGradient id="note-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${v}" stop-opacity="0.92"/><stop offset="1" stop-color="${v}"/></linearGradient>`).join('')}
    <radialGradient id="glow"><stop offset="0" stop-color="${s.glow?.color ?? '#fff'}"/><stop offset="1" stop-color="${s.glow?.color ?? '#fff'}" stop-opacity="0"/></radialGradient>
    <radialGradient id="lampGlow"><stop offset="0" stop-color="#FFD58C" stop-opacity="0.7"/><stop offset="0.35" stop-color="#FFC56E" stop-opacity="0.28"/><stop offset="1" stop-color="#FFB85A" stop-opacity="0"/></radialGradient>
    <radialGradient id="lampPool"><stop offset="0" stop-color="#FFE3A6"/><stop offset="1" stop-color="#FFD68A" stop-opacity="0"/></radialGradient>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="softer" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="12"/></filter>
    <filter id="noteShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="3" dy="8" stdDeviation="7" flood-color="#6A4A2A" flood-opacity="0.16"/></filter>
    <clipPath id="panes">${paneRects}</clipPath>
    <clipPath id="wallClip"><rect x="0" y="0" width="${W}" height="${DESK_TOP}"/></clipPath>
    <clipPath id="deskClip"><rect x="0" y="${DESK_TOP}" width="${W}" height="${H - DESK_TOP}"/></clipPath>
    <mask id="notSky"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#000">${paneRects}</g></mask>
  </defs>

  <!-- wall and its light -->
  <rect width="${W}" height="${DESK_TOP}" fill="url(#wall)"/>
  <g clip-path="url(#wallClip)" fill="${s.beam.color}" opacity="${s.beam.o}" filter="url(#soft)">${wallBeams()}</g>
  <rect y="${DESK_TOP - 34}" width="${W}" height="34" fill="url(#contact)"/>
  ${NOTES.map(note).join('')}

  <!-- window -->
  <rect x="${FRAME.x + 10}" y="${FRAME.y + 16}" width="${FRAME.w}" height="${FRAME.h}" rx="10" fill="#5A3A20" opacity="0.12" filter="url(#softer)"/>
  <rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" rx="10" fill="url(#frame)"/>
  <g clip-path="url(#panes)">
    <rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" fill="url(#sky)"/>
    ${s.glow ? `<circle cx="${s.glow.x}" cy="${s.glow.y}" r="${s.glow.r}" fill="url(#glow)" opacity="${s.glow.o}"/>` : ''}
    ${s.sun ? `<circle cx="${s.sun.x}" cy="${s.sun.y}" r="${s.sun.r}" fill="${s.sun.color}"/>` : ''}
    <path d="M1196 490 L1196 410 C1260 385 1320 398 1380 392 C1450 385 1520 360 1624 395 L1624 490 Z" fill="${s.farHill}"/>
    <path d="M1196 490 L1196 448 C1290 425 1370 446 1440 440 C1520 434 1570 418 1624 436 L1624 490 Z" fill="${s.nearHill}"/>
    <g fill="${s.tree}">
      <ellipse cx="1296" cy="430" rx="9" ry="15"/><ellipse cx="1314" cy="434" rx="7" ry="11"/>
      <ellipse cx="1556" cy="417" rx="9" ry="16"/><ellipse cx="1575" cy="421" rx="7" ry="12"/><ellipse cx="1240" cy="438" rx="6" ry="9"/>
    </g>
    <g fill="#FFFFFF" opacity="0.07">
      <polygon points="1204,250 1300,88 1350,88 1204,330"/><polygon points="1418,486 1560,295 1590,295 1460,486"/>
    </g>
  </g>
  <g fill="none" stroke="#5A3A20" stroke-width="6" opacity="0.08">
    ${PANES.map((p) => `<path d="M ${p.x + 3} ${p.y + p.h} L ${p.x + 3} ${p.y + 3} L ${p.x + p.w} ${p.y + 3}"/>`).join('')}
  </g>
  <rect x="${FRAME.x - 26}" y="${FRAME.y + FRAME.h - 6}" width="${FRAME.w + 52}" height="22" rx="5" fill="#FFFFFF"/>
  <rect x="${FRAME.x - 22}" y="${FRAME.y + FRAME.h + 16}" width="${FRAME.w + 44}" height="9" rx="3" fill="#E6DACB"/>
  <rect x="${FRAME.x - 20}" y="${FRAME.y + FRAME.h + 24}" width="${FRAME.w + 40}" height="18" fill="#5A3A20" opacity="0.1" filter="url(#soft)"/>

  <!-- desk -->
  <rect y="${DESK_TOP}" width="${W}" height="${H - DESK_TOP}" fill="url(#desk)"/>
  <g fill="none" stroke="#B9824F" stroke-width="2" opacity="0.14">${grain()}</g>
  <rect y="${DESK_TOP}" width="${W}" height="3" fill="#F8E0BD"/>
  <g clip-path="url(#deskClip)" fill="${s.patch.color}" opacity="${s.patch.o}" filter="url(#soft)">${deskPatch()}</g>

  <!-- plant -->
  <ellipse cx="1072" cy="622" rx="58" ry="10" fill="#5A3A20" opacity="0.14" filter="url(#soft)"/>
  <g fill="#6FA27C">
    <ellipse cx="1040" cy="500" rx="16" ry="46" transform="rotate(-28 1040 500)" fill="#5E9470"/>
    <ellipse cx="1104" cy="496" rx="16" ry="48" transform="rotate(30 1104 496)" fill="#5E9470"/>
    <ellipse cx="1072" cy="478" rx="17" ry="58"/>
    <ellipse cx="1020" cy="522" rx="13" ry="34" transform="rotate(-52 1020 522)" fill="#86B892"/>
    <ellipse cx="1126" cy="524" rx="13" ry="34" transform="rotate(54 1126 524)" fill="#86B892"/>
  </g>
  <path d="M1032 552 L1112 552 L1102 620 L1042 620 Z" fill="url(#pot)"/>
  <rect x="1024" y="540" width="96" height="18" rx="4" fill="#DF9670"/>

  <!-- lamp, kept clear of the header's trailing buttons -->
  <g transform="translate(-50 0)">
  <ellipse cx="1796" cy="640" rx="82" ry="12" fill="#3A2A1A" opacity="0.16" filter="url(#soft)"/>
  <ellipse cx="1800" cy="632" rx="60" ry="12" fill="#4A4650"/>
  <g stroke="#4A4650" stroke-width="11" stroke-linecap="round" fill="none"><path d="M1800 628 L1764 476 L1850 414"/></g>
  <circle cx="1764" cy="476" r="9" fill="#5B5662"/>
  <g transform="translate(1855 412) rotate(25)">
    <path d="M -20 0 L 20 0 L 58 70 Q 0 84 -58 70 Z" fill="url(#shade)"/>
    <ellipse cx="0" cy="71" rx="58" ry="12" fill="${lamp ? '#FFF2C6' : '#C59A32'}"/>
    <circle cx="0" cy="-2" r="10" fill="#5B5662"/>
  </g>
  </g>

  <!-- the hour's light over everything but the sky -->
  <rect width="${W}" height="${H}" fill="${s.overlay}" mask="url(#notSky)" style="mix-blend-mode:multiply"/>
  ${lamp ? `<g style="mix-blend-mode:screen" opacity="${lamp}">
    <circle cx="${LAMP_MOUTH.x - 20}" cy="${LAMP_MOUTH.y + 40}" r="400" fill="url(#lampGlow)"/>
    <ellipse cx="1722" cy="650" rx="240" ry="48" fill="url(#lampPool)" opacity="0.6"/>
  </g>
  <g transform="translate(1805 412) rotate(25)" opacity="${lamp}"><ellipse cx="0" cy="71" rx="58" ry="12" fill="#FFF6D8"/></g>` : ''}
</svg>`;
}

// ── Render ──────────────────────────────────────────────────────────────────

function render(html, out, width, height) {
  const dir = mkdtempSync(join(tmpdir(), 'chits-scene-'));
  const page = join(dir, 'page.html');
  writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden}svg{display:block}</style></head><body>${html}</body></html>`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${width},${height}`, `--screenshot=${out}`, `file://${page}`], { stdio: 'ignore' });
  rmSync(dir, { recursive: true, force: true });
}

// Where header ink lands on a phone, where the band is about 3.3:1: the
// status bar across the upper half, the title and buttons across the lower.
const REGIONS = { status: [30, 360], text: [360, 690] };

// The average color of a finished webp, and the 5th and 95th percentile
// luminance of each region, so the app can pick ink and a veil without decoding pixels.
function measure(webp) {
  const dir = mkdtempSync(join(tmpdir(), 'chits-measure-'));
  const page = join(dir, 'page.html');
  const data = readFileSync(webp).toString('base64');
  writeFileSync(page, `<!doctype html><body><script>
    const lin = (c) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const image = new Image();
    image.onload = () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: ${W}, height: ${H} });
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const out = {};
      const all = context.getImageData(0, 0, ${W}, ${H}).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < all.length; i += 4) { sum[0] += all[i]; sum[1] += all[i + 1]; sum[2] += all[i + 2]; }
      out.tone = '#' + sum.map((v) => Math.round(v / (all.length / 4)).toString(16).padStart(2, '0')).join('').toUpperCase();
      for (const [name, [top, bottom]] of Object.entries(${JSON.stringify(REGIONS)})) {
        const { data } = context.getImageData(0, top, ${W}, bottom - top);
        const values = new Float64Array(data.length / 4);
        for (let i = 0; i < values.length; i++) values[i] = 0.2126 * lin(data[i * 4]) + 0.7152 * lin(data[i * 4 + 1]) + 0.0722 * lin(data[i * 4 + 2]);
        values.sort();
        out[name] = [values[Math.floor(values.length * 0.05)], values[Math.floor(values.length * 0.95)]].map((v) => Math.round(v * 1000) / 1000);
      }
      document.body.textContent = JSON.stringify(out);
    };
    image.src = 'data:image/webp;base64,${data}';
  </script></body>`);
  const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--virtual-time-budget=10000', '--dump-dom', `file://${page}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  rmSync(dir, { recursive: true, force: true });
  return JSON.parse(dom.match(/<body>(.*)<\/body>/s)[1]);
}

const previewIndex = process.argv.indexOf('--preview');
const previewDir = previewIndex > 0 ? resolve(process.argv[previewIndex + 1]) : null;
mkdirSync(OUT_DIR, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'chits-scenes-'));
const luminance = {};
for (const [id, s] of Object.entries(SCENES)) {
  const png = join(previewDir ?? work, `${id}.png`);
  const webp = join(OUT_DIR, `${id}.webp`);
  render(scene(s), png, W, H);
  execFileSync('cwebp', ['-quiet', '-q', '88', '-m', '6', png, '-o', webp]);
  luminance[id] = measure(webp);
  console.log(`${id}.webp`, JSON.stringify(luminance[id]));
}
rmSync(work, { recursive: true, force: true });

writeFileSync(STATS_FILE, `// Generated by scripts/generate-header-scenes.mjs; run it again instead of editing.

/** The pictures' size, in their own pixels. */
export const HEADER_SCENE_SIZE = { width: ${W}, height: ${H} };
/** The window's four panes of sky, in picture pixels, for the animated sky. */
export const HEADER_SCENE_PANES = [
${PANES.map((p) => `  { x: ${p.x}, y: ${p.y}, w: ${p.w}, h: ${p.h} },`).join('\n')}
];
/** Each picture's average color: what the header shows for the instant before it decodes. */
export const HEADER_SCENE_TONE = {
${Object.entries(luminance).map(([id, l]) => `  ${id}: '${l.tone}',`).join('\n')}
};
/** 5th and 95th percentile luminance behind the status bar and the header row. */
export const HEADER_SCENE_LUMINANCE = {
${Object.entries(luminance).map(([id, l]) => `  ${id}: { status: [${l.status.join(', ')}], text: [${l.text.join(', ')}] },`).join('\n')}
};
`);
console.log(STATS_FILE);
