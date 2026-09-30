import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, statSync, existsSync, copyFileSync, cpSync, readdirSync, renameSync, createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const urls = new Map();
const nativeWarn = console.warn;
console.warn = (tag, ...details) => {
  // Data-URL module stacks contain the full compiled source; keep expected fault
  // injection diagnostics short while preserving warnings for assertions.
  if (String(tag).startsWith('[backup]')) globalThis.__chitsBackupRuntime?.warnings.push({ tag, message: details[0]?.message });
  else nativeWarn(tag, ...details);
};
const stub = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const environment = (name) => `globalThis.__chitsBackupRuntime.${name}`;
const externals = new Map([
  ['expo-constants', stub("export default { expoConfig: { version: '1.0.0' } };")],
  ['expo-image', stub(`export const Image = { clearMemoryCache: async () => true, clearDiskCache: async () => true };`)],
  ['expo-file-system/legacy', stub(['copyAsync','moveAsync','getInfoAsync','readDirectoryAsync','deleteAsync','makeDirectoryAsync','readAsStringAsync','writeAsStringAsync','getFreeDiskStorageAsync'].map((key) => `export const ${key} = (...args) => ${environment('FS')}.${key}(...args);`).join('\n') + `\nexport const documentDirectory = 'file:///chits-test-documents/'; export const cacheDirectory = 'file:///chits-test-cache/';`)],
  ['expo-sqlite', stub(`export const openDatabaseAsync = (...args) => ${environment('sqlite')}.openDatabaseAsync(...args); export const backupDatabaseAsync = (...args) => ${environment('sqlite')}.backupDatabaseAsync(...args); export const defaultDatabaseDirectory = '/chits-test-documents/SQLite';`)],
  ['react-native-zip-archive', stub(`export const NO_COMPRESSION = 0; export const listContents = (...args) => ${environment('archive')}.listContents(...args); export const zip = (...args) => ${environment('archive')}.zip(...args); export const unzip = (...args) => ${environment('archive')}.unzip(...args);`)],
]);
function moduleUrl(path) {
  if (urls.has(path)) return urls.get(path);
  if (path === resolve(root, 'modules/chits-attachments')) return stub(`export const ChitsFiles = { hashFileAsync: (...args) => ${environment('native')}.hashFileAsync(...args), atomicWriteFileAsync: (...args) => ${environment('native')}.atomicWriteFileAsync(...args), exportAsync: async () => ({ status: 'saved' }) };`);
  if (path === resolve(root, 'src/services/reminders')) return stub('export async function pauseReminderSync() {} export function resumeReminderSync() {}');
  const actual = existsSync(`${path}.ts`) ? `${path}.ts` : path;
  let code = ts.transpileModule(readFileSync(actual, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace(/from ['"]([^'"]+)['"]/g, (match, specifier) => {
    const external = externals.get(specifier);
    if (external) return `from '${external}'`;
    const local = specifier.startsWith('@/') ? resolve(root, 'src', specifier.slice(2)) : resolve(dirname(actual), specifier);
    return `from '${moduleUrl(local)}'`;
  });
  const url = stub(code); urls.set(path, url); return url;
}
export const service = await import(moduleUrl(resolve(root, 'src/services/backup-service.native.ts')));
export const recovery = await import(moduleUrl(resolve(root, 'src/services/backup-recovery.native.ts')));
export const migration = await import(moduleUrl(resolve(root, 'src/db/migrations.ts')));
export const format = await import(moduleUrl(resolve(root, 'src/services/backup-format.ts')));
/** Any app module (e.g. 'src/db/repositories'), loaded through the same stubs as the backup service. */
export const loadModule = (path) => import(moduleUrl(resolve(root, path)));

export function runtime() {
  const location = mkdtempSync(join(tmpdir(), 'chits-backup-test-'));
  const documents = join(location, 'documents'); const cache = join(location, 'cache');
  mkdirSync(join(documents, 'SQLite'), { recursive: true }); mkdirSync(cache);
  const filePath = (uri) => {
    if (uri.startsWith('file:///chits-test-documents/')) return join(documents, uri.slice('file:///chits-test-documents/'.length));
    if (uri.startsWith('file:///chits-test-cache/')) return join(cache, uri.slice('file:///chits-test-cache/'.length));
    if (uri.startsWith('content://fixture/')) return join(location, uri.slice('content://fixture/'.length));
    return uri.startsWith('file://') ? fileURLToPath(uri) : uri;
  };
  const state = { location, documents, cache, filePath, freeBytes: 1e12, fault: null, connections: new Set(), warnings: [] };
  const fault = (method, argument) => { if (state.fault) state.fault(method, argument); };
  state.FS = {
    async getInfoAsync(uri) {
      fault('info', uri); const path = filePath(uri);
      if (!existsSync(path)) return { exists: false };
      const info = statSync(path); return { exists: true, isDirectory: info.isDirectory(), size: info.size };
    },
    async getFreeDiskStorageAsync() { return state.freeBytes; },
    async copyAsync({ from, to }) { fault('copy', { from, to }); const path = filePath(from); if (statSync(path).isDirectory()) cpSync(path, filePath(to), { recursive: true }); else copyFileSync(path, filePath(to)); },
    async moveAsync({ from, to }) { fault('move', { from, to }); rmSync(filePath(to), { recursive: true, force: true }); renameSync(filePath(from), filePath(to)); },
    async deleteAsync(uri) { fault('delete', uri); rmSync(filePath(uri), { recursive: true, force: true }); },
    async makeDirectoryAsync(uri) { fault('mkdir', uri); mkdirSync(filePath(uri), { recursive: true }); },
    async readDirectoryAsync(uri) { return readdirSync(filePath(uri)); },
    async readAsStringAsync(uri) { return readFileSync(filePath(uri), 'utf8'); },
    async writeAsStringAsync(uri, contents) { fault('write', uri); writeFileSync(filePath(uri), contents); },
  };
  state.native = {
    async hashFileAsync(uri) {
      fault('hash', uri); const hash = createHash('sha256');
      for await (const chunk of createReadStream(filePath(uri), { highWaterMark: 65536 })) hash.update(chunk);
      return hash.digest('hex');
    },
    async atomicWriteFileAsync(uri, contents) { fault('journal', JSON.parse(contents)); writeFileSync(`${filePath(uri)}.tmp`, contents); renameSync(`${filePath(uri)}.tmp`, filePath(uri)); },
  };
  state.sqlite = {
    async openDatabaseAsync(name, _, directory = 'file:///chits-test-documents/SQLite/') {
      fault('open', { name, directory });
      const path = filePath(`${directory.replace(/\/$/, '')}/${name}`); mkdirSync(dirname(path), { recursive: true });
      const raw = new DatabaseSync(path); let closed = false;
      const db = {
        path, raw,
        async getFirstAsync(sql, ...args) { return raw.prepare(sql).get(...args) ?? null; },
        async getAllAsync(sql, ...args) { return raw.prepare(sql).all(...args); },
        async runAsync(sql, ...args) { fault('sql', sql); return raw.prepare(sql).run(...args); },
        async execAsync(sql) { fault('sql', sql); raw.exec(sql); },
        async withExclusiveTransactionAsync(action) { raw.exec('BEGIN IMMEDIATE'); try { await action(db); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; } },
        async closeAsync() { if (!closed) { closed = true; raw.close(); state.connections.delete(db); } },
      };
      state.connections.add(db); return db;
    },
    async backupDatabaseAsync({ sourceDatabase, destDatabase }) { await backup(sourceDatabase.raw, destDatabase.path); },
  };
  const python = (code, args) => execFileSync('python3', ['-c', code, ...args], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  state.archive = {
    async zip(from, to) {
      fault('zip', to);
      python("import os,sys,zipfile\nwith zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_STORED) as z:\n for directory,_,files in os.walk(sys.argv[1]):\n  for file in files:\n   p=os.path.join(directory,file); z.write(p,os.path.relpath(p,sys.argv[1]))", [filePath(from), filePath(to)]);
      return to;
    },
    async listContents(uri) {
      return JSON.parse(python("import sys,zipfile,json\nwith zipfile.ZipFile(sys.argv[1]) as z: print(json.dumps([dict(path=e.filename,size=e.file_size,compressedSize=e.compress_size,isDirectory=e.is_dir(),isEncrypted=bool(e.flag_bits&1)) for e in z.infolist()]))", [filePath(uri)]));
    },
    async unzip(from, to, options) {
      fault('unzip', to);
      python("import sys,zipfile,json\nwanted=json.loads(sys.argv[3])\nwith zipfile.ZipFile(sys.argv[1]) as z:\n for e in z.infolist():\n  if any(e.filename.rstrip('/') == p.rstrip('/') or e.filename.startswith(p.rstrip('/')+'/') for p in wanted): z.extract(e,sys.argv[2])", [filePath(from), filePath(to), JSON.stringify(options?.entries ?? [])]);
      return to;
    },
  };
  state.write = (relative, content) => { const path = join(documents, relative); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
  state.cleanup = async () => { state.fault = null; for (const db of state.connections) await db.closeAsync(); rmSync(location, { recursive: true, force: true }); };
  globalThis.__chitsBackupRuntime = state;
  return state;
}
