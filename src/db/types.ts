export type MessageType = 'text' | 'photo' | 'video' | 'audio' | 'file';

export interface Message {
  id: string; text: string | null; type: MessageType; createdAt: number; updatedAt: number;
  archivedAt: number | null; pinned: boolean; deletedAt: number | null; attachments: Attachment[];
  organization?: { boardId: string; boardName: string; columnName: string } | null;
}

// The fields every attachment-shaped thing has in common, regardless of what it's
// attached to — AttachmentContent (message-row.native.tsx) renders off this shape
// alone, so both a message's Attachment and a card's CardAttachment can share that
// one rendering/viewer implementation.
export interface AttachmentLike {
  id: string; type: MessageType; localUri: string; originalName: string | null;
  mimeType: string | null; size: number | null; duration: number | null; width: number | null;
  height: number | null; createdAt: number;
}

export interface Attachment extends AttachmentLike { messageId: string; }

// A file the user attached directly inside Card Details — supporting material for
// the card, not a copy of (or replacement for) the original linked thought's own
// "source" attachment. Deliberately narrower than MessageType: card attachments are
// always photo/video/file, never audio or text.
export interface CardAttachment extends Omit<AttachmentLike, 'type'> {
  type: 'photo' | 'video' | 'file';
  cardId: string;
  updatedAt: number;
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
