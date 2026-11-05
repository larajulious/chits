// A layout switch can overlap the previous canvas's final preference write.
// Retry only SQLite contention, keep the last successful value, and discard
// completions from an older refresh or a canvas that has already unmounted.
const RETRY_DELAYS = [40, 120, 300];
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isContention(error: unknown) {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = value?.code;
  return code === 5 || code === 6 || /SQLITE_(BUSY|LOCKED)|database (?:table )?is locked/i.test(`${code ?? ''} ${value?.message ?? error}`);
}

export function createCanvasReader<T>({ read, onValue, onError, wait = pause }: {
  read: () => Promise<T>;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  wait?: (ms: number) => Promise<void>;
}) {
  let generation = 0;
  return {
    cancel() { generation++; },
    async refresh() {
      const request = ++generation;
      for (let attempt = 0; ; attempt++) {
        if (request !== generation) return;
        let value: T;
        try { value = await read(); }
        catch (error) {
          if (request !== generation) return;
          if (!isContention(error) || attempt === RETRY_DELAYS.length) { onError(error); return; }
          await wait(RETRY_DELAYS[attempt]);
          continue;
        }
        if (request === generation) onValue(value);
        return;
      }
    },
  };
}
