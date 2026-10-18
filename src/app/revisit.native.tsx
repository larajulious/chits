import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, EmptyState, HeaderIcon, Icon, IconButton, Screen, Surface } from '@/components/ui/primitives';
import { SearchField } from '@/components/ui/search-field';
import { ChitsLoader } from '@/components/ui/chits-loader';
import { spacing } from '@/constants/theme';
import { CHITS_REVISIT_ENABLED } from '@/constants/revisit';
import { createRevisitRepository, type CompletionPlan, type Relationship } from '@/db/revisit-repository';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import { subscribeToNoteChanges } from '@/services/note-changes';
import { subscribeToReminderChanges, requestReminderSync } from '@/services/reminders';
import { DAY, keywords, pairKey, type ConnectionSuggestion, type NoteKey, type RevisitNote } from '@/services/revisit-engine';
import { getNoteConnections, getRevisitReport, parseNoteKey, type RevisitReport } from '@/services/revisit-service';
import RevisitUnavailable from '@/features/revisit/unavailable';
import { RevisitAction as Action, RevisitActions as CardActions, RevisitBody as CardBody, RevisitCaption as Caption, RevisitEmpty as InlineEmpty, RevisitFooter as CardFooter, RevisitHeading as Heading, RevisitMore as More, RevisitNoteContent as NoteContent, RevisitPaper as Paper, RevisitText as AppText, RevisitTitle as CardTitle } from '@/features/revisit/revisit-components';

function ReviewHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <AppHeader title={title} subtitle={subtitle} leading={<IconButton label="Go back" onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />;
}

function RevisitExperience() {
  const database = useSQLiteContext();
  const repository = useMemo(() => createRevisitRepository(database), [database]);
  const { tokens, styleTokens, styleColors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const columns = width < 350 || fontScale >= 1.3 ? 1 : 2;
  const tileWidth = (width - spacing.md * 2 - (columns - 1) * 12) / columns;
  const { confirm, actionSheet } = useAppDialog();
  const params = useLocalSearchParams<{ note?: string; a?: string; b?: string; pick?: string; browse?: string }>();
  const noteKey = parseNoteKey(params.note), aKey = parseNoteKey(params.a), bKey = parseNoteKey(params.b), pickKey = parseNoteKey(params.pick);
  const [report, setReport] = useState<RevisitReport | null>(null);
  const [links, setLinks] = useState<Relationship[]>([]);
  const [noteConnections, setNoteConnections] = useState<ConnectionSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [connectedLimit, setConnectedLimit] = useState(20);
  const deferredSearch = useDeferredValue(search);
  const byKey = useMemo(() => new Map(report?.notes.map((note) => [note.key, note]) ?? []), [report]);
  const candidates = useMemo(() => {
    if (!pickKey && !params.browse) return [];
    const query = deferredSearch.trim().normalize('NFKC').toLowerCase();
    return (report?.notes ?? []).filter((item) => item.key !== pickKey && (params.browse !== 'excluded' || item.excluded) && `${item.title} ${item.text}`.normalize('NFKC').toLowerCase().includes(query));
  }, [deferredSearch, params.browse, pickKey, report]);
  const mounted = useRef(true);
  const operationLock = useRef(false);
  const sessionRef = useRef<{ reviews: Set<string>; connections: Set<string> } | null>(null);
  const [session, setSession] = useState<{ reviews: Set<string>; connections: Set<string> } | null>(null);
  const request = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async () => {
    const generation = ++request.current;
    setRefreshing(true);
    try {
      const next = await getRevisitReport(database);
      const nextLinks = await repository.relationships();
      const focusedConnections = noteKey ? await getNoteConnections(database, noteKey) : [];
      if (!mounted.current || request.current !== generation) return;
      if (!sessionRef.current) {
        sessionRef.current = { reviews: new Set(next.reviews.map((item) => item.note.key)), connections: new Set(next.connections.map((item) => pairKey(item.a.key, item.b.key))) };
        setSession(sessionRef.current);
      }
      setReport(next); setLinks(nextLinks); setNoteConnections(focusedConnections); setError(null);
    } catch { if (mounted.current && request.current === generation) { setReport(null); setError('Revisit could not load your notes. Please try again.'); } }
    finally { if (mounted.current && request.current === generation) setRefreshing(false); }
  }, [database, noteKey, repository]);
  useFocusEffect(useCallback(() => {
    void (async () => {
      for (const key of [noteKey, aKey, bKey]) if (key) await repository.opened(key);
      await load();
    })().catch(() => { if (mounted.current) setError('This note could not be opened. Try again.'); });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void load(), 150); };
    const notes = subscribeToNoteChanges(refresh);
    const reminders = subscribeToReminderChanges(refresh);
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    const expiry = setInterval(refresh, 60_000);
    return () => { clearTimeout(timer); clearInterval(expiry); notes(); reminders(); foreground.remove(); request.current++; };
  }, [aKey, bKey, load, noteKey, repository]));

  const run = async (operation: () => Promise<unknown>) => {
    if (operationLock.current) return;
    operationLock.current = true; setBusy(true); setError(null);
    try { await operation(); await load(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'This action could not be saved. Try again.'); }
    finally { operationLock.current = false; if (mounted.current) setBusy(false); }
  };
  const openOriginal = (note: RevisitNote, revisit = false) => void run(async () => {
    const current = await repository.get(note.key);
    if (!current) throw new Error('This note is no longer available.');
    if (revisit) await repository.review(note.key, 'revisit');
    else await repository.opened(note.key);
    const id = note.key.slice(note.key.indexOf(':') + 1);
    if (note.key.startsWith('card:')) router.navigate({ pathname: '/card/[id]', params: { id } });
    else router.push({ pathname: '/card/edit-content', params: { messageId: id, autoFocus: '0' } });
  });
  const snooze = (note: RevisitNote) => actionSheet({ title: 'Remind later', message: 'Hide this suggestion in Chits until:', options: [1, 7, 30].map((days) => ({ label: days === 1 ? 'Tomorrow' : `In ${days} days`, onPress: () => { void run(() => repository.review(note.key, 'snooze', Date.now() + days * DAY)); } })) });
  const markDone = async (note: RevisitNote) => {
    const preview: { plan: CompletionPlan | null } = { plan: null };
    await run(async () => {
      const plan = await repository.completionPlan(note.key);
      if (!plan.count) throw new Error('This checklist is already complete.');
      preview.plan = plan;
    });
    // Release the interaction lock before presenting the confirmation so even
    // an immediate confirm tap performs the checked transaction.
    const plan = preview.plan;
    if (plan && mounted.current) confirm({ title: 'Complete checklist?', message: `Mark all ${plan.count} remaining items in ${note.title} complete? You can uncheck items in the original note.`, confirmText: `Complete ${plan.count} items`, onConfirm: () => run(() => repository.complete(plan)) });
  };
  const archive = (note: RevisitNote) => confirm({ title: 'Archive note?', message: 'You can restore it from Archive. Its content and connections will be kept.', confirmText: 'Archive', onConfirm: () => run(async () => {
    const id = note.key.slice(note.key.indexOf(':') + 1);
    if (note.key.startsWith('card:')) await createBoardRepository(database).archiveCard(id);
    else await createMessageRepository(database).archive(id);
    void requestReminderSync();
  }) });
  const showNote = (key: NoteKey, replace = false) => {
    const href = { pathname: '/revisit' as const, params: { note: key } };
    if (replace) router.replace(href); else router.push(href);
  };
  const compare = (a: NoteKey, b: NoteKey) => router.push({ pathname: '/revisit', params: { a, b } });
  const connected = (a: NoteKey, b: NoteKey) => links.find((link) => (link.note_a === a && link.note_b === b) || (link.note_a === b && link.note_b === a));
  const noteActions = (item: RevisitReport['reviews'][number]) => actionSheet({
    title: item.note.title,
    options: [
      { label: 'Remind later', icon: 'time-outline', onPress: () => snooze(item.note) },
      item.kind === 'worth'
        ? { label: 'Archive', icon: 'archive-outline' as const, onPress: () => archive(item.note) }
        : { label: 'Mark done', icon: 'checkmark-circle-outline' as const, onPress: () => { void markDone(item.note); } },
      ...(item.kind === 'progress' ? [{ label: 'Mark inactive', icon: 'pause-circle-outline' as const, onPress: () => confirm({ title: 'Mark this plan inactive?', message: 'This stops suggestions for the note. Your checkboxes stay as you left them. You can include it again in Connected notes.', confirmText: 'Mark inactive', onConfirm: () => run(() => repository.review(item.note.key, 'exclude')) }) }] : []),
      { label: 'Not relevant', icon: 'close-outline', onPress: () => { void run(() => repository.review(item.note.key, 'dismiss')); } },
      { label: 'Connections', icon: 'link-outline', onPress: () => showNote(item.note.key) },
    ],
  });
  const connectionCard = (connection: ConnectionSuggestion) => (
    <Paper note={connection.a} id={pairKey(connection.a.key, connection.b.key)}>
      <CardBody>
        <CardTitle>{connection.a.title}</CardTitle>
        <Caption>{connection.a.boardName ?? 'Unorganized'}</Caption>
        <View style={styles.connectionDivider}><Icon name="link-outline" size={15} color={tokens.textMuted} /><View style={[styles.divider, { backgroundColor: tokens.borderSubtle }]} /></View>
        <CardTitle>{connection.b.title}</CardTitle>
        <Caption>{connection.b.boardName ?? 'Unorganized'}</Caption>
        <Caption>Shared terms: {connection.terms.join(', ')}</Caption>
      </CardBody>
      <CardActions>
        <Action primary disabled={busy} onPress={() => void run(() => repository.link(connection.a.key, connection.b.key))}>Link notes</Action>
        <Action disabled={busy} onPress={() => compare(connection.a.key, connection.b.key)}>Compare</Action>
        <More disabled={busy} label="Connection actions" onPress={() => actionSheet({ title: 'Possible connection', options: [{ label: 'Not related', icon: 'close-outline', onPress: () => { void run(() => repository.reject(connection.a.key, connection.b.key)); } }] })} />
      </CardActions>
    </Paper>
  );

  const headerTitle = params.browse ? (params.browse === 'excluded' ? 'Excluded notes' : 'Your notes') : pickKey ? 'Link a note' : aKey && bKey ? 'Compare notes' : noteKey ? 'Connected notes' : 'Revisit';
  if (!report) return <Screen><ReviewHeader title={headerTitle} />{error ? <View style={styles.content}><AppText accessibilityRole="alert">{error}</AppText><Action onPress={() => void load()}>Try again</Action></View> : <ChitsLoader label="Finding notes to revisit…" />}</Screen>;
  const note = noteKey ? byKey.get(noteKey) : null;
  const a = aKey ? byKey.get(aKey) : null, b = bKey ? byKey.get(bKey) : null;
  const unavailable = (noteKey && !note) || (aKey && bKey && (!a || !b)) || (pickKey && !byKey.has(pickKey));
  const errorBanner = error ? <View style={[styles.error, { borderColor: tokens.danger }]}><AppText accessibilityRole="alert" style={[styles.helper, { color: tokens.danger }]}>{error}</AppText></View> : null;
  if (unavailable) return <Screen><ReviewHeader title={headerTitle} /><EmptyState title="Note unavailable" description="It may have been archived, hidden, organized, or deleted." /></Screen>;
  if (pickKey || params.browse) {
    return <Screen>
      <ReviewHeader title={headerTitle} subtitle={`${candidates.length} notes`} />
      <View style={styles.searchArea}>
        {errorBanner}
        <SearchField accessibilityLabel={pickKey ? 'Search notes to link' : 'Search notes'} placeholder="Search your notes" value={search} onChangeText={setSearch} />
      </View>
      <FlashList key={`revisit-notes-${columns}`} masonry numColumns={columns} optimizeItemArrangement={styleTokens.card.tinted} data={candidates} keyExtractor={(item) => item.key}
        contentContainerStyle={styles.browseContent} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<EmptyState pose="search" title="No notes found" description="Try another search or create another note." style={styles.listEmpty} />}
        renderItem={({ item }) => {
          const alreadyLinked = !!(pickKey && connected(pickKey, item.key));
          const open = () => pickKey ? void run(async () => { await repository.link(pickKey, item.key); router.back(); }) : showNote(item.key);
          return <View style={styles.browseCell}><Paper note={item} onPress={busy || alreadyLinked ? undefined : open}
            label={`${pickKey ? alreadyLinked ? 'Already connected' : 'Link note' : 'Open connections'}. ${item.title}${item.total ? `. ${item.completed} of ${item.total} completed` : ''}`}>
            <NoteContent note={item} previewLines={3} />
            <CardFooter note={item}>{alreadyLinked ? <Icon name="checkmark-circle-outline" size={18} color={tokens.textMuted} /> : <View style={styles.tileArrow}><Icon name={pickKey ? 'add-outline' : 'chevron-forward'} size={17} color={tokens.textMuted} /></View>}</CardFooter>
          </Paper></View>;
        }} />
    </Screen>;
  }
  const visibleReviews = report.reviews.filter((item) => session?.reviews.has(item.note.key));
  const visibleConnections = report.connections.filter((item) => session?.connections.has(pairKey(item.a.key, item.b.key)));
  const noteLinks = note ? links.filter((link) => link.note_a === note.key || link.note_b === note.key) : [];
  const focusedConnections = note ? noteConnections.filter((pair) => pair.a.key === note.key || pair.b.key === note.key) : [];
  const sharedTerms = a && b ? keywords(`${a.title}\n${a.text}`).filter((term) => keywords(`${b.title}\n${b.text}`).includes(term)).slice(0, 5) : [];
  return <Screen><ReviewHeader title={headerTitle} subtitle={note ? `${noteLinks.length} links` : a && b ? undefined : `${visibleReviews.length} notes`} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {errorBanner}
      {a && b ? <>
        <AppText variant="paragraph" style={[styles.helper, { color: tokens.textSecondary }]}>Compare the dates and words. A newer update may still need checking.</AppText>
        {[a, b].map((source) => <Paper key={source.key} note={source}>
          <NoteContent note={source} dates moreRecent={source.updatedAt > (source === a ? b : a).updatedAt} />
          <CardFooter note={source}><Action disabled={busy} label={`Open ${source.title}`} onPress={() => openOriginal(source)}>Open note</Action></CardFooter>
        </Paper>)}
        <Heading>Connection</Heading>
        <Surface fill={styleColors.controlFill} border={tokens.borderSubtle} radius={styleTokens.radius.control} outline={StyleSheet.hairlineWidth} edge={false} style={styles.panel}>
          <View style={styles.summaryRow}><Icon name="link-outline" size={18} color={tokens.textSecondary} /><AppText weight="600" style={styles.label}>{connected(a.key, b.key) ? `Connected · ${connected(a.key, b.key)!.relationship_type}` : 'These notes are not linked'}</AppText></View>
          <AppText style={[styles.helper, { color: tokens.textSecondary }]}>{sharedTerms.length ? `Shared terms: ${sharedTerms.join(', ')}` : 'No distinctive overlap found.'}</AppText>
          <Action primary={!connected(a.key, b.key)} disabled={busy} onPress={() => void run(() => connected(a.key, b.key) ? repository.unlink(a.key, b.key) : repository.link(a.key, b.key))}>{connected(a.key, b.key) ? 'Remove connection' : 'Link notes'}</Action>
        </Surface>
      </> : note ? <>
        <Paper note={note}><NoteContent note={note} dates /><CardFooter note={note}><Action disabled={busy} onPress={() => openOriginal(note)}>Open original</Action></CardFooter></Paper>
        <View style={styles.section}>
          <Heading count={noteLinks.length}>Connected thoughts</Heading>
          {noteLinks.length ? <View style={styles.grid}>
            {noteLinks.slice(0, connectedLimit).map((link) => {
              const target = byKey.get(link.note_a === note.key ? link.note_b : link.note_a);
              return <View key={pairKey(link.note_a, link.note_b)} style={{ width: tileWidth }}><Paper note={target} id={pairKey(link.note_a, link.note_b)}>
                {target ? <NoteContent note={target} previewLines={3} /> : <CardBody><CardTitle>Archived or unavailable note</CardTitle></CardBody>}
                <CardBody><Caption>{link.relationship_type === 'follow-up' ? 'Follow-up' : link.relationship_type === 'reference' ? 'Reference' : 'Related'}</Caption></CardBody>
                <CardActions>{target ? <Action disabled={busy} onPress={() => showNote(target.key, true)}>Open</Action> : null}
                  <More disabled={busy} label={`Connection actions for ${target?.title ?? 'unavailable note'}`} onPress={() => actionSheet({ title: target?.title ?? 'Connection', options: [
                    ...(target ? [{ label: 'Compare notes', icon: 'documents-outline' as const, onPress: () => compare(note.key, target.key) }] : []),
                    { label: 'Change type', icon: 'link-outline', onPress: () => actionSheet({ title: 'Connection type', options: (['related', 'follow-up', 'reference'] as const).map((type) => ({ label: type === 'follow-up' ? 'Follow-up' : type === 'reference' ? 'Reference' : 'Related', onPress: () => { void run(() => repository.link(link.note_a, link.note_b, type)); } })) }) },
                    { label: 'Remove link', icon: 'unlink-outline', onPress: () => { void run(() => repository.unlink(link.note_a, link.note_b)); } },
                  ] })} /></CardActions>
              </Paper></View>;
            })}
          </View> : <InlineEmpty icon="link-outline">No connected notes yet.</InlineEmpty>}
          {noteLinks.length > connectedLimit ? <Action disabled={busy} onPress={() => setConnectedLimit((limit) => limit + 20)}>Show more connections</Action> : null}
          <View style={styles.sectionActions}><Action primary disabled={busy} onPress={() => router.push({ pathname: '/revisit', params: { pick: note.key } })}>Link a note</Action></View>
        </View>
        {focusedConnections.length ? <View style={styles.section}><Heading count={focusedConnections.length}>Possible connections</Heading>{focusedConnections.map((connection) => <View key={pairKey(connection.a.key, connection.b.key)} style={styles.connectionSpace}>{connectionCard(connection)}</View>)}</View> : null}
        <Action quiet disabled={busy} onPress={() => void run(() => repository.review(note.key, note.excluded ? 'include' : 'exclude'))}>{note.excluded ? 'Include in suggestions' : 'Exclude from suggestions'}</Action>
      </> : <>
        <Surface fill={styleColors.controlFill} border={tokens.borderSubtle} radius={styleTokens.radius.control} outline={StyleSheet.hairlineWidth} edge={false} style={styles.panel}>
          <View style={styles.preference}><View style={styles.flex}><AppText weight="600" style={styles.label}>Revisit suggestions</AppText><AppText style={[styles.helper, { color: tokens.textSecondary }]}>A fresh look at your saved thoughts</AppText></View>
            <Switch hitSlop={8} accessibilityLabel="Enable Revisit suggestions" value={report.preferences.enabled} disabled={busy} onValueChange={(enabled) => { sessionRef.current = null; void run(() => repository.setPreferences({ ...report.preferences, enabled })); }} trackColor={{ true: tokens.accent, false: tokens.borderSubtle }} thumbColor={tokens.surface} />
          </View>
          <View style={[styles.preference, styles.preferenceBottom, { borderTopColor: tokens.borderSubtle }]}><AppText style={[styles.helper, { color: tokens.textSecondary }]}>Minimum inactivity</AppText><Action quiet disabled={busy} onPress={() => actionSheet({ title: 'Minimum inactivity', options: [7, 14, 30].map((days) => ({ label: `${days} days${report.preferences.inactivityDays === days ? ' · Selected' : ''}`, onPress: () => { sessionRef.current = null; void run(() => repository.setPreferences({ ...report.preferences, inactivityDays: days })); } })) })}>{report.preferences.inactivityDays} days</Action></View>
        </Surface>
        {report.preferences.enabled ? <>
          {(['worth', 'progress'] as const).map((kind) => {
            const suggestions = visibleReviews.filter((item) => item.kind === kind);
            return <View key={kind} style={styles.section}><Heading count={suggestions.length}>{kind === 'worth' ? 'Worth revisiting' : 'Still in progress'}</Heading>
              {suggestions.length ? <View style={styles.grid}>{suggestions.map((item) => <View key={item.note.key} style={{ width: tileWidth }}><Paper note={item.note}>
                <NoteContent note={item.note} previewLines={3} />
                <CardBody><Caption>{item.kind === 'progress' ? item.reason.split(' · ').slice(1).join(' · ') : item.reason}</Caption></CardBody>
                <CardActions><Action primary disabled={busy} label={`${kind === 'progress' ? 'Continue' : 'Revisit'} ${item.note.title}`} onPress={() => openOriginal(item.note, true)}>{kind === 'progress' ? 'Continue' : 'Revisit'}</Action><More disabled={busy} label={`Review actions for ${item.note.title}`} onPress={() => noteActions(item)} /></CardActions>
              </Paper></View>)}</View> : <InlineEmpty icon={kind === 'worth' ? 'refresh-outline' : 'checkbox-outline'}>{kind === 'worth' ? 'Nothing needs a revisit right now.' : 'No stalled checklists right now.'}</InlineEmpty>}
            </View>;
          })}
          <View style={styles.section}><Heading count={visibleConnections.length}>Possible connections</Heading>
            {visibleConnections.length ? visibleConnections.map((connection) => <View key={pairKey(connection.a.key, connection.b.key)} style={styles.connectionSpace}>{connectionCard(connection)}</View>) : <InlineEmpty icon="link-outline">No strong connections to suggest right now.</InlineEmpty>}
          </View>
        </> : <EmptyState title="Suggestions are off" description="Your notes and existing connections are kept. Enable suggestions whenever you want." style={styles.disabledEmpty} />}
        <View style={styles.sectionActions}><Action primary disabled={busy} onPress={() => router.push({ pathname: '/revisit', params: { browse: 'all' } })}>Browse notes</Action><Action disabled={busy || refreshing} onPress={() => { sessionRef.current = null; void load(); }}>New review</Action></View>
        {report.notes.some((item) => item.excluded) ? <Action quiet disabled={busy} onPress={() => router.push({ pathname: '/revisit', params: { browse: 'excluded' } })}>Manage excluded notes</Action> : null}
      </>}
    </ScrollView>
  </Screen>;
}

export default function RevisitScreen() { return CHITS_REVISIT_ENABLED ? <RevisitExperience /> : <RevisitUnavailable />; }
const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: 12, paddingBottom: 36 },
  section: { gap: 4 }, grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  browseContent: { paddingHorizontal: spacing.md - 6, paddingTop: spacing.md, paddingBottom: 36 }, browseCell: { paddingHorizontal: 6, paddingBottom: 12 }, searchArea: { paddingHorizontal: spacing.md, marginBottom: spacing.xs },
  listEmpty: { minHeight: 240, width: '100%' }, disabledEmpty: { minHeight: 160, paddingVertical: 16 },
  panel: { paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  label: { fontSize: 14, lineHeight: 20, flexShrink: 1 }, helper: { fontSize: 12, lineHeight: 18 },
  preference: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  preferenceBottom: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 }, flex: { flex: 1, minWidth: 0 },
  sectionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  connectionSpace: { marginBottom: 8 }, connectionDivider: { flexDirection: 'row', alignItems: 'center', gap: 8 }, divider: { height: StyleSheet.hairlineWidth, flex: 1 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, tileArrow: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  error: { borderWidth: StyleSheet.hairlineWidth, padding: 12, borderRadius: 12 },
});
