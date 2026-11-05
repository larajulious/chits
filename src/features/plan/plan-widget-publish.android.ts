import { requireOptionalNativeModule } from 'expo';

import type { WidgetToggle } from './plan-core';
import type { PlanWidgetSnapshot } from './plan-widget-snapshot';

const native = requireOptionalNativeModule<{ updatePlanSnapshot: (snapshot: string, fresh: string) => Promise<void>; takePlanPending: () => Promise<string> }>('ChitsAnywhere');
export const planWidgetInteractive = true;

export async function drainPlanWidget(): Promise<WidgetToggle[]> {
  if (!native?.takePlanPending) return [];
  const parsed: unknown = JSON.parse(await native.takePlanPending());
  return Array.isArray(parsed) ? parsed as WidgetToggle[] : [];
}

export async function publishPlanWidget(today: PlanWidgetSnapshot, fresh: PlanWidgetSnapshot, _midnight: Date) {
  await native?.updatePlanSnapshot?.(JSON.stringify(today), JSON.stringify(fresh));
}

export function observePlanWidget(_changed: () => void) { return () => undefined; }
