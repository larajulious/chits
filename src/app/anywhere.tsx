import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { BackHeader, EmptyState, LoadingState, Screen } from '@/components/ui/primitives';

/** Widget URLs carry only stable identifiers. Recheck eligibility after every tap:
 * old launcher snapshots must never reopen archived, deleted or hidden notes. */
export default function AnywhereRoute() {
  useLocale();
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const database = useSQLiteContext();
  const key = `${kind}:${id}`;
  const [result, setResult] = useState<{ key: string; valid: boolean } | null>(null);
  const validParams = typeof id === 'string' && id.length > 0 && id.length <= 200 && (kind === 'thought' || kind === 'card');
  const status = !validParams ? 'missing' : result?.key === key ? result.valid ? 'valid' : 'missing' : 'loading';
  useEffect(() => {
    let current = true;
    if (!validParams || !id) return;
    const query = kind === 'thought'
      ? 'SELECT id FROM messages WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL AND is_hidden_content = 0'
      : `SELECT c.id FROM cards c JOIN boards b ON b.id = c.board_id WHERE c.id = ? AND c.archived_at IS NULL AND b.archived_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM card_messages cm JOIN messages m ON m.id = cm.message_id WHERE cm.card_id = c.id AND m.is_hidden_content = 1)`;
    void database.getFirstAsync(query, id).then(row => {
      if (!current) return;
      if (!row) { setResult({ key, valid: false }); return; }
      // Reuse an existing destination in the stack, including repeated taps.
      if (kind === 'card') router.dismissTo({ pathname: '/card/[id]', params: { id, fromWidget: '1' } });
      else router.dismissTo({ pathname: '/card/edit-content', params: { messageId: id, autoFocus: '0', fromWidget: '1' } });
    }).catch(() => { if (current) setResult({ key, valid: false }); });
    return () => { current = false; };
  }, [database, id, kind, key, validParams]);
  if (status === 'loading') return <LoadingState />;
  return <Screen><BackHeader title={tr('anywhere.brand')} onBack={() => router.replace('/chat')} /><EmptyState title={tr('chat.thatThoughtIsNoLongerAvailableInChat')} description={tr('anywhere.description')} /></Screen>;
}
