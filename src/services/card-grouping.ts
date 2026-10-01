/**
 * Splits notes (already sorted newest → oldest) into consecutive month-and-year
 * groups for the Cards grid, keyed by the date shown on each note. `month` and
 * `year` are returned separately so the header can style them differently;
 * `title` is the combined, readable label ("September 2026").
 */
export function groupByMonth<T extends { updatedAt: number }>(items: readonly T[], locale?: string): { key: string; title: string; month: string; year: string; items: T[] }[] {
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' });
  const groups: { key: string; title: string; month: string; year: string; items: T[] }[] = [];
  for (const item of items) {
    const date = new Date(item.updatedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const month = monthName.format(date);
      const year = String(date.getFullYear());
      group = { key, title: `${month} ${year}`, month, year, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** Calendar-based headings for the personal notes collection. Input stays in its newest-first order. */
export function groupRecentNotes<T extends { updatedAt: number }>(items: readonly T[], now = new Date(), locale?: string): { key: string; title: string; items: T[] }[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' });
  const groups: { key: string; title: string; items: T[] }[] = [];
  for (const item of items) {
    const date = new Date(item.updatedAt);
    let key: string;
    let title: string;
    if (item.updatedAt >= today) { key = 'today'; title = 'Today'; }
    else if (item.updatedAt >= yesterday) { key = 'yesterday'; title = 'Yesterday'; }
    else if (item.updatedAt >= weekStart) { key = 'week'; title = 'This week'; }
    else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      title = `${monthName.format(date)}${date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`}`;
    }
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, title, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
