import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type TextStyle, type ViewProps, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { fontStyle } from './app-text';
import type { Corners, SoftShadow, StyleColors, StyleTokens } from '@/constants/style-tokens';

export type Radius = number | Corners;

export type SurfaceOptions = {
  fill?: string;
  radius?: Radius;
  /** Classic's hairline border color; Sticky draws its outline in its place. */
  border?: string;
  /** Sticky's outline width (default: the style's); false for none. */
  outline?: number | false;
  outlineColor?: string;
  /** Classic's soft shadow, by name or exact values; false for none. */
  shadow?: keyof StyleTokens['shadow'] | SoftShadow | false;
  /** Sticky's solid bottom edge depth (default: the style's); false for none. */
  edge?: number | false;
  edgeColor?: string;
  /**
   * The surface clips its content (overflow: hidden): Sticky draws the edge as
   * a deeper bottom border inside the box, which clipping can't cut off.
   */
  clip?: boolean;
  /** Which side the edge shows on: under the surface (default), or to its right for a side panel. */
  edgeSide?: 'bottom' | 'right';
};

export function radiusStyle(radius: Radius | undefined): ViewStyle {
  if (radius === undefined) return {};
  if (typeof radius === 'number') return { borderRadius: radius };
  return { borderTopLeftRadius: radius.topLeft, borderTopRightRadius: radius.topRight, borderBottomRightRadius: radius.bottomRight, borderBottomLeftRadius: radius.bottomLeft };
}

/** How deep a surface's edge is under the active style (0 under Classic). */
export function edgeDepth(tokens: StyleTokens, edge: SurfaceOptions['edge']): number {
  if (tokens.elevation !== 'edge' || edge === false) return 0;
  return edge ?? tokens.edgeDepth;
}

/**
 * A surface's border, corners and depth under the active style. Classic:
 * an optional hairline and a soft shadow. Sticky: an outline and a solid,
 * unblurred edge under the bottom (drawn outside the box, so it takes no
 * layout space — leave room for it below).
 */
export function surfaceStyle(tokens: StyleTokens, colors: StyleColors, options: SurfaceOptions, sunk = false): ViewStyle {
  const { fill, radius, border, outline, outlineColor, shadow, edge, edgeColor, clip, edgeSide = 'bottom' } = options;
  const style: ViewStyle = { ...radiusStyle(radius), ...(fill ? { backgroundColor: fill } : null) };
  if (tokens.elevation === 'soft') {
    if (border) Object.assign(style, { borderWidth: StyleSheet.hairlineWidth, borderColor: border });
    const soft = typeof shadow === 'string' ? tokens.shadow[shadow] : shadow || null;
    if (soft) Object.assign(style, { shadowColor: '#000', shadowOpacity: soft.opacity, shadowRadius: soft.radius, shadowOffset: { width: 0, height: soft.offsetY }, elevation: soft.elevation });
    return style;
  }
  // Sticky never blurs: cancel any soft shadow a Classic style underneath set.
  Object.assign(style, { shadowOpacity: 0, elevation: 0 });
  const width = outline === false ? 0 : outline ?? tokens.outline.width;
  if (width > 0) Object.assign(style, { borderWidth: width, borderColor: outlineColor ?? colors.outline });
  const depth = edgeDepth(tokens, edge);
  if (depth > 0 && clip) Object.assign(style, { borderBottomWidth: width + depth, borderBottomColor: edgeColor ?? colors.outline });
  else if (depth > 0 && !sunk) style.boxShadow = edgeSide === 'right' ? `${depth}px 0px 0px 0px ${edgeColor ?? colors.outline}` : `0px ${depth}px 0px 0px ${edgeColor ?? colors.outline}`;
  return style;
}

/**
 * For screens that keep their Classic styles as they are: returns a style to
 * lay over them that turns the surface into Sticky's (outline, edge, corners),
 * or null under Classic so nothing changes.
 */
export function useStickySurface() {
  const { styleTokens, styleColors } = useTheme();
  return (options: SurfaceOptions, sunk = false): ViewStyle | null =>
    styleTokens.elevation === 'edge' ? surfaceStyle(styleTokens, styleColors, options, sunk) : null;
}

/**
 * A bottom sheet under Sticky: rounded top corners and an ink outline along
 * its top and sides (the bottom runs off-screen). Null under Classic.
 */
export function useStickySheet() {
  const { styleTokens: t, styleColors } = useTheme();
  return (fill: string = styleColors.controlFill): ViewStyle | null => t.elevation === 'edge' ? {
    backgroundColor: fill,
    borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet,
    borderWidth: t.outline.width, borderBottomWidth: 0, borderColor: styleColors.outline,
    shadowOpacity: 0, elevation: 0,
  } : null;
}

/**
 * Sticky overlays for the pieces every sheet repeats: a text field, a filled
 * button, and a grouped panel. Each is null under Classic.
 */
export function useStickyControls() {
  const { styleTokens: t, styleColors, look } = useTheme();
  const on = t.elevation === 'edge';
  const sticky = (options: SurfaceOptions) => (on ? surfaceStyle(t, styleColors, options) : null);
  return {
    input: on ? { ...sticky({ fill: styleColors.controlFill, radius: t.radius.control, edge: false }), ...fontStyle(t, look, 'paragraph') } as TextStyle : null,
    button: sticky({ radius: t.button.radius, edge: t.button.edge }),
    panel: sticky({ radius: t.radius.panel, edge: false }),
  };
}

export function Surface({ children, style, fill, radius, border, outline, outlineColor, shadow, edge, edgeColor, clip, ...props }: PropsWithChildren<ViewProps & SurfaceOptions>) {
  const { styleTokens, styleColors } = useTheme();
  return <View {...props} style={[surfaceStyle(styleTokens, styleColors, { fill, radius, border, outline, outlineColor, shadow, edge, edgeColor, clip }), style]}>{children}</View>;
}

const CLASSIC_PRESSED: ViewStyle = { opacity: 0.6 };

/**
 * A tappable Surface. Classic keeps each control's own pressed look
 * (`pressedStyle`); Sticky sinks the surface onto its edge — or, with Reduce
 * Motion on, just loses the edge and dims slightly instead of moving.
 */
export function PressableSurface({ children, style, pressedStyle = CLASSIC_PRESSED, fill, radius, border, outline, outlineColor, shadow, edge, edgeColor, clip, ...props }: Omit<PressableProps, 'style' | 'children'> & SurfaceOptions & { children?: ReactNode; style?: StyleProp<ViewStyle>; pressedStyle?: StyleProp<ViewStyle> }) {
  const { styleTokens, styleColors } = useTheme();
  const reduceMotion = useReducedMotion();
  const options = { fill, radius, border, outline, outlineColor, shadow, edge, edgeColor, clip };
  const depth = edgeDepth(styleTokens, edge);
  return <Pressable
    {...props}
    style={({ pressed }) => {
      // A clipped surface's edge is part of its box, so it stays put rather than sinking.
      const sink = pressed && styleTokens.press === 'sink' && depth > 0 && !clip;
      return [
        surfaceStyle(styleTokens, styleColors, options, sink),
        style,
        pressed && styleTokens.press === 'ripple' && pressedStyle,
        sink && (reduceMotion ? { opacity: 0.85 } : { transform: [{ translateY: depth }] }),
      ];
    }}
  >{children}</Pressable>;
}
