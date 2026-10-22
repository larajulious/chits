import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule, migration, runtime, service } from './helpers/backup-runtime.mjs';

const { createFocusRepository } = await loadModule('src/db/focus-repository');
const { createMessageRepository, createBoardRepository } = await loadModule('src/db/repositories');
const { advanceFocus, focusPreferences, focusClock } = await loadModule('src/services/focus-timer');
const { observeFocusClock, correctedFocusElapsed, focusNow, resetFocusClocks } = await loadModule('src/services/focus-clock');
const { appendFocusThought } = await loadModule('src/services/focus-content');
const { draftFromNote } = await loadModule('src/services/note-content');
const { loadFocusAttachments } = await loadModule('src/services/focus-attachments');
const { loadCardsFocus } = await loadModule('src/services/focus-cards');
const session = (changes = {}) => ({ id:'s',note_key:'thought:a',started_at:1000,ended_at:null,planned_ms:60000,focused_ms:0,paused_ms:0,checkpoint_at:1000,status:'running',completed_at:null,dismissed_at:null,clock_adjusted:0,...changes });
async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db'); await migration.migrateDatabase(db);
  for (const id of ['a','b']) await db.runAsync("INSERT INTO messages(id,text,type,created_at,updated_at) VALUES (?,?,'text',1,1)",id,id);
  return {env,db,repo:createFocusRepository(db)};
}

test('Cards exposes running and paused sessions even when continuity suggestions are disabled, without resuming them', async (t) => {
  const {db,repo}=await fixture(t);
  await repo.setPreferences({...await repo.preferences(),continuity:false});
  const started=await repo.start('thought:a',60000,1000);
  assert.equal((await loadCardsFocus(db)).session.id,started.id);
  await repo.update(started.id,'pause',2000);
  const before=await repo.get(started.id);
  const banner=await loadCardsFocus(db);
  assert.equal(banner.session.status,'paused'); assert.equal(banner.title,'a');
  assert.deepEqual(await repo.get(started.id),before);
  await db.runAsync('UPDATE messages SET is_hidden_content=1 WHERE id=?','a');
  assert.equal((await loadCardsFocus(db)).title,null);
});

test('Cards returns the saved unfinished session and respects dismissal and continuity settings', async (t) => {
  const {db,repo}=await fixture(t);const started=await repo.start('thought:a',60000,1000);
  await repo.update(started.id,'leave',2000);
  const banner=await loadCardsFocus(db);
  assert.equal(banner.session.id,started.id);assert.equal(banner.session.status,'unfinished');
  assert.equal((await repo.get(started.id)).focused_ms,1000);
  await repo.setPreferences({...await repo.preferences(),continuity:false});
  assert.equal(await loadCardsFocus(db),null);
  await repo.setPreferences({...await repo.preferences(),continuity:true});
  await repo.dismiss(started.id);assert.equal(await loadCardsFocus(db),null);
});

test('Cards prioritizes the active session and removes completed sessions without reviving older sessions on the same note', async (t) => {
  const {db,repo}=await fixture(t);const earlier=await repo.start('thought:a',60000,1000);
  await repo.update(earlier.id,'leave',2000);
  const active=await repo.start('thought:b',60000,3000);
  assert.equal((await loadCardsFocus(db)).session.id,active.id);
  await repo.update(active.id,'finish',4000);
  assert.equal((await loadCardsFocus(db)).session.id,earlier.id);
  const later=await repo.start('thought:a',60000,5000);await repo.update(later.id,'finish',6000);
  assert.equal(await loadCardsFocus(db),null);
});

test('Cards skips hidden unfinished sources without exposing their titles', async (t) => {
  const {db,repo}=await fixture(t);const a=await repo.start('thought:a',60000,1000);
  await repo.update(a.id,'leave',2000);
  const b=await repo.start('thought:b',60000,3000);await repo.update(b.id,'leave',4000);
  await db.runAsync('UPDATE messages SET is_hidden_content=1 WHERE id=?','b');
  const banner=await loadCardsFocus(db);assert.equal(banner.session.id,a.id);assert.equal(banner.title,'a');
});

test('timestamp projection stops at its deadline, is repeatable, and excludes paused time', () => {
  const running=advanceFocus(session(),31000);
  assert.equal(running.focused_ms,30000);
  assert.equal(advanceFocus(running,31000).focused_ms,30000);
  const paused=advanceFocus({...running,status:'paused'},91000);
  assert.equal(paused.focused_ms,30000); assert.equal(paused.paused_ms,60000);
  const completed=advanceFocus({...paused,status:'running'},151000);
  assert.equal(completed.focused_ms,60000);assert.equal(completed.completed_at,121000);
  assert.deepEqual(advanceFocus(completed,999999),completed);
  assert.equal(advanceFocus(session({planned_ms:null}),91000).focused_ms,90000);
  assert.equal(focusClock(3_661_000),'1:01:01');
});
test('clock changes never produce negative time or unbounded fabricated focus', () => {
  assert.equal(advanceFocus(session(),0).status,'paused');
  assert.equal(advanceFocus(session(),0).focused_ms,0);
  assert.equal(advanceFocus(session({planned_ms:null}),1000+86_400_001).focused_ms,0);
  const adjusted=advanceFocus(session(),3_601_000,10000);
  assert.equal(adjusted.focused_ms,10000);assert.equal(adjusted.clock_adjusted,1);
  assert.equal(advanceFocus(session({status:'unfinished',ended_at:1000}),90000).focused_ms,0);
});
test('foreground time follows a monotonic clock while suspension restores wall-clock accounting', () => {
  const owner={}, current=session();
  observeFocusClock(owner,current,1000,100);
  assert.equal(focusNow(owner,current,3_611_000,10100),11000);
  assert.equal(correctedFocusElapsed(owner,current,3_611_000,10100),10000);
  assert.equal(correctedFocusElapsed(owner,current,11000,10100),undefined);
  resetFocusClocks(owner);
  assert.equal(correctedFocusElapsed(owner,current,61000,10100),undefined);
  assert.equal(advanceFocus(current,61000).status,'completed');
});
test('preferences reject malformed values and preserve explicit untimed/off choices', () => {
  assert.equal(focusPreferences('null').durationMinutes,25);
  assert.equal(focusPreferences('{"durationMinutes":999999}').durationMinutes,25);
  assert.deepEqual(focusPreferences('{"durationMinutes":null,"companion":false,"continuity":false,"notifications":true}'),{durationMinutes:null,companion:false,continuity:false,notifications:true});
});
test('rapid starts are idempotent and another note cannot own a second active session', async(t)=>{
  const {db,repo}=await fixture(t);
  const started=await Promise.all(Array.from({length:8},()=>repo.start('thought:a',60000,1000)));
  assert.equal(new Set(started.map(row=>row.id)).size,1);
  await assert.rejects(()=>repo.start('thought:b',60000,2000));
  await assert.rejects(()=>db.runAsync("INSERT INTO focus_sessions(id,note_key,started_at,planned_ms,checkpoint_at,status) VALUES ('bad','thought:b',1,NULL,1,'running')"));
  assert.equal((await repo.history()).length,1);
  for(const invalid of [0,-1,1000,Infinity,60000.5,43_200_001]) await assert.rejects(()=>repo.start('thought:a',invalid));
});
test('pause, resume, exit, process reopen and explicit continuity retain one accurate record',async(t)=>{
  const {env,db,repo}=await fixture(t);
  const started=await repo.start('thought:a',60000,1000);
  await repo.update(started.id,'pause',11000);
  await repo.update(started.id,'resume',31000);
  const left=await repo.update(started.id,'leave',41000);
  assert.equal(left.focused_ms,20000);assert.equal(left.paused_ms,20000);
  assert.equal(await repo.active(),null);
  const reopened=createFocusRepository(await env.sqlite.openDatabaseAsync('chits.db'));
  assert.equal((await reopened.continuity('thought:a')).id,started.id);
  const resumed=await reopened.update(started.id,'resume',100000);
  assert.equal(resumed.focused_ms,20000);
  const done=await reopened.update(started.id,'checkpoint',200000);
  assert.equal(done.focused_ms,60000);assert.equal(done.completed_at,140000);
  await reopened.update(started.id,'finish',300000);
  assert.equal((await repo.get(started.id)).completed_at,140000);
  assert.equal(await repo.continuity('thought:a'),null);
  assert.deepEqual({...await repo.totals()},{focusedMs:60000,completed:1});
  assert.equal((await db.getFirstAsync('SELECT text FROM messages WHERE id=\'a\'')).text,'a');
});
test('dismissal persists and a newer completed session suppresses older unfinished suggestions',async(t)=>{
  const {repo}=await fixture(t);
  const a=await repo.start('thought:a',null,1000);await repo.update(a.id,'leave',2000);
  await repo.dismiss(a.id);assert.equal(await repo.continuity('thought:a'),null);
  assert.equal((await repo.continuityList()).length,0);
  await repo.update(a.id,'resume',3000);await repo.update(a.id,'leave',4000);
  const b=await repo.start('thought:a',60000,5000);await repo.update(b.id,'finish',6000);
  assert.equal(await repo.continuity('thought:a'),null);assert.equal((await repo.continuityList()).length,0);
});
test('deleted or hidden notes stop active work, preserve history, and cannot be resumed',async(t)=>{
  const {db,repo}=await fixture(t);const a=await repo.start('thought:a',null,1000);
  await db.runAsync("UPDATE messages SET deleted_at=2 WHERE id='a'");
  const stopped=await repo.update(a.id,'checkpoint',2000);
  assert.equal(stopped.status,'unfinished');assert.equal((await repo.history()).length,1);
  await assert.rejects(()=>repo.update(a.id,'resume',3000));
  await db.runAsync("UPDATE messages SET is_hidden_content=1 WHERE id='b'");
  await assert.rejects(()=>repo.start('thought:b',null));
});
test('session writes roll back on errors without losing the previous checkpoint',async(t)=>{
  const {env,repo}=await fixture(t);const a=await repo.start('thought:a',null,1000);
  env.fault=(operation,value)=>{if(operation==='sql'&&String(value).startsWith('UPDATE focus_sessions'))throw new Error('disk');};
  await assert.rejects(()=>repo.update(a.id,'pause',5000));env.fault=null;
  assert.equal((await repo.get(a.id)).focused_ms,0);assert.equal((await repo.get(a.id)).status,'running');
});
test('organizing a note moves its session reference and existing persistence rejects stale edits',async(t)=>{
  const {db,repo}=await fixture(t);const a=await repo.start('thought:a',null,1000);
  await db.execAsync("INSERT INTO boards(id,name,created_at,updated_at) VALUES ('b','Board',1,1); INSERT INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('col','b','Notes',0,1,1); INSERT INTO cards(id,board_id,column_id,title,position,created_at,updated_at) VALUES ('c','b','col','Card',0,1,1); INSERT INTO card_messages(card_id,message_id,position) VALUES ('c','a',0);");
  assert.equal((await repo.get(a.id)).note_key,'card:c');
  const messages=createMessageRepository(db),source=await messages.getActiveById('a');
  await db.runAsync("UPDATE messages SET text='Changed elsewhere' WHERE id='a'");
  await assert.rejects(()=>messages.updateContent('a',[{key:'t',type:'text',text:'stale'}],source));
  assert.equal((await messages.getActiveById('a')).text,'Changed elsewhere');
  const id=await createBoardRepository(db).addNoteToCard('c',[{key:'t',type:'text',text:'Captured'}]);
  assert.ok((await createBoardRepository(db).listCardMessages('c')).some(row=>row.id===id));
});
test('Quick Capture appends without changing image order or checklist state and leaves the timer untouched',async(t)=>{
  const {db,repo}=await fixture(t),messages=createMessageRepository(db);
  const image={key:'image',type:'image',attachmentId:null,image:{storagePath:'chits-attachments/chat/focus.jpg',originalName:null,mimeType:'image/jpeg',size:10,width:800,height:600}};
  const task={key:'task',type:'text',text:'Keep this task',list:{kind:'checklist',id:'list',checked:true}};
  const id=await messages.createNote({blocks:[image,task]});
  const active=await repo.start(`thought:${id}`,null,1000);
  const source=await messages.getActiveById(id);
  const draft=draftFromNote(source),next=appendFocusThought(draft,'A captured idea');
  assert.equal(draft.at(-1).text,'Keep this task');
  const written=await messages.updateContent(id,next,source);
  assert.deepEqual(written.removablePaths,[]);
  const saved=await messages.getActiveById(id);
  assert.equal(saved.attachments.length,1);assert.equal(saved.content[0].type,'image');
  assert.deepEqual(saved.content[1].list,{kind:'checklist',id:'list',checked:true});
  assert.equal(saved.content[2].text,'A captured idea');
  assert.equal((await repo.get(active.id)).focused_ms,0);assert.equal((await repo.get(active.id)).status,'running');
  // An attachment write without a message timestamp change must not let an
  // older Focus draft remove the newly added file.
  await db.runAsync("INSERT INTO attachments(id,message_id,type,storage_path,created_at) VALUES ('outside',?,'photo','chits-attachments/chat/outside.jpg',1)",id);
  await assert.rejects(()=>messages.updateContent(id,draftFromNote(saved),saved));
  assert.equal((await messages.getActiveById(id)).attachments.length,2);
});
test('backup round trip retains sessions/preferences and restores active timers as unfinished',async(t)=>{
  const {db,repo}=await fixture(t);const a=await repo.start('thought:a',60000,Date.now());
  await repo.setPreferences({durationMinutes:45,companion:false,continuity:true,notifications:false});
  const backup=await service.createBackup(db);
  const validated=await service.validateBackup(backup.uri);
  assert.equal(validated.valid,true,validated.reason);
  const staged=await (globalThis.__chitsBackupRuntime.sqlite).openDatabaseAsync('database.sqlite',{},validated.preparedDir);
  const restored=createFocusRepository(staged);
  assert.equal((await restored.get(a.id)).status,'unfinished');assert.equal(await restored.active(),null);
  assert.equal((await restored.preferences()).durationMinutes,45);
  assert.equal((await repo.get(a.id)).status,'running');
});
test('upgrading schema 28 initializes Focus without altering existing notes',async(t)=>{
  const {db}=await fixture(t);
  const before=await db.getAllAsync('SELECT * FROM messages ORDER BY id');
  await db.execAsync('DROP TRIGGER focus_organize; DROP TABLE focus_sessions; PRAGMA user_version = 28;');
  await migration.migrateDatabase(db);await migration.migrateDatabase(db);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM messages ORDER BY id'),before);
  assert.deepEqual(await createFocusRepository(db).history(),[]);
});
test('backup validation rejects multiple active timers even if an external database lost its unique index',async(t)=>{
  const {db,repo}=await fixture(t);
  await repo.start('thought:a',null,1000);
  await db.execAsync("DROP INDEX idx_focus_single_active; INSERT INTO focus_sessions(id,note_key,started_at,checkpoint_at,status) VALUES ('second','thought:b',1000,1000,'running');");
  await assert.rejects(()=>service.createBackup(db));
});


test('Focus card attachments include linked files, audio and video once, followed by direct card attachments', async t => {
  const {db} = await fixture(t);
  await db.execAsync("INSERT INTO boards(id,name,created_at,updated_at) VALUES ('board','Board',1,1); INSERT INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('column','board','Notes',0,1,1); INSERT INTO cards(id,board_id,column_id,title,position,created_at,updated_at) VALUES ('card','board','column','Card',0,1,1); INSERT INTO card_messages(card_id,message_id,position) VALUES ('card','a',0);");
  for(const [index,type] of ['file','audio','video','photo'].entries()) await db.runAsync('INSERT INTO attachments(id,message_id,type,storage_path,created_at) VALUES (?,?,?,?,?)',`linked-${type}`,'a',type,`attachments/${type}`,index+1);
  await db.runAsync("INSERT INTO card_attachments(id,card_id,type,storage_path,created_at,updated_at) VALUES ('direct-file','card','file','attachments/direct-file',10,10)");
  const before = await db.getAllAsync('SELECT * FROM attachments');
  const items = await loadFocusAttachments(db,'card:card');
  assert.deepEqual(items.map(item=>item.id),['linked-file','linked-audio','linked-video','linked-photo','direct-file']);
  assert.equal(new Set(items.map(item=>item.id)).size,items.length);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM attachments'),before);
});
test('Focus chat attachment loading retains non-photo media and leaves inline photos in the editor', async t => {
  const {db} = await fixture(t);
  for(const [index,type] of ['photo','file','audio','video'].entries()) await db.runAsync('INSERT INTO attachments(id,message_id,type,storage_path,created_at) VALUES (?,?,?,?,?)',`media-${type}`,'a',type,`attachments/${type}`,index+1);
  assert.deepEqual((await loadFocusAttachments(db,'thought:a')).map(item=>item.id),['media-file','media-audio','media-video']);
  await db.runAsync("UPDATE messages SET is_hidden_content=1 WHERE id='a'");
  assert.deepEqual(await loadFocusAttachments(db,'thought:a'),[]);
  await db.runAsync("UPDATE messages SET is_hidden_content=0,archived_at=2 WHERE id='a'");
  assert.deepEqual(await loadFocusAttachments(db,'thought:a'),[]);
});
