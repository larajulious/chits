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
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { DeskDots, PAPER_INK, PAPER_WHITE, PAPER_YELLOW, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { Toast } from '@/components/ui/primitives';
import { DrawerHero } from './drawer-hero';
import { APP_STYLE_NAMES, APP_STYLES, mix, type AppStyle } from '@/constants/style-tokens';
import { spacing } from '@/constants/theme';
import { CHITS_REVISIT_ENABLED } from '@/constants/revisit';
import { createBoardRepository, createSpaceRepository } from '@/db/repositories';
import { useOpenCardNote } from '@/components/notes/use-open-card-note';
import { createSpinRepository } from '@/db/spin-repository';
import { getCalendarItems } from '@/features/calendar/calendar-data';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { welcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
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
type Destination = { label: string; path: '/' | '/spaces/pick' | '/attachments' | '/calendar' | '/archive' | '/settings' | '/onboarding' | '/revisit' | '/focus' | '/spin' | '/canvases'; icon: IconName };

const DrawerContext = createContext<DrawerContextValue | null>(null);
// Main destinations live in the side panel; Chat remains a floating button.
const spacesDestination: Destination = { get label() { return tr("pick.spaces"); }, path: '/spaces/pick', icon: 'magnet-outline' };
const notesDestination: Destination = { get label() { return tr('index.notes'); }, path: '/', icon: 'reader-outline' };
const canvasDestination: Destination = { label: 'Canvas', path: '/canvases', icon: 'easel-outline' };
const calendarDestination: Destination = { get label() { return tr("appdrawer.calendar"); }, path: '/calendar', icon: 'calendar-outline' };
const focusDestination: Destination = { get label() { return tr('focus.title').replace(/^Chits\s+/u, ''); }, path: '/focus', icon: 'timer-outline' };
const spinDestination: Destination = { get label() { return tr('spin.title').replace(/^Chits\s+/u, ''); }, path: '/spin', icon: 'shuffle-outline' };
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

/** The paper below the panel's hero and the ink on it, from the same kit as every page's sheet. */
function useDrawerSurfaces() {
  const { scheme } = useTheme();
  const desk = useDesk();
  return welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
}

const DOCK_PADDING = 4;
const DOCK_ICON_SIZE = 21;
// A cell's corners follow the dock's, so the two curves stay parallel.
const dockCellRadius = (dockRadius: number) => Math.max(dockRadius - DOCK_PADDING, 0);

/** A row's icon on a small rounded tile, as in the Boards list. */
function DrawerIcon({ name, color, fill }: { name: IconName; color: string; fill: string }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { styleTokens } = useTheme();
  return (
    <View accessible={false} style={[styles.iconTile, { backgroundColor: fill, borderRadius: styleTokens.button.radius }]}>
      <Icon name={name} size={19} color={color} />
    </View>
  );
}

function NavigationRow({ destination, pathname, close, badge = 0, badgeNoun = 'note', iconOnly = false }: { destination: Destination; pathname: string; close: () => void; badge?: number; badgeNoun?: 'note' | 'reminder'; iconOnly?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle } = useDirection();
  const router = useRouter();
  const { tokens, styleTokens } = useTheme();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const surfaces = useDrawerSurfaces();
  const active = isDestinationActive(pathname, destination);
  const ink = active ? tokens.accentText : surfaces.ink;
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
        iconOnly ? styles.dockCell : [styles.item, rowStyle],
        { borderRadius: iconOnly ? dockCellRadius(styleTokens.button.radius) : styleTokens.button.radius },
        active && { backgroundColor: tokens.accent, boxShadow: `0px 3px 8px ${desk.shadow}` },
        pressed && styles.pressed,
      ]}>
      {iconOnly ? <>
        <Icon name={destination.icon} size={DOCK_ICON_SIZE} color={ink} />
        <AppText family={fonts.textBold} style={[styles.dockLabel, { color: ink }]}>{destination.label}</AppText>
      </> : <>
        <DrawerIcon name={destination.icon} color={ink} fill={active ? mix(tokens.accent, PAPER_WHITE, 0.55) : surfaces.control} />
        <AppText numberOfLines={1} family={active ? fonts.display : fonts.text} style={[styles.itemText, { color: ink }]}>{destination.label}</AppText>
      </>}
      {/* The same small paper tag as a section's count; the number is in the row's label. */}
      {badge > 0 ? <View style={[styles.badge, { boxShadow: `0px 2px 4px ${desk.shadow}` }]}><AppText weight="700" style={styles.badgeText}>{badge}</AppText></View> : null}
    </Pressable>
  );
}

// Open an explicit choice before changing the same Style preference as Settings.
function StyleButton({ value, expanded, onPress }: { value: AppStyle; expanded: boolean; onPress: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { styleTokens } = useTheme();
  const surfaces = useDrawerSurfaces();
  const fonts = useWelcomeFonts();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr("settings.style")}
      accessibilityValue={{ text: APP_STYLE_NAMES[value] }}
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [styles.dockCell, { borderRadius: dockCellRadius(styleTokens.button.radius) }, pressed && styles.pressed]}>
      <Icon name="color-palette-outline" size={DOCK_ICON_SIZE} color={surfaces.ink} />
      <AppText family={fonts.textBold} style={[styles.dockLabel, { color: surfaces.ink }]}>{tr("settings.style")}</AppText>
    </Pressable>
  );
}

// One row shape for both Pinned and Recent so the two lists read as the same
// kind of thing; only Pinned rows get the trailing unpin button.
function ShortcutRow({ item, close, onUnpin }: { item: ContextItem; close: () => void; onUnpin?: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const router = useRouter();
  const openCardNote = useOpenCardNote();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const surfaces = useDrawerSurfaces();
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
        else void openCardNote(item.id);
      }}
      style={({ pressed }) => [styles.contextRow, { borderRadius: styleTokens.button.radius }, onUnpin && styles.pinnedRow, pressed && styles.pressed]}>
      <DrawerIcon name={isBoard ? 'grid-outline' : 'document-text-outline'} color={surfaces.inkMuted} fill={surfaces.control} />
      <View style={styles.contextCopy}>
        <AppText numberOfLines={1} ellipsizeMode="tail" family={fonts.text} style={[styles.contextTitle, { color: surfaces.ink }]}>{item.title}</AppText>
        <AppText numberOfLines={1} ellipsizeMode="tail" family={fonts.text} style={[styles.contextMeta, { color: surfaces.inkMuted }]}>{isBoard ? tr('id.board') : item.context}</AppText>
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
          <Icon name="close" size={16} color={surfaces.inkMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const MINUTE = 60_000;
// Today's date and time under the title, in the user's language and clock;
// it ticks over on each new minute while the panel is open.
function useTodayLine() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(Date.now()); timer = setTimeout(tick, MINUTE - (Date.now() % MINUTE)); };
    timer = setTimeout(tick, MINUTE - (Date.now() % MINUTE));
    return () => clearTimeout(timer);
  }, []);
  const day = dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const time = dateFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(now);
  return `${day} · ${time}`;
}

// Shared header row for every drawer section.
function SectionHeader({ label }: { label: string }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { handBold } = useHandwriting();
  const surfaces = useDrawerSurfaces();
  return (
    <View style={styles.sectionHeader}>
      <AppText accessibilityRole="header" style={[handBold, styles.sectionLabel, { color: surfaces.ink }]}>{label}</AppText>
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
      <SectionHeader label={tr("attachments.recent")} />
      {items.map((item) => <ShortcutRow key={`${item.kind}-${item.id}`} item={item} close={close} />)}
    </View>
  );
}

function PinnedSection({ items, close, onUnpin }: { items: ContextItem[]; close: () => void; onUnpin: (item: ContextItem) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader label={tr("index.pinned")} />
      {items.map((item) => <ShortcutRow key={`${item.kind}-${item.id}`} item={item} close={close} onUnpin={() => onUnpin(item)} />)}
    </View>
  );
}

function DrawerContent({ close, isOpen }: { close: () => void; isOpen: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const repository = useMemo(() => createBoardRepository(database), [database]);
  const pathname = usePathname();
  const { style, setStyle, styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const [stylePicker, setStylePicker] = useState(false);
  const [savingStyle, setSavingStyle] = useState(false);
  const { rowStyle } = useDirection();
  const desk = useDesk();
  const surfaces = useDrawerSurfaces();
  const insets = useSafeAreaInsets();
  const today = useTodayLine();
  const [pinned, setPinned] = useState<ContextItem[]>([]);
  const [recent, setRecent] = useState<ContextItem[]>([]);
  // Same single source of truth as Chat's own header (app_settings.chat_title) and
  // the Boards header — the drawer must show that title too, not its own hardcoded
  // "Chits" that would drift the moment it's renamed.
  const [appTitle, setAppTitle] = useState('Chits');
  const spaces = useMemo(() => createSpaceRepository(database), [database]);
  const [stuckCount, setStuckCount] = useState(0);
  const [incomingReminderCount, setIncomingReminderCount] = useState(0);
  // Settings' "Show Chits Spin". Unlike Spin's shortcuts this row doesn't wait
  // for eligible notes: a place in the panel stays put, and Spin's own empty
  // state explains what to do.
  const [showSpin, setShowSpin] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadReminderCount = useCallback(async () => {
    const items = await getCalendarItems(database);
    setIncomingReminderCount(items.filter((item) => item.scheduledAt >= Date.now()).length);
  }, [database]);

  const load = useCallback(async () => {
    const [nextPinned, nextRecent, titleRow, spaceCounts, spinVisible] = await Promise.all([
      repository.listPinned(),
      repository.listRecent(),
      database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_title'),
      spaces.counts(),
      createSpinRepository(database).visibility(),
      loadReminderCount(),
    ]);
    setShowSpin(spinVisible);
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

  // Changing a style is deliberate; opening the chooser leaves the preference alone.
  const chooseStyle = useCallback((next: AppStyle) => {
    if (savingStyle) return;
    if (next === style) { setStylePicker(false); return; }
    setSavingStyle(true);
    setStyle(next)
      .then(() => { setStylePicker(false); void Haptics.selectionAsync(); setToast(tr("settings.valueStyle", { value1: APP_STYLE_NAMES[next] })); })
      .catch(() => setToast(tr("appdrawer.styleCouldNotBeSaved")))
      .finally(() => setSavingStyle(false));
  }, [savingStyle, setStyle, style]);

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
  return (
    <SafeAreaView edges={['top']} accessibilityViewIsModal style={[styles.drawer, { backgroundColor: desk.desk, boxShadow: `0px 0px 16px ${desk.shadow}` }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}><DeskDots /></View>
      <DrawerHero title={appTitle} today={today} paper={surfaces.paper} />
      <View style={[styles.sheet, { backgroundColor: surfaces.paper }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerContent}>
          <NavigationRow destination={notesDestination} pathname={pathname} close={close} />
          <NavigationRow destination={canvasDestination} pathname={pathname} close={close} />
          <NavigationRow destination={spacesDestination} pathname={pathname} close={close} badge={stuckCount} />
          <NavigationRow destination={calendarDestination} pathname={pathname} close={close} badge={incomingReminderCount} badgeNoun="reminder" />
          <NavigationRow destination={focusDestination} pathname={pathname} close={close} />
          {showSpin ? <NavigationRow destination={spinDestination} pathname={pathname} close={close} /> : null}
          <NavigationRow destination={attachmentsDestination} pathname={pathname} close={close} />
          <NavigationRow destination={archiveDestination} pathname={pathname} close={close} />
          {CHITS_REVISIT_ENABLED ? <NavigationRow destination={revisitDestination} pathname={pathname} close={close} /> : null}
          <PinnedSection items={pinned} close={close} onUnpin={unpinItem} />
          <RecentSection items={recentUnpinned.slice(0, 5)} close={close} />
        </ScrollView>
        {/* Settings is app chrome, not a place your notes live: it stays at the
            foot of the panel, as one compact dock lined up with the rows' icons,
            instead of sitting in the list of destinations. */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm), backgroundColor: surfaces.paper, borderTopColor: surfaces.control }]}>
          {stylePicker ? <View style={[styles.styleChoices, rowStyle]}>
            {APP_STYLES.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={APP_STYLE_NAMES[option]} accessibilityState={{ checked: style === option, disabled: savingStyle }} disabled={savingStyle} onPress={() => chooseStyle(option)} style={({ pressed }) => [styles.styleChoice, rowStyle, { backgroundColor: style === option ? surfaces.control : surfaces.paper, borderColor: style === option ? surfaces.action : surfaces.track, borderRadius: styleTokens.button.radius }, pressed && styles.pressed]}>
              <AppText family={fonts.textBold} style={[styles.styleChoiceLabel, { color: surfaces.ink }]}>{APP_STYLE_NAMES[option]}</AppText>
              <Icon name={style === option ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={surfaces.ink} />
            </Pressable>)}
          </View> : null}
          <View style={[styles.dock, rowStyle, { backgroundColor: surfaces.control, borderRadius: styleTokens.button.radius }]}>
            <StyleButton value={style} expanded={stylePicker} onPress={() => setStylePicker(value => !value)} />
            <NavigationRow destination={gettingStartedDestination} pathname={pathname} close={close} iconOnly />
            <NavigationRow destination={settingsDestination} pathname={pathname} close={close} iconOnly />
          </View>
        </View>
      </View>
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
  drawer: { flex: 1 },
  sheet: { flex: 1, minHeight: 0 },
  drawerContent: { paddingTop: spacing.xs, paddingHorizontal: spacing.xs, paddingBottom: spacing.md, gap: 2 },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  itemText: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 21 },
  iconTile: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge: { minWidth: 26, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 2, alignItems: 'center', backgroundColor: PAPER_WHITE, transform: [{ rotate: '3deg' }] },
  badgeText: { color: PAPER_INK, fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] },
  footer: { paddingTop: spacing.sm, paddingHorizontal: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  dock: { padding: DOCK_PADDING, gap: DOCK_PADDING },
  dockCell: { flex: 1, minWidth: 0, minHeight: 68, paddingHorizontal: 3, paddingVertical: 8, gap: 5, alignItems: 'center', justifyContent: 'center' },
  dockLabel: { fontSize: 11, lineHeight: 15, textAlign: 'center', flexShrink: 1 },
  styleChoices: { gap: spacing.xs, marginBottom: spacing.sm },
  styleChoice: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, gap: 6, alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5 },
  styleChoiceLabel: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18 },
  section: { paddingTop: spacing.sm, gap: 2 },
  sectionHeader: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.xs },
  sectionLabel: { fontSize: 18, lineHeight: 24 },
  contextRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  contextCopy: { flex: 1, minWidth: 0 },
  contextTitle: { fontSize: 15, lineHeight: 20 },
  contextMeta: { fontSize: 12, lineHeight: 16 },
  pinnedRow: { paddingRight: spacing.xxs },
  // Icon stays visually compact (16dp); hitSlop below brings the actual touch
  // target up to the 44dp minimum without the row looking crowded.
  unpinButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 32 / 2 },
  unpinPressed: { opacity: 0.55 },
  pressed: { opacity: 0.62 },
});
