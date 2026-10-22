import { countLabel, tr } from '@/localization/runtime';
import { useDirection, useLocale } from '@/localization/provider';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { useStickySurface } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { LabelTape } from '@/components/spaces/label-tape';
import { SegmentedControl, Toast } from '@/components/ui/primitives';
import { DrawerBackground } from './drawer-background';
import { APP_STYLE_NAMES, APP_STYLES, type AppStyle } from '@/constants/style-tokens';
import { spacing } from '@/constants/theme';
import { CHITS_REVISIT_ENABLED } from '@/constants/revisit';
import { createBoardRepository, createSpaceRepository } from '@/db/repositories';
import { getCalendarItems } from '@/features/calendar/calendar-data';
import { subscribeToReminderChanges } from '@/services/reminders';
import { subscribeToSpaceChanges } from '@/services/space-changes';
import { dateFormat } from '@/services/reminder-time';

// Short, restrained transition for a row's fade and collapse on unpin.
const PINNED_TRANSITION = LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity);

type DrawerContextValue = { openDrawer: () => void; closeDrawer: () => void };
type ContextItem = {
  id: string;
  title: string;
  kind: 'board' | 'card';
  boardId: string | null;
  context: string;
  accessibilityContext: string | null;
};
type IconName = ComponentProps<typeof Ionicons>['name'];
type Destination = { label: string; path: '/' | '/spaces/pick' | '/attachments' | '/calendar' | '/archive' | '/settings' | '/onboarding' | '/revisit'; icon: IconName };

const styleOptions = () => APP_STYLES.map((key: AppStyle) => ({ key, label: APP_STYLE_NAMES[key], accessibilityLabel: tr("settings.valueStyle", { value1: APP_STYLE_NAMES[key] }) }));

const DrawerContext = createContext<DrawerContextValue | null>(null);
// True for rows on a Classic card, which supplies their side margin.
const InCardContext = createContext(false);
// Main destinations live in the side panel; Chat remains a floating button.
const spacesDestination: Destination = { get label() { return tr("pick.spaces"); }, path: '/spaces/pick', icon: 'magnet-outline' };
const notesDestination: Destination = { get label() { return tr('index.notes'); }, path: '/', icon: 'reader-outline' };
const calendarDestination: Destination = { get label() { return tr("appdrawer.calendar"); }, path: '/calendar', icon: 'calendar-outline' };
const attachmentsDestination: Destination = { get label() { return tr('attachments.attachments'); }, path: '/attachments', icon: 'attach-outline' };
const archiveDestination: Destination = { get label() { return tr("archive.archive"); }, path: '/archive', icon: 'archive-outline' };
const revisitDestination: Destination = { get label() { return tr("revisit.revisit"); }, path: '/revisit', icon: 'refresh-outline' };
const settingsDestination: Destination = { get label() { return tr("settings.settings"); }, path: '/settings', icon: 'settings-outline' };
const gettingStartedDestination: Destination = { get label() { return tr("appdrawer.gettingStarted"); }, path: '/onboarding', icon: 'compass-outline' };

export function useAppDrawer() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const context = useContext(DrawerContext);
  if (!context) throw new Error('useAppDrawer must be used within AppDrawerProvider.');
  return context;
}

function isDestinationActive(pathname: string, destination: Destination) {
  // Spaces is two screens (the board and Pick a Space); either one is "here".
  if (destination.path === '/spaces/pick') return pathname === '/spaces' || pathname.startsWith('/spaces/');
  return pathname === destination.path;
}

function DrawerIcon({ name, color }: { name: IconName; color: string }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return (
    <View accessible={false} style={styles.iconSlot}>
      <Icon name={name} size={21} color={color} />
    </View>
  );
}

function NavigationRow({ destination, pathname, close, badge = 0, badgeNoun = 'note' }: { destination: Destination; pathname: string; close: () => void; badge?: number; badgeNoun?: 'note' | 'reminder' }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle } = useDirection();
  const router = useRouter();
  const { tokens, styleTokens, styleColors } = useTheme();
  const sticky = useStickySurface();
  const inCard = useContext(InCardContext);
  const active = isDestinationActive(pathname, destination);
  // Sticky: the current screen is an outlined accent tile, like the nav's active pill.
  const tile = active && styleTokens.outline.width > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${destination.label}${badge ? `, ${countLabel(badgeNoun, badge)}` : ''}${active ? tr("appdrawer.currentScreen") : ''}`}
      accessibilityState={{ selected: active }}
      onPress={() => {
        close();
        router.navigate(destination.path);
      }}
      style={({ pressed }) => [
        styles.item, rowStyle, inCard && styles.inCard,
        active && { backgroundColor: tokens.accentSoft },
        { borderRadius: styleTokens.radius.control - 2 },
        active && sticky({ fill: styleColors.accentFill, radius: styleTokens.radius.control, edge: false }),
        pressed && styles.pressed,
      ]}>
      <DrawerIcon name={destination.icon} color={tile ? styleColors.onAccent : active ? tokens.accentStrong : tokens.textPrimary} />
      <AppText style={[styles.itemText, { color: tile ? styleColors.onAccent : tokens.textPrimary }, active && styles.itemTextSelected]}>{destination.label}</AppText>
      {/* A tiny red label-maker tape, like the ones in Spaces; the count is in the row's label. */}
      {badge > 0 ? <LabelTape text={String(badge)} variant="red" size="sm" rotation={-3} decorative style={styles.badge} /> : null}
    </Pressable>
  );
}

// One row shape for both Pinned and Recent so the two lists read as the same
// kind of thing; only Pinned rows get the trailing unpin button.
function ShortcutRow({ item, close, onUnpin }: { item: ContextItem; close: () => void; onUnpin?: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const router = useRouter();
  const { tokens, styleTokens, styleColors } = useTheme();
  const sticky = useStickySurface();
  const inCard = useContext(InCardContext);
  const isBoard = item.kind === 'board';
  const accessibilityLabel = isBoard
    ? tr('appdrawer.boardShortcut', { title: item.title })
    : tr('appdrawer.cardShortcut', { title: item.title, context: item.context });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        close();
        if (isBoard) router.push({ pathname: '/board/[id]', params: { id: item.id } });
        else router.push({ pathname: '/card/[id]', params: { id: item.id } });
      }}
      style={({ pressed }) => [styles.contextRow, inCard && styles.inCard, { borderRadius: styleTokens.radius.control - 2 }, onUnpin && styles.pinnedRow, pressed && styles.pressed]}>
      <View accessible={false} style={[styles.contextIcon, { borderRadius: styleTokens.radius.control - 3, backgroundColor: isBoard ? tokens.accentSoft : tokens.surfaceElevated, borderColor: isBoard ? tokens.accentBorder : tokens.borderSubtle }, sticky({ fill: isBoard ? styleColors.cardTint : styleColors.controlFill, radius: styleTokens.radius.control - 4, edge: false })]}>
        <Icon name={isBoard ? 'grid-outline' : 'document-text-outline'} size={17} color={styleTokens.outline.width ? (isBoard ? styleColors.cardInk : tokens.textSecondary) : isBoard ? tokens.accentStrong : tokens.textSecondary} />
      </View>
      <View style={styles.contextCopy}>
        <AppText numberOfLines={1} ellipsizeMode="tail" style={[styles.contextTitle, { color: tokens.textPrimary }]}>{item.title}</AppText>
        <AppText numberOfLines={1} ellipsizeMode="tail" style={[styles.contextMeta, { color: tokens.textSecondary }]}>{isBoard ? tr('id.board') : item.context}</AppText>
      </View>
      {/* Nested Pressable, not the row's own onPress — stopPropagation keeps this
          from also opening the row underneath it. Neutral color throughout: this
          unpins, it never deletes anything. */}
      {onUnpin ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("appdrawer.removeValueFromPinned", { value1: item.title })}
          hitSlop={10}
          onPress={(event) => { event.stopPropagation(); onUnpin(); }}
          style={({ pressed }) => [styles.unpinButton, pressed && styles.unpinPressed]}>
          <Icon name="close" size={16} color={tokens.textMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

// Classic groups each part of the panel on its own card; Sticky keeps its
// flat list, so there this renders just the rows.
function DrawerCard({ children }: PropsWithChildren) {
  const { tokens, scheme, style, styleTokens } = useTheme();
  if (style !== 'classic') return <>{children}</>;
  return (
    <InCardContext.Provider value>
      <View style={[styles.card, { backgroundColor: scheme === 'dark' ? tokens.surfaceElevated : tokens.surface, borderColor: tokens.borderSubtle, borderRadius: styleTokens.radius.panel }]}>{children}</View>
    </InCardContext.Provider>
  );
}

const MINUTE = 60_000;
// Today's date and time under the title, in the user's language and clock;
// it ticks over on each new minute while the panel is open.
function TodayLine() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(Date.now()); timer = setTimeout(tick, MINUTE - (Date.now() % MINUTE)); };
    timer = setTimeout(tick, MINUTE - (Date.now() % MINUTE));
    return () => clearTimeout(timer);
  }, []);
  const day = dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const time = dateFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(now);
  return <AppText numberOfLines={1} style={[styles.today, { color: tokens.textSecondary }]}>{`${day} · ${time}`}</AppText>;
}

// Shared header row for every drawer section.
function SectionHeader({ label }: { label: string }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <AppText accessibilityRole="header" style={[styles.sectionLabel, { color: tokens.textMuted }]}>{label}</AppText>
    </View>
  );
}

function DrawerBackdrop({ close, darkMode }: { close: () => void; darkMode: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const tint = darkMode ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.30)';
  return <Pressable accessibilityRole="button" accessibilityLabel={tr("appdrawer.dismissNavigation")} onPress={close} style={[styles.backdrop, { backgroundColor: tint }]} />;
}

function RecentSection({ items, close }: { items: ContextItem[]; close: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader label={tr("unorganized.recent")} />
      <DrawerCard>{items.map((item) => <ShortcutRow key={`${item.kind}-${item.id}`} item={item} close={close} />)}</DrawerCard>
    </View>
  );
}

function PinnedSection({ items, close, onUnpin }: { items: ContextItem[]; close: () => void; onUnpin: (item: ContextItem) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader label={tr("appdrawer.pinned")} />
      <DrawerCard>{items.map((item) => <ShortcutRow key={`${item.kind}-${item.id}`} item={item} close={close} onUnpin={() => onUnpin(item)} />)}</DrawerCard>
    </View>
  );
}

function DrawerContent({ close, isOpen }: { close: () => void; isOpen: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const repository = useMemo(() => createBoardRepository(database), [database]);
  const pathname = usePathname();
  const { tokens, styleTokens, styleColors, style, setStyle } = useTheme();
  const sticky = useStickySurface();
  const [pinned, setPinned] = useState<ContextItem[]>([]);
  const [recent, setRecent] = useState<ContextItem[]>([]);
  // Same single source of truth as Chat's own header (app_settings.chat_title) and
  // the Boards header — the drawer must show that title too, not its own hardcoded
  // "Chits" that would drift the moment it's renamed.
  const [appTitle, setAppTitle] = useState('Chits');
  const spaces = useMemo(() => createSpaceRepository(database), [database]);
  const [stuckCount, setStuckCount] = useState(0);
  const [incomingReminderCount, setIncomingReminderCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const loadReminderCount = useCallback(async () => {
    const items = await getCalendarItems(database);
    setIncomingReminderCount(items.filter((item) => item.scheduledAt >= Date.now()).length);
  }, [database]);

  const load = useCallback(async () => {
    const [nextPinned, nextRecent, titleRow, spaceCounts] = await Promise.all([
      repository.listPinned(),
      repository.listRecent(),
      database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_title'),
      spaces.counts(),
      loadReminderCount(),
    ]);
    setPinned(nextPinned);
    setStuckCount(Object.values(spaceCounts).reduce((sum, count) => sum + count, 0));
    setRecent(nextRecent);
    setAppTitle(titleRow?.value.trim() || 'Chits');
  }, [database, repository, spaces, loadReminderCount]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, load]);
  // A note stuck on or taken off a space while the drawer is open updates the badge.
  useEffect(() => (isOpen ? subscribeToSpaceChanges(() => { void load(); }) : undefined), [isOpen, load]);
  useEffect(() => {
    if (!isOpen) return;
    const stop = subscribeToReminderChanges(() => { void loadReminderCount(); });
    const clock = setInterval(() => { void loadReminderCount(); }, 60_000);
    return () => { stop(); clearInterval(clock); };
  }, [isOpen, loadReminderCount]);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 1800); return () => clearTimeout(timer); }, [toast]);

  // Same setting as Settings → Appearance → Style; the drawer restyles in place.
  const changeStyle = useCallback((next: AppStyle) => {
    if (next === style) return;
    void Haptics.selectionAsync();
    setStyle(next).catch(() => setToast(tr("appdrawer.styleCouldNotBeSaved")));
  }, [setStyle, style]);

  // Immediately reversible (pin it again elsewhere), so no confirmation — just an
  // optimistic removal with a subtle toast, rolled back only if the write fails.
  const unpinItem = useCallback((item: ContextItem) => {
    LayoutAnimation.configureNext(PINNED_TRANSITION);
    setPinned((current) => current.filter((entry) => !(entry.kind === item.kind && entry.id === item.id)));
    void repository.setPinned(item.kind, item.id, false)
      .then(() => { void Haptics.selectionAsync(); setToast(tr("appdrawer.removedFromPinned")); })
      .catch(() => { void load(); });
  }, [load, repository]);

  // Anything already in Pinned is one tap away there; repeating it under Recent
  // just doubles the list.
  const pinnedKeys = new Set(pinned.map((item) => `${item.kind}-${item.id}`));
  const recentUnpinned = recent.filter((item) => !pinnedKeys.has(`${item.kind}-${item.id}`));
  const hasShortcuts = pinned.length > 0 || recentUnpinned.length > 0;
  const classic = style === 'classic';
  const footer = <>
    <View accessibilityRole="radiogroup" accessibilityLabel={tr("settings.style")} style={[styles.styleToggle, classic && styles.styleToggleClassic]}>
      <SegmentedControl options={styleOptions()} value={style} onChange={changeStyle} />
    </View>
    <DrawerCard>
      <NavigationRow destination={gettingStartedDestination} pathname={pathname} close={close} />
      <NavigationRow destination={settingsDestination} pathname={pathname} close={close} />
    </DrawerCard>
  </>;
  return (
    <SafeAreaView accessibilityViewIsModal style={[styles.drawer, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle }, styleTokens.outline.width ? [{ borderRightWidth: styleTokens.outline.width, borderColor: styleColors.outline }, sticky({ edge: styleTokens.nav.edge, edgeSide: 'right', outline: false })] : null]}>
      <DrawerBackground />
      <View style={styles.top}>
        <View style={styles.titleBlock}>
          <AppText accessibilityRole="header" variant="display" style={[styles.title, { color: tokens.textPrimary }]}>{appTitle}</AppText>
          <TodayLine />
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.drawerContent, classic && styles.drawerContentClassic]}>
        <DrawerCard>
          <NavigationRow destination={notesDestination} pathname={pathname} close={close} />
          <NavigationRow destination={spacesDestination} pathname={pathname} close={close} badge={stuckCount} />
          <NavigationRow destination={calendarDestination} pathname={pathname} close={close} badge={incomingReminderCount} badgeNoun="reminder" />
          <NavigationRow destination={attachmentsDestination} pathname={pathname} close={close} />
          <NavigationRow destination={archiveDestination} pathname={pathname} close={close} />
          {CHITS_REVISIT_ENABLED ? <NavigationRow destination={revisitDestination} pathname={pathname} close={close} /> : null}
        </DrawerCard>
        {hasShortcuts && !classic ? <View style={[styles.divider, { backgroundColor: tokens.borderSubtle }, styleTokens.outline.width ? { height: styleTokens.outline.width, backgroundColor: styleColors.outline } : null]} /> : null}
        <PinnedSection items={pinned} close={close} onUnpin={unpinItem} />
        <RecentSection items={recentUnpinned.slice(0, 5)} close={close} />
        {/* Classic scrolls as one page, with Settings and the rest at its
            foot (pushed to the bottom when the list is short). */}
        {classic ? <View style={styles.footerClassic}>{footer}</View> : null}
      </ScrollView>
      {/* Settings is app chrome, not a place your notes live — it stays pinned
          to the bottom instead of sitting in the list of destinations. */}
      {classic ? null : <View style={[styles.footer, { borderTopColor: tokens.borderSubtle }, styleTokens.outline.width ? { borderTopWidth: styleTokens.outline.width, borderTopColor: styleColors.outline } : null]}>{footer}</View>}
      <Toast message={toast} />
    </SafeAreaView>
  );
}

export function AppDrawerProvider({ children }: PropsWithChildren) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { scheme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { isRTL } = useDirection();
  const drawerWidth = Math.min(windowWidth * 0.78, 340);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => motion.remove();
  }, []);

  const animate = useCallback((toValue: 0 | 1, done?: () => void) => {
    Animated.timing(progress, { toValue, duration: reduceMotion ? 0 : 220, easing: toValue ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => { if (finished) done?.(); });
  }, [progress, reduceMotion]);
  const openDrawer = useCallback(() => {
    if (mounted) return;
    setMounted(true);
    setIsOpen(true);
  }, [mounted]);
  const closeDrawer = useCallback(() => {
    if (!mounted) return;
    setIsOpen(false);
    animate(0, () => {
      setMounted(false);
    });
  }, [animate, mounted]);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (event, gesture) => (isRTL ? event.nativeEvent.pageX > windowWidth - 20 && gesture.dx < -12 : event.nativeEvent.pageX < 20 && gesture.dx > 12) && Math.abs(gesture.dy) < 16,
    onPanResponderRelease: (_, gesture) => { if (isRTL ? gesture.dx < -48 : gesture.dx > 48) openDrawer(); },
  }), [openDrawer, isRTL, windowWidth]);
  const value = useMemo(() => ({ openDrawer, closeDrawer }), [closeDrawer, openDrawer]);

  return (
    <DrawerContext.Provider value={value}>
      <View style={styles.root} {...responder.panHandlers}>{children}</View>
      <Modal transparent visible={mounted} animationType="none" onShow={() => { if (isOpen) animate(1); }} onRequestClose={closeDrawer}>
        <SafeAreaProvider>
          <View style={styles.modal}>
            <Animated.View style={[styles.backdropShell, { opacity: progress }]}>
              <DrawerBackdrop close={closeDrawer} darkMode={scheme === 'dark'} />
            </Animated.View>
            <Animated.View style={[styles.drawerShell, { width: drawerWidth, left: isRTL ? undefined : 0, right: isRTL ? 0 : undefined, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [isRTL ? drawerWidth : -drawerWidth, 0] }) }] }]}>
              <DrawerContent close={closeDrawer} isOpen={isOpen} />
            </Animated.View>
          </View>
        </SafeAreaProvider>
      </Modal>
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  modal: { flex: 1 },
  drawerShell: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  backdropShell: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdrop: { flex: 1 },
  drawer: { flex: 1, borderRightWidth: StyleSheet.hairlineWidth },
  top: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  title: { fontSize: 21, fontWeight: '600' },
  titleBlock: { flex: 1, minWidth: 0 },
  today: { fontSize: 13, marginTop: 1 },
  drawerContent: { paddingTop: spacing.sm, paddingBottom: spacing.lg },
  drawerContentClassic: { flexGrow: 1, paddingBottom: spacing.md },
  card: { marginHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderWidth: StyleSheet.hairlineWidth },
  inCard: { marginHorizontal: spacing.xxs },
  footerClassic: { marginTop: 'auto', paddingTop: spacing.lg },
  item: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  itemText: { fontSize: 16 },
  itemTextSelected: { fontWeight: '700' },
  badge: { marginLeft: 'auto', alignSelf: 'center' },
  // Same width as contextIcon so destination labels and shortcut titles share one text column.
  iconSlot: { width: 30, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.lg, marginTop: spacing.sm },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs },
  styleToggle: { marginHorizontal: spacing.md, marginTop: spacing.xs, marginBottom: spacing.xxs },
  styleToggleClassic: { marginHorizontal: spacing.sm, marginTop: 0, marginBottom: spacing.sm },
  section: { paddingTop: spacing.sm },
  sectionHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  sectionLabel: { flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  contextRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  contextIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  contextCopy: { flex: 1, minWidth: 0 },
  contextTitle: { fontSize: 15, fontWeight: '500' },
  contextMeta: { fontSize: 12, marginTop: 2 },
  pinnedRow: { paddingRight: spacing.xxs },
  // Icon stays visually compact (16dp); hitSlop below brings the actual touch
  // target up to the 44dp minimum without the row looking crowded.
  unpinButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 32 / 2 },
  unpinPressed: { opacity: 0.55 },
  pressed: { opacity: 0.62 },
});
