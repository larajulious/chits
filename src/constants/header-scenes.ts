import { HEADER_SCENE_LUMINANCE, HEADER_SCENE_TONE } from './header-scenes.generated';

// Default's header follows the local clock through six pictures of the same
// room (drawn by scripts/generate-header-scenes.mjs). Neighboring scenes
// crossfade minute by minute. A warm veil follows app appearance, while its
// strength follows the pictures' measured luminance, so the room complements
// the paper workspace and its ink stays readable throughout the day.
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
export type HeaderSceneLook = { ink: HeaderSceneInk; veil: { color: '#FFFDF6' | '#221E18'; opacity: number } };
/** Dark ink for the bright scenes; light scenes' ink is plain white. */
export const HEADER_SCENE_DARK_INK = { text: '#24231F', muted: '#45423B' };

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
  if (scheme === 'light') {
    // Lift evening blues toward the same cream as Chits' paper. Use the tint's
    // darkest channel as the floor, leaving a contrast margin for its warmth.
    const color = '#FFFDF6';
    const tint = 246 / 255;
    const lift = Math.max(0.16, ...REGIONS.map((region) => {
      const low = blend(region, 0);
      return (FLOOR[region] - low) / (tint - low);
    }));
    return { ink: 'dark', veil: { color, opacity: Math.min(1, lift) } };
  }
  // The desk's warm charcoal quiets bright daytime scenes as well as blue
  // night scenes. Its brightest channel bounds the background under white ink.
  const color = '#221E18';
  const tint = 34 / 255;
  const shade = Math.max(0.5, ...REGIONS.map((region) => {
    const high = blend(region, 1);
    return (high - CEILING[region]) / (high - tint);
  }));
  return { ink: 'light', veil: { color, opacity: Math.min(1, shade) } };
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

/** What drifts, flies and twinkles in the window at each hour. */
const SKY: Record<HeaderSceneId, { cloud: string; clouds: number; stars: number; motes: number; sun: string; birds: number; meteors: number }> = {
  dawn: { cloud: '#FFE6EC', clouds: 0.75, stars: 0, motes: 0.5, sun: '#FFE2C6', birds: 0.7, meteors: 0 },
  morning: { cloud: '#FFFFFF', clouds: 0.9, stars: 0, motes: 1, sun: '#FFFBEA', birds: 1, meteors: 0 },
  afternoon: { cloud: '#FFFFFF', clouds: 0.85, stars: 0, motes: 1, sun: '#FFF7D6', birds: 0.8, meteors: 0 },
  golden: { cloud: '#FFE0C2', clouds: 0.8, stars: 0, motes: 0.8, sun: '#FFF0C2', birds: 0.8, meteors: 0 },
  evening: { cloud: '#B999BE', clouds: 0.35, stars: 0.5, motes: 0, sun: '#FFC9A0', birds: 0, meteors: 0.4 },
  night: { cloud: '#46527C', clouds: 0, stars: 1, motes: 0, sun: '#FFC9A0', birds: 0, meteors: 1 },
};

export function sceneSky(mix: HeaderSceneMix) {
  const entries = Object.entries(mix) as [HeaderSceneId, number][];
  const sum = (pick: (id: HeaderSceneId) => number) => entries.reduce((total, [id, weight]) => total + weight * pick(id), 0);
  return {
    cloudColor: blendHex(entries, (id) => SKY[id].cloud),
    sunColor: blendHex(entries, (id) => SKY[id].sun),
    clouds: sum((id) => SKY[id].clouds),
    stars: sum((id) => SKY[id].stars),
    motes: sum((id) => SKY[id].motes),
    birds: sum((id) => SKY[id].birds),
    meteors: sum((id) => SKY[id].meteors),
  };
}

// The sun follows the clock across the glass: it comes up behind the hills
// where dawn's glow is painted, climbs to the top panes by noon and goes down
// where golden hour's glow is (picture pixels; the hills hide it at either end).
const SUNRISE = at(6, 15);
const SUNSET = at(18, 50);
const SUN_PATH = { from: 1250, to: 1522, horizon: 420, noon: 150 };
export const HEADER_SCENE_SUN_RADIUS = 26;

/** Where the sun sits in the window at this minute, or null while it is down. */
export function sunAt(minute: number) {
  const m = ((minute % DAY) + DAY) % DAY;
  if (m <= SUNRISE || m >= SUNSET) return null;
  const t = (m - SUNRISE) / (SUNSET - SUNRISE);
  return { x: SUN_PATH.from + (SUN_PATH.to - SUN_PATH.from) * t, y: SUN_PATH.horizon - (SUN_PATH.horizon - SUN_PATH.noon) * Math.sin(Math.PI * t) };
}
