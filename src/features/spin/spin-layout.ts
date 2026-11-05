// Spin's geometry and timing, as plain numbers so tests can check them.
import { HERO_CONTENT_WIDTH } from '../../components/mascot/hero-stage-layout';

const GUTTER = 16;
/** What sits under the wheel at rest: the filter tabs, wrapped onto two rows. */
const CONTROLS_ROOM = 104;
/** The room above the wheel for its pointer. */
export const WHEEL_TOP_ROOM = 22;
/** Space between the small wheel and the result under it. */
export const RESULT_GAP = 10;

/**
 * The wheel at rest and beside a result. The large wheel is the page's
 * centerpiece: as big as fits with the tabs under it, and never so small that
 * a short window loses it — that page just scrolls.
 */
export function spinWheelLayout(width: number, viewport: number, heroHeight: number) {
  const content = Math.min(width, HERO_CONTENT_WIDTH) - GUTTER * 2;
  const room = viewport - heroHeight - WHEEL_TOP_ROOM - CONTROLS_ROOM;
  const size = Math.round(Math.max(Math.min(220, content), Math.min(324, content * 0.94, room)));
  return { size, compactSize: Math.round(Math.min(size, Math.max(150, Math.min(176, viewport * 0.26)))) };
}

/** The room for a label along a slice, between the hub and the rim, in wheel units. */
const LABEL_ROOM = 86;
const SMALLEST_LABEL = 11;
const glyphWidth = (glyph: string, size: number) => (glyph.codePointAt(0)! > 0x2ff ? 1 : /[MWmw]/.test(glyph) ? 0.8 : 0.56) * size;
const textWidth = (text: string, size: number) => Array.from(text).reduce((sum, glyph) => sum + glyphWidth(glyph, size), 0);

/** Whole words on as few lines as fit, or null if a word is too long or there are too many lines. */
function wrapWords(words: string[], size: number, maxLines: number) {
  const lines: string[] = [];
  for (const word of words) {
    if (textWidth(word, size) > LABEL_ROOM) return null;
    const joined = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
    if (lines.length && textWidth(joined, size) <= LABEL_ROOM) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  return lines.length <= maxLines ? lines : null;
}

/**
 * A slice's label: whole words at the largest size that fits, stepping the type
 * down before ever splitting a word. Only text too long for that is cut, and the
 * full wording stays in the wheel's accessible label and the result.
 */
export function fitWheelLabel(value: string, fontSize: number, maxLines: number) {
  const clean = value.replace(/\s+/g, ' ').trim();
  const words = clean.split(' ');
  for (let size = fontSize; size >= Math.min(fontSize, SMALLEST_LABEL); size--) {
    const lines = wrapWords(words, size, maxLines);
    if (lines) return { lines, size };
  }
  const glyphs = Array.from(clean);
  const lines: string[] = [];
  while (glyphs.length && lines.length < maxLines) {
    let used = 0; let end = 0;
    while (end < glyphs.length && used + glyphWidth(glyphs[end], fontSize) <= LABEL_ROOM) used += glyphWidth(glyphs[end++], fontSize);
    if (end < glyphs.length && lines.length < maxLines - 1) {
      const space = glyphs.slice(0, end).lastIndexOf(' ');
      if (space > 0) end = space + 1;
    }
    let line = glyphs.splice(0, Math.max(1, end)).join('').trim();
    if (glyphs.length && lines.length === maxLines - 1) line = `${Array.from(line).slice(0, -2).join('').trimEnd()}…`;
    lines.push(line);
  }
  return { lines, size: fontSize };
}

/** One spin, end to end: quick to start, long to slow, then a small settle back. */
export const SPIN_DURATION = 2800;
export const SPIN_SETTLE_MS = 340;
/** How far past the target the wheel drifts before settling, kept well inside the chosen slice. */
export const spinOvershoot = (count: number) => Math.min(3, 360 / Math.max(1, count) * 0.12);

/** When each part of the reveal starts after the wheel stops, in milliseconds. */
export const REVEAL_MS = { wheel: 260, card: 380, details: 480, actions: 620 } as const;
