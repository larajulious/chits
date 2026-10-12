# Android reminder delivery

Reminders are scheduled as native Expo DATE notifications when saved. Chits does not rely on JavaScript timers, background fetch, or opening the app to deliver them.

Android 12+ needs `SCHEDULE_EXACT_ALARM` access for precise delivery. Previously Chits did not declare/check that access, causing Expo to use `setAndAllowWhileIdle` instead of `setExactAndAllowWhileIdle`. Inexact alarms can be delayed by Android power management.

The reminder sheet now explains the Alarms & reminders setting and opens the app-specific system page on a deliberate tap. Setting/changing a reminder requires this access; a denied check preserves an existing reminder. Returning from Settings refreshes the status. The native grant receiver and first foreground reconciliation re-register Expo's existing saved notification requests without changing their identifiers, times, or note data. Reboot/package-replacement handling remains Expo's responsibility.

Rebuild Android to include `ChitsReminderAlarmModule`, its receiver, and the permission. A JavaScript refresh alone is insufficient. Grant notification permission and Alarms & reminders before setting a reminder.

## Verification

- TypeScript and changed-file ESLint passed.
- Android debug app and native test APK compiled; the merged app manifest contains the permission and receiver, and Expo's generated module list contains the module.
- JS regression coverage checks card/message scheduling, denied access, preservation of existing reminders, native DATE triggers, and recovery without duplicate IDs.
- API 33 disposable emulator: native instrumentation passed recovery with the same request ID, timestamp, and text.
- API 33 disposable emulator: the native QA activity scheduled a reminder 30 seconds ahead. `dumpsys alarm` showed `RTC_WAKEUP`, `window=0`, and `exactAllowReason=permission`. The task was dismissed and its process killed using `am kill` (not Force stop); `pidof` was empty and `stopped=false`. The notification appeared on time without launching React Native or JS.
- Full Node suite: 219 pass, two existing UI source assertions fail (card details edit accent and onboarding root navigation).
- Physical-device delivery, OEM battery restrictions, and Android 14+ special-access flow remain manual QA.

## Reproduce native delivery

Only use a disposable emulator. Build `:chits-attachments:assembleDebugAndroidTest` and install `modules/chits-attachments/android/build/outputs/apk/androidTest/debug/chits-attachments-debug-androidTest.apk`.

Grant `POST_NOTIFICATIONS` and allow the `SCHEDULE_EXACT_ALARM` app-op for `expo.modules.chitsattachments.test`. Run instrumentation class `expo.modules.chitsattachments.ChitsReminderAlarmTest` with `androidx.test.runner.AndroidJUnitRunner`.

Start `expo.modules.chitsattachments.test/expo.modules.chitsattachments.ReminderAlarmTestActivity` with `am start -W`. It creates a native reminder 30 seconds ahead. Swipe its task away and use `am kill expo.modules.chitsattachments.test` to ensure its process is gone. Check notification tag `chits-background-reminder-qa` in `dumpsys notification` after the due time. The activity lives in the test APK only.

Android Settings → Force stop is different from dismissing a recent task: Android intentionally suppresses a force-stopped app until it is launched again. Device-specific sleeping-app restrictions can also affect delivery and need device testing.

References: [Expo SDK 57 notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/#permissions), [Android alarm access](https://developer.android.com/develop/background-work/services/alarms#exact-permission).
