import { addDatabaseChangeListener, useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { widgetPrivacy, WIDGET_PRIVACY_KEY } from '@/features/anywhere/snapshot';
import { useLanguage } from '@/localization/provider';
import { getFormattingLocale, tr } from '@/localization/runtime';
import { addDays, dateFromKey, latestToggles, nextMidnight } from './plan-core';
import { observePlanNotifications, syncPlanNotifications } from './plan-notifications';
import { createPlanRepository, subscribeToPlanChanges } from './plan-repository';
import { readPlanNotificationSettings } from './plan-settings-store';
import { drainPlanWidget, observePlanWidget, planWidgetInteractive, publishPlanWidget } from './plan-widget-publish';
import { freshDaySnapshot, planWidgetSnapshot } from './plan-widget-snapshot';
import { useToday } from './use-plan-day';

/** Keeps everything outside the planner in step: widget ticks in, snapshots and nudges out. */
export function PlanCoordinator() {
  const database = useSQLiteContext();
  const repository = useMemo(() => createPlanRepository(database), [database]);
  const { tokens } = useTheme();
  const { language } = useLanguage();
  const { today } = useToday();
  const previous = useRef('');

  useEffect(() => observePlanNotifications((target) => {
    requestAnimationFrame(() => router.push(target === 'wrap' ? '/plan?wrap=1' : '/plan'));
  }), []);

  useEffect(() => {
    let disposed = false;
    let running = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const label = (key: string) => dateFromKey(key).toLocaleDateString(getFormattingLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
    const sync = async () => {
      if (disposed) return;
      if (running) { again = true; return; }
      running = true;
      try {
        // Save widget ticks before publishing, or a new snapshot would erase them.
        for (const toggle of latestToggles(await drainPlanWidget())) await repository.setDone(toggle.id, toggle.done, toggle.at);
        const [day, setting, settings, reminders] = await Promise.all([
          repository.day(today),
          database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', WIDGET_PRIVACY_KEY),
          readPlanNotificationSettings(database),
          repository.upcomingReminders(),
        ]);
        const snapshot = planWidgetSnapshot({
          date: today, dateLabel: label(today), plan: day?.plan ?? null, tasks: day?.tasks ?? [],
          showTitles: widgetPrivacy(setting?.value) !== 'hidden', interactive: planWidgetInteractive, locale: language, rtl: language === 'ar',
          labels: { today: tr('plan.widget.today'), none: tr('plan.hero.morning'), action: tr('plan.cta.plan'), keepGoing: tr('plan.widget.keepGoing'), allDone: tr('plan.widget.allDone'), wrapped: tr('plan.wrap.heading'), hidden: tr('plan.widget.hidden'), add: tr('plan.widget.add'), wrap: tr('plan.widget.wrap'), view: tr('plan.cta.view'), recap: tr('plan.cta.recap') },
          colors: { background: tokens.background, foreground: tokens.textPrimary, secondary: tokens.textSecondary, accent: tokens.accent, onAccent: tokens.accentText, track: tokens.borderSubtle },
          countLabel: (done, total) => tr('plan.widget.count', { done, total }),
        });
        const serialized = JSON.stringify(snapshot);
        if (previous.current !== serialized) {
          await publishPlanWidget(snapshot, freshDaySnapshot(snapshot, label(addDays(today, 1))), nextMidnight(new Date()));
          previous.current = serialized;
        }
        await syncPlanNotifications({
          settings, hasPlan: Boolean(day?.tasks.length), wrapped: day?.plan.status === 'wrapped',
          tasks: reminders.map((task) => ({ id: task.id, title: task.title, reminderAt: task.reminderAt! })),
        });
      } catch { /* No task data in logs. The next change or foreground tries again. */ }
      finally { running = false; if (again) { again = false; schedule(); } }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void sync(); }, 200); };
    const stopPlan = subscribeToPlanChanges(schedule);
    const stopWidget = observePlanWidget(schedule);
    const stopSettings = addDatabaseChangeListener((event) => { if (event.tableName === 'app_settings') schedule(); });
    const state = AppState.addEventListener('change', (next) => { if (next === 'active') { previous.current = ''; schedule(); } });
    schedule();
    return () => { disposed = true; clearTimeout(timer); stopPlan(); stopWidget(); stopSettings.remove(); state.remove(); };
  }, [database, language, repository, today, tokens]);
  return null;
}
