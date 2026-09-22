import { createContext, useCallback, useContext, useMemo, useState, type ComponentProps, type PropsWithChildren } from 'react';
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';

type DrawerContextValue = { openDrawer: () => void; closeDrawer: () => void };
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
      style={({ pressed }) => [styles.item, active && { backgroundColor: tokens.accentSoft }, pressed && styles.pressed]}>
      <View accessible={false} style={styles.iconSlot}>
        <Ionicons accessible={false} name={destination.icon} size={21} color={active ? tokens.accentStrong : tokens.textPrimary} />
      </View>
      <Text style={[styles.itemText, { color: tokens.textPrimary }, active && styles.itemTextSelected]}>{destination.label}</Text>
    </Pressable>
  );
}

function DrawerContent({ close }: { close: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { tokens } = useTheme();
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
          <View accessible={false} style={styles.iconSlot}>
            <Ionicons accessible={false} name="chatbubble-outline" size={21} color={tokens.accentText} />
          </View>
          <Text style={[styles.chatText, { color: tokens.accentText }]}>Chat</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export function AppDrawerProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (event, gesture) => event.nativeEvent.pageX < 24 && gesture.dx > 12 && Math.abs(gesture.dy) < 16,
    onPanResponderRelease: (_, gesture) => { if (gesture.dx > 48) openDrawer(); },
  }), [openDrawer]);
  const value = useMemo(() => ({ openDrawer, closeDrawer }), [closeDrawer, openDrawer]);
  return (
    <DrawerContext.Provider value={value}>
      <View style={styles.root} {...responder.panHandlers}>{children}</View>
      <Modal transparent visible={isOpen} animationType="fade" onRequestClose={closeDrawer}>
        <View style={styles.modal}>
          <DrawerContent close={closeDrawer} />
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss navigation" style={styles.backdrop} onPress={closeDrawer} />
        </View>
      </Modal>
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  modal: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)' },
  drawer: { width: '78%', maxWidth: 340, height: '100%', borderRightWidth: StyleSheet.hairlineWidth },
  top: {
    minHeight: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  iconSlot: { width: 24, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 16 },
  itemTextSelected: { fontWeight: '700' },
  settingsGap: { marginTop: spacing.sm },
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
  chatText: { fontSize: 15, fontWeight: '700' },
  chatButtonPressed: { opacity: 0.82 },
  pressed: { opacity: 0.62 },
});
