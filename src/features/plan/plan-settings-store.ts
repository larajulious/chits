import type { SQLiteDatabase } from 'expo-sqlite';

import { PLAN_NOTIFICATION_DEFAULTS, PLAN_NOTIFICATION_KEYS, type PlanNotificationSettings } from './plan-core';

export async function readPlanNotificationSettings(database: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<PlanNotificationSettings> {
  const rows = await database.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM app_settings WHERE key LIKE 'plan\\_%' ESCAPE '\\'");
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  return {
    morning: value(PLAN_NOTIFICATION_KEYS.morning) === 'true', morningTime: value(PLAN_NOTIFICATION_KEYS.morningTime) ?? PLAN_NOTIFICATION_DEFAULTS.morningTime,
    evening: value(PLAN_NOTIFICATION_KEYS.evening) === 'true', eveningTime: value(PLAN_NOTIFICATION_KEYS.eveningTime) ?? PLAN_NOTIFICATION_DEFAULTS.eveningTime,
  };
}
