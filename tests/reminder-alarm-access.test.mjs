import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const repositories = await loadModule('src/db/repositories');
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
let instance = 0;
async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  db.raw.exec("INSERT INTO boards (id,name,created_at,updated_at) VALUES ('board','Board',1,1); INSERT INTO board_columns (id,board_id,name,position,created_at,updated_at) VALUES ('column','board','Column',1,1,1); INSERT INTO cards (id,board_id,column_id,title,position,created_at,updated_at) VALUES ('card','board','column','Card',1,1,1); INSERT INTO messages (id,text,type,created_at,updated_at) VALUES ('message','Thought','text',1,1);");
  const key = `__chitsAlarmQA${++instance}`;
  const state = { allowed: false, scheduled: new Map(), restores: 0, nextId: 0, repositories };
  globalThis[key] = state; t.after(() => delete globalThis[key]);
  const stateRef = `globalThis.${key}`;
  const notifications = dataUrl(`
    export const AndroidImportance = {HIGH:4}; export const IosAuthorizationStatus = {};
    export const SchedulableTriggerInputTypes = {DATE:'date'};
    export function setNotificationHandler() {}
    export async function setNotificationChannelAsync() {}
    export async function getPermissionsAsync() { return {granted:true,canAskAgain:true}; }
    export async function requestPermissionsAsync() { throw new Error('Should not prompt'); }
    export async function scheduleNotificationAsync(request) { const identifier = 'n' + (++${stateRef}.nextId); ${stateRef}.scheduled.set(identifier, {...request,identifier}); return identifier; }
    export async function cancelScheduledNotificationAsync(id) { ${stateRef}.scheduled.delete(id); }
    export async function getAllScheduledNotificationsAsync() { return [...${stateRef}.scheduled.values()]; }
  `);
  const mocks = {
    '@/services/permissions': new URL('../src/services/permission-state.ts', import.meta.url).href,
    'react-native': dataUrl("export const Platform = {OS:'android'};"),
    './local-notifications.native': notifications,
    '@/db/repositories': dataUrl(`export const createReminderRepository = (...args) => ${stateRef}.repositories.createReminderRepository(...args);`),
    './reminder-alarm-access': dataUrl(`export async function hasExactReminderAccess(){return ${stateRef}.allowed;} export async function restorePendingReminderAlarms(){${stateRef}.restores++;}`),
    '@/services/backup-operation': dataUrl('export function isBackupOperationActive(){return false;}'),
  };
  let code = ts.transpileModule(readFileSync(new URL('../src/services/reminders.native.ts', import.meta.url),'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from '${mocks[specifier] ?? new URL(`../src/${specifier.replace('@/','')}.ts`, import.meta.url).href}'`);
  const service = await import(dataUrl(code));
  return { db, state, service };
}

test('Android card and message reminders require exact access without replacing existing reminders', async (t) => {
  const { db, state, service } = await fixture(t);
  const time = Date.now() + 600_000;
  assert.deepEqual(await service.setCardReminder(db,'card',time), {ok:false,reason:'exact-alarm'});
  assert.deepEqual(await service.setMessageReminder(db,'message',time), {ok:false,reason:'exact-alarm'});
  assert.equal(state.scheduled.size,0);
  state.allowed = true;
  assert.deepEqual(await service.setCardReminder(db,'card',time), {ok:true});
  assert.deepEqual(await service.setMessageReminder(db,'message',time), {ok:true});
  for (const request of state.scheduled.values()) {
    assert.equal(request.trigger.type,'date');
    assert.equal(request.trigger.date.getTime(),time);
    assert.equal(request.trigger.channelId,'reminders');
  }
  const before = db.raw.prepare('SELECT * FROM card_reminders').get();
  state.allowed = false;
  assert.deepEqual(await service.setCardReminder(db,'card',time+600_000), {ok:false,reason:'exact-alarm'});
  assert.deepEqual(db.raw.prepare('SELECT * FROM card_reminders').get(),before);
  assert.equal(state.scheduled.size,2);
});

test('foreground sync restores OS alarms once without duplicating notification IDs or changing dates', async (t) => {
  const { db, state, service } = await fixture(t);
  const time = Date.now() + 600_000;
  state.allowed = true;
  await service.setCardReminder(db,'card',time);
  await service.setMessageReminder(db,'message',time);
  service.registerReminderDatabase(db);
  await service.requestReminderSync();
  const identifiers = [...state.scheduled.keys()];
  await service.requestReminderSync();
  assert.equal(state.restores,1);
  assert.deepEqual([...state.scheduled.keys()],identifiers);
  assert.equal(db.raw.prepare('SELECT scheduled_at FROM message_reminders').get().scheduled_at,time);
  service.registerReminderDatabase(null);
});
