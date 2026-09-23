import { useContext, useRef, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from 'expo-router/tabs';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { NAV_FADE_RANGE, useChatTransition } from '@/components/navigation/chat-transition';
import { spacing } from '@/constants/theme';

const CHAT_BUTTON_SIZE = 58;
// How far the Chat button pokes above the nav surface's own top edge — the
// remainder of the button's height sinks down into the surface itself.
const CHAT_OVERLAP = 22;
const NAV_SURFACE_HEIGHT = 64;

// The custom bottom-tab-bar for the app's 3 global destinations (Boards, Chat,
// Archive) — see PHASE: REDESIGN CHITS BOTTOM NAVIGATION and PHASE: REDESIGN CHAT
// TRANSITION — CONNECTED FLOATING BUTTON. Absolutely positioned over the active
// screen (not a normal docked flex tab-bar slot) so the transparent margins
// around the floating pill genuinely show the screen's own content/background
// instead of an opaque reserved strip — screens opt into the matching bottom
// clearance themselves via `useBottomTabBarHeight()` (see index.native.tsx,
// archive.native.tsx, search.native.tsx). While Chat itself is active, this
// renders nothing at all
// (not just hidden — see the early return below) so Chat's own composer can use
// that space instead of a floating bar sitting over it.
export function BottomNav({ state, navigation, insets }: BottomTabBarProps) {
  const { tokens: theme } = useTheme();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const { progress, openChat } = useChatTransition();
  const chatButtonRef = useRef<View>(null);
  const pressScale = useSharedValue(1);
  // Hides this button the instant it's tapped so the transition overlay's
  // traveling clone (starting at the exact same spot/size) can take over without
  // a visible duplicate — see chat-transition.tsx. This component doesn't
  // actually unmount while Chat is active (returning null from it just renders
  // nothing; the instance and its state persist), so this has to be reset
  // explicitly once Chat is no longer the active tab, or the button stays
  // invisible forever after the very first open.
  const [travelling, setTravelling] = useState(false);

  const boardsRoute = state.routes.find((route) => route.name === 'index');
  const archiveRoute = state.routes.find((route) => route.name === 'archive');
  const activeName = state.routes[state.index]?.name;

  // "Adjusting state when a prop changes" via setState-during-render (React's own
  // documented pattern for this — see the surrounding comment) rather than a ref
  // (this project's lint config forbids ref reads/writes during render) or a
  // useEffect (which would run one frame late and flash the hidden icon).
  const [previousActiveName, setPreviousActiveName] = useState(activeName);
  if (activeName !== previousActiveName) {
    setPreviousActiveName(activeName);
    if (previousActiveName === 'chat' && activeName !== 'chat') {
      if (travelling) setTravelling(false);
      // Defends against ever leaving Chat by a path other than closeChat() — e.g.
      // bottom-tabs' own `backBehavior` silently switching tabs on Android
      // hardware/gesture back before chat.native.tsx's focus-scoped BackHandler
      // gets a chance to intercept it. Without this, `progress` stays at 1 from
      // the open animation, and this nav's own fade (driven by that same
      // progress) stays rendered as "still open" — i.e. invisible — even though
      // we're already back on this tab. A no-op whenever closeChat() DID run
      // normally, since progress is already back at 0 by the time this fires.
      if (progress.get() > 0) progress.set(0);
    }
  }

  const go = (routeName: string | undefined) => {
    if (!routeName) return;
    const route = state.routes.find((item) => item.name === routeName);
    if (!route) return;
    const isFocused = activeName === routeName;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    void Haptics.selectionAsync();
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  const openChatBalloon = () => {
    void Haptics.selectionAsync();
    setTravelling(true);
    chatButtonRef.current?.measureInWindow((x, y, width, height) => {
      openChat({ x: x + width / 2, y: y + height / 2, size: Math.max(width, height) }, activeName === 'archive' ? '/archive' : '/');
    });
  };

  // Boards/Archive (and the idle "Chat" label) fade away first, per the phase's
  // choreography — the Chat button itself is handled separately (press bounce +
  // the overlay's traveling clone once tapped), never by this fade.
  const navFadeStyle = useAnimatedStyle(() => {
    const t = interpolate(progress.get(), NAV_FADE_RANGE, [1, 0], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 8 }] };
  });
  const pressedStyle = useAnimatedStyle(() => ({ transform: [{ scale: travelling ? 0 : pressScale.get() }] }));

  // Chat is treated as a launch point, not a resting destination for this bar —
  // once it's the active tab, this component intentionally renders nothing (see
  // the file comment above) rather than a "Chat" pill with nothing beside it.
  if (activeName === 'chat') return null;

  return (
    <Animated.View
      entering={enterRise}
      pointerEvents="box-none"
      // The ONE source of truth for how far the nav sits from the device edge
      // (see PHASE: REDESIGN CHITS BOTTOM NAVIGATION) — nothing else in this tree
      // adds its own bottom padding/margin on top of it. This pill is a small
      // floating element, not an edge-to-edge bar, so it doesn't need the
      // device's full safe-area reservation (insets.bottom alone runs ~34px on
      // home-indicator phones) below it — that's what produced the oversized
      // gap. Capping at spacing.xs keeps just enough clearance to stay off the
      // home indicator on every device, including ones with no inset at all.
      style={[styles.wrap, { paddingBottom: Math.min(insets.bottom, spacing.xs) || spacing.xs }]}
      onLayout={(event) => reportHeight?.(event.nativeEvent.layout.height)}
    >
      {/* Purely a layout container — caps the nav's width and centers it on
          wide screens (tablets) without touching the nav's own design. No
          background/border/shadow of its own, so the screen behind stays
          visible around and behind the floating pill. */}
      <View style={styles.navRow}>
        {/* A soft contact-shadow-like fade directly under the pill, not a second
            surface — extremely subtle, absolutely positioned so it paints past
            the wrapper's own (small) bottom padding toward the home indicator
            without adding any layout height of its own. */}
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0)']} style={styles.feather} />
        <Animated.View style={[styles.surface, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, navFadeStyle]}>
          <NavItem
            label="Boards"
            icon="grid-outline"
            focused={activeName === 'index'}
            accessibilityLabel={`Boards${activeName === 'index' ? '. Current screen.' : ''}`}
            onPress={() => go(boardsRoute?.name)}
          />
          <View style={styles.centerSlot} pointerEvents="none">
            <Text numberOfLines={1} style={[styles.centerLabel, { color: theme.textMuted }]}>Chat</Text>
          </View>
          <NavItem
            label="Archive"
            icon="archive-outline"
            focused={activeName === 'archive'}
            accessibilityLabel={`Archive${activeName === 'archive' ? '. Current screen.' : ''}`}
            onPress={() => go(archiveRoute?.name)}
          />
        </Animated.View>

        <Pressable
          ref={chatButtonRef}
          accessibilityRole="button"
          accessibilityLabel="Open Chat"
          accessibilityHint="Open Chat to capture a new thought."
          disabled={travelling}
          // Phase 1 (press): a very quick compression that springs back — done by
          // release, independent of the open sequence which only starts on tap.
          onPressIn={() => { pressScale.set(withTiming(0.94, { duration: 60 })); }}
          onPressOut={() => { pressScale.set(withTiming(1, { duration: 70, easing: Easing.out(Easing.quad) })); }}
          onPress={openChatBalloon}
          style={styles.chatButtonHit}
        >
          <Animated.View entering={enterButtonSettle} style={[styles.chatButton, { backgroundColor: theme.accent }, pressedStyle]}>
            <Ionicons accessible={false} name="chatbox" size={23} color="#FFFFFF" />
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// Custom entering animations (rather than a stock preset) so the distance/
// duration match the phase spec exactly: the nav rises ~10px with no bounce as
// it reappears after Chat closes, and the button separately settles from a
// slightly-shrunk state ("scales from ~0.85 -> 1") — both fire automatically
// whenever this component (re)mounts, which is exactly when Chat closes, since
// it renders nothing at all while Chat is active.
function enterRise() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 10 }] },
    animations: { opacity: withTiming(1, { duration: 180 }), transform: [{ translateY: withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) }) }] },
  };
}
function enterButtonSettle() {
  'worklet';
  return {
    initialValues: { transform: [{ scale: 0.85 }] },
    animations: { transform: [{ scale: withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }) }] },
  };
}

function NavItem({ label, icon, focused, accessibilityLabel, onPress }: { label: string; icon: ComponentProps<typeof Ionicons>['name']; focused: boolean; accessibilityLabel: string; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <Ionicons accessible={false} name={icon} size={23} color={focused ? theme.accent : theme.textMuted} />
      <Text style={[styles.itemLabel, { color: focused ? theme.textPrimary : theme.textMuted }, focused && styles.itemLabelActive]}>{label}</Text>
    </Pressable>
  );
}

// Only the pill (`surface`) is allowed to paint a background — everything
// around it (`wrap`, `navRow`) is a purely structural, transparent layout
// container so the screen stays visible behind/around the floating nav.
const NAV_MAX_WIDTH = 560;
const NAV_HORIZONTAL_MARGIN = 16;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', paddingHorizontal: NAV_HORIZONTAL_MARGIN, paddingTop: spacing.xs },
  navRow: { width: '100%', maxWidth: NAV_MAX_WIDTH, alignSelf: 'center' },
  surface: {
    height: NAV_SURFACE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  feather: { position: 'absolute', top: NAV_SURFACE_HEIGHT, left: 0, right: 0, height: 18 },
  item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 },
  itemPressed: { opacity: 0.55 },
  itemLabel: { fontSize: 11, fontWeight: '500' },
  itemLabelActive: { fontWeight: '700' },
  centerSlot: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 },
  centerLabel: { fontSize: 11, fontWeight: '600' },
  chatButtonHit: { position: 'absolute', top: -CHAT_OVERLAP, alignSelf: 'center', width: CHAT_BUTTON_SIZE, height: CHAT_BUTTON_SIZE },
  chatButton: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CHAT_BUTTON_SIZE / 2,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});
