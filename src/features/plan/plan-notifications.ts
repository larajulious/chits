import type { PlanNotificationSettings } from './plan-core';

export async function syncPlanNotifications(_input: { settings: PlanNotificationSettings; hasPlan: boolean; wrapped: boolean; tasks: { id: string; title: string; reminderAt: number }[] }) {}
export function observePlanNotifications(_open: (target: 'plan' | 'wrap') => void) { return () => undefined; }
