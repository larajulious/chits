import assert from 'node:assert/strict';
import test from 'node:test';

import { loadModule } from './helpers/backup-runtime.mjs';

const time = await loadModule('src/services/reminder-time.ts');

// Android's Material date dialog shows the UTC day of the value it's given and
// returns the picked day as UTC midnight; the app reads that back with getUTC*.
const roundTrip = (value) => {
  const shown = time.materialDialogDate(value);
  return new Date(shown.getUTCFullYear(), shown.getUTCMonth(), shown.getUTCDate(), value.getHours(), value.getMinutes());
};

test('opening and confirming the Android date dialog never moves the day, in any timezone', (t) => {
  const original = process.env.TZ;
  t.after(() => { process.env.TZ = original; });
  for (const zone of ['Asia/Manila', 'Pacific/Kiritimati', 'America/Los_Angeles', 'UTC', 'Pacific/Pago_Pago']) {
    process.env.TZ = zone;
    for (const value of [new Date(2026, 9, 15), new Date(2026, 9, 15, 7, 30), new Date(2026, 9, 15, 23, 59), new Date(2028, 1, 29), new Date(2026, 11, 31)]) {
      let current = value;
      for (let open = 0; open < 5; open++) current = roundTrip(current);
      assert.equal(current.getTime(), value.getTime(), `${zone}: ${value.toString()}`);
    }
  }
});
