import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Message } from '@/db/types';
import { DEFAULT_ORGANIZATION_STATE, ORGANIZATION_ENABLED_KEY, ORGANIZATION_STATE_KEY, openingCopy, parseOrganizationState, scoreOrganizationCandidate, SUGGESTION_DELAY_MS, type OrganizationState } from '@/services/chits-organization';

const UPSERT = 'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at';

export function useChitsOrganization(canPresent: () => boolean) {
  const database = useSQLiteContext();
  const [suggestion, setSuggestion] = useState<{ message: Message; intro: boolean; copy: string } | null>(null);
  const stateRef = useRef<OrganizationState>({ ...DEFAULT_ORGANIZATION_STATE });
  const enabledRef = useRef(true);
  const readyRef = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownMessageId = useRef<string | null>(null);
  const canPresentRef = useRef(canPresent);
  useEffect(() => { canPresentRef.current = canPresent; }, [canPresent]);

  useEffect(() => {
    let active = true;
    readyRef.current = database.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings WHERE key IN (?, ?)', ORGANIZATION_ENABLED_KEY, ORGANIZATION_STATE_KEY)
      .then((rows) => {
        if (!active) return;
        const settings = new Map(rows.map((row) => [row.key, row.value]));
        enabledRef.current = settings.get(ORGANIZATION_ENABLED_KEY) !== 'false';
        stateRef.current = parseOrganizationState(settings.get(ORGANIZATION_STATE_KEY));
      }).catch(() => { enabledRef.current = false; });
    return () => { active = false; generation.current += 1; if (timer.current) clearTimeout(timer.current); };
  }, [database]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', ORGANIZATION_ENABLED_KEY)
      .then((row) => { if (active) enabledRef.current = row?.value !== 'false'; })
      .catch(() => { if (active) enabledRef.current = false; });
    return () => { active = false; };
  }, [database]));

  const persist = useCallback((next: OrganizationState) => {
    stateRef.current = next;
    void database.runAsync(UPSERT, ORGANIZATION_STATE_KEY, JSON.stringify(next), Date.now()).catch(() => undefined);
  }, [database]);
  const cancelPending = useCallback(() => {
    generation.current += 1;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);
  const hide = useCallback(() => { cancelPending(); setSuggestion(null); }, [cancelPending]);
  const confirmShown = useCallback((messageId: string) => {
    if (!suggestion || suggestion.message.id !== messageId || shownMessageId.current === messageId) return;
    shownMessageId.current = messageId;
    const current = stateRef.current;
    persist({ ...current, introSeen: true, suggestionShownCount: current.suggestionShownCount + 1 });
  }, [persist, suggestion]);
  const dismiss = useCallback(() => {
    if (!suggestion) return;
    confirmShown(suggestion.message.id);
    hide();
    persist({ ...stateRef.current, dismissCount: stateRef.current.dismissCount + 1, lastInteraction: Date.now() });
  }, [confirmShown, hide, persist, suggestion]);
  const onSent = useCallback(async (message: Message) => {
    cancelPending();
    if (suggestion) setSuggestion(null);
    const score = scoreOrganizationCandidate(message);
    if (score < 1) return;
    const token = generation.current;
    await readyRef.current;
    if (generation.current !== token || !enabledRef.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (generation.current !== token || !canPresentRef.current || !canPresentRef.current() || !enabledRef.current) return;
      const current = stateRef.current;
      setSuggestion({ message, intro: !current.introSeen, copy: openingCopy(current) });
    }, SUGGESTION_DELAY_MS);
  }, [cancelPending, suggestion]);
  return { suggestion, onSent, dismiss, hide, confirmShown };
}
