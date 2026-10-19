export type ChatOrigin = { x: number; y: number; size: number };

/** Invalid or absent native geometry skips decoration, never navigation. */
export function measuredChatOrigin(x: number, y: number, width: number, height: number): ChatOrigin | null {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x: x + width / 2, y: y + height / 2, size: Math.max(width, height) };
}

/** Button measurement is in window coordinates; the overlay is local to Tabs. */
export function localChatOrigin(origin: ChatOrigin, overlay: { x: number; y: number }): ChatOrigin {
  return { ...origin, x: origin.x - overlay.x, y: origin.y - overlay.y };
}

/** A corner button lifts in place; it never flies toward a former center slot. */
export function chatButtonFrame(progress: number) {
  'worklet';
  const p = Math.max(0, Math.min(1, progress));
  const fade = Math.max(0, Math.min(1, (p - 0.2) / 0.8));
  return { translateY: -24 * p, scale: 1 - 0.12 * p, opacity: 1 - fade * fade * (3 - 2 * fade) };
}
