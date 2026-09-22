import type { SQLiteDatabase } from 'expo-sqlite';

type Migration = { version: number; up: (database: SQLiteDatabase) => Promise<void> };

export const RETIRED_SCHEDULING_DATA_MIGRATION = "DROP TABLE IF EXISTS reminders; DELETE FROM app_settings WHERE key = 'reminder_default_minutes';";

const migrations: Migration[] = [{
  version: 1,
  up: async (database) => {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY NOT NULL, text TEXT, type TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived_at INTEGER, pinned INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER);
      CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY NOT NULL, message_id TEXT NOT NULL, type TEXT NOT NULL, local_uri TEXT NOT NULL, original_name TEXT, mime_type TEXT, size INTEGER, duration INTEGER, width INTEGER, height INTEGER, created_at INTEGER NOT NULL, FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, icon TEXT, accent TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived_at INTEGER);
      CREATE TABLE IF NOT EXISTS board_columns (id TEXT PRIMARY KEY NOT NULL, board_id TEXT NOT NULL, name TEXT NOT NULL, position REAL NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY NOT NULL, board_id TEXT NOT NULL, column_id TEXT NOT NULL, title TEXT, position REAL NOT NULL, archived_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE RESTRICT, FOREIGN KEY (column_id) REFERENCES board_columns(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS card_messages (card_id TEXT NOT NULL, message_id TEXT NOT NULL, position REAL NOT NULL, PRIMARY KEY (card_id, message_id), FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT, FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY NOT NULL, card_id TEXT NOT NULL, scheduled_at INTEGER NOT NULL, notification_id TEXT, completed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT);
      CREATE INDEX IF NOT EXISTS idx_messages_active_chronological ON messages(deleted_at, archived_at, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
      CREATE INDEX IF NOT EXISTS idx_boards_active ON boards(archived_at, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_board_columns_position ON board_columns(board_id, position);
      CREATE INDEX IF NOT EXISTS idx_cards_board_position ON cards(board_id, column_id, position);
      CREATE INDEX IF NOT EXISTS idx_card_messages_message_id ON card_messages(message_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_lookup ON reminders(completed_at, scheduled_at);
    `);
  },
}, {
  version: 2,
  up: async (database) => {
    await database.execAsync('ALTER TABLE boards ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0; ALTER TABLE cards ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0; CREATE INDEX IF NOT EXISTS idx_cards_archive ON cards(archived_at, board_id);');
  },
}, {
  version: 3,
  up: async (database) => {
    await database.execAsync('ALTER TABLE boards ADD COLUMN last_opened_at INTEGER; ALTER TABLE cards ADD COLUMN last_opened_at INTEGER; CREATE INDEX IF NOT EXISTS idx_boards_recent ON boards(last_opened_at DESC); CREATE INDEX IF NOT EXISTS idx_cards_recent ON cards(last_opened_at DESC);');
  },
}, {
  version: 4,
  up: async (database) => {
    await database.execAsync('CREATE TABLE IF NOT EXISTS timeline_events (id TEXT PRIMARY KEY NOT NULL, event_type TEXT NOT NULL, created_at INTEGER NOT NULL, related_message_id TEXT, related_card_id TEXT, related_board_id TEXT, metadata_json TEXT); CREATE INDEX IF NOT EXISTS idx_timeline_events_chronological ON timeline_events(created_at DESC);');
  },
}, {
  version: 5,
  up: async (database) => {
    await database.execAsync('ALTER TABLE timeline_events ADD COLUMN dedupe_key TEXT; CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_events_dedupe_key ON timeline_events(dedupe_key) WHERE dedupe_key IS NOT NULL;');
  },
}, {
  version: 6,
  up: async (database) => {
    await database.execAsync('ALTER TABLE boards ADD COLUMN show_next_column_peek INTEGER NOT NULL DEFAULT 0;');
  },
}, {
  version: 7,
  up: async (database) => {
    await database.execAsync('ALTER TABLE boards ADD COLUMN show_column_navigator INTEGER NOT NULL DEFAULT 1;');
  },
}, {
  version: 8,
  up: async (database) => {
    await database.execAsync('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL);');
  },
}, {
  version: 9,
  up: async (database) => {
    await database.execAsync('UPDATE boards SET show_column_navigator = 1 WHERE show_column_navigator = 0;');
  },
}, {
  version: 10,
  up: async (database) => {
    await database.execAsync("ALTER TABLE reminders ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled'; UPDATE reminders SET status = 'completed' WHERE completed_at IS NOT NULL; CREATE INDEX IF NOT EXISTS idx_reminders_status_schedule ON reminders(status, scheduled_at); CREATE INDEX IF NOT EXISTS idx_reminders_card_status ON reminders(card_id, status);");
  },
}, {
  version: 11,
  up: async (database) => {
    // Boards created after migration 9 inherited the old schema default of off.
    // Repair those affected rows once; later user changes remain persistent.
    await database.execAsync('UPDATE boards SET show_column_navigator = 1 WHERE show_column_navigator = 0;');
  },
}, {
  version: 12,
  up: async (database) => {
    // Rename only the first column generated alongside its board, preserving user-created columns named Ideas.
    await database.execAsync("UPDATE board_columns AS bc SET name = 'Note' WHERE bc.name = 'Ideas' AND bc.position = 0 AND EXISTS (SELECT 1 FROM boards b WHERE b.id = bc.board_id AND b.created_at = bc.created_at);");
  },
}, {
  version: 13,
  up: async (database) => {
    // Reminder data is retired. Existing notes, cards, boards, and legacy timeline rows stay intact.
    await database.execAsync(RETIRED_SCHEDULING_DATA_MIGRATION);
  },
}, {
  version: 14,
  up: async (database) => {
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_messages_timeline_cursor ON messages(deleted_at, archived_at, created_at DESC, id DESC); CREATE INDEX IF NOT EXISTS idx_timeline_events_cursor ON timeline_events(created_at DESC, id DESC, event_type);');
  },
}, {
  version: 15,
  up: async (database) => {
    // Per-column board card queries (progressive column loading/prefetch) filter and
    // sort by column_id first; idx_cards_board_position leads with board_id, so it
    // can't serve that access pattern efficiently.
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_cards_column_position ON cards(column_id, position);');
  },
}, {
  version: 16,
  up: async (database) => {
    // Lightweight, card-scoped follow-up notes — structurally separate from
    // messages/timeline_events so they never leak into Chat history or Chits
    // talk-back. Soft-deleted (deleted_at) like messages; hard-deleted only when
    // the owning card itself is permanently deleted (see deleteCard).
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS card_comments (id TEXT PRIMARY KEY NOT NULL, card_id TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT);
      CREATE INDEX IF NOT EXISTS idx_card_comments_card ON card_comments(card_id, deleted_at, created_at ASC);
    `);
  },
}, {
  version: 17,
  up: async (database) => {
    // Attachments the user adds directly inside Card Details — supporting material
    // for the card itself, deliberately separate from `attachments` (which belongs
    // to chat messages, i.e. a card's linked "source" thoughts). Hard-deleted (no
    // deleted_at use in practice) since a physical file needs real cleanup, matching
    // message attachments' own hard-delete semantics rather than card_comments'
    // soft-delete one.
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS card_attachments (id TEXT PRIMARY KEY NOT NULL, card_id TEXT NOT NULL, type TEXT NOT NULL, local_uri TEXT NOT NULL, original_name TEXT, mime_type TEXT, size INTEGER, width INTEGER, height INTEGER, duration REAL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT);
      CREATE INDEX IF NOT EXISTS idx_card_attachments_card ON card_attachments(card_id, created_at ASC);
    `);
  },
}];

export async function migrateDatabase(database: SQLiteDatabase) {
  await database.execAsync('PRAGMA journal_mode = WAL;');
  await database.execAsync('PRAGMA foreign_keys = ON;');
  const result = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = result?.user_version ?? 0;
  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await migration.up(transaction);
      await transaction.execAsync(`PRAGMA user_version = ${migration.version};`);
    });
    currentVersion = migration.version;
  }
}
