import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { workspaceHTML } from '../src/features/whiteboard/workspace-html.ts';
import { newCanvas } from '../src/features/whiteboard/document.ts';
import { loadModule, runtime } from './helpers/backup-runtime.mjs';
const { whiteboards } = await loadModule('src/features/whiteboard/repository');
function engine(doc = newCanvas()) {
  const messages = [], exports = [], calls = [];
  const context = new Proxy({ measureText: s => ({ width: s.length * 8 }) }, { get: (o,k) => o[k] ?? ((...args) => calls.push([k,...args])) });
  const canvas = () => ({ width: 0, height: 0, getContext: () => context, setPointerCapture() {}, toDataURL() { exports.push({ width: this.width, height: this.height }); return 'data:image/png;base64,AAAA'; } });
  const surface = canvas();
  const sandbox = { document: { querySelector: () => surface, getElementById: () => ({}), createElement: canvas }, innerWidth: 390, innerHeight: 700, devicePixelRatio: 1, requestAnimationFrame: () => 1, window: { ReactNativeWebView: { postMessage: m => messages.push(JSON.parse(m)) } } };
  vm.createContext(sandbox); vm.runInContext(workspaceHTML.match(/<script>([\s\S]*)<\/script>/)[1], sandbox);
  const command = m => sandbox.window.command(m);
  command({ type: 'load', doc: structuredClone(doc), notes: {} });
  const event = (x,y,id=1) => ({ clientX:x,clientY:y,pointerId:id,pressure:.5,pointerType:'touch' });
  const stroke = (x,y,x2,y2) => { surface.onpointerdown(event(x,y)); surface.onpointermove(event(x2,y2)); surface.onpointerup(event(x2,y2)); };
  const latest = () => messages.filter(m => m.type === 'change').at(-1)?.doc;
  return { command, surface, stroke, latest, exports, event, messages };
}
test('world-coordinate strokes, undo/redo and stroke-only erasing preserve note references', () => {
  const doc = newCanvas(); doc.viewport = { x: 50, y: 100, zoom: 2 };
  const e = engine(doc); e.command({ type:'pin', kind:'thought', id:'original' });
  e.stroke(70,120,150,200);
  let saved = e.latest(); assert.equal(saved.objects[1].points[0].x,10); assert.equal(saved.objects[1].points[0].y,10);
  e.command({ type:'undo' }); assert.equal(e.latest().objects.length,1);
  e.command({ type:'redo' }); assert.equal(e.latest().objects.length,2);
  e.command({ type:'tool',tool:'eraser' }); e.stroke(100,150,100,150);
  assert.equal(e.latest().objects.length,1); assert.equal(e.latest().objects[0].noteId,'original');
  e.command({ type:'undo' }); assert.equal(e.latest().objects.length,2);
});
test('full-content export includes distant objects and bounds memory', () => {
  const e = engine(); e.stroke(-50000,-20000,50000,20000);
  e.command({ type:'export',padding:64 }); assert.equal(e.exports.length,1);
  assert.ok(e.exports[0].width<=4096); assert.ok(e.exports[0].height<=4096);
  assert.equal(e.messages.at(-1).type,'export');
});
test('pinch preserves the world point under the moving midpoint', () => {
  const e = engine(); const s=e.surface;
  e.command({ type:'tool',tool:'move' });
  s.onpointerdown(e.event(100,100,1)); s.onpointerdown(e.event(200,100,2));
  s.onpointermove(e.event(300,100,2)); s.onpointerup(e.event(100,100,1)); s.onpointerup(e.event(300,100,2));
  assert.equal(e.latest().viewport.zoom,2);
  assert.equal((200-e.latest().viewport.x)/2,126);
});
test('hundreds of strokes stay structured and reopening retains objects and camera', () => {
  const e = engine(); for(let i=0;i<400;i++) e.stroke(i,i,i+20,i+30);
  const doc=e.latest(); assert.equal(doc.objects.length,400);
  const reopened=engine(doc); reopened.command({ type:'tool',tool:'pen' }); reopened.stroke(1,1,3,3);
  assert.equal(reopened.latest().objects.length,401);
});
test('SQLite roundtrip, archive, duplication and removal leave original note data alone', async () => {
  const env=runtime(); const db=await env.sqlite.openDatabaseAsync('whiteboard.db');
  try {
    await db.execAsync('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    const repo=whiteboards(db),doc=newCanvas(); doc.title='Ideas';
    await repo.save(doc); assert.deepEqual(await repo.get(doc.id),doc);
    doc.archived=true; await repo.save(doc); assert.equal((await repo.list())[0].archived,true);
    const copy={...doc,id:newCanvas().id}; await repo.save(copy); await repo.remove(doc.id);
    assert.equal(await repo.get(doc.id),null); assert.deepEqual(await repo.get(copy.id),copy);
  } finally { await db.closeAsync(); await env.cleanup(); }
});

test('canvas document survives the actual backup validation and restore pipeline', async t => {
  const { migration, service } = await import('./helpers/backup-runtime.mjs');
  const env=runtime(); t.after(()=>env.cleanup());
  const db=await env.sqlite.openDatabaseAsync('chits.db'); await migration.migrateDatabase(db);
  const doc=newCanvas(); doc.objects=[{id:'pinned',type:'note',noteId:'source-id',noteKind:'thought',x:-1000,y:2000,width:200,height:120,color:'#292820'}];
  await whiteboards(db).save(doc);
  const exported=await service.createBackup(db), validated=await service.validateBackup(exported.uri);
  assert.equal(validated.valid,true,validated.reason);
  await service.restoreBackup(validated,db);
  const restored=await env.sqlite.openDatabaseAsync('chits.db');
  assert.deepEqual(await whiteboards(restored).get(doc.id),doc);
});

test('object movement, resizing and explicit removal can all be undone', () => {
  const e=engine(); e.command({type:'pin',kind:'card',id:'original'}); e.command({type:'tool',tool:'select'});
  let object=e.latest().objects[0],v=e.latest().viewport;
  let x=object.x*v.zoom+v.x+20,y=object.y*v.zoom+v.y+20;
  e.surface.onpointerdown(e.event(x,y));e.surface.onpointermove(e.event(x+50,y+30));e.surface.onpointerup(e.event(x+50,y+30));
  assert.equal(e.latest().objects[0].x,object.x+50);
  e.command({type:'undo'});assert.equal(e.latest().objects[0].x,object.x);
  e.command({type:'tool',tool:'select'}); x=(object.x+object.width-5)*v.zoom+v.x;y=(object.y+object.height-5)*v.zoom+v.y;
  e.surface.onpointerdown(e.event(x,y));e.surface.onpointermove(e.event(x+40,y+20));e.surface.onpointerup(e.event(x+40,y+20));
  assert.equal(e.latest().objects[0].width,object.width+40);
  e.command({type:'delete'});assert.equal(e.latest().objects.length,0);
  e.command({type:'undo'});assert.equal(e.latest().objects[0].noteId,'original');
});

test('highlighter opacity and pressure remain structured; fit includes distant content', () => {
  const e=engine(); e.command({type:'tool',tool:'highlighter'}); e.stroke(-50000,-20000,50000,20000);
  assert.equal(e.latest().objects[0].opacity,.3);
  assert.equal(e.latest().objects[0].points[0].pressure,.5);
  e.command({type:'fit'}); const d=e.latest(),v=d.viewport;
  assert.ok(-50024*v.zoom+v.x>=0);assert.ok(50024*v.zoom+v.x<=390);
});

test('edit availability follows live selection and clears on blank space, tool switch, delete, undo and reload', () => {
  const doc = newCanvas();
  doc.objects = [
    { id:'text', type:'text', x:10, y:10, width:80, height:60, color:'#292820', text:'Editable' },
    { id:'note', type:'note', x:120, y:10, width:80, height:60, color:'#292820', noteKind:'thought', noteId:'original' },
  ];
  const e=engine(doc), available=()=>e.messages.filter(m=>m.type==='selection').at(-1)?.canEdit;
  const tap=(x,y)=>{ e.surface.onpointerdown(e.event(x+24,y+24));e.surface.onpointerup(e.event(x+24,y+24)); };
  assert.equal(available(),false);
  e.command({type:'tool',tool:'select'});tap(20,20);assert.equal(available(),true);
  tap(280,180);assert.equal(available(),false);
  tap(130,20);assert.equal(available(),false); // Missing original notes cannot be opened.
  e.command({type:'notes',notes:{'thought:original':{title:'Original note'}}});assert.equal(available(),true);
  e.command({type:'tool',tool:'move'});assert.equal(available(),false);
  e.command({type:'tool',tool:'select'});tap(20,20);e.command({type:'delete'});assert.equal(available(),false);
  e.command({type:'undo'});assert.equal(available(),false);
  tap(20,20);assert.equal(available(),true);
  e.command({type:'load',doc:structuredClone(doc),notes:{}});assert.equal(available(),false);
});

test('layer and removal availability includes strokes and missing notes, and clears with selection', () => {
  const doc=newCanvas();
  doc.objects=[{id:'stroke',type:'pen',x:0,y:0,width:3,height:0,color:'#292820',points:[{x:10,y:10,pressure:.5},{x:80,y:40,pressure:.5}]},{id:'missing',type:'note',x:130,y:10,width:80,height:60,color:'#292820',noteKind:'thought',noteId:'missing'}];
  const e=engine(doc),selection=()=>e.messages.filter(m=>m.type==='selection').at(-1);
  const tap=(x,y)=>{e.surface.onpointerdown(e.event(x+24,y+24));e.surface.onpointerup(e.event(x+24,y+24));};
  assert.equal(selection().hasSelection,false);
  e.command({type:'tool',tool:'select'});tap(40,25);
  assert.equal(selection().hasSelection,true);assert.equal(selection().canEdit,false);
  e.command({type:'front'});assert.equal(selection().hasSelection,true);
  tap(300,200);assert.equal(selection().hasSelection,false);
  tap(140,20);assert.equal(selection().hasSelection,true);assert.equal(selection().canEdit,false);
  e.command({type:'delete'});assert.equal(selection().hasSelection,false);
  e.command({type:'undo'});assert.equal(selection().hasSelection,false);
  tap(140,20);assert.equal(selection().hasSelection,true);
  e.command({type:'tool',tool:'pen'});assert.equal(selection().hasSelection,false);
});
