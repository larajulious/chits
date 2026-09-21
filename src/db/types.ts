export type MessageType = 'text' | 'photo' | 'video' | 'audio' | 'file';

export interface Message {
  id: string; text: string | null; type: MessageType; createdAt: number; updatedAt: number;
  archivedAt: number | null; pinned: boolean; deletedAt: number | null; attachments: Attachment[];
  organization?: { boardId: string; boardName: string; columnName: string } | null;
}

export interface Attachment {
  id: string; messageId: string; type: MessageType; localUri: string; originalName: string | null;
  mimeType: string | null; size: number | null; duration: number | null; width: number | null;
  height: number | null; createdAt: number;
}

export interface Board {
  id: string; name: string; icon: string | null; accent: string | null; createdAt: number;
  updatedAt: number; archivedAt: number | null; showColumnNavigator: boolean;
}

export interface PageOptions { limit?: number; offset?: number; }
export interface TimelineCursor { createdAt: number; sortId: string; }
export interface TimelinePageOptions { limit?: number; before?: TimelineCursor | null; }

export const CHAT_TIMELINE_EVENT_TYPES = ['board_created', 'column_created'] as const;
export type TimelineEventType = typeof CHAT_TIMELINE_EVENT_TYPES[number];
export interface TimelineEvent { id: string; type: TimelineEventType; createdAt: number; relatedMessageId: string | null; relatedCardId: string | null; relatedBoardId: string | null; metadata: Record<string, unknown> | null; }
export type TimelineItem = { kind: 'message'; message: Message; createdAt: number } | { kind: 'event'; event: TimelineEvent; createdAt: number };
export interface TimelinePage { items: TimelineItem[]; hasMore: boolean; nextCursor: TimelineCursor | null; }
