// The fridge's alphabet magnets spell the NoteSpace name. Pure (no React
// Native) so tests can check how any name is laid out.

/** One magnet per letter or digit; a space is a gap. */
export type MagnetGlyph = { char: string; gap: boolean; rotation: number; colorIndex: number };

export const MAGNET_LETTER_SIZE = { max: 38, min: 22 } as const;
// How far each piece advances, as a fraction of the letter size — generous,
// so a row of wide letters (W, M) still fits.
const LETTER_ADVANCE = 0.74;
const GAP_ADVANCE = 0.36;
// Tilts between -8° and +9°, repeating, so neighbours never match.
const TILTS = [-8, 5, -3, 9, -6, 4, -7, 7, -2, 8, -5, 3];
// Things a set of alphabet magnets could plausibly include.
const MAGNETIC = /[\p{L}\p{N}!?&'.\-]/u;

const width = (glyphs: { gap: boolean }[], size: number) => glyphs.reduce((sum, glyph) => sum + (glyph.gap ? GAP_ADVANCE : LETTER_ADVANCE) * size, 0);

/**
 * Lays a NoteSpace name out as magnets within `maxWidth` points: uppercase,
 * letters and digits only (spaces become gaps, emoji and symbols are left
 * off), shrinking from 38 to 22 points to fit, then cut at the last magnet
 * that fits. A name with nothing to spell falls back to CHITS.
 */
export function magnetLetters(name: string | null | undefined, maxWidth: number): { glyphs: MagnetGlyph[]; size: number } {
  const pieces: { char: string; gap: boolean }[] = [];
  for (const char of Array.from((name ?? '').normalize('NFC').toUpperCase())) {
    if (/\s/.test(char)) {
      if (pieces.length && !pieces[pieces.length - 1].gap) pieces.push({ char: ' ', gap: true });
    } else if (MAGNETIC.test(char)) pieces.push({ char, gap: false });
  }
  while (pieces.length && pieces[pieces.length - 1].gap) pieces.pop();
  if (!pieces.length) return magnetLetters('CHITS', maxWidth);

  const available = Math.max(0, maxWidth);
  const size = Math.max(MAGNET_LETTER_SIZE.min, Math.min(MAGNET_LETTER_SIZE.max, Math.floor(available / Math.max(1e-6, width(pieces, 1)))));
  while (pieces.length > 1 && width(pieces, size) > available) {
    pieces.pop();
    while (pieces.length && pieces[pieces.length - 1].gap) pieces.pop();
  }
  let letter = 0;
  const glyphs = pieces.map((piece, index) => ({ ...piece, rotation: TILTS[index % TILTS.length], colorIndex: piece.gap ? -1 : letter++ }));
  return { glyphs, size };
}
