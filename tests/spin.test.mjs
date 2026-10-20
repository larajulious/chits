import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { SPIN_DEFAULTS, SPIN_CATEGORIES, normalizeSpinPreferences, spinOptions, spinOptionKey, selectSpin, spinCandidates, spinLanding, spinSourceRoute } from '../src/services/spin-engine.ts';
import { loadModule, migration, runtime, service } from './helpers/backup-runtime.mjs';
const { createSpinRepository } = await loadModule('src/db/spin-repository');
const { createRevisitRepository } = await loadModule('src/db/revisit-repository');
const { createFocusRepository } = await loadModule('src/db/focus-repository');
const now = Date.now();
const DAY = 86400000;
const note = (changes = {}) => ({ key: 'thought:a', title: 'A meaningful saved idea', text: 'Design garden planting seasonal flowers', createdAt: now - 50*DAY, updatedAt: now - 30*DAY, editedAt: now - 30*DAY, progressAt: now - 30*DAY, openedAt: null, revisitedAt: null, snoozedUntil: null, dismissedAt: null, dismissalCount: 0, excluded: false, pinned: false, boardId: null, reminderAt: null, total: 0, completed: 0, ...changes });
const candidates = (notes, metadata = [], history = [], preferences = SPIN_DEFAULTS, options = {}) => spinCandidates(notes, metadata, history, preferences, now, options);
const meta = (changes = {}) => ({ note_key: 'thought:a', duration_minutes: 5, priority: 0, energy: null, ...changes });
async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db'); await migration.migrateDatabase(db);
  const blocks = JSON.stringify([{ type: 'text', text: 'Do this', list: { id: 'g', kind: 'checklist', checked: false } }]);
  await db.runAsync("INSERT INTO messages(id,text,type,created_at,updated_at,content_json) VALUES ('a','A meaningful saved idea','text',?,?,?)", now-50*DAY,now-30*DAY,blocks);
  return { env, db, repo: createSpinRepository(db), revisit: createRevisitRepository(db) };
}

test('ordinary note text never becomes a task; completed checklists and excluded/snoozed notes stay out', () => {
  assert.ok(candidates([note()]).every(c => c.kind !== 'task'));
  for (const changes of [{total:1,completed:1},{excluded:true},{snoozedUntil:now+1}]) assert.deepEqual(candidates([note(changes)]), []);
  assert.equal(candidates([note({total:1})]).find(c => c.kind === 'task').minutes,null);
});
test('time, unestimated, energy, categories and five-minute challenges filter before selection', () => {
  const task = note({ total: 1, editedAt: now, progressAt: now });
  const onlyTasks = { ...SPIN_DEFAULTS, categories: ['unfinished'] };
  assert.equal(candidates([task], [], [], {...onlyTasks,includeUnestimated:false}).length,0);
  assert.equal(candidates([task], [meta({duration_minutes:30})], [], onlyTasks).length,0);
  assert.equal(candidates([task], [meta({energy:'high'})], [], {...onlyTasks,energy:'low'}).length,0);
  assert.equal(candidates([task], [meta()], [], onlyTasks).length,1);
  assert.equal(candidates([task], [], [], onlyTasks, {challenge:true}).length,0);
  assert.equal(candidates([task], [meta()], [], onlyTasks, {challenge:true}).length,1);
  assert.equal(candidates([task], [meta({duration_minutes:15})], [], onlyTasks, {challenge:true}).length,0);
  assert.ok(candidates([note()],[],[],SPIN_DEFAULTS,{challenge:true}).every(c => c.minutes === 5));
});
test('revisit rules honor saved cooldowns/preferences and explicit related references', () => {
  assert.equal(candidates([note()], [], [], {...SPIN_DEFAULTS,categories:['revisit']},{revisitEnabled:false}).length,0);
  assert.equal(candidates([note({openedAt:now})],[],[],{...SPIN_DEFAULTS,categories:['revisit']}).length,0);
  const linked = candidates([note(),note({key:'thought:b'})],[],[],SPIN_DEFAULTS,{relationships:[{note_a:'thought:a',note_b:'thought:b'}]});
  assert.equal(linked[0].related,'thought:b');
  assert.ok(!candidates([note()],[],[],SPIN_DEFAULTS,{relationships:[{note_a:'thought:a',note_b:'thought:deleted'}]})[0].related);
});
test('recent skip cooldown expires, recent selection reduces weight, urgent work is weighted higher', () => {
  const task = note({total:1});
  assert.equal(candidates([task],[],[{note_key:task.key,selected_at:now,skipped_at:now}]).length,0);
  assert.ok(candidates([task],[],[{note_key:task.key,selected_at:now-11*60000,skipped_at:now-11*60000}]).length);
  const base = candidates([task])[0].weight;
  assert.ok(candidates([task],[],[{note_key:task.key,selected_at:now-60000,skipped_at:null}])[0].weight < base);
  assert.ok(candidates([note({total:1,reminderAt:now-1})])[0].weight > base);
});
test('weighted random is injectable, avoids previous sources and corrects multiple category membership', () => {
  assert.equal(selectSpin([]),null);
  const a = candidates([note({total:1})])[0];
  const b = {...a,note:note({key:'thought:b'}),weight:3};
  assert.equal(selectSpin([a,b],undefined,()=>0).note.key,'thought:a');
  assert.equal(selectSpin([a,b],undefined,()=>0.9).note.key,'thought:b');
  assert.equal(selectSpin([a,b],'thought:b',()=>0.99).note.key,'thought:a');
  assert.equal(selectSpin([a],'thought:a',()=>0).note.key,'thought:a');
  assert.equal(selectSpin([a,{...a,category:'revisit'},{...b,weight:1}],undefined,()=>0.6).note.key,'thought:b');
});
test('every segment lands at the pointer across repeated spins and wheel sizes', () => {
  for (let count=1;count<=8;count++) for(let i=0;i<count;i++) for(const current of [0,11,359,720.2]) {
    const angle = spinLanding(current,i,count);
    assert.ok(angle>=current+1800);
    const normalized = ((angle+i*360/count)%360+360)%360;
    assert.ok(normalized<1e-8 || Math.abs(normalized-360)<1e-8);
  }
});
test('preference parsing accepts deliberate no-category state and rejects malformed settings', () => {
  assert.deepEqual(normalizeSpinPreferences(null), SPIN_DEFAULTS);
  assert.deepEqual(normalizeSpinPreferences({categories:[]}).categories,[]);
  assert.equal(normalizeSpinPreferences({minutes:999,energy:'unknown',sound:'yes'}).sound,false);
  assert.deepEqual(normalizeSpinPreferences({categories:['bad',...SPIN_CATEGORIES]}).categories,[...SPIN_CATEGORIES]);
});
test('routes preserve source identity for Chat and Cards', () => {
  assert.deepEqual(spinSourceRoute('thought:a'),{pathname:'/chat',params:{messageId:'a'}});
  assert.deepEqual(spinSourceRoute('card:c'),{pathname:'/card/[id]',params:{id:'c'}});
});
test('migration is additive, repeatable, metadata previews are bounded and selections never modify notes', async t => {
  const {db,repo,revisit}=await fixture(t);
  const original=await db.getFirstAsync('SELECT * FROM messages');
  await migration.migrateDatabase(db);
  await repo.setMetadata(meta());
  await repo.setPreferences({...SPIN_DEFAULTS,sound:true});
  const result=(await repo.candidates(SPIN_DEFAULTS)).candidates[0];
  const id=await repo.select(result,false); await repo.skip(id);
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM messages'),original);
  assert.equal((await repo.preferences()).sound,true);
  assert.equal((await repo.candidates(SPIN_DEFAULTS)).candidates.length,0);
  await db.runAsync("UPDATE messages SET text = ? WHERE id='a'",'x'.repeat(10000));
  assert.ok((await revisit.metadataPage())[0].text.length<=512);
  assert.ok((await revisit.metadataPage())[0].title.length<=100);
});
test('stale and deleted selections cannot be selected or completed; cascading history keeps references valid', async t => {
  const {db,repo}=await fixture(t);
  const candidate=(await repo.candidates(SPIN_DEFAULTS)).candidates[0];
  const id=await repo.select(candidate,false);
  await db.runAsync("UPDATE messages SET text='New content',updated_at=? WHERE id='a'",now);
  await assert.rejects(repo.select(candidate,false));
  await db.runAsync("UPDATE messages SET deleted_at=? WHERE id='a'",now);
  assert.equal(await repo.history(id),null);
  await assert.rejects(repo.open(id));
  assert.equal((await repo.candidates(SPIN_DEFAULTS)).candidates.length,0);
  assert.equal((await db.getAllAsync('PRAGMA foreign_key_check')).length,0);
});
test('overdue tasks stay visible when categories/time/energy filter them out', async t => {
  const {db,repo}=await fixture(t);
  await db.runAsync("INSERT INTO message_reminders(message_id,scheduled_at,created_at,updated_at) VALUES ('a',?,?,?)",now-1,now,now);
  const report=await repo.candidates({...SPIN_DEFAULTS,categories:[]});
  assert.equal(report.candidates.length,0); assert.equal(report.overdue.length,1);
});
test('completion uses the canonical optimistic confirmation transaction and awards once', async t => {
  const {db,repo,revisit}=await fixture(t);
  const candidate=(await repo.candidates(SPIN_DEFAULTS)).candidates.find(c=>c.kind==='task');
  await repo.setMetadata(meta());
  const id=await repo.select(candidate,true);
  const stale=await revisit.completionPlan('thought:a');
  await db.runAsync("UPDATE messages SET updated_at=? WHERE id='a'",now);
  await assert.rejects(repo.complete(id,stale));
  assert.equal((await repo.history(id)).completed_at,null);
  const plan=await revisit.completionPlan('thought:a'); await repo.complete(id,plan);
  assert.equal((await revisit.get('thought:a')).completed,1);
  assert.ok((await repo.history(id)).completed_at);
  assert.ok((await repo.achievements()).some(a=>a.id==='quick'));
  await assert.rejects(repo.complete(id,plan));
  assert.equal((await repo.candidates(SPIN_DEFAULTS)).candidates.length,0);
});
test('spinning is not completing, creative confirmation needs an open and an edit, rewards can be disabled', async t => {
  const {db,repo}=await fixture(t);
  await db.runAsync("UPDATE messages SET content_json=NULL,pinned=1 WHERE id='a'");
  const candidate=(await repo.candidates(SPIN_DEFAULTS)).candidates.find(c=>c.category==='creative');
  const id=await repo.select(candidate,true);
  assert.deepEqual((await repo.achievements()).map(a=>a.id),['first']);
  await assert.rejects(repo.confirmExercise(id)); await repo.open(id);
  await assert.rejects(repo.confirmExercise(id));
  await db.runAsync("UPDATE messages SET pinned=0,updated_at=? WHERE id='a'",now);
  await assert.rejects(repo.confirmExercise(id)); // A pin toggle is not developing an idea.
  await db.runAsync("UPDATE messages SET text='A developed idea',updated_at=? WHERE id='a'",now);
  await repo.confirmExercise(id); await assert.rejects(repo.confirmExercise(id));
  assert.ok((await repo.achievements()).some(a=>a.id==='quick'));
  await repo.setPreferences({...SPIN_DEFAULTS,rewards:false});
  await db.execAsync('DELETE FROM spin_achievements');
  await repo.select({...candidate,note:(await createRevisitRepository(db).get('thought:a'))},false);
  assert.deepEqual(await repo.achievements(),[]);
});
test('Focus award requires a real session started for the selected source after selection', async t => {
  const {repo,db}=await fixture(t);
  const id=await repo.select((await repo.candidates(SPIN_DEFAULTS)).candidates[0],false);
  await repo.focus(id,'missing');
  assert.ok(!(await repo.achievements()).some(a=>a.id==='focus'));
  const focus=createFocusRepository(db);
  const session=await focus.start('thought:a',5*60000);
  await repo.focus(id,session.id);
  assert.equal((await repo.history(id)).focus_session_id,session.id);
  assert.ok((await repo.achievements()).some(a=>a.id==='focus'));
  await focus.update(session.id,'checkpoint');
  assert.equal((await repo.history(id)).completed_at,null);
});

test('resuming a saved Focus session is verified against its actual running checkpoint', async t => {
  const {db,repo}=await fixture(t);
  const focus=createFocusRepository(db);
  const session=await focus.start('thought:a',5*60000,now-60000);
  await focus.update(session.id,'leave',now-30000);
  const id=await repo.select((await repo.candidates(SPIN_DEFAULTS)).candidates[0],false);
  await repo.focus(id,session.id);
  assert.equal((await repo.history(id)).focus_session_id,null);
  await focus.update(session.id,'resume'); await repo.focus(id,session.id);
  assert.equal((await repo.history(id)).focus_session_id,session.id);
  assert.ok((await repo.achievements()).some(a=>a.id==='focus'));
});
test('full offline backup round trip preserves Spin references, preferences, metadata, history and earned rewards', async t => {
  const {db,env,repo}=await fixture(t);
  await repo.setMetadata(meta({priority:2,energy:'low'})); await repo.setPreferences({...SPIN_DEFAULTS,minutes:5});
  const id=await repo.select((await repo.candidates(SPIN_DEFAULTS)).candidates[0],false); await repo.open(id);
  await repo.setVisibility(false);
  const tables=['spin_history','spin_metadata','spin_achievements'];
  const before=Object.fromEntries(await Promise.all(tables.map(async table=>[table,await db.getAllAsync(`SELECT * FROM ${table}`)])));
  const created=await service.createBackup(db); const checked=await service.validateBackup(created.uri);
  assert.equal(checked.valid,true,checked.reason); await service.restoreBackup(checked,db);
  const restored=new DatabaseSync(join(env.documents,'SQLite/chits.db')); t.after(()=>restored.close());
  for(const table of tables) assert.deepEqual(restored.prepare(`SELECT * FROM ${table}`).all(),before[table]);
  assert.equal(JSON.parse(restored.prepare("SELECT value FROM app_settings WHERE key='spin_preferences'").get().value).minutes,5);
  assert.equal(restored.prepare("SELECT value FROM app_settings WHERE key='spin_visible'").get().value,'false');
  assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('a real schema-30 upgrade preserves existing bytes and starts with empty Spin tables', async t => {
  const {db}=await fixture(t);
  const before=await db.getFirstAsync('SELECT * FROM messages');
  await db.execAsync('DROP TRIGGER spin_organize; DROP TABLE spin_metadata; DROP TABLE spin_history; DROP TABLE spin_achievements; PRAGMA user_version=30');
  await migration.migrateDatabase(db);
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM messages'),before);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM spin_history')).n,0);
});

test('opening archives, hidden notes, archived boards and broken card references cannot surface candidates', async t => {
  const {db,repo}=await fixture(t);
  await db.execAsync("INSERT INTO boards(id,name,created_at,updated_at) VALUES ('b','Board',1,1); INSERT INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('col','b','Column',0,1,1); INSERT INTO cards(id,board_id,column_id,title,position,created_at,updated_at) VALUES ('c','b','col','Card',0,1,1); INSERT INTO card_messages VALUES ('c','a',0)");
  assert.ok((await repo.candidates(SPIN_DEFAULTS)).candidates.every(c=>c.note.key==='card:c'));
  await db.runAsync("UPDATE messages SET is_hidden_content=1 WHERE id='a'");
  assert.deepEqual((await repo.candidates(SPIN_DEFAULTS)).candidates,[]);
  await db.runAsync("UPDATE messages SET is_hidden_content=0 WHERE id='a'");
  await db.runAsync("UPDATE boards SET archived_at=? WHERE id='b'",now);
  assert.deepEqual((await repo.candidates(SPIN_DEFAULTS)).candidates,[]);
  await db.runAsync("UPDATE boards SET archived_at=NULL WHERE id='b'");
  await db.runAsync("UPDATE cards SET archived_at=? WHERE id='c'",now);
  assert.deepEqual((await repo.candidates(SPIN_DEFAULTS)).candidates,[]);
});

test('Spin history and estimates follow an organized thought to the canonical card', async t => {
  const {db,repo,revisit}=await fixture(t);
  await repo.setMetadata(meta({priority:2,energy:'low'}));
  const candidate=(await repo.candidates(SPIN_DEFAULTS)).candidates[0];
  const id=await repo.select(candidate,false);
  await db.execAsync("INSERT INTO boards(id,name,created_at,updated_at) VALUES ('b','Board',1,1); INSERT INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('col','b','Column',0,1,1); INSERT INTO cards(id,board_id,column_id,title,position,created_at,updated_at) VALUES ('c','b','col','Card',0,1,1); INSERT INTO card_messages VALUES ('c','a',0)");
  assert.equal((await repo.history(id)).note_key,'card:c');
  assert.equal((await db.getFirstAsync("SELECT * FROM spin_metadata WHERE note_key='card:c'")).priority,2);
  assert.equal(await db.getFirstAsync("SELECT * FROM spin_metadata WHERE note_key='thought:a'"),null);
  assert.equal((await repo.latest()).candidate.note.key,'card:c');
  const plan=await revisit.completionPlan('card:c'); await repo.complete(id,plan);
  assert.equal((await revisit.get('card:c')).completed,1);
  assert.equal((await db.getAllAsync('PRAGMA foreign_key_check')).length,0);
});

test('restart restores a real result; skip suppresses it and cannot resurrect an earlier result', async t => {
  const {db,repo}=await fixture(t);
  const candidate=(await repo.candidates(SPIN_DEFAULTS)).candidates[0];
  await repo.select(candidate,false);
  await repo.setMetadata(meta());
  const second=await repo.select(candidate,true);
  const reopened=createSpinRepository(db);
  assert.equal((await reopened.latest()).id,second);
  assert.equal((await reopened.latest()).challenge,true);
  await reopened.skip(second); assert.equal(await reopened.latest(),null);
});

test('unfinished Focus is a continuation suggestion without inventing a task completion state', async t => {
  const {db,repo}=await fixture(t);
  await db.runAsync("UPDATE messages SET content_json=NULL,updated_at=? WHERE id='a'",now);
  const focus=createFocusRepository(db); const session=await focus.start('thought:a',5*60000);
  await focus.update(session.id,'leave');
  const continued=(await repo.candidates(SPIN_DEFAULTS)).candidates.find(c=>c.category==='unfinished');
  assert.equal(continued.kind,'review'); assert.equal(continued.reason,'continue');
  await repo.select(continued,false);
  assert.equal((await repo.latest()).candidate.kind,'review');
});

test('Calendar plans influence selection with accurate provenance, without estimating duration', async t => {
  const {db,repo}=await fixture(t);
  await db.runAsync("INSERT INTO calendar_entries(id,message_id,date_key,created_at,updated_at) VALUES ('p','a','2020-01-01',1,1)");
  const candidate=(await repo.candidates({...SPIN_DEFAULTS,categories:['unfinished']})).candidates[0];
  assert.equal(candidate.reason,'planned'); assert.ok(candidate.plannedAt); assert.equal(candidate.minutes,null);
  assert.equal((await repo.candidates(SPIN_DEFAULTS)).overdue.length,0);
});

test('achievement counts require distinct sources and actual edits, not repeated confirmations', async t => {
  const {db,repo}=await fixture(t);
  for(let i=0;i<5;i++) {
    const key=`thought:idea${i}`;
    await db.runAsync("INSERT INTO messages(id,text,type,pinned,created_at,updated_at) VALUES (?,?,'text',1,?,?)",`idea${i}`,'A saved creative idea',now-50*DAY,now-30*DAY);
    const candidate=(await repo.candidates(SPIN_DEFAULTS)).candidates.find(c=>c.note.key===key && c.category==='creative');
    const id=await repo.select(candidate,false); await repo.open(id);
    await db.runAsync('UPDATE messages SET text=?,updated_at=? WHERE id=?','A saved creative idea with new detail',now,`idea${i}`);
    await repo.confirmExercise(id);
    const earned=(await repo.achievements()).map(a=>a.id);
    assert.equal(earned.includes('creative'),i>=2); assert.equal(earned.includes('momentum'),i>=4);
    await assert.rejects(repo.confirmExercise(id));
  }
});

test('Spin completion and reward persistence roll back together if the metadata write fails', async t => {
  const {db,env,repo,revisit}=await fixture(t);
  const candidate=(await repo.candidates(SPIN_DEFAULTS)).candidates.find(c=>c.kind==='task');
  await repo.setMetadata(meta());
  const id=await repo.select(candidate,true); const plan=await revisit.completionPlan('thought:a');
  env.fault=(method,arg)=>{if(method==='sql' && String(arg).startsWith('UPDATE spin_history SET completed_at')) throw new Error('Injected write failure');};
  await assert.rejects(repo.complete(id,plan)); env.fault=null;
  assert.equal((await revisit.get('thought:a')).completed,0); assert.equal((await repo.history(id)).completed_at,null);
  assert.ok(!(await repo.achievements()).some(a=>a.id==='quick'));
});


test('new-note suggestions are available without sources and never masquerade as note references', () => {
  const options = spinOptions([], SPIN_DEFAULTS, null, now);
  const selected = selectSpin(options, undefined, () => 0);
  assert.equal(selected.kind, 'suggestion');
  assert.equal(selected.action, 'new-note');
  assert.equal(selected.category, 'suggestions');
  assert.equal(spinOptionKey(selected), 'action:new-note');
  assert.equal('note' in selected, false);
  assert.deepEqual(spinOptions([], {...SPIN_DEFAULTS, includeSuggestions:false}, null, now), []);
});
test('suggestions respect their skip cooldown and avoid repeating when a saved source is available', () => {
  const task = candidates([note({total:1})])[0];
  const options = spinOptions([task], SPIN_DEFAULTS, null, now);
  assert.equal(selectSpin(options, task.note.key, () => 0).kind, 'suggestion');
  assert.equal(selectSpin(options, 'action:new-note', () => 0.99).note.key, task.note.key);
  assert.equal(spinOptions([task], SPIN_DEFAULTS, now, now).length, 1);
  assert.equal(spinOptions([task], SPIN_DEFAULTS, now-600000, now).length, 2);
  assert.equal(spinOptions([], {...SPIN_DEFAULTS, minutes:5, energy:'low'}, null, now).length, 1);
});
test('suggestion settings upgrade existing preferences and persist explicit opt-out', async t => {
  assert.equal(normalizeSpinPreferences({categories:['tasks']}).includeSuggestions, true);
  const {repo} = await fixture(t);
  await repo.setPreferences({...SPIN_DEFAULTS,includeSuggestions:false});
  assert.equal((await repo.preferences()).includeSuggestions, false);
});
test('selecting a suggested action leaves saved notes, source history and rewards untouched', async t => {
  const {db,repo} = await fixture(t);
  const before = await db.getAllAsync('SELECT * FROM messages');
  const data = await repo.candidates(SPIN_DEFAULTS, false, now);
  const options = spinOptions(data.candidates, SPIN_DEFAULTS, null, now);
  const chosen = selectSpin(options, undefined, () => 1-Number.EPSILON);
  assert.equal(chosen.kind, 'suggestion');
  assert.deepEqual(await db.getAllAsync('SELECT * FROM messages'), before);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM spin_history')).n, 0);
  assert.deepEqual(await repo.achievements(), []);
});


test('recent unpinned chat notes outside boards qualify for review without inventing unfinished tasks', () => {
  const fresh = note({createdAt:now,updatedAt:now,editedAt:now,progressAt:now,openedAt:now});
  const options = candidates([fresh]);
  assert.deepEqual(options.map(c=>c.category), ['unorganized']);
  assert.equal(options[0].kind,'review');
  assert.equal(options[0].reason,'unorganized');
  assert.equal(options[0].minutes,5);
  assert.equal(options[0].note.total,0);
  assert.deepEqual(candidates([fresh],[],[],{...SPIN_DEFAULTS,categories:[]}),[]);
  assert.ok(!candidates([note({key:'card:c',boardId:'b'})]).some(c=>c.category==='unorganized'));
});
test('unorganized category upgrades the previous all-selected settings once and respects opt-out', () => {
  const oldCategories = SPIN_CATEGORIES.filter(c=>c!=='unorganized');
  assert.ok(normalizeSpinPreferences({categories:oldCategories}).categories.includes('unorganized'));
  assert.deepEqual(normalizeSpinPreferences({...SPIN_DEFAULTS,categories:oldCategories}).categories,oldCategories);
  assert.deepEqual(normalizeSpinPreferences({categories:['tasks']}).categories,['tasks']);
});
test('schema-31 history upgrade preserves references, estimates, IDs, sequence and original source bytes', async t => {
  const {db,repo} = await fixture(t);
  const {SPIN_SCHEMA} = await loadModule('src/db/spin-schema');
  await db.execAsync('DROP TRIGGER spin_organize; DROP TABLE spin_history;');
  await db.execAsync(SPIN_SCHEMA);
  await db.runAsync("INSERT INTO spin_history(id,note_key,category,selected_at,source_updated_at,opened_at,skipped_at) VALUES (17,'thought:a','unfinished',?,?,?,?)",now,now-30*DAY,now,now);
  await db.runAsync("UPDATE sqlite_sequence SET seq=99 WHERE name='spin_history'");
  await repo.setMetadata(meta());
  const source = await db.getAllAsync('SELECT * FROM messages');
  const history = await db.getAllAsync('SELECT * FROM spin_history');
  const metadata = await db.getAllAsync('SELECT * FROM spin_metadata');
  await db.execAsync('PRAGMA user_version=31');
  await migration.migrateDatabase(db);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM messages'),source);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM spin_history'),history);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM spin_metadata'),metadata);
  const result = await db.runAsync("INSERT INTO spin_history(note_key,category,selected_at,source_updated_at) VALUES ('thought:a','unorganized',?,?)",now,now);
  assert.equal(result.lastInsertRowId,100);
  assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'),[]);
  await migration.migrateDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,32);
});
test('unorganized review selection restores and routes to the real chat note without altering it', async t => {
  const {db,repo} = await fixture(t);
  await db.runAsync("UPDATE messages SET content_json=NULL,created_at=?,updated_at=? WHERE id='a'",now,now);
  const before = await db.getAllAsync('SELECT * FROM messages');
  const candidate = (await repo.candidates(SPIN_DEFAULTS)).candidates.find(c=>c.category==='unorganized');
  assert.equal(candidate.kind,'review');
  await repo.select(candidate,false);
  const latest = await repo.latest();
  assert.equal(latest.candidate.category,'unorganized');
  assert.equal(latest.candidate.reason,'unorganized');
  assert.equal(latest.candidate.kind,'review');
  assert.equal(spinSourceRoute(latest.candidate.note.key).params.messageId,'a');
  assert.deepEqual(await db.getAllAsync('SELECT * FROM messages'),before);
});


test('Spin visibility defaults on but its entry needs at least one eligible real source', async t => {
  const {db,repo} = await fixture(t);
  assert.equal(await repo.visibility(),true);
  assert.equal(await repo.entryAvailable(),true);
  await db.runAsync("DELETE FROM messages WHERE id='a'");
  assert.equal(await repo.entryAvailable(),false);
  assert.equal((await repo.preferences()).includeSuggestions,true);
  assert.equal(await repo.visibility(),true);
});
test('hiding Spin persists across repository instances without changing content, history or wheel preferences', async t => {
  const {db,repo} = await fixture(t);
  const candidate = (await repo.candidates(SPIN_DEFAULTS)).candidates[0];
  await repo.select(candidate,false);
  await repo.setPreferences({...SPIN_DEFAULTS,minutes:30,sound:true});
  const sources = await db.getAllAsync('SELECT * FROM messages');
  const history = await db.getAllAsync('SELECT * FROM spin_history');
  const preferences = await repo.preferences();
  await repo.setVisibility(false);
  const reopened = createSpinRepository(db);
  assert.equal(await reopened.visibility(),false);
  assert.equal(await reopened.entryAvailable(),false);
  assert.deepEqual(await reopened.preferences(),preferences);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM messages'),sources);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM spin_history'),history);
  await reopened.setVisibility(true);
  assert.equal(await repo.entryAvailable(),true);
});
test('entry eligibility preserves access to adjust restrictive wheel filters', async t => {
  const {repo} = await fixture(t);
  await repo.setMetadata(meta({duration_minutes:60,energy:'high'}));
  await repo.setPreferences({...SPIN_DEFAULTS,minutes:5,energy:'low',categories:[],includeUnestimated:false});
  assert.deepEqual((await repo.candidates(await repo.preferences())).candidates,[]);
  assert.equal(await repo.entryAvailable(),true);
});
test('entry minimum excludes hidden, archived, snoozed, completed and skipped sources', async t => {
  const {db,repo,revisit} = await fixture(t);
  for (const column of ['archived_at','is_hidden_content']) {
    await db.runAsync(`UPDATE messages SET ${column}=? WHERE id='a'`,column==='archived_at'?now:1);
    assert.equal(await repo.entryAvailable(),false);
    await db.runAsync(`UPDATE messages SET ${column}=? WHERE id='a'`,column==='archived_at'?null:0);
  }
  await revisit.review('thought:a','snooze',Date.now()+600000);
  assert.equal(await repo.entryAvailable(),false);
  await revisit.review('thought:a','include');
  const candidate = (await repo.candidates(SPIN_DEFAULTS)).candidates[0];
  const id = await repo.select(candidate,false);
  await repo.skip(id);
  assert.equal(await repo.entryAvailable(),false);
  await db.runAsync('UPDATE spin_history SET skipped_at=? WHERE id=?',Date.now()-11*60000,id);
  assert.equal(await repo.entryAvailable(),true);
  await repo.complete(id,await revisit.completionPlan('thought:a'));
  assert.equal(await repo.entryAvailable(),false);
});
test('persisted visibility and wheel setting changes publish entry refresh notifications', async t => {
  const {repo} = await fixture(t);
  const {subscribeToSpinChanges} = await loadModule('src/services/spin-changes');
  let changed = 0;
  const unsubscribe = subscribeToSpinChanges(()=>changed++); t.after(unsubscribe);
  await repo.setVisibility(false);
  await repo.setVisibility(true);
  await repo.setPreferences({...SPIN_DEFAULTS,minutes:5});
  assert.equal(changed,3);
  unsubscribe();
  await repo.setVisibility(false);
  assert.equal(changed,3);
});
