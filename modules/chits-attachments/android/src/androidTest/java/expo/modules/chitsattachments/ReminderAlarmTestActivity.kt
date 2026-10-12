package expo.modules.chitsattachments

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Bundle
import android.widget.TextView
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.triggers.DateTrigger
import expo.modules.notifications.service.delegates.ExpoSchedulingDelegate

/** Disposable QA host: schedules with Expo without starting React Native or JS. */
class ReminderAlarmTestActivity : Activity() {
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(NotificationChannel("reminders", "Reminder QA", NotificationManager.IMPORTANCE_HIGH))
    check(canScheduleReminderAlarms(this))
    val content = NotificationContent.Builder().setTitle("Chits Reminder QA").setText("Delivered without the app process").build()
    val trigger = DateTrigger("reminders", System.currentTimeMillis() + 30_000)
    ExpoSchedulingDelegate(this).scheduleNotification(NotificationRequest("chits-background-reminder-qa", content, trigger))
    setContentView(TextView(this).apply { text = "Reminder scheduled. Swipe away this task." })
  }
}
