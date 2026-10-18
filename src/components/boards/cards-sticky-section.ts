/** Promote a section into the app header after its inline heading scrolls away. */
export function findStickySection(
  headers: readonly number[],
  scrollOffset: number,
  filterHeight: number,
  firstItemOffset: number,
  getLayout: (index: number) => { y: number; height: number } | undefined,
): number | undefined {
  const threshold = scrollOffset + filterHeight - firstItemOffset;
  let low = 0;
  let high = headers.length - 1;
  let active: number | undefined;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const index = headers[middle];
    const layout = getLayout(index);
    if (layout && layout.y + layout.height <= threshold) {
      active = index;
      low = middle + 1;
    } else high = middle - 1;
  }
  return active;
}
