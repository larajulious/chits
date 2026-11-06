export type MascotVariant = 'classic' | 'chits-ong';

// Stable IDs are persisted, never display names or release dates. Costumes do
// not expire; adding a variant only requires a config entry and its accessory.
export const MASCOT_VARIANTS = [
  { id: 'classic', name: 'Classic Chits', descriptionKey: 'mascot.classicDescription', limited: false },
  { id: 'chits-ong', name: 'Chits Yong', descriptionKey: 'mascot.ongDescription', limited: true },
] as const;
export const MASCOT_SETTING_KEY = 'mascot_variant';
export function resolveMascotVariant(value: unknown): MascotVariant {
  return MASCOT_VARIANTS.find((mascot) => mascot.id === value)?.id ?? 'classic';
}
