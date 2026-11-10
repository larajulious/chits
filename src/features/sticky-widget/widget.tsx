import { Circle, HStack, Image, Link, Rectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, aspectRatio, background, clipped, containerBackground, cornerRadius, environment, font, foregroundStyle, frame, lineLimit, multilineTextAlignment, offset, opacity, padding, privacySensitive, resizable, rotationEffect, shadow, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { StickyWidgetNote, StickyWidgetSnapshot } from './snapshot';

/** Set per widget in Edit Widget: which Space it shows. */
export type StickyWidgetConfiguration = { space?: string };

// Runs inside the widget's own engine: only props and environment exist here
// (no imports, no outer values), so every color and size is spelled out, from
// SpaceSurface, PaperNote, SpacePhoto, Cassette and PinDecoration in
// src/components/spaces. Two rules of that engine: nested Text runs are
// dropped, and this function travels as a source string whose escapes are
// read twice, so it must contain no backslash (codes build those characters).
const layout = (props: StickyWidgetSnapshot, env: WidgetEnvironment<StickyWidgetConfiguration>) => {
  'widget';
  const family = env.widgetFamily;
  const size = family === 'systemSmall' ? 'small' : family === 'systemLarge' ? 'large' : 'medium';
  const wanted = env.configuration?.space;
  const spaceId = wanted === 'desk' || wanted === 'cork' || wanted === 'wall' ? wanted : 'fridge';
  const spaces = props && props.version === 1 && Array.isArray(props.spaces) ? props.spaces : [];
  const space = spaces.find((item) => item.id === spaceId);
  const ink = props?.ink ?? '#2A2622';
  const body = 'Nunito-SemiBold';
  const mono = 'SpaceMono-Bold';
  const slash = String.fromCharCode(92);
  const newline = String.fromCharCode(10);
  const marks = `${slash}${String.fromCharCode(96)}*_~[]()<>#!|{}`;
  // The words are the user's own: Markdown characters in them stay literal.
  const escape = (value: string) => value.split('').map((char) => (marks.includes(char) ? slash + char : char)).join('');
  const full = frame({ maxWidth: Infinity, maxHeight: Infinity });
  // iOS doesn't tell a widget its size. The notes sit on a canvas the size of
  // this family on the smallest iOS 17 iPhone, centered; the surface fills the rest.
  const W = size === 'small' ? 148 : 321;
  const H = size === 'large' ? 324 : 148;
  const s = size === 'small' ? 0.6 : 0.85;
  const scatter = (index: number, salt: number) => { const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453; return value - Math.floor(value); };
  const gradient = (colors: string[], from: { x: number; y: number }, to: { x: number; y: number }) => ({ type: 'linearGradient' as const, colors, startPoint: from, endPoint: to });
  const radial = (colors: string[], center: { x: number; y: number }, radius: number) => ({ type: 'radialGradient' as const, colors, center, startRadius: 0, endRadius: radius });

  // ── The Space's surface ──────────────────────────────────────────────────
  const backdrop = spaceId === 'fridge' ? gradient(['#D7DAD6', '#F8F9F7', '#D7DAD6'], { x: 0, y: 0.5 }, { x: 1, y: 0.5 })
    : spaceId === 'desk' ? gradient(['#A8723F', '#8A5A2E'], { x: 0.33, y: 0 }, { x: 0.67, y: 1 })
    : spaceId === 'cork' ? gradient(['#7C5A37', '#5F4226'], { x: 0, y: 0 }, { x: 1, y: 1 })
    : '#8FA897';
  const corkFrame = size === 'small' ? 8 : 10;
  const layers = spaceId === 'fridge' ? [
    // A soft vertical reflection band, the freezer seam and the chrome handle.
    <Rectangle key="band" modifiers={[foregroundStyle(gradient(['#FFFFFF00', '#FFFFFF99', '#FFFFFF00'], { x: 0, y: 0.5 }, { x: 1, y: 0.5 })), frame({ width: W * 0.2, height: H + 80 }), offset({ x: W * 0.22, y: -40 })]} />,
    <Rectangle key="seam" modifiers={[foregroundStyle('#282C2A38'), frame({ width: W + 120, height: 2 * s }), offset({ x: -60, y: Math.round(H * 0.1) })]} />,
    <Rectangle key="seam-light" modifiers={[foregroundStyle('#FFFFFFCC'), frame({ width: W + 120, height: 1 * s }), offset({ x: -60, y: Math.round(H * 0.1) + 2 * s })]} />,
    <Rectangle key="handle" modifiers={[foregroundStyle(gradient(['#8F9498', '#F4F5F5', '#B9BEC1', '#7F8488'], { x: 0, y: 0.5 }, { x: 1, y: 0.5 })), frame({ width: 11 * s, height: H * 0.24 }), cornerRadius(6 * s), shadow({ radius: 4 * s, x: -2 * s, y: 3 * s, color: '#00000047' }), offset({ x: W - 10 * s - 11 * s, y: H * 0.17 })]} />,
  ] : spaceId === 'desk' ? Array.from({ length: Math.ceil((H + 40) / (11 * s)) }, (_, line) => <Rectangle key={line} modifiers={[
    foregroundStyle(line % 4 ? '#5C3818' : '#C48A52'), opacity(0.1 + scatter(line, 3) * 0.12),
    frame({ width: W + 120, height: Math.max(0.6, (0.8 + scatter(line, 2) * 1.8) * s) }), rotationEffect((scatter(line, 4) - 0.5) * 1.4),
    offset({ x: -60, y: line * 11 * s + scatter(line, 1) * 5 * s - 20 }),
  ]} />) : spaceId === 'cork' ? Array.from({ length: size === 'large' ? 90 : 50 }, (_, dot) => {
    const diameter = (1.2 + scatter(dot, 5) * 2.6) * s;
    return <Circle key={dot} modifiers={[foregroundStyle(dot % 3 ? '#8A5E33' : '#E7C08D'), opacity(0.45), frame({ width: diameter, height: diameter }), offset({ x: corkFrame + scatter(dot, 6) * (W - corkFrame * 2), y: corkFrame + scatter(dot, 7) * (H - corkFrame * 2) })]} />;
  }) : [];
  const surface = [
    spaceId === 'cork' ? <Rectangle key="cork" modifiers={[foregroundStyle('#C79764'), full, padding({ all: corkFrame })]} /> : null,
    spaceId === 'wall' ? <Rectangle key="light" modifiers={[foregroundStyle(radial(['#FFFFFF4D', '#FFFFFF00'], { x: 0.5, y: 0.14 }, W * 0.6)), full]} /> : null,
    <ZStack key="details" alignment="topLeading" modifiers={[frame({ width: W, height: H, alignment: 'topLeading' })]}>{layers}</ZStack>,
    spaceId === 'cork' ? <VStack key="frame-shadow" modifiers={[full, padding({ all: corkFrame })]}><Rectangle modifiers={[foregroundStyle(gradient(['#00000073', '#00000000'], { x: 0.5, y: 0 }, { x: 0.5, y: 1 })), frame({ maxWidth: Infinity, height: 10 })]} /><Spacer /></VStack> : null,
    spaceId === 'desk' || spaceId === 'wall' ? <Rectangle key="vignette" modifiers={[foregroundStyle(radial(spaceId === 'desk' ? ['#1C0E0400', '#1C0E0400', '#1C0E048C'] : ['#1E2D2400', '#1E2D2400', '#1E2D244D'], { x: 0.5, y: 0.5 }, W * 0.8)), full]} /> : null,
  ];

  // ── A note, as the board draws it, at `k` times its size ─────────────────
  const pin = (note: StickyWidgetNote, k: number, w: number) => {
    const style = space?.pin ?? 'magnet';
    if (style === 'magnet' || style === 'pushpin') {
      const diameter = (style === 'magnet' ? 22 : 16) * k;
      return <Circle modifiers={[
        foregroundStyle(radial(['#FFFFFFBF', note.pinColor, note.pinColor, '#00000047'], { x: 0.3, y: 0.27 }, diameter * 0.75)),
        frame({ width: diameter, height: diameter }), shadow({ radius: 1.5 * k, x: style === 'pushpin' ? 2.5 * k : 0, y: 2.5 * k, color: '#00000061' }),
        offset({ x: w / 2 - diameter / 2, y: style === 'magnet' ? -10 * k : 6 * k }),
      ]} />;
    }
    const washi = style === 'washi';
    const length = (washi ? 64 : 60) * k;
    return <ZStack modifiers={[frame({ width: length, height: 20 * k }), clipped(), rotationEffect(note.tapeTilt), offset({ x: w / 2 - length / 2, y: -10 * k })]}>
      <Rectangle modifiers={[foregroundStyle(washi ? note.pinColor : '#FAF8F09E'), opacity(washi ? 0.85 : 1)]} />
      {washi ? <HStack spacing={5 * k}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((stripe) => <Rectangle key={stripe} modifiers={[foregroundStyle('#FFFFFF61'), frame({ width: 5 * k, height: 40 * k }), rotationEffect(45)]} />)}</HStack> : null}
    </ZStack>;
  };

  const paper = (note: StickyWidgetNote, k: number, w: number, h: number) => {
    const index = note.paper === 'index';
    const receipt = note.paper === 'receipt';
    const textSize = (index || receipt ? 18 : 21) * k;
    const words = note.lines.map((line) => line.s === 'h' ? `**${escape(line.t)}**` : line.s === 'x' ? `☑ ~~${escape(line.t.replace(/^☑ /, ''))}~~` : escape(line.t)).join(newline);
    const rules = Math.floor(h / (22 * k));
    return <ZStack alignment="topLeading" modifiers={[frame({ width: w, height: h, alignment: 'topLeading' })]}>
      <Rectangle modifiers={[foregroundStyle(index || receipt ? note.base : gradient([note.base, note.base, note.base, note.curl], { x: 0.45, y: 0 }, { x: 0.55, y: 1 })), frame({ width: w, height: h }), cornerRadius(2 * k), shadow({ radius: 4.5 * k, y: 4.5 * k, color: '#00000038' })]} />
      {receipt ? <HStack spacing={2.3 * k} modifiers={[frame({ width: w, height: 8 * k }), clipped(), offset({ y: h - 2 * k })]}>
        {Array.from({ length: Math.ceil(w / (8 * k)) }, (_, tooth) => <Rectangle key={tooth} modifiers={[foregroundStyle(note.base), frame({ width: 5.7 * k, height: 5.7 * k }), rotationEffect(45), offset({ y: -2.8 * k })]} />)}
      </HStack> : null}
      {index ? Array.from({ length: rules }, (_, rule) => <Rectangle key={rule} modifiers={[foregroundStyle('#BCD2EA'), frame({ width: w, height: Math.max(0.5, k) }), offset({ y: (rule + 1) * 22 * k })]} />) : null}
      {index ? <Rectangle modifiers={[foregroundStyle('#E9A3A3'), frame({ width: Math.max(0.5, k), height: h }), offset({ x: 24 * k })]} /> : null}
      {note.hidden
        ? <VStack spacing={2 * k} modifiers={[frame({ width: w, height: h })]}>
          <Image systemName="eye.slash" size={18 * k} color="#2A26228C" />
          <Text modifiers={[font({ family: body, size: 15 * k }), foregroundStyle('#2A2622A6'), lineLimit(1)]}>{props?.labels?.hidden ?? ''}</Text>
        </VStack>
        // The zero-width space keeps a note that reads exactly like a catalog string ("Desk") from being translated.
        : <Text markdownEnabled modifiers={[
          font({ family: body, size: textSize }), foregroundStyle(ink), lineLimit(index ? Math.max(1, rules - 1) : 3),
          frame({ width: w - (index ? 40 : receipt ? 24 : 26) * k, height: h - (index ? 5 : receipt ? 16 : 26) * k, alignment: 'topLeading' }),
          offset({ x: (index ? 30 : receipt ? 12 : 13) * k, y: (index ? 5 : receipt ? 16 : 18) * k }), privacySensitive(),
        ]}>{String.fromCharCode(8203) + words}</Text>}
      {note.images > 0 && !note.hidden ? <HStack spacing={2 * k} modifiers={[padding({ horizontal: 4 * k, vertical: 1 * k }), background('#FFFFFF73'), cornerRadius(7 * k), offset({ x: w - 34 * k, y: h - 20 * k })]}>
        <Image systemName="photo" size={10 * k} color="#2A2622B8" />
        <Text modifiers={[font({ size: 10 * k, weight: 'bold' }), foregroundStyle('#2A2622B8')]}>{String(note.images)}</Text>
      </HStack> : null}
    </ZStack>;
  };

  const print = (note: StickyWidgetNote, k: number, w: number, h: number) => <VStack spacing={0} modifiers={[padding({ top: 7 * k, leading: 7 * k, trailing: 7 * k }), frame({ width: w, height: h }), background('#FBFAF6'), cornerRadius(2 * k), shadow({ radius: 4.5 * k, y: 4.5 * k, color: '#00000038' })]}>
    <ZStack modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity }), background('#2A2622'), clipped()]}>
      {note.media?.type === 'photo' && note.media.image
        ? <Image uiImage={note.media.image} modifiers={[resizable(), aspectRatio({ contentMode: 'fill' }), frame({ maxWidth: Infinity, maxHeight: Infinity }), clipped(), privacySensitive()]} />
        : note.media?.type === 'video' ? <ZStack modifiers={[frame({ width: 26 * k, height: 26 * k })]}><Circle modifiers={[foregroundStyle('#00000080')]} /><Image systemName="play.fill" size={12 * k} color="#FFFFFF" /></ZStack> : null}
    </ZStack>
    <Text modifiers={[font({ family: body, size: 14 * k }), foregroundStyle(ink), lineLimit(1), frame({ maxWidth: Infinity, minHeight: 22 * k, maxHeight: 22 * k, alignment: 'leading' }), privacySensitive()]}>{note.media?.caption ?? ''}</Text>
  </VStack>;

  const cassette = (note: StickyWidgetNote, k: number, w: number) => {
    const height = w * 0.64;
    const reel = 17 * k;
    const wheel = <ZStack modifiers={[frame({ width: reel, height: reel })]}><Circle modifiers={[foregroundStyle('#FBFAF6')]} /><Circle modifiers={[foregroundStyle('#2B2C31'), frame({ width: reel * 0.32, height: reel * 0.32 })]} /></ZStack>;
    return <ZStack alignment="top" modifiers={[frame({ width: w, height }), background(gradient(['#3B3C42', '#2B2C31', '#1E1F23'], { x: 0.5, y: 0 }, { x: 0.5, y: 1 })), cornerRadius(7 * k), shadow({ radius: 4.5 * k, y: 4.5 * k, color: '#00000042' })]}>
      <VStack alignment="leading" spacing={2 * k} modifiers={[padding({ top: 3 * k, leading: 5 * k, trailing: 5 * k }), frame({ width: w - 20 * k, height: height * 0.66, alignment: 'top' }), background(gradient([note.base, note.base, note.base, note.curl], { x: 0.5, y: 0 }, { x: 0.5, y: 1 })), cornerRadius(3 * k), offset({ y: 7 * k })]}>
        <HStack spacing={4 * k}>
          <Text modifiers={[font({ family: body, size: 12.5 * k }), foregroundStyle(ink), lineLimit(1), frame({ maxWidth: Infinity, alignment: 'leading' }), privacySensitive()]}>{note.media?.caption ?? props?.labels?.voice ?? ''}</Text>
          <Text modifiers={[font({ family: mono, size: 7.5 * k }), foregroundStyle('#2A2622B3')]}>{note.media?.duration ?? ''}</Text>
        </HStack>
        <Rectangle modifiers={[foregroundStyle('#D8432ABF'), frame({ maxWidth: Infinity, height: 2 * k })]} />
        <HStack spacing={0} modifiers={[padding({ horizontal: 2.5 * k, vertical: 2.5 * k }), background('#1E1F23'), cornerRadius(reel)]}>
          {wheel}<Rectangle modifiers={[foregroundStyle('#5A3B2A'), frame({ width: w - 82 * k, height: reel * 0.62 })]} />{wheel}
        </HStack>
      </VStack>
      <Rectangle modifiers={[foregroundStyle('#3B3C42'), frame({ width: w * 0.56, height: 13 * k }), cornerRadius(4 * k), offset({ y: height - 13 * k })]} />
    </ZStack>;
  };

  // The board in miniature (widgetLayout in snapshot.ts): every note at its own
  // spot on the user's board, all scaled by one factor so spacing, overlaps and
  // order stay as arranged; fitted with the board's room for pins and shadows,
  // centered, never larger than on the board.
  const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  const shown = (space?.notes ?? []).slice(-12).map((note) => ({ ...note, left: finite(note.left, 8), top: finite(note.top, 16), tilt: Math.max(-4, Math.min(4, finite(note.tilt, 0))), tapeTilt: finite(note.tapeTilt, -3) }));
  const fitLeft = shown.length ? Math.min(...shown.map((note) => note.left)) - 8 : 0;
  const fitTop = shown.length ? Math.min(...shown.map((note) => note.top)) - 16 : 0;
  const fitRight = shown.length ? Math.max(...shown.map((note) => note.left)) + 132 + 8 : 1;
  const fitBottom = shown.length ? Math.max(...shown.map((note) => note.top)) + 124 + 10 : 1;
  const scale = Math.min(1, W / (fitRight - fitLeft), H / (fitBottom - fitTop));
  const originX = (W - (fitRight - fitLeft) * scale) / 2 - fitLeft * scale;
  const originY = (H - (fitBottom - fitTop) * scale) / 2 - fitTop * scale;
  const w = 132 * scale;
  const h = 124 * scale;
  const linked = size !== 'small';
  const stickies = shown.map((note) => {
    const object = note.object === 'cassette' ? cassette(note, scale, w) : note.object === 'print' ? print(note, scale, w, h) : paper(note, scale, w, h);
    const place = offset({ x: originX + note.left * scale, y: originY + note.top * scale });
    const sticky = <ZStack key={note.key} alignment="topLeading" modifiers={[frame({ width: w, height: h, alignment: 'topLeading' }), rotationEffect(note.tilt), ...(linked ? [] : [place])]}>{object}{pin(note, scale, w)}</ZStack>;
    // Small widgets take one tap target; on larger ones each note opens itself.
    return linked ? <Link key={note.key} destination={note.url} modifiers={[place, accessibilityLabel(note.hidden ? props?.labels?.hidden ?? '' : note.label)]}>{sticky}</Link> : sticky;
  });
  const name = space ? `${space.name}: ${shown.map((note) => (note.hidden ? props?.labels?.hidden ?? '' : note.label)).join(', ')}` : '';

  return <ZStack modifiers={[full, environment('locale', props?.locale ?? 'en'), containerBackground(backdrop, 'widget'), widgetURL(space?.url ?? `chits:///sticky?space=${spaceId}`), accessibilityLabel(name)]}>
    {surface}
    <ZStack alignment="topLeading" modifiers={[frame({ width: W, height: H, alignment: 'topLeading' }), clipped()]}>{stickies}</ZStack>
    {space && !shown.length ? <Text modifiers={[font({ family: body, size: size === 'small' ? 13 : 15 }), foregroundStyle(ink), multilineTextAlignment('center'), lineLimit(4), padding({ horizontal: 10, vertical: 7 }), background('#FBFAF6'), cornerRadius(2), shadow({ radius: 3, y: 3, color: '#00000038' }), rotationEffect(-1.5), padding({ horizontal: 18 })]}>{space.empty}</Text> : null}
  </ZStack>;
};

export default createWidget<StickyWidgetSnapshot, StickyWidgetConfiguration>('ChitsSticky', layout);
