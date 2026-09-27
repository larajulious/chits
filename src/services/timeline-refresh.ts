/**
 * Decides whether Chat's background refresh (the newest page, re-fetched each
 * time Chat regains focus) can simply be merged into the already-loaded feed,
 * or whether the loaded window is no longer a contiguous slice of history and
 * must be reloaded from the newest page (resetting pagination).
 *
 * Merging is only safe when everything new is *newer* than the newest item
 * already loaded — the normal "a note was added elsewhere" case. Anything that
 * inserts older-dated items (sample data, restores, bulk imports) would
 * otherwise leave a hole in the middle of the feed and stale pagination state,
 * so older history could never be scrolled to.
 *
 * Both lists are oldest → newest; `compare` is the feed's own ordering.
 */
export function canMergeTimelineRefresh<T>(
  current: readonly T[],
  latest: readonly T[],
  latestHasMore: boolean,
  key: (item: T) => string,
  compare: (left: T, right: T) => number,
): boolean {
  if (!current.length) return latest.length === 0;
  const newestLoaded = current[current.length - 1];
  const loadedKeys = new Set(current.map(key));
  const added = latest.filter((item) => !loadedKeys.has(key(item)));
  if (added.some((item) => compare(item, newestLoaded) <= 0)) return false;
  // A full refreshed page that shares nothing with the loaded window means
  // more new items arrived than one page holds: there's a gap between them.
  if (latestHasMore && latest.length > 0 && latest.every((item) => !loadedKeys.has(key(item)))) return false;
  return true;
}
