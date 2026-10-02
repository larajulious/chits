import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/db/serialize-statements.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { serializeDatabaseStatements } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('shared database statements finish one at a time and keep their results', async () => {
  let active = 0;
  let peak = 0;
  const call = async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value;
  };
  const database = {
    getAllAsync: (value) => call([value]),
    getFirstAsync: (value) => call(value),
    runAsync: (value) => call({ changes: value }),
    execAsync: (value) => call(value),
  };
  serializeDatabaseStatements(database);
  serializeDatabaseStatements(database);
  const results = await Promise.all([
    database.getAllAsync('list'),
    database.runAsync(1),
    database.getFirstAsync('first'),
    database.execAsync('done'),
  ]);
  assert.equal(peak, 1);
  assert.deepEqual(results, [['list'], { changes: 1 }, 'first', 'done']);
});

test('one failed statement does not block later queries', async () => {
  const database = {
    getAllAsync: async () => ['ready'],
    getFirstAsync: async () => { throw new Error('query failed'); },
    runAsync: async () => ({ changes: 0 }),
    execAsync: async () => undefined,
  };
  serializeDatabaseStatements(database);
  await assert.rejects(database.getFirstAsync(), /query failed/);
  assert.deepEqual(await database.getAllAsync(), ['ready']);
});
