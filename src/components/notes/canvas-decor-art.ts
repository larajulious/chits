// The scrapbook set for the Notes board, drawn in code as SVG markup and
// rendered with SvgXml. Each piece is drawn once when it mounts and then rides
// the board's transform, so panning never redraws it.
//
// Shapes are original to Chits: pastel papers, the same white die-cut edge the
// sticker notes use, and the little face the mascot has.

import { WORKSPACE_FONT_FAMILIES } from '@/constants/style-fonts';

export type DecorKind = 'sticker' | 'tape' | 'doodle' | 'label';
export type DecorLook = { id: string; text?: string; ink?: string };
export type DecorArt = {
  key: string;
  kind: DecorKind;
  /** Size at scale 1, in board points. */
  w: number;
  h: number;
  viewBox: string;
  /** Labels carry a word; this names the copy key for the word a new one starts with. */
  textKey?: string;
  inks?: boolean;
  draw: (look: DecorLook) => string;
};

export const DECOR_INK = '#2B2620';
export const DECOR_INKS = ['#2B2620', '#E0607E', '#4A86D8', '#3FA97A'];
const SHADOW = 'rgba(80,60,30,0.18)';
const FONT = WORKSPACE_FONT_FAMILIES.display;

/** A die-cut sticker: a soft shadow, the white edge, then the art. `outline` is the shape with no colors of its own. */
const sticker = (outline: string, art: string) =>
  `<g transform="translate(0 2.5)" fill="${SHADOW}" stroke="${SHADOW}" stroke-width="12" stroke-linejoin="round">${outline}</g>`
  + `<g fill="#FFFFFF" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round">${outline}</g>${art}`;

const face = (cx: number, cy: number, s = 1) =>
  `<circle cx="${cx - 9 * s}" cy="${cy}" r="${3.2 * s}" fill="${DECOR_INK}"/><circle cx="${cx + 9 * s}" cy="${cy}" r="${3.2 * s}" fill="${DECOR_INK}"/>`
  + `<path d="M${cx - 5 * s} ${cy + 6 * s} q${5 * s} ${5 * s} ${10 * s} 0" stroke="${DECOR_INK}" stroke-width="${2.4 * s}" fill="none" stroke-linecap="round"/>`
  + `<ellipse cx="${cx - 15 * s}" cy="${cy + 6 * s}" rx="${4 * s}" ry="${2.6 * s}" fill="#F49AB0" opacity="0.75"/><ellipse cx="${cx + 15 * s}" cy="${cy + 6 * s}" rx="${4 * s}" ry="${2.6 * s}" fill="#F49AB0" opacity="0.75"/>`;

function starPath(cx: number, cy: number, outer: number, inner: number, points = 5) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const radius = i % 2 ? inner : outer;
    d += `${i ? 'L' : 'M'}${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  }
  return `${d}Z`;
}

const HEART = 'M50 86 C20 66 8 48 8 32 C8 18 19 9 31 9 C40 9 46 14 50 21 C54 14 60 9 69 9 C81 9 92 18 92 32 C92 48 80 66 50 86Z';
const CLOUD = 'M28 76 C14 76 8 66 10 57 C12 48 20 44 27 45 C29 33 39 26 50 27 C61 28 69 36 70 45 C80 43 90 50 90 61 C90 71 82 76 74 76 Z';
const SPARK = 'M50 8 C54 36 64 46 92 50 C64 54 54 64 50 92 C46 64 36 54 8 50 C36 46 46 36 50 8Z';
const PETALS = [0, 1, 2, 3, 4].map((i) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return [(50 + 23 * Math.cos(angle)).toFixed(1), (50 + 23 * Math.sin(angle)).toFixed(1)];
});
const STAR = starPath(50, 54, 44, 22);
const BADGE = starPath(50, 50, 46, 38, 14);
const BOW = 'M60 44 C40 20 12 16 10 34 C8 52 36 60 60 46 C84 60 112 52 110 34 C108 16 80 20 60 44Z';
const BOW_TAILS = 'M56 48 L40 84 L52 80 L60 88 L62 50Z M64 48 L80 84 L68 80 L60 88Z';

const stickerArt = (key: string, w: number, h: number, draw: () => string, viewBox = '0 0 100 100'): DecorArt => ({ key, kind: 'sticker', w, h, viewBox, draw });

const STICKERS: DecorArt[] = [
  stickerArt('heart', 84, 84, () => sticker(`<path d="${HEART}"/>`, `<path d="${HEART}" fill="#F49AB0"/><ellipse cx="30" cy="28" rx="9" ry="5.5" fill="#FFFFFF" opacity="0.6" transform="rotate(-35 30 28)"/>`)),
  stickerArt('star', 88, 88, () => sticker(`<path d="${STAR}"/>`, `<path d="${STAR}" fill="#FBD45B"/>${face(50, 56, 0.8)}`)),
  stickerArt('flower', 84, 84, () => sticker(PETALS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="18"/>`).join(''), PETALS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="18" fill="#C9B5F2"/>`).join('') + '<circle cx="50" cy="50" r="15" fill="#FBD45B"/><circle cx="45" cy="45" r="4" fill="#FFFFFF" opacity="0.6"/>')),
  stickerArt('cloud', 96, 80, () => sticker(`<path d="${CLOUD}"/>`, `<path d="${CLOUD}" fill="#CFE3F7"/>${face(50, 58, 0.85)}`)),
  stickerArt('sparkle', 80, 80, () => sticker(`<path d="${SPARK}"/><path d="${SPARK}" transform="translate(68 4) scale(0.3)"/>`, `<path d="${SPARK}" fill="#FFD36E"/><path d="${SPARK}" transform="translate(68 4) scale(0.3)" fill="#F49AB0"/>`)),
  stickerArt('chits', 86, 86, () => sticker('<rect x="18" y="22" width="64" height="64" rx="13"/><rect x="38" y="13" width="24" height="14" rx="3"/>', `<rect x="18" y="22" width="64" height="64" rx="13" fill="#FBE47E"/><rect x="38" y="13" width="24" height="14" rx="3" fill="#F2C230"/>${face(50, 54, 1.1)}`)),
  stickerArt('rainbow', 104, 72, () => sticker('<path d="M25 70 A35 35 0 0 1 95 70" fill="none" stroke-width="45"/>', '<path d="M14 70 A46 46 0 0 1 106 70" fill="none" stroke="#F49AB0" stroke-width="11"/><path d="M25 70 A35 35 0 0 1 95 70" fill="none" stroke="#FBD45B" stroke-width="11"/><path d="M36 70 A24 24 0 0 1 84 70" fill="none" stroke="#9ED9B4" stroke-width="11"/><circle cx="12" cy="74" r="10" fill="#FFFFFF"/><circle cx="24" cy="76" r="8" fill="#FFFFFF"/><circle cx="108" cy="74" r="10" fill="#FFFFFF"/><circle cx="96" cy="76" r="8" fill="#FFFFFF"/>'), '0 0 120 84'),
  stickerArt('mug', 84, 84, () => sticker('<rect x="18" y="38" width="50" height="48" rx="9"/><circle cx="72" cy="60" r="14"/><path d="M32 12 v18 M46 8 v22"/>', `<circle cx="70" cy="60" r="11" fill="none" stroke="#E9B98F" stroke-width="7"/><rect x="18" y="38" width="50" height="48" rx="9" fill="#F3D2B5"/><path d="M30 30 c-6 -6 6 -10 0 -18 M45 30 c-6 -6 6 -10 0 -20" stroke="#C9BEAA" stroke-width="3.5" fill="none" stroke-linecap="round"/>${face(43, 60, 0.75)}`)),
  stickerArt('leaf', 80, 80, () => sticker('<path d="M18 82 C18 42 48 18 84 16 C84 52 62 82 18 82Z"/>', '<path d="M18 82 C18 42 48 18 84 16 C84 52 62 82 18 82Z" fill="#9ED9B4"/><path d="M22 78 C40 58 58 40 76 24" stroke="#5FB58A" stroke-width="3.5" fill="none" stroke-linecap="round"/>')),
  stickerArt('moon', 80, 80, () => sticker('<path d="M62 10 A40 40 0 1 0 90 66 A32 32 0 1 1 62 10Z"/>', `<path d="M62 10 A40 40 0 1 0 90 66 A32 32 0 1 1 62 10Z" fill="#C9DCF5"/><path d="M30 52 q5 4 10 0 M46 60 q5 4 10 0" stroke="${DECOR_INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="32" cy="64" rx="4" ry="2.6" fill="#F49AB0" opacity="0.75"/>`)),
  stickerArt('cherry', 80, 84, () => sticker('<circle cx="32" cy="70" r="17"/><circle cx="68" cy="74" r="17"/><path d="M32 54 C40 30 52 18 60 12 C62 30 66 46 68 58"/>', '<path d="M32 54 C40 30 52 18 60 12 C62 30 66 46 68 58" stroke="#5FB58A" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M60 12 c10 -2 20 2 24 10 c-10 2 -20 -2 -24 -10z" fill="#9ED9B4"/><circle cx="32" cy="70" r="17" fill="#EE6F86"/><circle cx="68" cy="74" r="17" fill="#EE6F86"/><circle cx="26" cy="64" r="4" fill="#FFFFFF" opacity="0.6"/><circle cx="62" cy="68" r="4" fill="#FFFFFF" opacity="0.6"/>')),
  stickerArt('bow', 92, 72, () => sticker(`<path d="${BOW}"/><path d="${BOW_TAILS}"/>`, `<path d="${BOW_TAILS}" fill="#E07C96"/><path d="${BOW}" fill="#F49AB0"/><circle cx="60" cy="45" r="9" fill="#E07C96"/>`), '0 0 120 90'),
];

// Washi tape: a translucent strip with torn ends and a printed pattern.
const TAPE_EDGE = (() => {
  let left = '';
  let right = '';
  for (let i = 0; i <= 6; i++) {
    right += `L${i % 2 ? 170 : 166} ${i * 6} `;
    left = `L${i % 2 ? 0 : 4} ${i * 6} ${left}`;
  }
  return `M4 0 L166 0 ${right}L4 36 ${left}Z`;
})();
const tape = (name: string, base: string, pattern: (id: string) => string): DecorArt => ({
  key: `tape-${name}`, kind: 'tape', w: 150, h: 32, viewBox: '0 0 170 36',
  draw: ({ id }) => {
    const patternId = `p${id.replace(/[^a-z0-9]/gi, '')}`;
    return `<defs>${pattern(patternId)}</defs><path d="${TAPE_EDGE}" transform="translate(0 1.5)" fill="rgba(0,0,0,0.07)"/><path d="${TAPE_EDGE}" fill="${base}" opacity="0.9"/><path d="${TAPE_EDGE}" fill="url(#${patternId})"/>`;
  },
});
const TAPES: DecorArt[] = [
  tape('dots', '#F9C6CF', (id) => `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1.8" fill="#FFFFFF" opacity="0.85"/></pattern>`),
  tape('stripes', '#C9DCF5', (id) => `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" fill="#FFFFFF" opacity="0.6"/></pattern>`),
  tape('gingham', '#C7EAD3', (id) => `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="12" fill="#FFFFFF" opacity="0.35"/><rect width="12" height="6" fill="#FFFFFF" opacity="0.35"/></pattern>`),
  tape('hearts', '#FFF1B8', (id) => `<pattern id="${id}" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M9 14 C4 10 2 8 2 6 C2 4 3.5 3 5 3 C6.5 3 8 4 9 5.5 C10 4 11.5 3 13 3 C14.5 3 16 4 16 6 C16 8 14 10 9 14Z" fill="#F49AB0"/></pattern>`),
  tape('kraft', '#E6D3B3', (id) => `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 3 H6" stroke="#B89B72" stroke-width="0.6" opacity="0.6"/></pattern>`),
  tape('lilac', '#DECFF5', (id) => `<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><path d="${SPARK}" transform="translate(3 3) scale(0.1)" fill="#FFFFFF"/></pattern>`),
];

// Doodles: pen marks in one ink, which the user can change.
const doodle = (name: string, d: string): DecorArt => ({
  key: `doodle-${name}`, kind: 'doodle', w: 104, h: 76, viewBox: '0 0 110 80', inks: true,
  draw: ({ ink }) => `<path d="${d}" stroke="${ink ?? DECOR_INK}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
});
const DOODLES: DecorArt[] = [
  doodle('arrow', 'M10 64 C30 20 70 14 96 40 M83 30 L97 41 L81 47'),
  doodle('circle', 'M62 12 C28 8 8 26 10 44 C12 64 40 74 66 68 C92 62 102 40 88 24 C78 13 58 10 40 16'),
  doodle('squiggle', 'M6 44 C16 30 24 58 34 44 C44 30 52 58 62 44 C72 30 80 58 90 44 C96 36 100 40 104 44'),
  doodle('burst', [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const angle = (i * Math.PI) / 4;
    return `M${(55 + 14 * Math.cos(angle)).toFixed(1)} ${(40 + 14 * Math.sin(angle)).toFixed(1)} L${(55 + 30 * Math.cos(angle)).toFixed(1)} ${(40 + 30 * Math.sin(angle)).toFixed(1)}`;
  }).join(' ')),
  doodle('check', 'M16 44 L40 66 L94 14'),
  doodle('heart', 'M55 70 C32 54 22 42 22 30 C22 20 30 13 39 13 C46 13 51 17 55 23 C59 17 64 13 71 13 C80 13 88 20 88 30 C88 42 78 54 55 70Z'),
  doodle('brace', 'M40 6 C26 6 30 30 18 40 C30 50 26 74 40 74 M70 6 C84 6 80 30 92 40 C80 50 84 74 70 74'),
  doodle('stars', `${starPath(30, 40, 16, 7)} ${starPath(70, 26, 10, 4.5)} ${starPath(82, 58, 12, 5)}`),
];

// Labels & stamps carry the user's own word, shrunk to fit.
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const fitSize = (text: string, width: number, base: number) => Math.min(base, width / Math.max(1, text.length * 0.56));
/** Centered on (x, y). SvgXml has no dominant-baseline, so the baseline is placed by hand. */
const word = (text: string, x: number, y: number, width: number, base: number, fill: string, extra = '') => {
  const size = fitSize(text, width, base);
  return `<text x="${x}" y="${(y + size * 0.36).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${size.toFixed(1)}" fill="${fill}"${extra}>${escapeXml(text)}</text>`;
};
const TAG = 'M28 6 H130 a8 8 0 0 1 8 8 V50 a8 8 0 0 1 -8 8 H28 L6 32 Z';
const RIBBON_TAILS = 'M22 14 H2 L10 26 L2 38 H22Z M148 14 H168 L160 26 L168 38 H148Z';
const LABELS: DecorArt[] = [
  { key: 'label-tag', kind: 'label', w: 130, h: 60, viewBox: '0 0 140 64', textKey: 'notesDecor.textIdeas',
    draw: ({ text = '' }) => sticker(`<path d="${TAG}"/>`, `<path d="${TAG}" fill="#FFF1D6"/><circle cx="26" cy="32" r="4.5" fill="#E6D3B3"/>${word(text, 84, 32, 92, 22, DECOR_INK)}`) },
  { key: 'label-stamp', kind: 'label', w: 96, h: 96, viewBox: '0 0 100 100', textKey: 'notesDecor.textDone',
    draw: ({ text = '' }) => `<g opacity="0.85"><circle cx="50" cy="50" r="44" fill="none" stroke="#D9534F" stroke-width="4"/><circle cx="50" cy="50" r="36" fill="none" stroke="#D9534F" stroke-width="1.5"/><path d="${starPath(50, 22, 5, 2.2)}" fill="#D9534F"/><path d="${starPath(50, 78, 5, 2.2)}" fill="#D9534F"/>${word(text.toLocaleUpperCase(), 50, 50, 60, 22, '#D9534F', ' letter-spacing="1"')}</g>` },
  { key: 'label-ribbon', kind: 'label', w: 160, h: 52, viewBox: '0 0 170 56', textKey: 'notesDecor.textThisWeek',
    draw: ({ text = '' }) => sticker('<path d="M22 8 H148 V44 H22Z"/>' + `<path d="${RIBBON_TAILS}"/>`, `<path d="${RIBBON_TAILS}" fill="#E07C96"/><rect x="20" y="8" width="130" height="36" rx="3" fill="#F49AB0"/>${word(text, 85, 26, 116, 19, '#FFFFFF')}`) },
  { key: 'label-tab', kind: 'label', w: 118, h: 42, viewBox: '0 0 124 44', textKey: 'notesDecor.textToDo',
    draw: ({ text = '' }) => sticker('<rect x="4" y="4" width="116" height="36" rx="10"/>', `<rect x="4" y="4" width="116" height="36" rx="10" fill="#C9DCF5"/><circle cx="20" cy="22" r="5" fill="#FFFFFF" opacity="0.8"/>${word(text, 66, 22, 80, 18, DECOR_INK)}`) },
  { key: 'label-badge', kind: 'label', w: 80, h: 80, viewBox: '0 0 100 100', textKey: 'notesDecor.textYay',
    draw: ({ text = '' }) => sticker(`<path d="${BADGE}"/>`, `<path d="${BADGE}" fill="#FBD45B"/>${word(text, 50, 50, 58, 24, DECOR_INK)}`) },
];

export const DECOR_SETS: { id: DecorKind; labelKey: string; items: DecorArt[] }[] = [
  { id: 'sticker', labelKey: 'notesDecor.stickers', items: STICKERS },
  { id: 'tape', labelKey: 'notesDecor.tape', items: TAPES },
  { id: 'doodle', labelKey: 'notesDecor.doodles', items: DOODLES },
  { id: 'label', labelKey: 'notesDecor.labels', items: LABELS },
];
export const DECOR_ART: ReadonlyMap<string, DecorArt> = new Map(DECOR_SETS.flatMap((set) => set.items).map((art) => [art.key, art]));

/** The whole drawing for SvgXml; width and height come from the caller. */
export function decorXml(art: DecorArt, look: DecorLook) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.viewBox}" preserveAspectRatio="xMidYMid meet">${art.draw(look)}</svg>`;
}
