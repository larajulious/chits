export type CustomSpinItem = { id: string; label: string };
export const CUSTOM_SPIN_LIMIT = 24;
export const CUSTOM_SPIN_LABEL_LIMIT = 120;
export function validCustomSpinLabel(label: string) {
  return label.trim().length > 0 && label.trim().length <= CUSTOM_SPIN_LABEL_LIMIT;
}
export function parseCustomSpinItems(value: string | null): CustomSpinItem[] {
  if (value === null) return [];
  const data: unknown = JSON.parse(value);
  if (!Array.isArray(data) || data.length > CUSTOM_SPIN_LIMIT) throw new Error('Invalid custom wheel');
  const ids = new Set<string>();
  return data.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.label !== 'string' || !validCustomSpinLabel(item.label)) throw new Error('Invalid custom wheel');
    ids.add(item.id);
    return { id: item.id, label: item.label };
  });
}
export function selectCustomSpin(items: CustomSpinItem[], random: () => number = Math.random): CustomSpinItem | null {
  if (!items.length) return null;
  return items[Math.floor(Math.max(0, Math.min(1-Number.EPSILON, random())) * items.length)];
}
