import type { SQLiteDatabase } from 'expo-sqlite';
import { CHAT_TIMELINE_EVENT_TYPES, type Attachment, type Board, type Message, type MessageType, type PageOptions, type TimelineEvent, type TimelineEventType, type TimelineItem, type TimelinePage, type TimelinePageOptions } from './types';

const DEFAULT_PAGE_SIZE = 50;
type MessageRow = { id: string; text: string | null; type: Message['type']; created_at: number; updated_at: number; archived_at: number | null; pinned: number; deleted_at: number | null };
type AttachmentRow = { id: string; message_id: string; type: MessageType; local_uri: string; original_name: string | null; mime_type: string | null; size: number | null; duration: number | null; width: number | null; height: number | null; created_at: number };
type EventRow = { id: string; event_type: TimelineEventType; created_at: number; related_message_id: string | null; related_card_id: string | null; related_board_id: string | null; metadata_json: string | null };
const messageFromRow = (row: MessageRow): Message => ({ id: row.id, text: row.text, type: row.type, createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at, pinned: row.pinned === 1, deletedAt: row.deleted_at, attachments: [] });
const attachmentFromRow = (row: AttachmentRow): Attachment => ({ id: row.id, messageId: row.message_id, type: row.type, localUri: row.local_uri, originalName: row.original_name, mimeType: row.mime_type, size: row.size, duration: row.duration, width: row.width, height: row.height, createdAt: row.created_at });
const eventFromRow = (row: EventRow): TimelineEvent => ({ id: row.id, type: row.event_type, createdAt: row.created_at, relatedMessageId: row.related_message_id, relatedCardId: row.related_card_id, relatedBoardId: row.related_board_id, metadata: row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : null });
const pageValues = (page: PageOptions) => [page.limit ?? DEFAULT_PAGE_SIZE, page.offset ?? 0] as const;
const attachmentCardTitle = (message: { text: string | null; type: MessageType | null; originalName: string | null }) => message.text?.trim().slice(0, 120) || (message.type === 'file' ? message.originalName?.trim().slice(0, 120) || 'Attachment' : message.type === 'photo' ? 'Photo' : message.type === 'video' ? 'Video' : message.type === 'audio' ? 'Audio note' : 'Attachment');
const CARD_TITLE_SQL = `COALESCE(NULLIF(TRIM(c.title), ''), (SELECT COALESCE(NULLIF(TRIM(m.text), ''), CASE WHEN a.type = 'file' THEN COALESCE(NULLIF(TRIM(a.original_name), ''), 'Attachment') WHEN a.type = 'photo' THEN 'Photo' WHEN a.type = 'video' THEN 'Video' WHEN a.type = 'audio' THEN 'Audio note' ELSE 'Attachment' END) FROM card_messages cm INNER JOIN messages m ON m.id = cm.message_id LEFT JOIN attachments a ON a.message_id = m.id WHERE cm.card_id = c.id ORDER BY cm.position ASC, a.created_at ASC LIMIT 1), 'Attachment')`;

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function insertChatTimelineEvent(database: Pick<SQLiteDatabase, 'runAsync'>, input: { type: TimelineEventType; relatedBoardId: string; metadata: Record<string, unknown> }) {
  await database.runAsync('INSERT INTO timeline_events (id, event_type, created_at, related_message_id, related_card_id, related_board_id, metadata_json, dedupe_key) VALUES (?, ?, ?, NULL, NULL, ?, ?, NULL)', newId(), input.type, Date.now(), input.relatedBoardId, JSON.stringify(input.metadata));
}

export function createMessageRepository(database: SQLiteDatabase) {
  const withAttachments = async (rows: MessageRow[]) => {
    const messages = rows.map(messageFromRow);
    if (!messages.length) return messages;
    const ids = messages.map(({ id }) => id);
    const attachmentRows = await database.getAllAsync<AttachmentRow>(`SELECT * FROM attachments WHERE message_id IN (${ids.map(() => '?').join(', ')}) ORDER BY created_at ASC`, ...ids);
    const organizationRows = await database.getAllAsync<{ messageId: string; boardId: string; boardName: string; columnName: string }>(`SELECT cm.message_id AS messageId, c.board_id AS boardId, b.name AS boardName, bc.name AS columnName FROM card_messages cm INNER JOIN cards c ON c.id = cm.card_id INNER JOIN boards b ON b.id = c.board_id INNER JOIN board_columns bc ON bc.id = c.column_id WHERE cm.message_id IN (${ids.map(() => '?').join(', ')}) AND c.archived_at IS NULL AND b.archived_at IS NULL ORDER BY c.created_at ASC`, ...ids);
    const grouped = new Map<string, Attachment[]>();
    const organizationByMessage = new Map<string, (typeof organizationRows)[number]>();
    for (const organization of organizationRows) if (!organizationByMessage.has(organization.messageId)) organizationByMessage.set(organization.messageId, organization);
    for (const row of attachmentRows) grouped.set(row.message_id, [...(grouped.get(row.message_id) ?? []), attachmentFromRow(row)]);
    return messages.map((message) => ({ ...message, attachments: grouped.get(message.id) ?? [], organization: organizationByMessage.get(message.id) ?? null }));
  };
  return {
    async createAttachmentMessage(input: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>, text: string | null = null): Promise<Message> {
      const now = Date.now();
      const messageId = newId();
      const attachment: Attachment = { ...input, id: newId(), messageId, createdAt: now };
      const description = text?.trim() || null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync('INSERT INTO messages (id, text, type, created_at, updated_at, archived_at, pinned, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', messageId, description, input.type, now, now, null, 0, null);
        await transaction.runAsync('INSERT INTO attachments (id, message_id, type, local_uri, original_name, mime_type, size, duration, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', attachment.id, messageId, attachment.type, attachment.localUri, attachment.originalName, attachment.mimeType, attachment.size, attachment.duration, attachment.width, attachment.height, now);
      });
      return { id: messageId, text: description, type: input.type, createdAt: now, updatedAt: now, archivedAt: null, pinned: false, deletedAt: null, attachments: [attachment] };
    },
    async createText(text: string): Promise<Message> {
      const now = Date.now();
      const message: Message = { id: newId(), text, type: 'text', createdAt: now, updatedAt: now, archivedAt: null, pinned: false, deletedAt: null, attachments: [] };
      await database.runAsync('INSERT INTO messages (id, text, type, created_at, updated_at, archived_at, pinned, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', message.id, message.text, message.type, message.createdAt, message.updatedAt, null, 0, null);
      return message;
    },
    async listActive(page: PageOptions = {}) {
      const [limit, offset] = pageValues(page);
      const rows = await database.getAllAsync<MessageRow>('SELECT * FROM messages WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?', limit, offset);
      return withAttachments(rows);
    },
    async listPinned() {
      const rows = await database.getAllAsync<MessageRow>('SELECT * FROM messages WHERE pinned = 1 AND deleted_at IS NULL AND archived_at IS NULL ORDER BY updated_at DESC, id DESC');
      return withAttachments(rows);
    },
    async listTimeline(page: TimelinePageOptions = {}): Promise<TimelinePage> {
      const limit = page.limit ?? DEFAULT_PAGE_SIZE;
      const beforeCreatedAt = page.before?.createdAt ?? null;
      const beforeSortId = page.before?.sortId ?? null;
      const eventPlaceholders = CHAT_TIMELINE_EVENT_TYPES.map(() => '?').join(', ');
      const messageCursorClause = page.before ? 'AND (m.created_at, m.id) < (?, ?)' : '';
      const eventCursorClause = page.before ? 'AND (e.created_at, e.id) < (?, ?)' : '';
      const messageTieId = beforeSortId?.startsWith('m:') ? beforeSortId.slice(2) : '';
      const eventTieId = beforeSortId?.startsWith('e:') ? beforeSortId.slice(2) : '\uffff';
      const branchLimit = limit + 1;
      const rows = await database.getAllAsync<{ entryKind: 'message' | 'event'; createdAt: number; messageId: string | null; eventId: string | null; sortId: string }>(`
        SELECT * FROM (
          SELECT * FROM (
            SELECT 'message' AS entryKind, m.created_at AS createdAt, m.id AS messageId, NULL AS eventId, 'm:' || m.id AS sortId
            FROM messages m
            WHERE m.deleted_at IS NULL AND m.archived_at IS NULL ${messageCursorClause}
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT ?
          )
          UNION ALL
          SELECT * FROM (
            SELECT 'event' AS entryKind, e.created_at AS createdAt, NULL AS messageId, e.id AS eventId, 'e:' || e.id AS sortId
            FROM timeline_events e
            WHERE e.event_type IN (${eventPlaceholders}) ${eventCursorClause}
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT ?
          )
        )
        ORDER BY createdAt DESC, sortId DESC
        LIMIT ?`,
        ...(page.before ? [beforeCreatedAt, messageTieId] : []),
        branchLimit,
        ...CHAT_TIMELINE_EVENT_TYPES,
        ...(page.before ? [beforeCreatedAt, eventTieId] : []),
        branchLimit,
        branchLimit,
      );
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const messageIds = pageRows.flatMap((row) => row.messageId ? [row.messageId] : []); const eventIds = pageRows.flatMap((row) => row.eventId ? [row.eventId] : []);
      const messages = messageIds.length ? await withAttachments(await database.getAllAsync<MessageRow>(`SELECT * FROM messages WHERE id IN (${messageIds.map(() => '?').join(', ')})`, ...messageIds)) : [];
      const events = eventIds.length ? await database.getAllAsync<EventRow>(`SELECT * FROM timeline_events WHERE id IN (${eventIds.map(() => '?').join(', ')})`, ...eventIds) : [];
      const messageById = new Map(messages.map((message) => [message.id, message])); const eventById = new Map(events.map((event) => [event.id, eventFromRow(event)])); const timeline: TimelineItem[] = [];
      pageRows.forEach((row) => { if (row.entryKind === 'message' && row.messageId) { const message = messageById.get(row.messageId); if (message) timeline.push({ kind: 'message', message, createdAt: row.createdAt }); } else if (row.entryKind === 'event' && row.eventId) { const event = eventById.get(row.eventId); if (event) timeline.push({ kind: 'event', event, createdAt: row.createdAt }); } });
      const oldest = pageRows.at(-1);
      return { items: timeline, hasMore, nextCursor: oldest ? { createdAt: oldest.createdAt, sortId: oldest.sortId } : null };
    },
    async getActiveById(id: string) {
      const rows = await database.getAllAsync<MessageRow>('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL', id);
      return (await withAttachments(rows))[0] ?? null;
    },
    async updateText(id: string, text: string): Promise<number> {
      const updatedAt = Date.now();
      const result = await database.runAsync('UPDATE messages SET text = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', text, updatedAt, id);
      if (result.changes !== 1) throw new Error('That thought is no longer available.');
      return updatedAt;
    },
    async setPinned(id: string, pinned: boolean) {
      const result = await database.runAsync('UPDATE messages SET pinned = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL', pinned ? 1 : 0, Date.now(), id);
      if (result.changes !== 1) throw new Error('That thought is no longer available.');
    },
    async archive(id: string) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const now = Date.now(); const result = await transaction.runAsync('UPDATE messages SET archived_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL', now, now, id);
        if (result.changes !== 1) throw new Error('That thought is no longer available.');
      });
    },
    async archiveMany(ids: string[]) {
      if (!ids.length) return 0;
      const now = Date.now();
      let archived = 0;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        for (const id of ids) {
          const result = await transaction.runAsync('UPDATE messages SET archived_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL', now, now, id);
          archived += result.changes;
        }
      });
      return archived;
    },
    async restore(id: string) { const result = await database.runAsync('UPDATE messages SET archived_at = NULL, updated_at = ? WHERE id = ?', Date.now(), id); if (result.changes !== 1) throw new Error('That thought is no longer available.'); },
    async softDelete(id: string) {
      const result = await database.runAsync('UPDATE messages SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', Date.now(), Date.now(), id);
      if (result.changes !== 1) throw new Error('That thought is no longer available.');
    },
    async deletePermanently(id: string) {
      const removableUris: string[] = [];
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const message = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM messages WHERE id = ?', id);
        if (!message) throw new Error('That thought is no longer available.');
        const attachments = await transaction.getAllAsync<{ localUri: string }>('SELECT local_uri AS localUri FROM attachments WHERE message_id = ?', id);
        for (const attachment of attachments) {
          const shared = await transaction.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM attachments WHERE local_uri = ? AND message_id != ?', attachment.localUri, id);
          if (!(shared?.count ?? 0)) removableUris.push(attachment.localUri);
        }
        await transaction.runAsync('DELETE FROM card_messages WHERE message_id = ?', id);
        await transaction.runAsync('DELETE FROM attachments WHERE message_id = ?', id);
        const result = await transaction.runAsync('DELETE FROM messages WHERE id = ?', id);
        if (result.changes !== 1) throw new Error('That thought is no longer available.');
      });
      return [...new Set(removableUris)];
    },
    async listUnorganized(page: PageOptions = {}) {
      const [limit, offset] = pageValues(page);
      const rows = await database.getAllAsync<MessageRow>(`SELECT m.* FROM messages m WHERE m.deleted_at IS NULL AND m.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM card_messages cm INNER JOIN cards c ON c.id = cm.card_id INNER JOIN boards b ON b.id = c.board_id WHERE cm.message_id = m.id AND c.archived_at IS NULL AND b.archived_at IS NULL) ORDER BY m.created_at DESC LIMIT ? OFFSET ?`, limit, offset);
      return withAttachments(rows);
    },
    async countUnorganized() {
      const result = await database.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM messages m WHERE m.deleted_at IS NULL AND m.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM card_messages cm INNER JOIN cards c ON c.id = cm.card_id INNER JOIN boards b ON b.id = c.board_id WHERE cm.message_id = m.id AND c.archived_at IS NULL AND b.archived_at IS NULL)`);
      return result?.count ?? 0;
    },
  };
}

export function createBoardRepository(database: SQLiteDatabase) {
  return {
    listActive: () => database.getAllAsync<Board & { columnCount: number; cardCount: number }>(`
      SELECT b.id, b.name, b.icon, b.accent,
        b.created_at AS createdAt, b.updated_at AS updatedAt,
        b.archived_at AS archivedAt,
        b.show_column_navigator = 1 AS showColumnNavigator,
        (SELECT COUNT(*) FROM board_columns bc WHERE bc.board_id = b.id) AS columnCount,
        (SELECT COUNT(*) FROM cards c WHERE c.board_id = b.id AND c.archived_at IS NULL) AS cardCount
      FROM boards b
      WHERE b.archived_at IS NULL
      ORDER BY b.updated_at DESC
    `),
    async setPinned(kind: 'board' | 'card', id: string, pinned: boolean) { const table = kind === 'board' ? 'boards' : 'cards'; const result = await database.runAsync(`UPDATE ${table} SET pinned = ?, updated_at = ? WHERE id = ?`, pinned ? 1 : 0, Date.now(), id); if (result.changes !== 1) throw new Error('That item is no longer available.'); },
    listPinned: () => database.getAllAsync<{ id: string; title: string; kind: 'board' | 'card'; boardId: string | null; context: string; accessibilityContext: string | null }>(`
      SELECT id, name AS title, 'board' AS kind, NULL AS boardId,
        'Board' AS context, NULL AS accessibilityContext
      FROM boards
      WHERE pinned = 1 AND archived_at IS NULL
      UNION ALL
      SELECT c.id, COALESCE(c.title, 'Related thoughts') AS title, 'card' AS kind,
        c.board_id AS boardId, b.name || ' · ' || bc.name AS context,
        b.name || ' board, ' || bc.name || ' column' AS accessibilityContext
      FROM cards c
      INNER JOIN boards b ON b.id = c.board_id
      INNER JOIN board_columns bc ON bc.id = c.column_id
      WHERE c.pinned = 1 AND c.archived_at IS NULL AND b.archived_at IS NULL
      ORDER BY title COLLATE NOCASE
    `),
    listRecent: () => database.getAllAsync<{ id: string; title: string; kind: 'board' | 'card'; boardId: string | null; context: string; accessibilityContext: string | null }>(`
      SELECT id, name AS title, 'board' AS kind, NULL AS boardId,
        'Board' AS context, NULL AS accessibilityContext, last_opened_at AS openedAt
      FROM boards
      WHERE archived_at IS NULL AND last_opened_at IS NOT NULL
      UNION ALL
      SELECT c.id, COALESCE(c.title, 'Related thoughts') AS title, 'card' AS kind,
        c.board_id AS boardId, b.name || ' · ' || bc.name AS context,
        b.name || ' board, ' || bc.name || ' column' AS accessibilityContext,
        c.last_opened_at AS openedAt
      FROM cards c
      INNER JOIN boards b ON b.id = c.board_id
      INNER JOIN board_columns bc ON bc.id = c.column_id
      WHERE c.archived_at IS NULL AND b.archived_at IS NULL AND c.last_opened_at IS NOT NULL
      ORDER BY openedAt DESC
      LIMIT 5
    `),
    async markOpened(kind: 'board' | 'card', id: string) { const table = kind === 'board' ? 'boards' : 'cards'; await database.runAsync(`UPDATE ${table} SET last_opened_at = ? WHERE id = ? AND archived_at IS NULL`, Date.now(), id); },
    async archiveBoard(id: string) { const result = await database.runAsync('UPDATE boards SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL', Date.now(), Date.now(), id); if (result.changes !== 1) throw new Error('That board is no longer available.'); },
    async restoreBoard(id: string) { const result = await database.runAsync('UPDATE boards SET archived_at = NULL, updated_at = ? WHERE id = ?', Date.now(), id); if (result.changes !== 1) throw new Error('That board is no longer available.'); },
    async restoreCard(id: string) { const result = await database.runAsync('UPDATE cards SET archived_at = NULL, updated_at = ? WHERE id = ?', Date.now(), id); if (result.changes !== 1) throw new Error('That card is no longer available.'); },
    listArchived: () => database.getAllAsync<{ id: string; title: string; kind: 'message' | 'card' | 'board'; archivedAt: number }>(`SELECT id, COALESCE(text, 'Attachment') AS title, 'message' AS kind, archived_at AS archivedAt FROM messages WHERE archived_at IS NOT NULL UNION ALL SELECT id, COALESCE(title, 'Related thoughts') AS title, 'card' AS kind, archived_at AS archivedAt FROM cards WHERE archived_at IS NOT NULL UNION ALL SELECT id, name AS title, 'board' AS kind, archived_at AS archivedAt FROM boards WHERE archived_at IS NOT NULL ORDER BY archivedAt DESC`),
    search: (term: string, includeArchived = false) => { const like = `%${term.replace(/[%_]/g, '\\$&')}%`; return database.getAllAsync<{ id: string; title: string; context: string; kind: 'message' | 'card' | 'board' | 'file' }>(`SELECT id, text AS title, 'Chat' AS context, 'message' AS kind FROM messages WHERE text LIKE ? ESCAPE '\\' ${includeArchived ? '' : 'AND archived_at IS NULL AND deleted_at IS NULL'} UNION ALL SELECT c.id, COALESCE(c.title, 'Related thoughts') AS title, b.name AS context, 'card' AS kind FROM cards c INNER JOIN boards b ON b.id = c.board_id WHERE c.title LIKE ? ESCAPE '\\' ${includeArchived ? '' : 'AND c.archived_at IS NULL AND b.archived_at IS NULL'} UNION ALL SELECT b.id, b.name AS title, 'Board' AS context, 'board' AS kind FROM boards b WHERE b.name LIKE ? ESCAPE '\\' ${includeArchived ? '' : 'AND b.archived_at IS NULL'} UNION ALL SELECT a.message_id AS id, COALESCE(a.original_name, 'Attachment') AS title, 'File' AS context, 'file' AS kind FROM attachments a WHERE a.original_name LIKE ? ESCAPE '\\' ORDER BY title COLLATE NOCASE LIMIT 100`, like, like, like, like); },
    getById: (id: string) => database.getFirstAsync<Board>('SELECT id, name, icon, accent, created_at AS createdAt, updated_at AS updatedAt, archived_at AS archivedAt, show_column_navigator = 1 AS showColumnNavigator FROM boards WHERE id = ? AND archived_at IS NULL', id),
    async create(input: { name: string; icon?: string | null; accent?: string | null }) {
      const now = Date.now(); const board: Board = { id: newId(), name: input.name, icon: input.icon ?? null, accent: input.accent ?? null, createdAt: now, updatedAt: now, archivedAt: null, showColumnNavigator: true };
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync('INSERT INTO boards (id, name, icon, accent, created_at, updated_at, archived_at, show_column_navigator) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', board.id, board.name, board.icon, board.accent, now, now, null, 1);
        await transaction.runAsync('INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), board.id, 'Notes', 0, now, now);
        await insertChatTimelineEvent(transaction, { type: 'board_created', relatedBoardId: board.id, metadata: { boardName: board.name } });
      });
      return board;
    },
    async renameBoard(boardId: string, name: string) {
      const normalizedName = name.trim();
      if (!normalizedName) throw new Error('Board name can’t be empty.');
      if (normalizedName.length > 80) throw new Error('Board name must be 80 characters or fewer.');
      const result = await database.runAsync('UPDATE boards SET name = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL', normalizedName, Date.now(), boardId);
      if (result.changes !== 1) throw new Error('That board is no longer available.');
    },
    async setShowColumnNavigator(boardId: string, show: boolean) { const result = await database.runAsync('UPDATE boards SET show_column_navigator = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL', show ? 1 : 0, Date.now(), boardId); if (result.changes !== 1) throw new Error('That board is no longer available.'); },
    async organizeMessages(boardId: string, messageIds: string[]) {
      if (!messageIds.length) return 0;
      const now = Date.now();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const column = await transaction.getFirstAsync<{ id: string; name: string }>('SELECT id, name FROM board_columns WHERE board_id = ? ORDER BY position ASC LIMIT 1', boardId);
        if (!column) throw new Error('This board is not ready to receive thoughts.');
        const board = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM boards WHERE id = ? AND archived_at IS NULL', boardId);
        if (!board) throw new Error('This board is no longer available.');
        for (const messageId of messageIds) {
          const message = await transaction.getFirstAsync<{ text: string | null; type: MessageType | null; originalName: string | null }>('SELECT m.text, a.type, a.original_name AS originalName FROM messages m LEFT JOIN attachments a ON a.message_id = m.id WHERE m.id = ? AND m.archived_at IS NULL AND m.deleted_at IS NULL ORDER BY a.created_at ASC LIMIT 1', messageId);
          if (!message) continue;
          const cardId = newId();
          const position = await transaction.getFirstAsync<{ position: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM cards WHERE column_id = ? AND archived_at IS NULL', column.id);
          await transaction.runAsync('INSERT INTO cards (id, board_id, column_id, title, position, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', cardId, boardId, column.id, attachmentCardTitle(message), position?.position ?? 0, null, now, now);
          await transaction.runAsync('INSERT INTO card_messages (card_id, message_id, position) VALUES (?, ?, ?)', cardId, messageId, 0);
        }
      });
      return messageIds.length;
    },
    async mergeMessages(input: { boardId: string; columnId: string; messageIds: string[]; title?: string | null }) {
      if (input.messageIds.length < 2) throw new Error('Select at least two thoughts to merge.');
      const now = Date.now(); const cardId = newId();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const column = await transaction.getFirstAsync<{ id: string }>('SELECT bc.id FROM board_columns bc INNER JOIN boards b ON b.id = bc.board_id WHERE bc.id = ? AND bc.board_id = ? AND b.archived_at IS NULL', input.columnId, input.boardId);
        if (!column) throw new Error('That board column is no longer available.');
        const position = await transaction.getFirstAsync<{ position: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM cards WHERE column_id = ? AND archived_at IS NULL', input.columnId);
        const validMessages: string[] = [];
        let fallbackTitle: string | null = null;
        for (const messageId of input.messageIds) {
          const message = await transaction.getFirstAsync<{ id: string; text: string | null; type: MessageType | null; originalName: string | null }>('SELECT m.id, m.text, a.type, a.original_name AS originalName FROM messages m LEFT JOIN attachments a ON a.message_id = m.id WHERE m.id = ? AND m.archived_at IS NULL AND m.deleted_at IS NULL ORDER BY a.created_at ASC LIMIT 1', messageId);
          if (message) { validMessages.push(message.id); fallbackTitle ??= attachmentCardTitle(message); }
        }
        if (validMessages.length < 2) throw new Error('At least two active thoughts are needed to merge.');
        const cardTitle = input.title?.trim() || fallbackTitle;
        await transaction.runAsync('INSERT INTO cards (id, board_id, column_id, title, position, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', cardId, input.boardId, input.columnId, cardTitle, position?.position ?? 0, null, now, now);
        for (const [positionIndex, messageId] of validMessages.entries()) await transaction.runAsync('INSERT INTO card_messages (card_id, message_id, position) VALUES (?, ?, ?)', cardId, messageId, positionIndex);
        await transaction.runAsync('UPDATE boards SET updated_at = ? WHERE id = ?', now, input.boardId);
      }); return cardId;
    },
    listCards: (boardId: string) => database.getAllAsync<{ id: string; title: string | null; columnName: string }>(`SELECT c.id, ${CARD_TITLE_SQL} AS title, bc.name AS columnName FROM cards c INNER JOIN board_columns bc ON bc.id = c.column_id WHERE c.board_id = ? AND c.archived_at IS NULL ORDER BY bc.position ASC, c.position ASC`, boardId),
    listColumns: (boardId: string) => database.getAllAsync<{ id: string; name: string; position: number }>('SELECT id, name, position FROM board_columns WHERE board_id = ? ORDER BY position ASC', boardId),
    listKanbanCards: (boardId: string) => database.getAllAsync<{ id: string; columnId: string; title: string | null; position: number; preview: string | null; attachmentCount: number; messageCount: number; mediaId: string | null; mediaMessageId: string | null; mediaType: 'photo' | 'video' | null; mediaUri: string | null; mediaMimeType: string | null; mediaSize: number | null; mediaDuration: number | null; mediaWidth: number | null; mediaHeight: number | null; mediaCreatedAt: number | null }>(`SELECT c.id, c.column_id AS columnId, ${CARD_TITLE_SQL} AS title, c.position,
      (SELECT m.text FROM card_messages cm INNER JOIN messages m ON m.id = cm.message_id WHERE cm.card_id = c.id ORDER BY cm.position ASC LIMIT 1) AS preview,
      (SELECT COUNT(*) FROM attachments a INNER JOIN card_messages cm ON cm.message_id = a.message_id WHERE cm.card_id = c.id) AS attachmentCount,
      (SELECT COUNT(*) FROM card_messages cm WHERE cm.card_id = c.id) AS messageCount,
      ma.id AS mediaId, ma.message_id AS mediaMessageId, ma.type AS mediaType,
      ma.local_uri AS mediaUri, ma.mime_type AS mediaMimeType, ma.size AS mediaSize,
      ma.duration AS mediaDuration, ma.width AS mediaWidth, ma.height AS mediaHeight,
      ma.created_at AS mediaCreatedAt
      FROM cards c
      LEFT JOIN attachments ma ON ma.id = (
        SELECT a.id FROM attachments a
        INNER JOIN card_messages cm ON cm.message_id = a.message_id
        WHERE cm.card_id = c.id AND a.type IN ('photo', 'video')
        ORDER BY cm.position ASC, a.created_at ASC LIMIT 1
      )
      WHERE c.board_id = ? AND c.archived_at IS NULL
      ORDER BY c.column_id, c.position ASC`, boardId),
    async addColumn(boardId: string, name: string) {
      const normalizedName = name.trim();
      if (!normalizedName) throw new Error('Column name can’t be empty.');
      if (normalizedName.length > 60) throw new Error('Column name must be 60 characters or fewer.');
      const now = Date.now(); const id = newId();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const board = await transaction.getFirstAsync<{ id: string; name: string }>('SELECT id, name FROM boards WHERE id = ? AND archived_at IS NULL', boardId);
        if (!board) throw new Error('This board is no longer available.');
        const next = await transaction.getFirstAsync<{ position: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM board_columns WHERE board_id = ?', boardId);
        await transaction.runAsync('INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, boardId, normalizedName, next?.position ?? 0, now, now);
        await transaction.runAsync('UPDATE boards SET updated_at = ? WHERE id = ?', now, boardId);
        await insertChatTimelineEvent(transaction, { type: 'column_created', relatedBoardId: boardId, metadata: { boardName: board.name, columnName: normalizedName } });
      }); return id;
    },
    async renameColumn(columnId: string, name: string) {
      const normalizedName = name.trim();
      if (!normalizedName) throw new Error('Column name can’t be empty.');
      if (normalizedName.length > 60) throw new Error('Column name must be 60 characters or fewer.');
      const result = await database.runAsync('UPDATE board_columns SET name = ?, updated_at = ? WHERE id = ?', normalizedName, Date.now(), columnId);
      if (result.changes !== 1) throw new Error('That column is no longer available.');
    },
    async reorderColumns(boardId: string, ids: string[]) {
      const now = Date.now(); await database.withExclusiveTransactionAsync(async (transaction) => {
        for (const [position, id] of ids.entries()) await transaction.runAsync('UPDATE board_columns SET position = ?, updated_at = ? WHERE id = ? AND board_id = ?', position, now, id, boardId);
        await transaction.runAsync('UPDATE boards SET updated_at = ? WHERE id = ?', now, boardId);
      });
    },
    async getColumnCardCount(columnId: string) {
      const result = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM cards WHERE column_id = ?', columnId);
      return result?.count ?? 0;
    },
    async deleteColumn(columnId: string, destinationColumnId?: string) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const source = await transaction.getFirstAsync<{ id: string; boardId: string }>('SELECT id, board_id AS boardId FROM board_columns WHERE id = ?', columnId);
        if (!source) throw new Error('That column is no longer available.');
        const columnCount = await transaction.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM board_columns WHERE board_id = ?', source.boardId);
        if ((columnCount?.count ?? 0) <= 1) throw new Error('A board needs at least one column.');
        const sourceCards = await transaction.getAllAsync<{ id: string }>('SELECT id FROM cards WHERE column_id = ? ORDER BY position ASC, created_at ASC', columnId);
        if (sourceCards.length) {
          if (!destinationColumnId || destinationColumnId === columnId) throw new Error('Choose where to move this column’s cards.');
          const destination = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM board_columns WHERE id = ? AND board_id = ?', destinationColumnId, source.boardId);
          if (!destination) throw new Error('That destination column is no longer available.');
          const next = await transaction.getFirstAsync<{ position: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM cards WHERE column_id = ?', destinationColumnId);
          const start = next?.position ?? 0;
          const now = Date.now();
          for (const [offset, card] of sourceCards.entries()) {
            await transaction.runAsync('UPDATE cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?', destinationColumnId, start + offset, now, card.id);
          }
        }
        const result = await transaction.runAsync('DELETE FROM board_columns WHERE id = ?', columnId);
        if (result.changes !== 1) throw new Error('That column is no longer available.');
        const remaining = await transaction.getAllAsync<{ id: string }>('SELECT id FROM board_columns WHERE board_id = ? ORDER BY position ASC', source.boardId);
        const now = Date.now();
        for (const [position, column] of remaining.entries()) await transaction.runAsync('UPDATE board_columns SET position = ?, updated_at = ? WHERE id = ?', position, now, column.id);
        await transaction.runAsync('UPDATE boards SET updated_at = ? WHERE id = ?', now, source.boardId);
      });
    },
    async moveCard(cardId: string, destinationColumnId: string, destinationIndex: number) {
      const now = Date.now(); await database.withExclusiveTransactionAsync(async (transaction) => {
        const card = await transaction.getFirstAsync<{ id: string; board_id: string; column_id: string }>('SELECT id, board_id, column_id FROM cards WHERE id = ? AND archived_at IS NULL', cardId);
        const column = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM board_columns WHERE id = ? AND board_id = ?', destinationColumnId, card?.board_id ?? '');
        if (!card || !column) throw new Error('That move is no longer available.');
        const destinationCards = await transaction.getAllAsync<{ id: string }>('SELECT id FROM cards WHERE column_id = ? AND archived_at IS NULL AND id != ? ORDER BY position ASC', destinationColumnId, cardId);
        const ids = [...destinationCards.map((item) => item.id)]; ids.splice(Math.max(0, Math.min(destinationIndex, ids.length)), 0, cardId);
        await transaction.runAsync('UPDATE cards SET column_id = ?, updated_at = ? WHERE id = ?', destinationColumnId, now, cardId);
        for (const [position, id] of ids.entries()) await transaction.runAsync('UPDATE cards SET position = ?, updated_at = ? WHERE id = ?', position, now, id);
        if (card.column_id !== destinationColumnId) {
          const sourceCards = await transaction.getAllAsync<{ id: string }>('SELECT id FROM cards WHERE column_id = ? AND archived_at IS NULL ORDER BY position ASC', card.column_id);
          for (const [position, item] of sourceCards.entries()) await transaction.runAsync('UPDATE cards SET position = ? WHERE id = ?', position, item.id);
        }
        await transaction.runAsync('UPDATE boards SET updated_at = ? WHERE id = ?', now, card.board_id);
      });
    },
    getCardDetail: (cardId: string) => database.getFirstAsync<{ id: string; title: string | null; explicitTitle: string | null; boardId: string; boardName: string; columnId: string; columnName: string; createdAt: number; pinned: number }>(`SELECT c.id, ${CARD_TITLE_SQL} AS title, c.title AS explicitTitle, c.board_id AS boardId, b.name AS boardName, c.column_id AS columnId, bc.name AS columnName, c.created_at AS createdAt, c.pinned FROM cards c INNER JOIN boards b ON b.id = c.board_id INNER JOIN board_columns bc ON bc.id = c.column_id WHERE c.id = ? AND c.archived_at IS NULL`, cardId),
    async updateCardTitle(cardId: string, title: string | null) {
      const result = await database.runAsync('UPDATE cards SET title = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL', title?.trim() || null, Date.now(), cardId);
      if (result.changes !== 1) throw new Error('That card is no longer available.');
    },
    async listCardMessages(cardId: string) {
      const rows = await database.getAllAsync<MessageRow & { position: number }>(`SELECT m.*, cm.position FROM card_messages cm INNER JOIN messages m ON m.id = cm.message_id WHERE cm.card_id = ? ORDER BY cm.position ASC`, cardId);
      const messages = rows.map(messageFromRow);
      if (!messages.length) return messages;
      const attachmentRows = await database.getAllAsync<AttachmentRow>(`SELECT a.* FROM attachments a INNER JOIN card_messages cm ON cm.message_id = a.message_id WHERE cm.card_id = ? ORDER BY cm.position ASC, a.created_at ASC`, cardId);
      const grouped = new Map<string, Attachment[]>();
      for (const row of attachmentRows) grouped.set(row.message_id, [...(grouped.get(row.message_id) ?? []), attachmentFromRow(row)]);
      return messages.map((message) => ({ ...message, attachments: grouped.get(message.id) ?? [] }));
    },
    async removeMessageFromCard(cardId: string, messageId: string) { const result = await database.runAsync('DELETE FROM card_messages WHERE card_id = ? AND message_id = ?', cardId, messageId); if (result.changes !== 1) throw new Error('That thought is no longer linked to this card.'); },
    async addMessagesToCard(cardId: string, messageIds: string[]) {
      if (!messageIds.length) return 0; let added = 0; const now = Date.now();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const card = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM cards WHERE id = ? AND archived_at IS NULL', cardId);
        if (!card) throw new Error('That card is no longer available.');
        const next = await transaction.getFirstAsync<{ position: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM card_messages WHERE card_id = ?', cardId);
        for (const [index, messageId] of messageIds.entries()) {
          const message = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM messages WHERE id = ? AND archived_at IS NULL AND deleted_at IS NULL', messageId);
          if (!message) continue;
          const result = await transaction.runAsync('INSERT OR IGNORE INTO card_messages (card_id, message_id, position) VALUES (?, ?, ?)', cardId, messageId, (next?.position ?? 0) + index);
          added += result.changes;
        }
        await transaction.runAsync('UPDATE cards SET updated_at = ? WHERE id = ?', now, cardId);
      }); return added;
    },
    async archiveCard(cardId: string) { const now = Date.now(); const result = await database.runAsync('UPDATE cards SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL', now, now, cardId); if (result.changes !== 1) throw new Error('That card is no longer available.'); },
    async deleteCard(cardId: string) { await database.withExclusiveTransactionAsync(async (transaction) => { await transaction.runAsync('DELETE FROM card_messages WHERE card_id = ?', cardId); const result = await transaction.runAsync('DELETE FROM cards WHERE id = ?', cardId); if (result.changes !== 1) throw new Error('That card is no longer available.'); }); },
  };
}
