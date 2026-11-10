/**
 * Widget props as iOS can store them. expo-widgets saves props in
 * UserDefaults, which takes only property-list values: a single `null` (an
 * NSNull) makes the whole write fail, silently, and the widget keeps its old
 * or empty content. Widget layouts read an absent field as they would a null,
 * so nulls are left out.
 */
export function withoutNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((item) => item !== null).map(withoutNulls) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined).map(([key, item]) => [key, withoutNulls(item)])) as T;
  return value;
}
