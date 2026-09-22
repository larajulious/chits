import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PropsWithChildren,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Keyboard,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { usePathname, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { Toast } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';
import { createBoardRepository } from '@/db/repositories';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
// Short, restrained transition — no bounce — reused for both the Pinned header's
// search/close swap and a row's fade+collapse on unpin.
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
type Destination = {
  label: 'Boards' | 'Archive' | 'Settings';
  path: '/' | '/archive' | '/settings';
  icon: IconName;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);
// Boards is the app's landing screen (route "/"); Chat lives at "/chat" and is
// reached via the persistent bottom Chat action, not a drawer destination.
const contentDestinations: Destination[] = [
  { label: 'Boards', path: '/', icon: 'grid-outline' },
  { label: 'Archive', path: '/archive', icon: 'archive-outline' },
];
const settingsDestination: Destination = { label: 'Settings', path: '/settings', icon: 'settings-outline' };

export function useAppDrawer() {
  const context = useContext(DrawerContext);
  if (!context) throw new Error('useAppDrawer must be used within AppDrawerProvider.');
  return context;
}

function isDestinationActive(pathname: string, destination: Destination) {
  if (destination.path !== '/') return pathname === destination.path;
  return pathname === '/' || pathname.startsWith('/board/') || pathname.startsWith('/card/') || pathname === '/unorganized';
}

function DrawerIcon({ name, color }: { name: IconName; color: string }) {
  return (
    <View accessible={false} style={styles.iconSlot}>
      <Ionicons accessible={false} name={name} size={21} color={color} />
    </View>
  );
}

function NavigationRow({ destination, pathname, close }: { destination: Destination; pathname: string; close: () => void }) {
  const router = useRouter();
  const { tokens } = useTheme();
  const active = isDestinationActive(pathname, destination);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${destination.label}${active ? '. Current screen.' : ''}`}
      accessibilityState={{ selected: active }}
      onPress={() => {
        close();
        router.navigate(destination.path);
      }}
      style={({ pressed }) => [
        styles.item,
        active && { backgroundColor: tokens.accentSoft },
        pressed && styles.pressed,
      ]}>
      <DrawerIcon name={destination.icon} color={active ? tokens.accentStrong : tokens.textPrimary} />
      <Text style={[styles.itemText, { color: tokens.textPrimary }, active && styles.itemTextSelected]}>{destination.label}</Text>
    </Pressable>
  );
}

function ContextRow({ item, close, showKind = false }: { item: ContextItem; close: () => void; showKind?: boolean }) {
  const router = useRouter();
  const { tokens } = useTheme();
  const accessibilityLabel = item.kind === 'board'
    ? `${item.title}. Board.`
    : `${item.title}. Card. ${item.accessibilityContext}.`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        close();
        if (item.kind === 'board') router.push({ pathname: '/board/[id]', params: { id: item.id } });
        else router.push({ pathname: '/card/[id]', params: { id: item.id } });
      }}
      style={({ pressed }) => [styles.contextRow, pressed && styles.pressed]}>
      <View accessible={false} style={[styles.contextIcon, { backgroundColor: item.kind === 'board' ? tokens.accentSoft : tokens.surfaceElevated, borderColor: item.kind === 'board' ? tokens.accentBorder : tokens.borderSubtle }]}>
        <Ionicons accessible={false} name={item.kind === 'board' ? 'grid-outline' : 'document-text-outline'} size={17} color={item.kind === 'board' ? tokens.accentStrong : tokens.textSecondary} />
      </View>
      <View style={styles.contextCopy}>
        <View style={styles.contextTitleRow}><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.contextTitle, { color: tokens.textPrimary }]}>{item.title}</Text>{showKind && item.kind === 'card' ? <View style={[styles.kindBadge, { backgroundColor: tokens.surfaceElevated }]}><Text style={[styles.kindBadgeText, { color: tokens.textSecondary }]}>CARD</Text></View> : null}</View>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.contextMeta, { color: tokens.textSecondary }]}>{item.context}</Text>
      </View>
    </Pressable>
  );
}

function DrawerBackdrop({ close, reduceTransparency, darkMode }: { close: () => void; reduceTransparency: boolean; darkMode: boolean }) {
  const tint = darkMode ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.30)';
  const tapTarget = <Pressable accessibilityRole="button" accessibilityLabel="Dismiss navigation" style={StyleSheet.absoluteFill} onPress={close} />;
  if (Platform.OS === 'ios' && !reduceTransparency && isGlassEffectAPIAvailable()) {
    return <GlassView glassEffectStyle="regular" colorScheme="dark" tintColor={tint} style={styles.backdrop}>{tapTarget}</GlassView>;
  }
  return <View style={[styles.backdrop, { backgroundColor: tint }]}>{tapTarget}</View>;
}

function ShortcutSection({ label, items, close }: { label: 'RECENT'; items: ContextItem[]; close: () => void }) {
  const { tokens } = useTheme();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionLabel, { color: tokens.textMuted }]}>{label}</Text>
      {items.map((item) => <ContextRow key={`${item.kind}-${item.id}`} item={item} close={close} showKind />)}
    </View>
  );
}

function matchesPinnedQuery(item: ContextItem, query: string) {
  return `${item.title} ${item.context}`.toLowerCase().includes(query.toLowerCase());
}

function PinnedRow({ item, close, onUnpin }: { item: ContextItem; close: () => void; onUnpin: () => void }) {
  const router = useRouter();
  const { tokens } = useTheme();
  const accessibilityLabel = item.kind === 'board'
    ? `${item.title}. Board.`
    : `${item.title}. Card. ${item.accessibilityContext}.`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        close();
        if (item.kind === 'board') router.push({ pathname: '/board/[id]', params: { id: item.id } });
        else router.push({ pathname: '/card/[id]', params: { id: item.id } });
      }}
      style={({ pressed }) => [styles.contextRow, styles.pinnedRow, pressed && styles.pressed]}>
      <View accessible={false} style={[styles.contextIcon, { backgroundColor: item.kind === 'board' ? tokens.accentSoft : tokens.surfaceElevated, borderColor: item.kind === 'board' ? tokens.accentBorder : tokens.borderSubtle }]}>
        <Ionicons accessible={false} name={item.kind === 'board' ? 'grid-outline' : 'document-text-outline'} size={17} color={item.kind === 'board' ? tokens.accentStrong : tokens.textSecondary} />
      </View>
      <View style={styles.contextCopy}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.contextTitle, { color: tokens.textPrimary }]}>{item.title}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.contextMeta, { color: tokens.textSecondary }]}>{item.context}</Text>
      </View>
      {/* Nested Pressable, not the row's own onPress — stopPropagation keeps this
          from also opening the row underneath it. Neutral color throughout: this
          unpins, it never deletes anything. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.title} from Pinned`}
        hitSlop={10}
        onPress={(event) => { event.stopPropagation(); onUnpin(); }}
        style={({ pressed }) => [styles.unpinButton, pressed && styles.unpinPressed]}>
        <Ionicons accessible={false} name="close" size={16} color={tokens.textMuted} />
      </Pressable>
    </Pressable>
  );
}

function PinnedSection({ items, close, onUnpin }: { items: ContextItem[]; close: () => void; onUnpin: (item: ContextItem) => void }) {
  const { tokens } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const [hadItems, setHadItems] = useState(items.length > 0);
  // Unpinning the last item drops this section to zero-length rather than
  // unmounting it (it just renders null below) — reset search state right in that
  // same render so a later re-pin doesn't resurrect a stale open search field.
  if ((items.length > 0) !== hadItems) {
    setHadItems(items.length > 0);
    if (items.length === 0) { setSearchOpen(false); setQuery(''); }
  }

  if (!items.length) return null;

  const openSearch = () => { LayoutAnimation.configureNext(PINNED_TRANSITION); setSearchOpen(true); };
  const closeSearch = () => { LayoutAnimation.configureNext(PINNED_TRANSITION); setSearchOpen(false); setQuery(''); Keyboard.dismiss(); };
  const trimmed = query.trim();
  const filtered = trimmed ? items.filter((item) => matchesPinnedQuery(item, trimmed)) : items;

  return (
    <View style={styles.section}>
      <View style={styles.pinnedHeader}>
        {searchOpen ? <>
          <View style={[styles.pinnedSearchField, { backgroundColor: tokens.surfaceElevated, borderColor: tokens.borderSubtle }]}>
            <Ionicons accessible={false} name="search-outline" size={15} color={tokens.textMuted} />
            <TextInput
              ref={searchInputRef}
              accessibilityLabel="Search pinned items"
              value={query}
              onChangeText={setQuery}
              placeholder="Search pinned items…"
              placeholderTextColor={tokens.textMuted}
              selectionColor={tokens.accent}
              returnKeyType="search"
              autoFocus
              style={[styles.pinnedSearchInput, { color: tokens.textPrimary }]}
            />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close pinned search" hitSlop={10} onPress={closeSearch} style={styles.pinnedSearchClose}>
            <Ionicons accessible={false} name="close" size={18} color={tokens.textSecondary} />
          </Pressable>
        </> : <>
          <Text accessibilityRole="header" style={[styles.sectionLabel, styles.pinnedLabel, { color: tokens.textMuted }]}>PINNED</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Search pinned items" hitSlop={10} onPress={openSearch} style={styles.pinnedSearchButton}>
            <Ionicons accessible={false} name="search-outline" size={17} color={tokens.textMuted} />
          </Pressable>
        </>}
      </View>
      {trimmed && filtered.length === 0
        ? <Text style={[styles.pinnedNoResults, { color: tokens.textMuted }]}>No pinned items found.</Text>
        : filtered.map((item) => <PinnedRow key={`${item.kind}-${item.id}`} item={item} close={close} onUnpin={() => onUnpin(item)} />)}
    </View>
  );
}

function DrawerContent({ close, isOpen }: { close: () => void; isOpen: boolean }) {
  const database = useSQLiteContext();
  const repository = useMemo(() => createBoardRepository(database), [database]);
  const router = useRouter();
  const pathname = usePathname();
  const { tokens } = useTheme();
  const [pinned, setPinned] = useState<ContextItem[]>([]);
  const [recent, setRecent] = useState<ContextItem[]>([]);
  // Same single source of truth as Chat's own header (app_settings.chat_title) and
  // the Boards header — the drawer must show that title too, not its own hardcoded
  // "Chits" that would drift the moment it's renamed.
  const [appTitle, setAppTitle] = useState('Chits');
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [nextPinned, nextRecent, titleRow] = await Promise.all([
      repository.listPinned(),
      repository.listRecent(),
      database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_title'),
    ]);
    setPinned(nextPinned);
    setRecent(nextRecent);
    setAppTitle(titleRow?.value.trim() || 'Chits');
  }, [database, repository]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, load]);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 1800); return () => clearTimeout(timer); }, [toast]);

  // Immediately reversible (pin it again elsewhere), so no confirmation — just an
  // optimistic removal with a subtle toast, rolled back only if the write fails.
  const unpinItem = useCallback((item: ContextItem) => {
    LayoutAnimation.configureNext(PINNED_TRANSITION);
    setPinned((current) => current.filter((entry) => !(entry.kind === item.kind && entry.id === item.id)));
    void repository.setPinned(item.kind, item.id, false)
      .then(() => { void Haptics.selectionAsync(); setToast('Removed from Pinned'); })
      .catch(() => { void load(); });
  }, [load, repository]);

  const hasShortcuts = pinned.length > 0 || recent.length > 0;
  return (
    <SafeAreaView accessibilityViewIsModal style={[styles.drawer, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle }]}>
      <View style={styles.top}>
        <Text accessibilityRole="header" style={[styles.title, { color: tokens.textPrimary }]}>{appTitle}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={() => {
            close();
            router.navigate('/search');
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
          <Ionicons accessible={false} name="search-outline" size={22} color={tokens.textSecondary} />
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerContent}>
        {contentDestinations.map((destination) => (
          <NavigationRow key={destination.path} destination={destination} pathname={pathname} close={close} />
        ))}
        <View style={styles.settingsGap}>
          <NavigationRow destination={settingsDestination} pathname={pathname} close={close} />
        </View>
        {hasShortcuts ? <View style={[styles.divider, { backgroundColor: tokens.borderSubtle }]} /> : null}
        <PinnedSection items={pinned} close={close} onUnpin={unpinItem} />
        <ShortcutSection label="RECENT" items={recent.slice(0, 5)} close={close} />
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: tokens.borderSubtle }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Chat"
          accessibilityHint="Open Chat to capture a new thought."
          onPress={() => {
            close();
            router.navigate('/chat');
          }}
          style={({ pressed }) => [styles.chatButton, { backgroundColor: tokens.accent }, pressed && styles.chatButtonPressed]}>
          <DrawerIcon name="chatbubble-outline" color={tokens.accentText} />
          <Text style={[styles.chatText, { color: tokens.accentText }]}>Chat to Note</Text>
        </Pressable>
      </View>
      <Toast message={toast} />
    </SafeAreaView>
  );
}

export function AppDrawerProvider({ children }: PropsWithChildren) {
  const { scheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const transparency = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => {
      motion.remove();
      transparency.remove();
    };
  }, []);

  const animate = useCallback((toValue: 0 | 1, done?: () => void) => {
    Animated.timing(progress, { toValue, duration: reduceMotion ? 0 : 180, useNativeDriver: true })
      .start(({ finished }) => { if (finished) done?.(); });
  }, [progress, reduceMotion]);
  const openDrawer = useCallback(() => {
    if (mounted) return;
    setMounted(true);
    setIsOpen(true);
    requestAnimationFrame(() => animate(1));
  }, [animate, mounted]);
  const closeDrawer = useCallback(() => {
    if (!mounted) return;
    animate(0, () => {
      setMounted(false);
      setIsOpen(false);
    });
  }, [animate, mounted]);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (event, gesture) => event.nativeEvent.pageX < 20 && gesture.dx > 12 && Math.abs(gesture.dy) < 16,
    onPanResponderRelease: (_, gesture) => { if (gesture.dx > 48) openDrawer(); },
  }), [openDrawer]);
  const value = useMemo(() => ({ openDrawer, closeDrawer }), [closeDrawer, openDrawer]);

  return (
    <DrawerContext.Provider value={value}>
      <View style={styles.root} {...responder.panHandlers}>{children}</View>
      <Modal transparent visible={mounted} animationType="none" onRequestClose={closeDrawer}>
        <SafeAreaProvider>
          <View style={styles.modal}>
            <Animated.View style={[styles.drawerShell, { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-380, 0] }) }] }]}>
              <DrawerContent close={closeDrawer} isOpen={isOpen} />
            </Animated.View>
            <Animated.View style={[styles.backdropShell, { opacity: progress }]}>
              <DrawerBackdrop close={closeDrawer} reduceTransparency={reduceTransparency} darkMode={scheme === 'dark'} />
            </Animated.View>
          </View>
        </SafeAreaProvider>
      </Modal>
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  modal: { flex: 1, flexDirection: 'row' },
  drawerShell: {
    width: '78%',
    maxWidth: 340,
    height: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 4, height: 0 },
    elevation: 12,
  },
  backdropShell: { flex: 1 },
  backdrop: { flex: 1 },
  drawer: { flex: 1, borderRightWidth: StyleSheet.hairlineWidth },
  top: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  title: { fontSize: 21, fontWeight: '600' },
  headerAction: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  drawerContent: { paddingTop: spacing.sm, paddingBottom: spacing.lg },
  item: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
  },
  itemText: { fontSize: 16 },
  itemTextSelected: { fontWeight: '700' },
  iconSlot: { width: 24, alignItems: 'center', justifyContent: 'center' },
  settingsGap: { marginTop: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.lg, marginTop: spacing.md },
  section: { paddingTop: spacing.lg },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  contextRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
  },
  contextIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 9 },
  contextCopy: { flex: 1, minWidth: 0 },
  contextTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  contextTitle: { flexShrink: 1, fontSize: 15, fontWeight: '500' },
  contextMeta: { fontSize: 12, marginTop: 2 },
  kindBadge: { minHeight: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderRadius: 5 },
  kindBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.45 },
  // Same 44pt-ish footprint as the drawer's other header actions (headerAction),
  // just inline with the PINNED label instead of top-right.
  pinnedHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  pinnedLabel: { flex: 1, paddingHorizontal: 0, paddingBottom: 0 },
  pinnedSearchButton: { width: 44, height: 44, marginRight: -spacing.sm, alignItems: 'center', justifyContent: 'center' },
  pinnedSearchField: { flex: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1 },
  pinnedSearchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  pinnedSearchClose: { width: 44, height: 44, marginRight: -spacing.sm, alignItems: 'center', justifyContent: 'center' },
  pinnedRow: { paddingRight: spacing.xxs },
  // Icon stays visually compact (16dp); hitSlop below brings the actual touch
  // target up to the 44dp minimum without the row looking crowded.
  unpinButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  unpinPressed: { opacity: 0.55 },
  pinnedNoResults: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontSize: 13 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatButton: {
    alignSelf: 'flex-end',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 22,
  },
  chatButtonPressed: { opacity: 0.82 },
  chatText: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.62 },
});
