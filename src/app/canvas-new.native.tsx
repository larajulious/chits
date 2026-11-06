import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { View } from 'react-native';
import { AppHeader, HeaderIcon, IconButton, EmptyState, Button } from '@/components/ui/primitives';
import { CanvasPage } from '@/features/whiteboard/presentation';
import { ChitsLoader } from '@/components/ui/chits-loader';
import { newCanvas } from '@/features/whiteboard/document';
import { whiteboards } from '@/features/whiteboard/repository';

export default function NewCanvasScreen() {
  const db = useSQLiteContext(), repo = useMemo(() => whiteboards(db), [db]);
  const [doc] = useState(newCanvas), [attempt, setAttempt] = useState(0), [error, setError] = useState(false);
  const creation = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let alive = true;
    creation.current ??= repo.save(doc);
    void creation.current.then(() => {
      if (alive) router.replace({ pathname: '/canvas', params: { id: doc.id } });
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [repo, doc, attempt]);
  if (!error) return <ChitsLoader fullscreen label="Creating canvas…" />;
  return <CanvasPage header={<AppHeader title="New Canvas" leading={<IconButton label="Back" onPress={() => router.back()}><HeaderIcon name="chevron-back" size={22} /></IconButton>} />}>
    <EmptyState title="Let's try that again" description="We couldn't create your canvas. Your existing canvases are safe." />
    <View style={{ padding: 24 }}><Button label="Try again" onPress={() => { creation.current = null; setError(false); setAttempt(value => value + 1); }} /></View>
  </CanvasPage>;
}
