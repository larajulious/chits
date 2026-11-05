import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import type { WidgetToggle } from './plan-core';
import type { PlanWidgetSnapshot } from './plan-widget-snapshot';

const available = () => Boolean(requireOptionalNativeModule('ExpoWidgets'));
/** Widget buttons need iOS 17. Before that a row opens the task instead. */
export const planWidgetInteractive = Number.parseInt(String(Platform.Version), 10) >= 17;

/** Ticks made while the app was closed live in the widget's saved timeline. */
export async function drainPlanWidget(): Promise<WidgetToggle[]> {
  if (!available()) return [];
  const { default: Widget } = await import('./plan-widget');
  const entries = await Widget.getTimeline();
  return entries.flatMap((entry) => entry.props?.pending ?? []);
}

export async function publishPlanWidget(today: PlanWidgetSnapshot, fresh: PlanWidgetSnapshot, midnight: Date) {
  if (!available()) return;
  const { widgetsDirectory } = await import('expo-widgets');
  const { default: Widget } = await import('./plan-widget');
  const image = widgetsDirectory ? `${widgetsDirectory.replace(/\/$/, '')}/chits-icon.png` : '';
  const mascot = image && (await FileSystem.getInfoAsync(image)).exists ? image : '';
  Widget.updateTimeline([{ date: new Date(), props: { ...today, mascot } }, { date: midnight, props: { ...fresh, mascot } }]);
}

export function observePlanWidget(changed: () => void) {
  if (!available()) return () => undefined;
  let stop: (() => void) | undefined;
  let cancelled = false;
  void import('expo-widgets').then(({ addUserInteractionListener }) => {
    if (cancelled) return;
    const subscription = addUserInteractionListener((event) => { if (event.source === 'ChitsPlan') changed(); });
    stop = () => subscription.remove();
  });
  return () => { cancelled = true; stop?.(); };
}
