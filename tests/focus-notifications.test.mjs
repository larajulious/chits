import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { advanceFocus } from '../src/services/focus-timer.ts';

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const state = { scheduled:[], permission:true, permissionRequests:0, scheduledCalls:0, cancelled:[], listener:null, last:null, cleared:0, backup:false };
globalThis.__focusNotificationTest = { state, advanceFocus };
const deps={
  '@/localization/runtime':url('export const tr = key => key;'),
  './focus-timer':url('export const advanceFocus = globalThis.__focusNotificationTest.advanceFocus;'),
  './backup-operation':url('export const isBackupOperationActive = () => globalThis.__focusNotificationTest.state.backup;'),
  './reminders.native':url(`const s=globalThis.__focusNotificationTest.state;
    export async function ensureReminderChannel() {}
    export async function ensureNotificationPermission() { s.permissionRequests++; return s.permission ? 'granted' : 'denied'; }`),
  './local-notifications.native':url(`const s=globalThis.__focusNotificationTest.state;
    export const IosAuthorizationStatus={PROVISIONAL:3};
    export const SchedulableTriggerInputTypes={DATE:'date'};
    export async function getAllScheduledNotificationsAsync(){return [...s.scheduled];}
    export async function getPermissionsAsync(){return {granted:s.permission};}
    export async function scheduleNotificationAsync(request){s.scheduledCalls++;s.scheduled.push(request);return request.identifier;}
    export async function cancelScheduledNotificationAsync(id){s.cancelled.push(id);s.scheduled=s.scheduled.filter(item=>item.identifier!==id);}
    export function getLastNotificationResponse(){return s.last;}
    export function clearLastNotificationResponse(){s.cleared++;s.last=null;}
    export function addNotificationResponseReceivedListener(listener){s.listener=listener;return {remove(){s.listener=null;}};}`),
};
let code=ts.transpileModule(readFileSync(new URL('../src/services/focus-notifications.native.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
code=code.replace(/from ['"]([^'"]+)['"]/g,(_,specifier)=>`from '${deps[specifier]}'`);
const {syncFocusNotifications,enableFocusNotifications,observeFocusNotifications}=await import(url(code));

test('one local notification follows the deadline across duplicate syncs, pause, resume and expiry',async(t)=>{
  const original=Date.now;let now=1000;Date.now=()=>now;t.after(()=>{Date.now=original;});
  const session={id:'one',note_key:'thought:private-id',started_at:1000,planned_ms:60000,checkpoint_at:1000,focused_ms:0,paused_ms:0,status:'running',completed_at:null,ended_at:null};
  const preferences={notifications:true};
  await syncFocusNotifications(session,preferences);
  now=11000;await syncFocusNotifications(session,preferences);
  assert.equal(state.scheduledCalls,1);assert.equal(state.permissionRequests,0);
  assert.equal(state.scheduled[0].trigger.date.getTime(),61000);
  assert.equal(state.scheduled[0].content.body,'focus.notificationBody');
  assert.equal(state.scheduled[0].content.title,'focus.title');
  await syncFocusNotifications({...session,status:'paused'},preferences);
  assert.equal(state.scheduled.length,0);
  now=31000;
  const resumed={...session,checkpoint_at:31000,focused_ms:10000};
  await syncFocusNotifications(resumed,preferences);
  assert.equal(state.scheduled[0].trigger.date.getTime(),81000);
  now=81000;await syncFocusNotifications(resumed,preferences);
  assert.equal(state.scheduled.length,0);assert.equal(state.scheduledCalls,2);
});
test('denial keeps Focus functional and permission is requested only by the explicit settings action',async()=>{
  state.permission=false;
  await syncFocusNotifications({id:'denied',note_key:'thought:a',started_at:Date.now(),checkpoint_at:Date.now(),planned_ms:60000,focused_ms:0,paused_ms:0,status:'running'}, {notifications:true});
  assert.equal(state.scheduled.length,0);assert.equal(state.permissionRequests,0);
  assert.equal(await enableFocusNotifications(),false);assert.equal(state.permissionRequests,1);
  state.permission=true;
});
test('notification routing consumes only Focus responses and waits during a backup',()=>{
  const opened=[];
  state.last={notification:{request:{content:{data:{type:'note-reminder',messageId:'a'}}}}};
  const stop=observeFocusNotifications((...args)=>opened.push(args));
  assert.equal(state.cleared,0);
  const response={notification:{request:{content:{data:{type:'chits-focus',sessionId:'s',noteKey:'thought:a'}}}}};
  state.backup=true;state.listener(response);assert.equal(opened.length,0);
  state.backup=false;state.listener(response);
  assert.deepEqual(opened,[['s','thought:a']]);assert.equal(state.cleared,1);stop();assert.equal(state.listener,null);
});
