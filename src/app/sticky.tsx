import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { BackHeader, EmptyState, LoadingState, Screen } from '@/components/ui/primitives';
import { PaperDesk, useDesk } from '@/components/desk/paper-desk';
import { resolveSpaceId } from '@/constants/spaces';
import { createBoardRepository, createSpaceRepository } from '@/db/repositories';
import { cardNoteRoute } from '@/services/card-note-route';

/**
 * Where a Sticky Notes widget's tap lands. `?space=` opens that Space in
 * Chits. `?kind=&id=` opens one of its notes, rechecked every time so a
 * stale widget never reopens a deleted or archived note: in the existing
 * editor, or for a note hidden in Chat through Chits' own reveal (Card
 * Details, or Chat for a thought).
 */
export default function StickyRoute() {
  useLocale();
  const { kind, id, space } = useLocalSearchParams<{ kind?: string; id?: string; space?: string }>();
  const database = useSQLiteContext();
  const desk = useDesk();
  const spaceId = resolveSpaceId(space);
  const key = `${kind}:${id}:${spaceId}`;
  const [result, setResult] = useState<{ key: string; valid: boolean } | null>(null);
  const validNote = typeof id === 'string' && id.length > 0 && id.length <= 200 && (kind === 'thought' || kind === 'card');
  const status = !validNote && !spaceId ? 'missing' : result?.key === key ? result.valid ? 'valid' : 'missing' : 'loading';
  useEffect(() => {
    let current = true;
    if (spaceId) {
      // Spaces opens on the saved Space and rereads it when it comes back into view.
      void createSpaceRepository(database).setSelectedSpace(spaceId)
        .catch(() => undefined)
        .then(() => { if (current) router.dismissTo({ pathname: '/spaces', params: { spaceId } }); });
      return () => { current = false; };
    }
    if (!validNote || !id) return;
    const query = kind === 'thought'
      ? 'SELECT is_hidden_content AS hidden FROM messages WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL'
      : 'SELECT 0 AS hidden FROM cards c JOIN boards b ON b.id = c.board_id WHERE c.id = ? AND c.archived_at IS NULL AND b.archived_at IS NULL';
    void database.getFirstAsync<{ hidden: number }>(query, id).then(async (row) => {
      if (!current) return;
      if (!row) { setResult({ key, valid: false }); return; }
      // Reuse an existing destination in the stack, including repeated taps.
      if (kind === 'card') {
        const route = await cardNoteRoute(createBoardRepository(database), id, { fromWidget: '1' });
        if (current) router.dismissTo(route);
      } else if (row.hidden) router.dismissTo({ pathname: '/chat', params: { messageId: id } });
      else router.dismissTo({ pathname: '/card/edit-content', params: { messageId: id, autoFocus: '0', fromWidget: '1' } });
    }).catch(() => { if (current) setResult({ key, valid: false }); });
    return () => { current = false; };
  }, [database, id, kind, key, spaceId, validNote]);
  if (status === 'loading') return <LoadingState />;
  return <Screen style={{ backgroundColor: desk.desk }}>
    <BackHeader title={tr('stickyWidget.name')} onBack={() => router.replace('/chat')} />
    <PaperDesk><EmptyState title={tr('stickyWidget.unavailable')} description={tr('stickyWidget.unavailableHint')} /></PaperDesk>
  </Screen>;
}
