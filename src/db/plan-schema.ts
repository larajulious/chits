export const PLAN_COLUMNS: Record<string, string[]> = {
  daily_plans: ['id', 'plan_date', 'status', 'reflection', 'created_at', 'updated_at', 'wrapped_at'],
  daily_tasks: ['id', 'plan_id', 'title', 'completed_at', 'position', 'reminder_at', 'message_id', 'card_id', 'carried_from', 'carried_to', 'created_at', 'updated_at'],
};

// plan_date is the device's local calendar day (YYYY-MM-DD), so a plan belongs to
// the day it was made on, wherever the phone goes next. Links to notes and cards
// are plain ids, not foreign keys: a task never deletes a note, and a note going
// away just leaves the task with its own title.
export const PLAN_SCHEMA = `
  CREATE TABLE IF NOT EXISTS daily_plans (
    id TEXT PRIMARY KEY NOT NULL,
    plan_date TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','wrapped')),
    reflection TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    wrapped_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS daily_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed_at INTEGER,
    position INTEGER NOT NULL,
    reminder_at INTEGER,
    message_id TEXT,
    card_id TEXT,
    carried_from TEXT,
    carried_to TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_daily_tasks_plan ON daily_tasks(plan_id, position);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_tasks_carry ON daily_tasks(plan_id, carried_from) WHERE carried_from IS NOT NULL;
`;
