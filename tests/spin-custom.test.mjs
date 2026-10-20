import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { CUSTOM_SPIN_LIMIT, parseCustomSpinItems, selectCustomSpin } from '../src/services/spin-custom.ts';
import { spinLanding } from '../src/services/spin-engine.ts';
import { loadModule, migration, runtime, service } from './helpers/backup-runtime.mjs';
const {createCustomSpinRepository,CUSTOM_SPIN_KEY} = await loadModule('src/db/spin-custom-repository');
const {createSpinRepository} = await loadModule('src/db/spin-repository');
async function fixture(t) {
  const env = runtime(); t.after(()=>env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db'); await migration.migrateDatabase(db);
  return {env,db,repo:createCustomSpinRepository(db)};
}
test('custom wheels start empty and CRUD preserves stable identities and user-entered choices', async t => {
  const {db,repo} = await fixture(t);
  assert.deepEqual(await repo.items(),[]);
  assert.equal(await repo.mode(),'notes');
  await repo.save('  Walk outside  '); await repo.save('Read a book');
  const first = await repo.items();
  assert.deepEqual(first.map(i=>i.label),['Walk outside','Read a book']);
  await repo.save('Walk in the park',first[0].id);
  const reopened = createCustomSpinRepository(db);
  assert.deepEqual(await reopened.items(),[{...first[0],label:'Walk in the park'},first[1]]);
  await reopened.remove(first[0].id);
  assert.deepEqual(await repo.items(),[first[1]]);
  await repo.clear(); assert.deepEqual(await reopened.items(),[]);
});
test('validation rejects empty, oversized, stale and over-capacity edits without losing saved items', async t => {
  const {repo} = await fixture(t);
  for (const label of ['', '  ', 'x'.repeat(121)]) await assert.rejects(repo.save(label));
  for (let i=0;i<CUSTOM_SPIN_LIMIT;i++) await repo.save(`Choice ${i}`);
  const before = await repo.items();
  await assert.rejects(repo.save('Overflow'));
  await assert.rejects(repo.save('Stale edit','missing'));
  assert.deepEqual(await repo.items(),before);
  await repo.save('A valid edit at capacity',before[0].id);
  assert.equal((await repo.items()).length,CUSTOM_SPIN_LIMIT);
});
test('custom selection has equal-size probability ranges, allows repeats and never seeds an empty wheel', () => {
  assert.equal(selectCustomSpin([]),null);
  for(let count=1;count<=CUSTOM_SPIN_LIMIT;count++) {
    const items = Array.from({length:count},(_,i)=>({id:String(i),label:`Item ${i}`}));
    for(let index=0;index<count;index++) {
      assert.equal(selectCustomSpin(items,()=>(index+0.5)/count),items[index]);
      const angle = spinLanding(73,index,count);
      assert.ok(Math.abs((angle+index*360/count)%360)<1e-8 || Math.abs((angle+index*360/count)%360-360)<1e-8);
    }
    assert.equal(selectCustomSpin(items,()=>0),items[0]);
    assert.equal(selectCustomSpin(items,()=>0),items[0]);
    assert.equal(selectCustomSpin(items,()=>1),items[count-1]);
  }
});
test('malformed custom storage is surfaced without silently overwriting or clearing it', async t => {
  const {db,repo} = await fixture(t);
  for(const value of ['{broken','{}','[{"id":"x","label":""}]','[{"id":"x","label":"A"},{"id":"x","label":"B"}]']) {
    await db.runAsync('INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES (?,?,1)',CUSTOM_SPIN_KEY,value);
    await assert.rejects(repo.items()); await assert.rejects(repo.save('New'));
    assert.equal((await db.getFirstAsync('SELECT value FROM app_settings WHERE key=?',CUSTOM_SPIN_KEY)).value,value);
  }
  assert.deepEqual(parseCustomSpinItems(null),[]);
  await db.runAsync("INSERT INTO messages(id,text,type,created_at,updated_at) VALUES ('available','Existing note','text',1,1)");
  assert.equal(await createSpinRepository(db).entryAvailable(),true);
});
test('failed saves roll back and custom spinning never changes notes, Focus or source achievements', async t => {
  const {db,repo} = await fixture(t);
  await db.runAsync("INSERT INTO messages(id,text,type,created_at,updated_at) VALUES ('a','Original note','text',1,1)");
  const sources = await db.getAllAsync('SELECT * FROM messages');
  await repo.save('Choice'); const original = await repo.items();
  await db.execAsync("CREATE TRIGGER reject_custom_update BEFORE UPDATE ON app_settings WHEN NEW.key='spin_custom_items' BEGIN SELECT RAISE(ABORT,'save failed'); END");
  await assert.rejects(repo.save('Second choice'));
  assert.deepEqual(await repo.items(),original);
  assert.ok(selectCustomSpin(original));
  assert.deepEqual(await db.getAllAsync('SELECT * FROM messages'),sources);
  for(const table of ['spin_history','spin_achievements','focus_sessions']) assert.equal((await db.getFirstAsync(`SELECT count(*) AS n FROM ${table}`)).n,0);
});
test('custom items qualify for entry visibility without saved notes and respect the hide setting', async t => {
  const {db,repo} = await fixture(t); const spin = createSpinRepository(db);
  assert.equal(await spin.entryAvailable(),false);
  await repo.save('Take a break'); assert.equal(await spin.entryAvailable(),true);
  await spin.setVisibility(false); assert.equal(await spin.entryAvailable(),false);
  await spin.setVisibility(true); await repo.clear(); assert.equal(await spin.entryAvailable(),false);
});
test('custom wheel and selected mode survive full offline backup/restore independently of notes', async t => {
  const {env,db,repo} = await fixture(t);
  await repo.save('Read for ten minutes'); await repo.save('散歩する 🌱'); await repo.setMode('custom');
  const expected = await repo.items();
  const created = await service.createBackup(db); const checked = await service.validateBackup(created.uri);
  assert.equal(checked.valid,true,checked.reason); await service.restoreBackup(checked,db);
  const restored = new DatabaseSync(join(env.documents,'SQLite/chits.db')); t.after(()=>restored.close());
  const row = restored.prepare('SELECT value FROM app_settings WHERE key=?').get(CUSTOM_SPIN_KEY);
  assert.deepEqual(JSON.parse(row.value),expected);
  assert.equal(restored.prepare("SELECT value FROM app_settings WHERE key='spin_mode'").get().value,'custom');
  assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length,0);
});
