import type { AnywhereSnapshot } from './snapshot';
/** Keep async writes ordered across coordinator remounts (theme/restore/privacy).
 * A slow older write must never replace a newer hidden snapshot. */
export function serialWidgetPublisher(publish: (snapshot: AnywhereSnapshot) => Promise<void>) {
  let tail = Promise.resolve();
  return (snapshot: AnywhereSnapshot) => {
    const next = tail.catch(() => undefined).then(() => publish(snapshot));
    tail = next;
    return next;
  };
}
