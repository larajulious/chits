import { Divider, HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, containerBackground, cornerRadius, environment, font, foregroundStyle, frame, lineLimit, padding, privacySensitive, resizable, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { AnywhereSnapshot } from './snapshot';

const layout = (props: AnywhereSnapshot, widgetEnvironment: WidgetEnvironment) => {
  'widget';
  const small = widgetEnvironment.widgetFamily === 'systemSmall';
  const large = widgetEnvironment.widgetFamily === 'systemLarge';
  const quickURL = 'chits:///chat?focusInput=1';
  const privacy = props.version === 1 && (props.privacy === 'titles' || props.privacy === 'previews') ? props.privacy : 'hidden';
  const notes = privacy !== 'hidden' && Array.isArray(props.notes) ? props.notes.slice(0, large ? 5 : 2) : [];
  const fg = props.foreground ?? '#24231F';
  const secondary = props.secondary ?? '#5F5C52';
  const modifiers = [frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }), foregroundStyle(fg), environment('locale', props.locale ?? 'en'), containerBackground(props.background ?? '#F7F8F6', 'widget'), widgetURL(quickURL)];
  const mascot = props.mascot ? <Image uiImage={props.mascot} modifiers={[resizable(), frame({ width: small ? 44 : 24, height: small ? 44 : 24 }), cornerRadius(6)]} /> : <Image systemName="note.text" size={small ? 44 : 24} />;
  const quick = <Link destination={quickURL}>
    <HStack spacing={5} modifiers={[frame({ maxWidth: Infinity, minHeight: small ? 24 : 20, alignment: 'leading' }), padding({ all: 8 }), background(props.accent ?? '#FBE47E'), cornerRadius(12)]}>
      <Image systemName="square.and.pencil" size={16} color={props.onAccent ?? '#2B2410'} />
      <Text modifiers={[font({ size: small ? 13 : 12, weight: 'bold', design: 'rounded' }), foregroundStyle(props.onAccent ?? '#2B2410'), lineLimit(2)]}>{props.quick ?? 'Quick Note'}</Text>
    </HStack>
  </Link>;
  if (small) return <VStack alignment="leading" spacing={8} modifiers={modifiers}>{mascot}<Spacer />{quick}</VStack>;
  const rows = notes.map((note, index) => <VStack key={`${note.kind}:${note.id}`} alignment="leading" spacing={0} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'leading' })]}>
    {index > 0 ? <Divider /> : null}
    <Link destination={note.url} modifiers={[privacySensitive()]}>
      <VStack alignment="leading" spacing={3} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'leading' }), padding({ vertical: large ? 6 : 3 })]}>
        <HStack spacing={6}>
          <Image systemName="document" size={14} color={secondary} />
          <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(fg), lineLimit(1), frame({ maxWidth: Infinity, alignment: 'leading' })]}>{note.title}</Text>
        </HStack>
        <HStack spacing={8} modifiers={[padding({ leading: 20 }), frame({ maxWidth: Infinity, alignment: 'leading' })]}>
          {large && privacy === 'previews' && note.preview ? <Text modifiers={[font({ size: 11 }), foregroundStyle(secondary), lineLimit(1), frame({ maxWidth: Infinity, alignment: 'leading' })]}>{note.preview}</Text> : null}
          <Text date={new Date(note.updatedAt)} dateStyle="relative" modifiers={[font({ size: 10 }), foregroundStyle(secondary), lineLimit(1)]} />
        </HStack>
      </VStack>
    </Link>
  </VStack>);
  return <VStack alignment="leading" spacing={6} modifiers={modifiers}>
    <HStack spacing={6}>
      {mascot}
      <Text modifiers={[font({ size: large ? 14 : 12, weight: 'semibold', design: 'rounded' }), lineLimit(2), frame({ maxWidth: Infinity, alignment: 'leading' })]}>{props.brand ?? 'Chits Anywhere'}</Text>
      <VStack modifiers={[frame({ width: 104 })]}>{quick}</VStack>
    </HStack>
    <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondary), lineLimit(1)]}>{props.recent ?? 'Recent Notes'}</Text>
    <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: notes.length ? 'topLeading' : 'leading' })]}>
      {notes.length ? rows : <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(4)]}>{privacy === 'hidden' ? props.hidden ?? props.brand : props.empty}</Text>}
    </VStack>
  </VStack>;
};
export default createWidget('ChitsAnywhere', layout);
