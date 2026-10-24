import { HEADER_SCENE_LUMINANCE, HEADER_SCENE_TONE } from './header-scenes.generated';

// Default's header follows the local clock through six pictures of the same
// room (drawn by scripts/generate-header-scenes.mjs). Neighboring scenes
// crossfade minute by minute, and the header's ink and a light veil are
// chosen from each picture's measured luminance, so titles, buttons and the
// status bar stay readable at every minute, blends included.
//
// Pure data and math (no React Native) so tests can walk the whole day.

export const HEADER_SCENE_IDS = ['dawn', 'morning', 'afternoon', 'golden', 'evening', 'night'] as const;
export type HeaderSceneId = typeof HEADER_SCENE_IDS[number];
/** How much of each scene shows; the weights sum to 1. */
export type HeaderSceneMix = Partial<Record<HeaderSceneId, number>>;

const DAY = 24 * 60;
const at = (hours: number, minutes = 0) => hours * 60 + minutes;
// Stops through the day: between two stops of one scene it holds, between
// two different scenes it crossfades. The last stop runs on into the first.
const SCHEDULE: readonly (readonly [number, HeaderSceneId])[] = [
  [at(4, 30), 'night'], [at(6), 'dawn'], [at(6, 45), 'dawn'], [at(8), 'morning'], [at(10, 30), 'morning'], [at(12), 'afternoon'],
  [at(15, 30), 'afternoon'], [at(17), 'golden'], [at(18), 'golden'], [at(19), 'evening'], [at(20, 15), 'evening'], [at(21, 30), 'night'],
];

/** The minute of the local day, with seconds as a fraction. */
export function localMinute(date: Date) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

export function sceneMixAt(minute: number): HeaderSceneMix {
  const m = ((minute % DAY) + DAY) % DAY;
  let index = SCHEDULE.length - 1;
  for (let i = 0; i < SCHEDULE.length; i++) if (SCHEDULE[i][0] <= m) index = i;
  const [start, from] = SCHEDULE[index];
  const [end, to] = SCHEDULE[(index + 1) % SCHEDULE.length];
  if (from === to) return { [from]: 1 };
  const length = (end - start + DAY) % DAY;
  const x = ((m - start + DAY) % DAY) / length;
  const t = x * x * (3 - 2 * x);
  return t <= 0 ? { [from]: 1 } : { [from]: 1 - t, [to]: t };
}

// ── Ink and veil ─────────────────────────────────────────────────────────────

export type HeaderSceneInk = 'dark' | 'light';
export type HeaderSceneLook = { ink: HeaderSceneInk; veil: { color: '#000000' | '#FFFFFF'; opacity: number } };
/** Dark ink for the bright scenes; light scenes' ink is plain white. */
export const HEADER_SCENE_DARK_INK = { text: '#24231F', muted: '#45423B' };
/** The most dark mode dims a scene; under dark ink only as far as the ink allows. */
const DARK_MODE_DIM = 0.12;

const toLuminance = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const toValue = (luminance: number) => luminance <= 0.0031308 ? luminance * 12.92 : 1.055 * luminance ** (1 / 2.4) - 0.055;
const luminanceOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => toLuminance(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// WCAG AA (4.5 for text, 3 for icons and the status bar), with a little
// margin because a blend's percentiles are estimated from its two pictures'.
const MARGIN = 1.05;
const whiteOn = (ratio: number) => toValue(1.05 / (ratio * MARGIN) - 0.05);
const inkOn = (ink: string, ratio: number) => toValue((luminanceOf(ink) + 0.05) * ratio * MARGIN - 0.05);
type Region = 'text' | 'status';
const REGIONS: Region[] = ['text', 'status'];
/** The brightest a region may be under white ink, and the darkest under dark ink (as encoded values). */
const CEILING: Record<Region, number> = { text: whiteOn(4.5), status: whiteOn(3) };
const FLOOR: Record<Region, number> = {
  text: Math.max(inkOn(HEADER_SCENE_DARK_INK.text, 4.5), inkOn(HEADER_SCENE_DARK_INK.muted, 3)),
  status: inkOn(HEADER_SCENE_DARK_INK.text, 3),
};

export function sceneLook(mix: HeaderSceneMix, scheme: 'light' | 'dark'): HeaderSceneLook {
  // A crossfade mixes encoded values, so mix the percentiles the same way.
  const blend = (region: Region, end: 0 | 1) => Object.entries(mix).reduce((sum, [id, weight]) => sum + (weight ?? 0) * toValue(HEADER_SCENE_LUMINANCE[id as HeaderSceneId][region][end]), 0);
  const dim = scheme === 'dark' ? DARK_MODE_DIM : 0;
  // White ink: shade the brightest pixels down to the ceiling (dark mode then
  // dims on top, so it always reads a touch darker than light mode).
  const shade = Math.max(0, ...REGIONS.map((region) => 1 - CEILING[region] / blend(region, 1)));
  // Dark ink: dim only while the darkest pixels stay above the floor, then
  // lift whatever is still too dark toward white.
  const lows = REGIONS.map((region) => [blend(region, 0), FLOOR[region]] as const);
  const inkDim = Math.max(0, Math.min(dim, ...lows.map(([low, floor]) => 1 - floor / low)));
  const lift = Math.max(0, ...lows.map(([low, floor]) => (floor - low * (1 - inkDim)) / (1 - low * (1 - inkDim))));
  if (lift <= shade) return { ink: 'dark', veil: lift > 0 ? { color: '#FFFFFF', opacity: lift } : { color: '#000000', opacity: inkDim } };
  return { ink: 'light', veil: { color: '#000000', opacity: 1 - (1 - dim) * (1 - shade) } };
}

/** The mix's average color: the header's ground for the instant before its pictures decode. */
export function sceneTone(mix: HeaderSceneMix) {
  return blendHex(Object.entries(mix) as [HeaderSceneId, number][], (id) => HEADER_SCENE_TONE[id]);
}

function blendHex(entries: [HeaderSceneId, number][], color: (id: HeaderSceneId) => string) {
  const channel = (offset: number) => Math.round(entries.reduce((total, [id, weight]) => total + weight * parseInt(color(id).slice(offset, offset + 2), 16), 0)).toString(16).padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

// ── Sky ──────────────────────────────────────────────────────────────────────

/** What drifts and twinkles in the window at each hour. */
const SKY: Record<HeaderSceneId, { cloud: string; clouds: number; stars: number; motes: number }> = {
  dawn: { cloud: '#FFE6EC', clouds: 0.75, stars: 0, motes: 0.5 },
  morning: { cloud: '#FFFFFF', clouds: 0.9, stars: 0, motes: 1 },
  afternoon: { cloud: '#FFFFFF', clouds: 0.85, stars: 0, motes: 1 },
  golden: { cloud: '#FFE0C2', clouds: 0.8, stars: 0, motes: 0.8 },
  evening: { cloud: '#B999BE', clouds: 0.35, stars: 0.5, motes: 0 },
  night: { cloud: '#46527C', clouds: 0, stars: 1, motes: 0 },
};

export function sceneSky(mix: HeaderSceneMix) {
  const entries = Object.entries(mix) as [HeaderSceneId, number][];
  const sum = (pick: (id: HeaderSceneId) => number) => entries.reduce((total, [id, weight]) => total + weight * pick(id), 0);
  return {
    cloudColor: blendHex(entries, (id) => SKY[id].cloud),
    clouds: sum((id) => SKY[id].clouds),
    stars: sum((id) => SKY[id].stars),
    motes: sum((id) => SKY[id].motes),
  };
}
