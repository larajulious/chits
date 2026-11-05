import type { WidgetToggle } from './plan-core';
import type { PlanWidgetSnapshot } from './plan-widget-snapshot';

export async function drainPlanWidget(): Promise<WidgetToggle[]> { return []; }
export async function publishPlanWidget(_today: PlanWidgetSnapshot, _fresh: PlanWidgetSnapshot, _midnight: Date) {}
export function observePlanWidget(_changed: () => void) { return () => undefined; }
export const planWidgetInteractive = false;
