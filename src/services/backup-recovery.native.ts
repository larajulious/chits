import * as FS from 'expo-file-system/legacy';
import { defaultDatabaseDirectory } from 'expo-sqlite';
import { ChitsFiles } from '../../modules/chits-attachments';
import { BackupError } from './backup-format';

export function restorePaths() {
  if (!FS.documentDirectory || !defaultDatabaseDirectory) throw new BackupError('Chits could not access private device storage.');
  // Expo SQLite exposes a filesystem path, while FileSystem requires a file:// URI.
  const sqliteUri = defaultDatabaseDirectory.startsWith('file://') ? defaultDatabaseDirectory : `file://${defaultDatabaseDirectory}`;
  const sqlite = sqliteUri.endsWith('/') ? sqliteUri : `${sqliteUri}/`;
  const root = `${FS.documentDirectory}.chits-restore/`;
  return { root, database: `${sqlite}chits.db`, attachments: `${FS.documentDirectory}chits-attachments/`, safetyDatabase: `${root}safety.sqlite`, safetyAttachments: `${root}safety-attachments/`, stagedDatabase: `${root}database.sqlite`, stagedAttachments: `${root}attachments/`, journal: `${root}journal.json` };
}
export async function removeDatabaseFiles(path: string) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) await FS.deleteAsync(`${path}${suffix}`, { idempotent: true });
}
export type RestoreJournal = { version: 1; phase: 'pending' | 'committed'; hadAttachments: boolean; safetyDatabaseHash: string };
export async function discardAbandonedBackupExports() {
  if (!FS.documentDirectory) return;
  const names = await FS.readDirectoryAsync(FS.documentDirectory);
  for (const name of names) {
    if (/^\.chits-backup-export-\d+-[a-z0-9]+$/.test(name)) await FS.deleteAsync(`${FS.documentDirectory}${name}`, { idempotent: true });
  }
}
export async function writeRestoreJournal(journal: RestoreJournal) {
  const paths = restorePaths();
  await ChitsFiles.atomicWriteFileAsync(paths.journal, JSON.stringify(journal));
}
export async function recoverInterruptedRestore(): Promise<'recovered' | null> {
  const paths = restorePaths();
  if (!(await FS.getInfoAsync(paths.root)).exists) return null;
  if (!(await FS.getInfoAsync(paths.journal)).exists) {
    // No destructive operation can begin before the pending journal is durable.
    await FS.deleteAsync(paths.root, { idempotent: true });
    return null;
  }
  let journal: RestoreJournal;
  try {
    journal = JSON.parse(await FS.readAsStringAsync(paths.journal));
    if (journal.version !== 1 || !['pending', 'committed'].includes(journal.phase) || typeof journal.hadAttachments !== 'boolean' || !/^[a-f0-9]{64}$/.test(journal.safetyDatabaseHash)) throw new Error('Invalid recovery journal');
  } catch {
    throw new BackupError('Chits needs to recover an interrupted restore, but its recovery information could not be read. Your safety copy has been kept.');
  }
  if (journal.phase === 'committed') {
    await FS.deleteAsync(paths.root, { idempotent: true }).catch(() => undefined);
    return null;
  }
  try {
    if (await ChitsFiles.hashFileAsync(paths.safetyDatabase) !== journal.safetyDatabaseHash) throw new Error('Safety database checksum mismatch');
    // Copy first. The safety snapshot remains untouched across repeated interruptions.
    const recoveryDb = `${paths.root}recovery.sqlite`;
    const recoveryFiles = `${paths.root}recovery-attachments/`;
    await FS.deleteAsync(recoveryDb, { idempotent: true });
    await FS.copyAsync({ from: paths.safetyDatabase, to: recoveryDb });
    await FS.deleteAsync(recoveryFiles, { idempotent: true });
    if (journal.hadAttachments) await FS.copyAsync({ from: paths.safetyAttachments, to: recoveryFiles });
    await removeDatabaseFiles(paths.database);
    await FS.moveAsync({ from: recoveryDb, to: paths.database });
    await FS.deleteAsync(paths.attachments, { idempotent: true });
    if (journal.hadAttachments) await FS.moveAsync({ from: recoveryFiles, to: paths.attachments });
    await FS.deleteAsync(paths.root, { idempotent: true });
    return 'recovered';
  } catch (cause) {
    console.warn('[backup] safety recovery failed', cause);
    throw new BackupError('Chits could not finish recovering your previous data. Your safety copy has been kept. Free some storage and reopen Chits to try again.');
  }
}
