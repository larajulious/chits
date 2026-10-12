import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReminderClock, withTime } from '../src/services/reminder-time.ts';

test('time entry converts midnight, noon and afternoon without changing the reminder day', () => {
  for (const [hour, minute, period, hours, minutes] of [['12','00','AM',0,0], ['12','00','PM',12,0], ['1','05','PM',13,5], ['11','59','PM',23,59], ['00','00',null,0,0], ['23','59',null,23,59]]) {
    const time = parseReminderClock(hour,minute,period);
    assert.deepEqual(time,{hours,minutes});
    const date = withTime(new Date(2026,9,15,9,30),time.hours,time.minutes);
    assert.deepEqual([date.getFullYear(),date.getMonth(),date.getDate(),date.getHours(),date.getMinutes()],[2026,9,15,hours,minutes]);
  }
});
test('time entry rejects incomplete, invalid or out-of-range fields', () => {
  for (const args of [['','00',null], ['12','',null], ['24','00',null], ['0','00','AM'], ['13','00','PM'], ['1','60','AM'], ['-1','00',null], ['1.5','00',null], ['12','abc',null], ['100','00',null]]) assert.equal(parseReminderClock(...args),null);
});
