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
import {
  AccessibilityInfo,
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { usePathname, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { createBoardRepository } from '@/db/repositories';

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
  path: '/boards' | '/archive' | '/settings';
  icon: IconName;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);
const contentDestinations: Destination[] = [
  { label: 'Boards', path: '/boards', icon: 'grid-outline' },
  { label: 'Archive', path: '/archive', icon: 'archive-outline' },
];
const settingsDestination: Destination = { label: 'Settings', path: '/settings', icon: 'settings-outline' };

export function useAppDrawer() {
  const context = useContext(DrawerContext);
  if (!context) throw new Error('useAppDrawer must be used within AppDrawerProvider.');
  return context;
}

function isDestinationActive(pathname: string, destination: Destination) {
  if (destination.path !== '/boards') return pathname === destination.path;
  return pathname === '/boards' || pathname.startsWith('/board/') || pathname.startsWith('/card/') || pathname === '/unorganized';
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

function ShortcutSection({ label, items, close }: { label: 'PINNED' | 'RECENT'; items: ContextItem[]; close: () => void }) {
  const { tokens } = useTheme();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionLabel, { color: tokens.textMuted }]}>{label}</Text>
      {items.map((item) => <ContextRow key={`${item.kind}-${item.id}`} item={item} close={close} showKind={label === 'RECENT'} />)}
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

  const load = useCallback(async () => {
    const [nextPinned, nextRecent] = await Promise.all([repository.listPinned(), repository.listRecent()]);
    setPinned(nextPinned);
    setRecent(nextRecent);
  }, [repository]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, load]);

  const hasShortcuts = pinned.length > 0 || recent.length > 0;
  return (
    <SafeAreaView accessibilityViewIsModal style={[styles.drawer, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle }]}>
      <View style={styles.top}>
        <Text accessibilityRole="header" style={[styles.title, { color: tokens.textPrimary }]}>Chits</Text>
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
        <ShortcutSection label="PINNED" items={pinned} close={close} />
        <ShortcutSection label="RECENT" items={recent.slice(0, 5)} close={close} />
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: tokens.borderSubtle }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chat. Return Home."
          onPress={() => {
            close();
            router.navigate('/');
          }}
          style={({ pressed }) => [styles.chatButton, { backgroundColor: tokens.accent }, pressed && styles.chatButtonPressed]}>
          <DrawerIcon name="chatbubble-outline" color={tokens.accentText} />
          <Text style={[styles.chatText, { color: tokens.accentText }]}>Chat</Text>
        </Pressable>
      </View>
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
