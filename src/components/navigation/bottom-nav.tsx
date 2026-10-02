import { useContext, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from 'expo-router/tabs';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { NAV_FADE_RANGE, useChatTransition } from '@/components/navigation/chat-transition';
import { AppText } from '@/components/ui/app-text';
import { ChatButtonFace } from '@/components/navigation/chat-button-face';
import { Icon, type IconName } from '@/components/ui/icon';
import { surfaceStyle } from '@/components/ui/surface';
import { spacing } from '@/constants/theme';

// Sizes come from the style (styleTokens.nav / .chat): Classic's 64pt pill
// with a round 58pt Chat button poking 22pt above it, or Sticky's outlined
// 72pt bar with a speech-bubble Chat button raised 34pt above it.

// The custom bottom-tab-bar for Notes, Calendar, Chat, Attachments and Spaces —
// see PHASE: REDESIGN CHITS BOTTOM NAVIGATION and PHASE: REDESIGN
// CHAT TRANSITION — CONNECTED FLOATING BUTTON. Archive moved to the side drawer
// (see PHASE: GLOBAL ATTACHMENTS SCREEN) but stays mounted in this same tabs
// group, just without its own NavItem here. Absolutely positioned over the
// active screen (not a normal docked flex tab-bar slot) so the transparent
// margins around the floating pill genuinely show the screen's own content/
// background instead of an opaque reserved strip — screens opt into the
// matching bottom clearance themselves via `useBottomTabBarHeight()`. Chat and
// Spaces render without this bar so their own controls can use the bottom edge.
export function BottomNav({ state, navigation, insets }: BottomTabBarProps) {
  const { tokens: theme, styleTokens, styleColors } = useTheme();
  const nav = styleTokens.nav;
  const compactLabels = useWindowDimensions().width < 375;
  const chat = styleTokens.chat;
  const bubble = styleTokens.chatButton === 'bubble';
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const { progress, openingToken, openChat } = useChatTransition();
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
  const spacesRoute = state.routes.find((route) => route.name === 'spaces');
  const attachmentsRoute = state.routes.find((route) => route.name === 'attachments');
  const calendarRoute = state.routes.find((route) => route.name === 'calendar');
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
      const fromPath = activeName === 'spaces' ? '/spaces' : activeName === 'attachments' ? '/attachments' : activeName === 'calendar' ? '/calendar' : '/';
      openChat({ x: x + width / 2, y: y + height / 2, size: Math.max(width, height) }, fromPath);
    });
  };

  // The tab labels and icons (including the idle "Chat" label) fade away first,
  // choreography — the Chat button itself is handled separately (press bounce +
  // the overlay's traveling clone once tapped), never by this fade.
  const navFadeStyle = useAnimatedStyle(() => {
    const t = openingToken.get() > 0 ? interpolate(progress.get(), NAV_FADE_RANGE, [1, 0], Extrapolation.CLAMP) : 1;
    return { opacity: t, transform: [{ translateY: (1 - t) * 8 }] };
  });
  const pressedStyle = useAnimatedStyle(() => ({ transform: [{ scale: travelling ? 0 : pressScale.get() }] }));

  // Chat and Spaces have their own controls at the bottom of the screen.
  if (activeName === 'chat' || activeName === 'spaces') return null;

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
      // Android is different: its inset is a real system bar (3-button
      // Back/Home/Recents, or the gesture handle's touch zone), so the pill
      // must clear all of it or its buttons end up underneath the system's.
      // Sticky floats the bar a fixed 18pt off the bottom (its edge needs the room).
      style={[styles.wrap, { paddingHorizontal: nav.marginHorizontal, paddingBottom: Platform.OS === 'android' && insets.bottom > 0 ? insets.bottom + spacing.xxs : nav.marginBottom || Math.min(insets.bottom, spacing.xs) || spacing.xs }]}
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
        {styleTokens.elevation === 'soft' ? <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0)']} style={[styles.feather, { top: nav.height }]} /> : null}
        <Animated.View style={[
          styles.surface,
          { height: nav.height },
          surfaceStyle(styleTokens, styleColors, { fill: bubble ? styleColors.controlFill : theme.surface, radius: nav.radius, border: theme.borderSubtle, shadow: 'nav', edge: nav.edge || false }),
          navFadeStyle,
        ]}>
          <NavItem
            label="Notes"
            icon="reader-outline"
            focused={activeName === 'index'}
            accessibilityLabel={`Notes${activeName === 'index' ? '. Current screen.' : ''}`}
            onPress={() => go(boardsRoute?.name)}
            compact={compactLabels}
          />
          <NavItem
            label="Calendar"
            icon="calendar-outline"
            focused={activeName === 'calendar'}
            accessibilityLabel={`Calendar${activeName === 'calendar' ? '. Current screen.' : ''}`}
            onPress={() => go(calendarRoute?.name)}
            compact={compactLabels}
          />
          <View style={styles.centerSlot} pointerEvents="none">
            <AppText numberOfLines={1} weight={bubble ? '800' : '600'} style={{ fontSize: compactLabels ? Math.min(nav.labelSize, 10) : nav.labelSize, color: bubble ? styleColors.textSecondary : theme.textMuted }}>Chat</AppText>
          </View>
          <NavItem
            label="Attachments"
            icon="attach-outline"
            focused={activeName === 'attachments'}
            accessibilityLabel={`Attachments${activeName === 'attachments' ? '. Current screen.' : ''}`}
            onPress={() => go(attachmentsRoute?.name)}
            compact={compactLabels}
          />
          <NavItem
            label="Spaces"
            icon="magnet-outline"
            focused={activeName === 'spaces'}
            accessibilityLabel={`Spaces${activeName === 'spaces' ? '. Current screen.' : ''}`}
            onPress={() => go(spacesRoute?.name)}
            compact={compactLabels}
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
          style={[styles.chatButtonHit, { top: -chat.raise, width: chat.width, height: chat.height }]}
        >
          <Animated.View entering={enterButtonSettle} style={[styles.chatButton, pressedStyle]}>
            <ChatButtonFace />
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

function NavItem({ label, icon, focused, accessibilityLabel, onPress, compact }: { label: string; icon: IconName; focused: boolean; accessibilityLabel: string; onPress: () => void; compact: boolean }) {
  const { tokens: theme, styleTokens, styleColors } = useTheme();
  const nav = styleTokens.nav;
  const pill = nav.activePill;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      {pill ? (
        // Sticky: the current destination's icon sits in an outlined accent pill.
        <View style={[styles.activePill, { width: pill.width, height: pill.height, borderRadius: pill.height / 2 }, focused && { backgroundColor: styleColors.accentFill, borderWidth: styleTokens.outline.width, borderColor: styleColors.outline }]}>
          <Icon name={icon} size={22} color={focused ? styleColors.onAccent : styleColors.textSecondary} />
        </View>
      ) : <Icon name={icon} size={23} color={focused ? theme.accent : theme.textMuted} />}
      <AppText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} weight={pill ? (focused ? '800' : '700') : focused ? '700' : '500'} style={{ width: '100%', textAlign: 'center', fontSize: compact ? Math.min(nav.labelSize, 10) : nav.labelSize, color: focused ? theme.textPrimary : pill ? styleColors.textSecondary : theme.textMuted }}>{label}</AppText>
    </Pressable>
  );
}

// Only the pill (`surface`) is allowed to paint a background — everything
// around it (`wrap`, `navRow`) is a purely structural, transparent layout
// container so the screen stays visible behind/around the floating nav.
const NAV_MAX_WIDTH = 560;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', paddingTop: spacing.xs },
  navRow: { width: '100%', maxWidth: NAV_MAX_WIDTH, alignSelf: 'center' },
  surface: { flexDirection: 'row', alignItems: 'center' },
  feather: { position: 'absolute', left: 0, right: 0, height: 18 },
  item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 },
  itemPressed: { opacity: 0.55 },
  activePill: { alignItems: 'center', justifyContent: 'center' },
  centerSlot: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 },
  chatButtonHit: { position: 'absolute', alignSelf: 'center' },
  chatButton: { width: '100%', height: '100%' },
});
