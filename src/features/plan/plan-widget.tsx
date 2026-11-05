import { Button, HStack, Image, Link, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, containerBackground, cornerRadius, environment, font, foregroundStyle, frame, lineLimit, padding, privacySensitive, resizable, tint } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { PlanWidgetSnapshot } from './plan-widget-snapshot';

// Runs inside the widget's own engine: only its props exist here, so everything
// it needs is passed in, and a tick is recorded in `pending` for the app to save.
const layout = (props: PlanWidgetSnapshot, widgetEnvironment: WidgetEnvironment) => {
  'widget';
  const family = widgetEnvironment.widgetFamily;
  const small = family === 'systemSmall';
  const large = family === 'systemLarge';
  const fg = props.foreground ?? '#24231F';
  const secondary = props.secondary ?? '#5F5C52';
  const accent = props.accent ?? '#FBE47E';
  const onAccent = props.onAccent ?? '#2B2410';
  const state = props.state ?? 'none';
  const total = props.total ?? 0;
  const done = props.done ?? 0;
  const root = [frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }), foregroundStyle(fg), environment('locale', props.locale ?? 'en'), containerBackground(props.background ?? '#F7F8F6', 'widget')];
  const mascot = props.mascot ? <Image uiImage={props.mascot} modifiers={[resizable(), frame({ width: small ? 30 : 24, height: small ? 30 : 24 }), cornerRadius(6)]} /> : <Image systemName="checklist" size={small ? 26 : 20} color={fg} />;
  const action = (label: string, url: string, icon: 'sun.max' | 'moon' | 'plus' | 'checklist') => <Link destination={url}>
    <HStack spacing={5} modifiers={[padding({ vertical: 6, horizontal: 10 }), background(accent), cornerRadius(10)]}>
      <Image systemName={icon} size={13} color={onAccent} />
      <Text modifiers={[font({ size: 12, weight: 'bold', design: 'rounded' }), foregroundStyle(onAccent), lineLimit(1)]}>{label}</Text>
    </HStack>
  </Link>;
  const message = state === 'none' ? props.none : state === 'allDone' ? props.allDone : state === 'wrapped' ? props.wrapped : props.keepGoing;
  const bar = total > 0 ? <ProgressView value={done / total} modifiers={[tint(fg), frame({ maxWidth: Infinity })]} /> : null;
  const toggle = (id: string, nextDone: boolean) => {
    const tasks = (props.tasks ?? []).map((task) => (task.id === id ? { ...task, done: nextDone } : task));
    const nextCount = done + (nextDone ? 1 : -1);
    return {
      tasks, done: nextCount, state: nextCount === total ? 'allDone' : 'active',
      count: (props.count ?? '').replace(String(done), String(nextCount)),
      pending: [...(props.pending ?? []), { id, done: nextDone, at: Date.now() }],
    };
  };

  if (small) return <VStack alignment="leading" spacing={6} modifiers={[...root]}>
    <HStack spacing={6}>{mascot}<Text modifiers={[font({ size: 14, weight: 'bold', design: 'rounded' }), lineLimit(1)]}>{props.today}</Text></HStack>
    <Spacer />
    {total > 0 ? <Text modifiers={[font({ size: 15, weight: 'semibold', design: 'rounded' }), lineLimit(1)]}>{props.count}</Text> : null}
    {bar}
    <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(2)]}>{message}</Text>
  </VStack>;

  const limit = large ? 6 : 3;
  // A finished day says so instead of listing what's already ticked.
  const rows = (state === 'allDone' || state === 'wrapped' ? [] : props.tasks ?? []).slice(0, limit).map((task) => <HStack key={task.id} spacing={8} modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
    {props.interactive
      ? <Button target={`task:${task.id}`} systemImage={task.done ? 'checkmark.circle.fill' : 'circle'} label="" onPress={() => toggle(task.id, !task.done)} />
      : <Image systemName={task.done ? 'checkmark.circle.fill' : 'circle'} size={16} color={secondary} />}
    <Link destination={`chits:///plan?task=${encodeURIComponent(task.id)}`} modifiers={[privacySensitive()]}>
      <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(task.done ? secondary : fg), lineLimit(1), frame({ maxWidth: Infinity, alignment: 'leading' })]}>{task.title}</Text>
    </Link>
  </HStack>);

  return <VStack alignment="leading" spacing={large ? 8 : 5} modifiers={[...root]}>
    <HStack spacing={6}>
      {mascot}
      <Text modifiers={[font({ size: 13, weight: 'bold', design: 'rounded' }), lineLimit(1), frame({ maxWidth: Infinity, alignment: 'leading' })]}>{props.dateLabel}</Text>
      {total > 0 ? <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(secondary), lineLimit(1)]}>{props.count}</Text> : null}
    </HStack>
    {bar}
    {rows.length ? <VStack alignment="leading" spacing={large ? 7 : 3} modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>{rows}</VStack>
      : <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary), lineLimit(3)]}>{props.hiddenTasks ? props.hidden : message}</Text>}
    <Spacer />
    <HStack spacing={6}>
      {state === 'none' ? action(props.action, 'chits:///plan', 'sun.max') : null}
      {state === 'wrapped' ? action(props.recap, 'chits:///plan', 'moon') : null}
      {state === 'active' || state === 'allDone' ? <>
        {large ? action(props.add, 'chits:///plan?add=1', 'plus') : action(props.view, 'chits:///plan', 'checklist')}
        {large ? action(props.wrap, 'chits:///plan?wrap=1', 'moon') : null}
      </> : null}
    </HStack>
  </VStack>;
};
export default createWidget('ChitsPlan', layout);
