import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { createContext, useCallback, useContext, useMemo, useState, type ComponentProps, type PropsWithChildren } from 'react';
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { CHITS_REVISIT_ENABLED } from '@/constants/revisit';

type DrawerContextValue = { openDrawer: () => void; closeDrawer: () => void };
type IconName = ComponentProps<typeof Ionicons>['name'];
type Destination = { label: string; path: '/' | '/attachments' | '/calendar' | '/archive' | '/settings' | '/onboarding' | '/revisit'; icon: IconName };

const DrawerContext = createContext<DrawerContextValue | null>(null);
// Main destinations live in the side panel; Chat remains a floating button.
const notesDestination: Destination = { get label() { return tr('index.notes'); }, path: '/', icon: 'reader-outline' };
const calendarDestination: Destination = { get label() { return tr("appdrawer.calendar"); }, path: '/calendar', icon: 'calendar-outline' };
const attachmentsDestination: Destination = { get label() { return tr('attachments.attachments'); }, path: '/attachments', icon: 'attach-outline' };
const archiveDestination: Destination = { get label() { return tr("archive.archive"); }, path: '/archive', icon: 'archive-outline' };
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
  return pathname === destination.path;
}

function NavigationRow({ destination, pathname, close }: { destination: Destination; pathname: string; close: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const router = useRouter();
  const { tokens } = useTheme();
  const active = isDestinationActive(pathname, destination);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${destination.label}${active ? tr("appdrawer.currentScreen") : ''}`}
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
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const pathname = usePathname();
  const { tokens } = useTheme();
  return (
    <SafeAreaView accessibilityViewIsModal style={[styles.drawer, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle }]}>
      <View style={styles.top}>
        <Text accessibilityRole="header" style={[styles.title, { color: tokens.textPrimary }]}>Chits</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerContent}>
        <NavigationRow destination={notesDestination} pathname={pathname} close={close} />
        <NavigationRow destination={calendarDestination} pathname={pathname} close={close} />
        <NavigationRow destination={attachmentsDestination} pathname={pathname} close={close} />
        <NavigationRow destination={archiveDestination} pathname={pathname} close={close} />
        {CHITS_REVISIT_ENABLED ? <NavigationRow destination={{ label: tr("revisit.revisit"), path: '/revisit', icon: 'refresh-outline' }} pathname={pathname} close={close} /> : null}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: tokens.borderSubtle }]}>
        <NavigationRow destination={gettingStartedDestination} pathname={pathname} close={close} />
        <NavigationRow destination={settingsDestination} pathname={pathname} close={close} />
      </View>
    </SafeAreaView>
  );
}

export function AppDrawerProvider({ children }: PropsWithChildren) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
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
          <Pressable accessibilityRole="button" accessibilityLabel={tr("appdrawer.dismissNavigation")} style={styles.backdrop} onPress={closeDrawer} />
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
  drawerContent: { paddingTop: spacing.sm, paddingBottom: spacing.lg },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs },
  item: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
  },
  iconSlot: { width: 30, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 16 },
  itemTextSelected: { fontWeight: '700' },
  pressed: { opacity: 0.62 },
});
