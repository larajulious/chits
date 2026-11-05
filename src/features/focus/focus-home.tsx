import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PaperCard, PaperTab, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { MascotStage } from '@/components/mascot/mascot-stage';
import { AppHeader, HeaderIcon, Icon, IconButton, Screen } from '@/components/ui/primitives';
import { SearchField } from '@/components/ui/search-field';
import { createFocusRepository } from '@/db/focus-repository';
import { listNoteCandidates } from '@/db/repositories';
import type { SpaceCandidate } from '@/db/types';
import { useMascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { loadCardsFocus } from '@/services/focus-cards';
import { FOCUS_DEFAULTS } from '@/services/focus-timer';
import { FocusText as AppText } from './focus-ui';
import { focusPickerNotes } from './focus-phase';

/**
 * Focus without a note: the way in from the side panel. A session in progress
 * or waiting to resume goes straight back to it; otherwise this asks what to
 * work on. Nothing starts here, so opening it never touches a session.
 */
export function FocusHome() {
  'use no memo'; // Global i18next copy must refresh when the locale subscription fires.
  useLocale();
  const database = useSQLiteContext();
  const repository = useMemo(() => createFocusRepository(database), [database]);
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const { rowStyle, isRTL } = useDirection();
  const [companion] = useState(() => { try { return repository.preferencesSync().companion; } catch { return FOCUS_DEFAULTS.companion; } });
  const rig = useMascotRig(1, { compact: true, restGaze: -10 });
  const [checked, setChecked] = useState(false);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<SpaceCandidate[] | null>(null);

  useEffect(() => {
    let active = true;
    void loadCardsFocus(database).then((current) => {
      if (!active) return;
      if (current) router.replace({ pathname: '/focus', params: { note: current.session.note_key, session: current.session.id } });
      else setChecked(true);
    }, () => { if (active) setChecked(true); });
    return () => { active = false; };
  }, [database]);
  useEffect(() => {
    if (!checked) return;
    let cancelled = false;
    // A short pause while typing, so each keystroke doesn't query.
    const timer = setTimeout(() => { void listNoteCandidates(database, 'plan', query).then((next) => { if (!cancelled) setNotes(focusPickerNotes(next)); }, () => { if (!cancelled) setNotes([]); }); }, query ? 150 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [checked, database, query]);

  const open = (note: SpaceCandidate) => router.replace({ pathname: '/focus', params: { note: `${note.kind}:${note.id}` } });
  const footer = <View style={[styles.footer, rowStyle]}>
    <PaperTab tilt={-0.4} icon="time-outline" label={tr('focus.history')} accessibilityRole="button" containerStyle={styles.flex} onPress={() => router.push('/focus-history')} />
    <PaperTab tilt={0.4} icon="settings-outline" label={tr('focus.settings')} accessibilityRole="button" containerStyle={styles.flex} onPress={() => router.push('/focus-settings')} />
  </View>;
  return <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <AppHeader actionWidth={100} title={tr('focus.title')} leading={<IconButton label={tr('search.goBack')} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />
    {checked ? <MascotStage rig={rig} title={tr('focus.home.title')} body={tr('focus.home.body')} mascot={companion} hint={tr('focus.hero.hint')} onTap={rig.tap} line={null} footer={footer}>
      <SearchField accessibilityLabel={tr('calendarnotepicker.searchNotes')} value={query} onChangeText={setQuery} placeholder={tr('calendarnotepicker.searchNotesAndCards')} style={styles.search} />
      {notes?.map((note) => <PaperCard key={`${note.kind}:${note.id}`} paper={PAPER_WHITE} accessibilityRole="button" accessibilityLabel={note.context ? `${note.title}, ${note.context}` : note.title} onPress={() => open(note)} style={styles.note}>
        <View style={[styles.row, rowStyle]}>
          <Icon name={note.kind === 'card' ? 'albums-outline' : 'document-text-outline'} size={18} color={PAPER_INK_MUTED} />
          <View style={styles.flex}>
            <AppText numberOfLines={2} style={[handBold, styles.title]}>{note.title}</AppText>
            {note.context ? <AppText numberOfLines={1} style={styles.context}>{note.context}</AppText> : null}
          </View>
          <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={PAPER_INK_MUTED} />
        </View>
      </PaperCard>)}
      {notes && !notes.length ? <AppText style={[styles.empty, { color: desk.inkMuted }]}>{tr(query ? 'calendarnotepicker.noNotesMatchThatSearch' : 'focus.historyHelp')}</AppText> : null}
    </MascotStage> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { gap: 8, alignItems: 'stretch' },
  search: { marginTop: 0 },
  note: { paddingHorizontal: 12, paddingVertical: 8, minHeight: 52, justifyContent: 'center' },
  row: { alignItems: 'center', gap: 8 },
  title: { color: PAPER_INK, fontSize: 16, lineHeight: 21 },
  context: { color: PAPER_INK_MUTED, fontSize: 12, lineHeight: 16 },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 20 },
});
