import { memo, useEffect, useState, type ComponentProps } from 'react';
import { Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { SHARE_NOTE_FONT_METRICS, type ShareNoteFontStyle, type ShareNoteTheme } from '@/constants/chits-themes';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import { fitShareNoteText, shareNoteLayout, SHARE_NOTE_DESIGN_WIDTH, type ShareNoteFormat, type ShareNoteImage, type ShareNoteLayout, type ShareNoteMode, type ShareNoteSubtask, type ShareNoteTextFit } from '@/services/share-note';

// System faces only — nothing to download or fail to load before a capture.
const FONTS: Record<ShareNoteFontStyle, TextStyle> = Platform.select({
  ios: {
    formal: { fontWeight: '600', letterSpacing: -0.2 },
    casual: { fontFamily: 'ui-rounded', fontWeight: '600' },
    playful: { fontFamily: 'ui-rounded', fontWeight: '700' },
    elegant: { fontFamily: 'ui-serif', fontStyle: 'italic', fontWeight: '400' },
    bold: { fontWeight: '900', letterSpacing: -0.6 },
    expressive: { fontFamily: 'ui-serif', fontWeight: '700', letterSpacing: -0.3 },
    classic: { fontFamily: 'ui-serif', fontWeight: '500' },
    mono: { fontFamily: 'ui-monospace', fontWeight: '500', letterSpacing: -0.3 },
  },
  default: {
    // A named medium face: many Android system fonts (e.g. Samsung's) have no 600 and fall back to regular.
    formal: { fontFamily: 'sans-serif-medium', fontWeight: '500' },
    casual: { fontFamily: 'sans-serif', fontWeight: '500' },
    playful: { fontFamily: 'sans-serif-medium', fontWeight: '700' },
    elegant: { fontFamily: 'serif', fontStyle: 'italic', fontWeight: '400' },
    bold: { fontFamily: 'sans-serif', fontWeight: '900', letterSpacing: -0.4 },
    expressive: { fontFamily: 'serif', fontWeight: '700' },
    classic: { fontFamily: 'serif', fontWeight: '400' },
    mono: { fontFamily: 'monospace', fontWeight: '400' },
  },
});
const QUOTE_FONT: TextStyle = Platform.select({ ios: { fontFamily: 'ui-serif' }, default: { fontFamily: 'serif' } });

const isDark = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 < 110;
};

export type ShareNoteContent = { title: string | null; text: string | null; images: ShareNoteImage[]; subtasks?: ShareNoteSubtask[] };

export type ShareNoteTemplateProps = {
  content: ShareNoteContent;
  theme: ShareNoteTheme;
  format: ShareNoteFormat;
  mode: ShareNoteMode;
  showBranding: boolean;
  /** The drawn width in points; every design unit scales by width / 360. */
  width: number;
  onImageLoad?: (id: string) => void;
  onCanvasReady?: (height: number) => void;
  page?: { index: number; total: number };
};

/** Layout + text fit for a note, shared by the template and the composer's "too long" hint. */
export function measureShareNote({ content, theme, format, mode, showBranding }: Omit<ShareNoteTemplateProps, 'width' | 'onImageLoad'>): { layout: ShareNoteLayout; fit: ShareNoteTextFit | null } {
  const layout = shareNoteLayout({
    format, mode, imageCount: content.images.length, hasTitle: mode !== 'image' && Boolean(content.title),
    showMark: theme.mark === 'quote' || theme.mark === 'bar' || theme.mark === 'cross', showBranding,
  });
  const fit = layout.text && content.text && mode !== 'image'
    ? fitShareNoteText(content.text, layout.text, { mode, format, metrics: SHARE_NOTE_FONT_METRICS[theme.fontStyle] })
    : null;
  return { layout, fit };
}

/**
 * The designed Share Note — the one renderer behind both the live preview and
 * the exported image. It is drawn from design units, never from the app's own
 * UI, so the file looks like a crafted card rather than a screenshot. Only
 * text and photos appear; everything else about the note stays private.
 */
export const ShareNoteTemplate = memo(function ShareNoteTemplate({ content, theme, format, mode, showBranding, width, onImageLoad, onCanvasReady, page }: ShareNoteTemplateProps) {
  if (content.subtasks?.length) return <ChecklistShareNoteTemplate content={content} theme={theme} format={format} mode={mode} showBranding={showBranding} width={width} onImageLoad={onImageLoad} onCanvasReady={onCanvasReady} page={page} />;
  const u = width / SHARE_NOTE_DESIGN_WIDTH;
  const { layout, fit } = measureShareNote({ content, theme, format, mode, showBranding });
  const { canvas, card, content: box } = layout;
  const { colors } = theme;
  const darkCanvas = isDark(colors.background);
  const cardRadius = 26 * u;
  const textAlign = theme.align;
  const center = textAlign === 'center';
  const font = FONTS[theme.fontStyle];

  const cardFrame = { left: card.left * u, top: card.top * u, width: card.width * u, height: card.height * u, borderRadius: cardRadius };

  return <View collapsable={false} style={{ width: canvas.width * u, height: canvas.height * u, overflow: 'hidden', backgroundColor: colors.background }}>
    {theme.backgroundType === 'gradient' ? <LinearGradient colors={[colors.background, colors.backgroundEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
    <Decorations theme={theme} u={u} canvas={canvas} />

    {/* A drawn two-layer shadow: platform shadows (Android elevation especially) don't survive a capture. */}
    <View style={[styles.absolute, cardFrame, { top: cardFrame.top + 10 * u, left: cardFrame.left + 4 * u, width: cardFrame.width - 8 * u, backgroundColor: darkCanvas ? 'rgba(0,0,0,0.35)' : 'rgba(24,32,40,0.07)' }]} />
    <View style={[styles.absolute, cardFrame, { top: cardFrame.top + 4 * u, backgroundColor: darkCanvas ? 'rgba(0,0,0,0.3)' : 'rgba(24,32,40,0.06)' }]} />

    <View style={[styles.absolute, cardFrame, { backgroundColor: colors.surface, overflow: 'hidden' }]}>
      <View style={{ position: 'absolute', left: card.padding * u, top: card.padding * u, width: box.width * u, height: box.height * u }}>
        {layout.images.map((frame, index) => {
          const image = content.images[index];
          const uri = image ? resolveAttachmentUri(image.storagePath) : null;
          return <View key={image?.id ?? index} style={[styles.absolute, { left: frame.left * u, top: frame.top * u, width: frame.width * u, height: frame.height * u, borderRadius: 16 * u, backgroundColor: colors.decoration, overflow: 'hidden' }]}>
            {uri ? <Image source={{ uri }} contentFit="cover" cachePolicy="memory" style={StyleSheet.absoluteFill} onLoad={() => onImageLoad?.(image.id)} onError={() => onImageLoad?.(image.id)} /> : null}
          </View>;
        })}

        {layout.textBlock ? <View style={[styles.absolute, styles.textBlock, { top: layout.textBlock.top * u, height: layout.textBlock.height * u, alignItems: center ? 'center' : 'flex-start' }]}>
          {layout.mark ? <View style={{ height: layout.mark.height * u, justifyContent: 'flex-start', alignItems: center ? 'center' : 'flex-start' }}>
            {theme.mark === 'quote'
              ? <Text style={[QUOTE_FONT, styles.quote, { fontSize: 58 * u, lineHeight: 62 * u, height: layout.mark.height * u, color: colors.accent }]}>“</Text>
              : theme.mark === 'cross'
                // A simple Latin cross drawn from two bars (no icon font has one).
                ? <View style={{ width: 16 * u, height: 24 * u }}>
                  <View style={[styles.absolute, { left: 6.5 * u, top: 0, width: 3 * u, height: 24 * u, borderRadius: 1 * u, backgroundColor: colors.accent }]} />
                  <View style={[styles.absolute, { left: 0, top: 6 * u, width: 16 * u, height: 3 * u, borderRadius: 1 * u, backgroundColor: colors.accent }]} />
                </View>
                : <View style={{ marginTop: 4 * u, width: 30 * u, height: 4 * u, borderRadius: 2 * u, backgroundColor: colors.accent }} />}
          </View> : null}
          {layout.title && content.title ? <Text numberOfLines={1} style={[styles.title, { width: box.width * u, height: layout.title.height * u, fontSize: 11 * u, lineHeight: 16 * u, letterSpacing: 1.2 * u, color: colors.accent, textAlign }]}>{content.title.toUpperCase()}</Text> : null}
          {fit && content.text ? <Text
            numberOfLines={fit.maxLines}
            ellipsizeMode="tail"
            style={[font, styles.body, {
              width: box.width * u, maxHeight: fit.maxLines * fit.lineHeight * u,
              fontSize: fit.fontSize * u, lineHeight: fit.lineHeight * u,
              letterSpacing: (font.letterSpacing ?? 0) * u, color: colors.textPrimary, textAlign,
            }]}
          >{content.text}</Text> : null}
        </View> : null}

        {layout.footer ? <View style={[styles.absolute, styles.footer, { top: layout.footer.top * u, height: layout.footer.height * u, justifyContent: center || mode === 'image' ? 'center' : 'flex-start', gap: 5 * u }]}>
          <Ionicons name="chatbubbles" size={11 * u} color={colors.accent} />
          <Text style={[styles.footerText, { fontSize: 10 * u, lineHeight: 14 * u, letterSpacing: 0.3 * u, color: colors.textSecondary }]}>Shared from Chits</Text>
        </View> : null}
      </View>
    </View>

    {theme.mark === 'tape' ? <View style={[styles.absolute, { left: (canvas.width / 2 - 44) * u, top: (card.top - 11) * u, width: 88 * u, height: 24 * u, borderRadius: 3 * u, backgroundColor: colors.accent, opacity: 0.28, transform: [{ rotate: '-3deg' }] }]} /> : null}
    {theme.stickers ? <CornerStickers theme={theme} u={u} canvas={canvas} card={card} /> : null}
  </View>;
});

function ChecklistRows({ subtasks, theme, u, onRowHeight }: { subtasks: ShareNoteSubtask[]; theme: ShareNoteTheme; u: number; onRowHeight?: (index: number, height: number) => void }) {
  return <View style={{ gap: 7 * u }}>
    {subtasks.map((item, index) => <View key={index} onLayout={onRowHeight ? ({ nativeEvent }) => onRowHeight(index, nativeEvent.layout.height / u) : undefined} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 * u, minHeight: 22 * u }}>
      <Ionicons name={item.isCompleted ? 'checkbox-outline' : 'square-outline'} size={18 * u} color={theme.colors.accent} style={{ marginTop: 2 * u }} />
      <Text style={[FONTS[theme.fontStyle], { flex: 1, flexShrink: 1, color: item.isCompleted ? theme.colors.textSecondary : theme.colors.textPrimary, fontSize: 15 * u, lineHeight: 22 * u, includeFontPadding: false }]}>{item.title}</Text>
    </View>)}
  </View>;
}

/** Actual row measurements at the export width decide page breaks before capture. */
export function ChecklistMeasure({ subtasks, theme, format, width, onRowHeight }: { subtasks: ShareNoteSubtask[]; theme: ShareNoteTheme; format: ShareNoteFormat; width: number; onRowHeight: (index: number, height: number) => void }) {
  const frame = shareNoteLayout({ format, mode: 'text', imageCount: 0, hasTitle: false, showMark: false, showBranding: false });
  const u = width / SHARE_NOTE_DESIGN_WIDTH;
  return <View style={{ width: frame.content.width * u }}><ChecklistRows subtasks={subtasks} theme={theme} u={u} onRowHeight={onRowHeight} /></View>;
}

/** Cards with checklists use natural text layout, so every row can wrap and grow. */
const ChecklistShareNoteTemplate = memo(function ChecklistShareNoteTemplate({ content, theme, format, mode, showBranding, width, onImageLoad, onCanvasReady, page }: ShareNoteTemplateProps) {
  const u = width / SHARE_NOTE_DESIGN_WIDTH;
  const frame = shareNoteLayout({ format, mode, imageCount: content.images.length, hasTitle: Boolean(content.title), showMark: false, showBranding });
  const [measuredContentHeight, setMeasuredContentHeight] = useState(0);
  const cardHeight = Math.max(frame.card.height, Math.ceil(measuredContentHeight / u) + 4);
  const canvas = { width: SHARE_NOTE_DESIGN_WIDTH, height: cardHeight + frame.card.top * 2 };
  const { colors } = theme;
  const darkCanvas = isDark(colors.background);
  const imageCount = content.images.length;
  const imageHeight = (format === 'story' ? 190 : format === 'square' ? 150 : 170) * u;
  useEffect(() => { if (measuredContentHeight > 0) onCanvasReady?.(canvas.height); }, [canvas.height, measuredContentHeight, onCanvasReady]);

  return <View collapsable={false} style={{ width, height: canvas.height * u, overflow: 'hidden', backgroundColor: colors.background }}>
    {theme.backgroundType === 'gradient' ? <LinearGradient colors={[colors.background, colors.backgroundEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
    <Decorations theme={theme} u={u} canvas={canvas} />
    <View style={[styles.absolute, { left: (frame.card.left + 4) * u, top: (frame.card.top + 10) * u, width: (frame.card.width - 8) * u, height: cardHeight * u, borderRadius: 26 * u, backgroundColor: darkCanvas ? 'rgba(0,0,0,0.35)' : 'rgba(24,32,40,0.07)' }]} />
    <View style={[styles.absolute, { left: frame.card.left * u, top: frame.card.top * u, width: frame.card.width * u, height: cardHeight * u, borderRadius: 26 * u, backgroundColor: colors.surface, overflow: 'hidden' }]}>
      <View onLayout={({ nativeEvent }) => { const height = nativeEvent.layout.height; if (Math.abs(height - measuredContentHeight) > 0.5) setMeasuredContentHeight(height); }} style={{ width: frame.card.width * u, padding: frame.card.padding * u }}>
        {content.title ? <Text style={[FONTS[theme.fontStyle], { color: colors.accent, fontSize: 16 * u, lineHeight: 22 * u, fontWeight: '800', marginBottom: 11 * u }]}>{content.title}</Text> : null}
        {mode !== 'image' && content.text ? <Text numberOfLines={mode === 'text-image' ? 4 : 6} ellipsizeMode="tail" style={[FONTS[theme.fontStyle], { color: colors.textPrimary, fontSize: (mode === 'text-image' ? 14 : 16) * u, lineHeight: (mode === 'text-image' ? 20 : 22) * u, marginBottom: 14 * u, includeFontPadding: false }]}>{content.text}</Text> : null}
        {imageCount ? <View style={{ flexDirection: 'row', gap: 10 * u, marginBottom: 16 * u }}>
          {content.images.map((image) => {
            const uri = resolveAttachmentUri(image.storagePath);
            return <View key={image.id} style={{ width: imageCount === 1 ? frame.content.width * u : (frame.content.width - 10) / 2 * u, height: imageHeight, borderRadius: 14 * u, overflow: 'hidden', backgroundColor: colors.decoration }}>
              {uri ? <Image source={{ uri }} contentFit="cover" cachePolicy="memory" style={StyleSheet.absoluteFill} onLoad={() => onImageLoad?.(image.id)} onError={() => onImageLoad?.(image.id)} /> : null}
            </View>;
          })}
        </View> : null}
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.accent, opacity: 0.35, marginBottom: 12 * u }} />
        <Text style={{ color: colors.accent, fontSize: 11 * u, lineHeight: 16 * u, fontWeight: '800', letterSpacing: 1.1 * u, marginBottom: 9 * u }}>{page && page.total > 1 ? `CHECKLIST · PAGE ${page.index + 1} OF ${page.total}` : 'CHECKLIST'}</Text>
        <ChecklistRows subtasks={content.subtasks ?? []} theme={theme} u={u} />
        {showBranding ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 * u, marginTop: 20 * u }}><Ionicons name="chatbubbles" size={11 * u} color={colors.accent} /><Text style={{ color: colors.textSecondary, fontSize: 10 * u, lineHeight: 14 * u, fontWeight: '600' }}>Shared from Chits</Text></View> : null}
      </View>
    </View>
    {theme.mark === 'tape' ? <View style={[styles.absolute, { left: (canvas.width / 2 - 44) * u, top: (frame.card.top - 11) * u, width: 88 * u, height: 24 * u, borderRadius: 3 * u, backgroundColor: colors.accent, opacity: 0.28, transform: [{ rotate: '-3deg' }] }]} /> : null}
    {theme.stickers ? <CornerStickers theme={theme} u={u} canvas={canvas} card={frame.card} /> : null}
  </View>;
});

type IconName = ComponentProps<typeof Ionicons>['name'];
type Canvas = ShareNoteLayout['canvas'];

// Deterministic "scatter": the same note always draws the same way, in the
// preview and in the file.
const scatter = (index: number, salt: number) => {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

export function Decorations({ theme, u, canvas }: { theme: ShareNoteTheme; u: number; canvas: Canvas }) {
  const ink = theme.colors.decoration;
  const { width, height } = canvas;
  switch (theme.decorationStyle) {
    case 'soft-shapes':
      return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.absolute, { left: (width - 110) * u, top: -70 * u, width: 220 * u, height: 220 * u, borderRadius: 110 * u, backgroundColor: ink, opacity: 0.55 }]} />
        <View style={[styles.absolute, { left: -80 * u, top: (height - 120) * u, width: 200 * u, height: 200 * u, borderRadius: 100 * u, backgroundColor: ink, opacity: 0.45 }]} />
        <View style={[styles.absolute, { left: (width - 34) * u, top: height * 0.58 * u, width: 56 * u, height: 56 * u, borderRadius: 28 * u, backgroundColor: ink, opacity: 0.5 }]} />
      </View>;
    case 'lines':
      return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: Math.ceil(height / 22) }, (_, index) => <View key={index} style={[styles.absolute, { left: 0, right: 0, top: (index * 22 + 11) * u, height: Math.max(1, 0.75 * u), backgroundColor: ink }]} />)}
      </View>;
    case 'dots':
      return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: Math.ceil(height / 40) * 8 }, (_, index) => {
          const row = Math.floor(index / 8);
          const size = (1.6 + scatter(index, 1) * 2.8) * u;
          return <View key={index} style={[styles.absolute, { left: ((index % 8) * 48 + (row % 2) * 24 + scatter(index, 2) * 10) * u, top: (row * 40 + scatter(index, 3) * 12) * u, width: size, height: size, borderRadius: size / 2, backgroundColor: ink, opacity: 0.5 + scatter(index, 4) * 0.5 }]} />;
        })}
      </View>;
    case 'stickers':
      return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: 10 }, (_, index) => {
          const glyphs = theme.stickers ?? ['sparkles'];
          const size = (14 + scatter(index, 5) * 22) * u;
          return <Ionicons key={index} name={glyphs[index % glyphs.length] as IconName} size={size} color={ink} style={[styles.absolute, { left: scatter(index, 6) * (width - 30) * u, top: scatter(index, 7) * (height - 30) * u, opacity: 0.55, transform: [{ rotate: `${Math.round(scatter(index, 8) * 50 - 25)}deg` }] }]} />;
        })}
      </View>;
    case 'confetti': {
      const palette = theme.confetti ?? [theme.colors.accent];
      return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: 22 }, (_, index) => {
          const shape = index % 3;
          const size = (6 + scatter(index, 9) * 10) * u;
          return <View key={index} style={[styles.absolute, {
            left: scatter(index, 10) * (width - 12) * u, top: scatter(index, 11) * (height - 12) * u,
            width: shape === 2 ? size * 2.2 : size, height: shape === 2 ? size * 0.5 : size,
            borderRadius: shape === 0 ? size : 2 * u, backgroundColor: palette[index % palette.length],
            transform: [{ rotate: `${Math.round(scatter(index, 12) * 180)}deg` }],
          }]} />;
        })}
      </View>;
    }
    case 'cross': {
      // A Latin cross of light. On a note it stands behind the card, its arms
      // reaching out past every edge; in a wide header band it stands slender
      // to one side, clear of the centered title.
      const band = height < width * 0.6;
      const beam = band ? 5 : 18;
      const vertical = band ? { top: height * 0.1, length: height * 0.8 } : { top: 6, length: height - 12 };
      const centerX = band ? width * 0.8 : width / 2;
      const armLength = band ? vertical.length * 0.62 : width - 16;
      const crossbarY = vertical.top + vertical.length * (band ? 0.3 : 0.28);
      return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.absolute, { left: (centerX - 60) * u, top: (crossbarY - 60) * u, width: 120 * u, height: 120 * u, borderRadius: 60 * u, backgroundColor: ink, opacity: 0.35 }]} />
        <View style={[StyleSheet.absoluteFill, { opacity: 0.8 }]}>
          <View style={[styles.absolute, { left: (centerX - beam / 2) * u, top: vertical.top * u, width: beam * u, height: vertical.length * u, borderRadius: beam / 3 * u, backgroundColor: ink }]} />
          <View style={[styles.absolute, { left: (centerX - armLength / 2) * u, top: (crossbarY - beam / 2) * u, width: armLength * u, height: beam * u, borderRadius: beam / 3 * u, backgroundColor: ink }]} />
        </View>
      </View>;
    }
    case 'ruled': {
      // Classic stationery: evenly ruled lines and, on a note, a margin rule in
      // the accent. A header band keeps just the lines, clear of its buttons.
      const band = height < width * 0.6;
      return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: Math.ceil(height / 24) }, (_, index) => <View key={index} style={[styles.absolute, { left: 0, right: 0, top: (index * 24 + 18) * u, height: Math.max(1, 0.75 * u), backgroundColor: ink }]} />)}
        {band ? null : <View style={[styles.absolute, { left: 30 * u, top: 0, bottom: 0, width: Math.max(1, 1.25 * u), backgroundColor: theme.colors.accent, opacity: 0.3 }]} />}
      </View>;
    }
    case 'cassette': {
      // A tape shell: fine grain, with the label's retro stripes running across
      // it — low behind a note, thin along the bottom of a header band.
      const stripes = theme.confetti ?? [theme.colors.accent];
      const band = height < width * 0.6;
      const thickness = band ? 4 : 12;
      const top = band ? height - thickness * stripes.length - 8 : height * 0.7;
      return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: Math.ceil((width * height) / 2400) }, (_, index) => {
          const size = (1.4 + scatter(index, 13) * 1.4) * u;
          return <View key={index} style={[styles.absolute, { left: scatter(index, 14) * width * u, top: scatter(index, 15) * height * u, width: size, height: size, borderRadius: size / 2, backgroundColor: ink }]} />;
        })}
        {stripes.map((color, index) => <View key={color + index} style={[styles.absolute, { left: 0, right: 0, top: (top + index * thickness) * u, height: thickness * u, backgroundColor: color }]} />)}
      </View>;
    }
    case 'dot-grid': {
      // A planner page: an even grid of small dots.
      const step = 30;
      const columns = Math.ceil(width / step);
      return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: columns * Math.ceil(height / step) }, (_, index) => {
          const size = 2.4 * u;
          return <View key={index} style={[styles.absolute, { left: ((index % columns) * step + step / 2) * u - size / 2, top: (Math.floor(index / columns) * step + step / 2) * u - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: ink }]} />;
        })}
      </View>;
    }
    case 'geometric': {
      // Floating rings, a rounded tile and small orbs: soft, futuristic depth.
      const colors = theme.confetti ?? [theme.colors.accent];
      const band = height < width * 0.6;
      // [left, top, width, height, radius, color, opacity, ring thickness (0 = filled), rotation]
      const shapes: [number, number, number, number, number, number, number, number, number][] = band
        ? [
          [width - 90, -40, 120, 120, 60, 0, 0.3, 10, 0],
          [-20, height - 30, 50, 50, 14, 1, 0.3, 0, 18],
          [width * 0.62, height * 0.55, 16, 16, 8, 2, 0.6, 0, 0],
          [width * 0.3, height * 0.15, 18, 18, 9, 3, 0.5, 3, 0],
        ]
        : [
          [width - 120, -50, 190, 190, 95, 0, 0.35, 16, 0],
          [-40, height - 150, 130, 130, 36, 1, 0.35, 0, 18],
          [width - 70, height * 0.62, 44, 44, 22, 2, 0.6, 0, 0],
          [26, height * 0.18, 36, 36, 18, 3, 0.6, 5, 0],
          [width * 0.55, height - 40, 70, 18, 9, 0, 0.45, 0, -12],
        ];
      return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {shapes.map(([left, top, w, h, radius, colorIndex, opacity, ring, rotate], index) => {
          const color = colors[colorIndex % colors.length];
          return <View key={index} style={[styles.absolute, {
            left: left * u, top: top * u, width: w * u, height: h * u, borderRadius: radius * u, opacity,
            transform: [{ rotate: `${rotate}deg` }],
            ...(ring ? { borderWidth: ring * u, borderColor: color } : { backgroundColor: color }),
          }]} />;
        })}
      </View>;
    }
    default:
      return null;
  }
}

// A couple of stickers on the card's corners, like they were pressed on by hand.
function CornerStickers({ theme, u, canvas, card }: { theme: ShareNoteTheme; u: number; canvas: Canvas; card: ShareNoteLayout['card'] }) {
  const glyphs = (theme.stickers ?? []) as IconName[];
  if (!glyphs.length) return null;
  const spots = [
    { left: canvas.width - card.left - 22, top: card.top - 16, size: 30, rotate: 14 },
    { left: card.left - 10, top: canvas.height - card.top - 20, size: 26, rotate: -12 },
  ];
  return <>
    {spots.map((spot, index) => <Ionicons key={index} name={glyphs[index % glyphs.length]} size={spot.size * u} color={theme.colors.accent} style={[styles.absolute, { left: spot.left * u, top: spot.top * u, transform: [{ rotate: `${spot.rotate}deg` }] }]} />)}
  </>;
}

const styles = StyleSheet.create({
  absolute: { position: 'absolute' },
  textBlock: { left: 0, right: 0, justifyContent: 'center' },
  quote: { includeFontPadding: false, fontWeight: '700' },
  title: { fontWeight: '800' },
  body: { includeFontPadding: false },
  footer: { left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  footerText: { fontWeight: '600' },
});
