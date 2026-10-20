import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';
const { listWidgetRecentNotes, createSpaceRepository } = await loadModule('src/db/repositories');
const { isWidgetDatabaseChange, widgetNotes, widgetPrivacy, widgetNoteURL } = await loadModule('src/features/anywhere/snapshot');
async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  return db;
}
async function message(db, id, updated, extra = {}) {
  await db.runAsync('INSERT INTO messages (id,text,type,created_at,updated_at,archived_at,deleted_at,is_hidden_content) VALUES (?,?,\'text\',1,?,?,?,?)', id, extra.text ?? id, updated, extra.archived ?? null, extra.deleted ?? null, extra.hidden ?? 0);
}
test('recent widget query orders and limits eligible notes using indexed timestamps', async t => {
  const db = await fixture(t);
  for (let i=0;i<8;i++) await message(db, `n${i}`, i);
  await message(db, 'deleted', 100, { deleted: 1 });
  await message(db, 'archived', 100, { archived: 1 });
  await message(db, 'hidden', 100, { hidden: 1, text: 'SECRET' });
  const rows = await listWidgetRecentNotes(db);
  assert.deepEqual(rows.map(n => n.id), ['n7','n6','n5','n4','n3']);
  await db.runAsync('UPDATE messages SET updated_at=200 WHERE id=?', 'n0');
  assert.equal((await listWidgetRecentNotes(db))[0].id, 'n0');
  await db.runAsync('UPDATE messages SET archived_at=NULL WHERE id=?','archived');
  assert.equal((await listWidgetRecentNotes(db))[1].id, 'archived');
  const plan = await db.getAllAsync('EXPLAIN QUERY PLAN SELECT id FROM messages INDEXED BY idx_messages_widget_recent WHERE deleted_at IS NULL AND archived_at IS NULL AND is_hidden_content=0 ORDER BY updated_at DESC,id DESC LIMIT 5');
  assert.ok(plan.some(row => row.detail.includes('idx_messages_widget_recent')));
});
test('organized notes appear once as their card and space placement does not exclude them', async t => {
  const db = await fixture(t);
  await db.runAsync("INSERT INTO boards(id,name,created_at,updated_at) VALUES ('board','Board',1,1)");
  await db.runAsync("INSERT INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('col','board','Column',0,1,1)");
  await db.runAsync("INSERT INTO cards(id,board_id,column_id,title,position,created_at,updated_at) VALUES ('card','board','col','Template note',0,1,10)");
  await message(db,'linked',20);
  await db.runAsync("INSERT INTO card_messages(card_id,message_id,position) VALUES ('card','linked',0)");
  assert.equal((await createSpaceRepository(db).stick('card','card','fridge')).status,'stuck');
  assert.deepEqual((await listWidgetRecentNotes(db)).map(n=>[n.kind,n.id,n.updatedAt]), [['card','card',20]]);
  await db.runAsync("UPDATE messages SET is_hidden_content=1 WHERE id='linked'");
  assert.deepEqual(await listWidgetRecentNotes(db),[]);
  await db.runAsync("UPDATE messages SET is_hidden_content=0 WHERE id='linked'");
  await db.runAsync("UPDATE messages SET archived_at=1 WHERE id='linked'");
  assert.deepEqual((await listWidgetRecentNotes(db)).map(n=>[n.kind,n.id]), [['card','card']]);
  await db.runAsync("UPDATE messages SET archived_at=NULL,deleted_at=1,text='PRIVATE DELETED TEXT' WHERE id='linked'");
  await db.runAsync("UPDATE cards SET title=NULL WHERE id='card'");
  const withDeletedChild = await listWidgetRecentNotes(db);
  assert.equal(withDeletedChild.length,1);
  assert.ok(!JSON.stringify(withDeletedChild).includes('PRIVATE DELETED TEXT'));
  await db.runAsync("UPDATE messages SET deleted_at=NULL WHERE id='linked'");
  await db.runAsync("UPDATE boards SET archived_at=1 WHERE id='board'");
  assert.deepEqual((await listWidgetRecentNotes(db)).map(n=>[n.kind,n.id]), [['thought','linked']]);
});
test('privacy removes private fields from snapshots and links carry identifiers only', () => {
  const note = { kind:'thought',id:'a &b',title:'Private title',preview:'Private text',updatedAt:5 };
  assert.equal(widgetPrivacy('unknown'),'hidden');
  assert.deepEqual(widgetNotes([note],'hidden'),[]);
  assert.equal(widgetNotes([note],'titles')[0].preview,null);
  assert.equal(widgetNotes([note,note],'previews').length,1);
  assert.equal(widgetNoteURL(note),'chits:///anywhere?kind=thought&id=a%20%26b');
  assert.ok(!widgetNoteURL(note).includes('Private'));
  assert.equal(widgetNotes([{...note,title:'x'.repeat(1000),preview:'y'.repeat(1000)}],'previews')[0].preview.length,160);
});

test('many linked thoughts cannot consume the five unique recent-note slots', async t => {
  const db = await fixture(t);
  await db.runAsync("INSERT INTO boards(id,name,created_at,updated_at) VALUES ('b','Board',1,1)");
  await db.runAsync("INSERT INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('c','b','Column',0,1,1)");
  await db.runAsync("INSERT INTO cards(id,board_id,column_id,title,position,created_at,updated_at) VALUES ('organized','b','c','Card',0,1,1)");
  for (let i=0;i<8;i++) {
    await message(db, `linked${i}`,100+i);
    await db.runAsync('INSERT INTO card_messages(card_id,message_id,position) VALUES (?,?,?)','organized',`linked${i}`,i);
  }
  for (let i=0;i<5;i++) await message(db, `single${i}`,i+10);
  const notes = await listWidgetRecentNotes(db);
  assert.deepEqual(notes.map(n=>n.id),['organized','single4','single3','single2','single1']);
  assert.equal(notes[0].updatedAt,107);
  const plan = await db.getAllAsync('EXPLAIN QUERY PLAN SELECT id FROM cards INDEXED BY idx_cards_widget_recent WHERE archived_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 5');
  assert.ok(plan.some(row=>row.detail.includes('idx_cards_widget_recent')));
});

test('empty database and long notes produce empty or bounded display projections', async t => {
  const db = await fixture(t);
  assert.deepEqual(await listWidgetRecentNotes(db),[]);
  await message(db,'long',1,{text:'x'.repeat(3000)});
  const [note] = await listWidgetRecentNotes(db);
  assert.equal(note.title.length,100);
  assert.equal(note.preview.length,160);
  assert.ok(!('content' in note));
});


test('SQLite change routing matches the database file, rather than its main schema alias', () => {
  const event = { databaseName:'main',databaseFilePath:'/var/mobile/Application Support/chits.db',tableName:'messages' };
  assert.equal(isWidgetDatabaseChange(event,'file:///private/var/mobile/Application%20Support/chits.db'),true);
  assert.equal(isWidgetDatabaseChange({...event,tableName:'focus_sessions'},event.databaseFilePath),false);
  assert.equal(isWidgetDatabaseChange({...event,databaseFilePath:'/backup/chits.db'},event.databaseFilePath),false);
});


test('snapshot publishing preserves privacy order across slow writes and recovers after failure', async () => {
  const { serialWidgetPublisher } = await loadModule('src/features/anywhere/publish-queue');
  const writes = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const publish = serialWidgetPublisher(async snapshot => {
    if (snapshot.privacy === 'previews') await gate;
    if (snapshot.fail) throw new Error('native failure');
    writes.push(snapshot.privacy);
  });
  const old = publish({privacy:'previews'});
  const hidden = publish({privacy:'hidden'});
  await Promise.resolve();
  assert.deepEqual(writes,[]);
  release(); await Promise.all([old,hidden]);
  assert.deepEqual(writes,['previews','hidden']);
  await assert.rejects(publish({privacy:'titles',fail:true}));
  await publish({privacy:'hidden'});
  assert.equal(writes.at(-1),'hidden');
});

test('widget navigation reuses the same editor identity and preserves another open note', async () => {
  const { StackRouter } = await import('../node_modules/expo-router/build/react-navigation/routers/StackRouter.js');
  const router = StackRouter({initialRouteName:'chat'});
  const options = {routeNames:['chat','editor','anywhere'],routeParamList:{},routeGetIdList:{editor:({params})=>params?.messageId}};
  let state = router.getInitialState(options);
  const act = (type,name,params) => { state = router.getStateForAction(state,{type,payload:{name,params}},options); return state; };
  act('PUSH','editor',{messageId:'a'});
  const originalKey = state.routes.at(-1).key;
  act('PUSH','anywhere',{});
  act('POP_TO','editor',{messageId:'a',autoFocus:'0',fromWidget:'1'});
  assert.equal(state.routes.at(-1).key,originalKey);
  assert.equal(state.routes.length,2);
  act('PUSH','anywhere',{});
  act('POP_TO','editor',{messageId:'b',autoFocus:'0',fromWidget:'1'});
  assert.equal(state.routes.length,3);
  assert.equal(state.routes[1].key,originalKey);
  const secondKey = state.routes.at(-1).key;
  act('PUSH','anywhere',{});
  act('POP_TO','editor',{messageId:'b',autoFocus:'0',fromWidget:'1'});
  assert.equal(state.routes.length,3);
  assert.equal(state.routes.at(-1).key,secondKey);
});


test('database observers wait for transaction settlement and cannot fail a saved transaction', async () => {
  const {observeDatabaseTransactions,subscribeToDatabaseTransactions,databaseTransactionState} = await loadModule('src/services/database-transactions');
  const events = [];
  const db = {
    async withTransactionAsync(task) { await task(); events.push('commit'); },
    async withExclusiveTransactionAsync(task) { await task({}); events.push('exclusive commit'); },
  };
  observeDatabaseTransactions(db); observeDatabaseTransactions(db);
  const stop = subscribeToDatabaseTransactions(db,()=>events.push('refresh'));
  subscribeToDatabaseTransactions(db,()=>{ throw new Error('observer failure'); });
  await db.withExclusiveTransactionAsync(async()=>{ events.push('write'); assert.deepEqual(events,['write']); assert.equal(databaseTransactionState(db).active,true); });
  assert.deepEqual(events,['write','exclusive commit','refresh']);
  await assert.rejects(db.withTransactionAsync(async()=>{ throw new Error('rollback'); }));
  assert.equal(events.length,4);
  assert.equal(databaseTransactionState(db).active,false);
  assert.equal(databaseTransactionState(db).revision,4);
  stop(); await db.withTransactionAsync(async()=>{});
  assert.equal(events.at(-1),'commit');
});
