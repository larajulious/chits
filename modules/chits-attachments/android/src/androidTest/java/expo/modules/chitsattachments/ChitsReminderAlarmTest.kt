package expo.modules.chitsattachments

import android.app.AlarmManager
import android.content.Intent
import androidx.test.platform.app.InstrumentationRegistry
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.triggers.DateTrigger
import expo.modules.notifications.service.delegates.ExpoSchedulingDelegate
import expo.modules.notifications.service.delegates.SharedPreferencesNotificationsStore
import org.junit.Assert.*
import org.junit.Test

class ChitsReminderAlarmTest {
  @Test fun restoresTheSameStoredRequestAfterPermissionGrant() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    assertTrue("Grant Alarms & reminders to the disposable test package first", canScheduleReminderAlarms(context))
    val store = SharedPreferencesNotificationsStore(context)
    val identifier = "chits-alarm-native-qa"
    val timestamp = System.currentTimeMillis() + 120_000
    val request = NotificationRequest(identifier, NotificationContent.Builder().setTitle("Chits Reminder QA").setText("Native alarm recovery").build(), DateTrigger("reminders", timestamp))
    try {
      store.saveNotificationRequest(request)
      ChitsReminderAlarmReceiver().onReceive(context, Intent(AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED))
      val restored = store.getNotificationRequest(identifier)!!
      assertEquals(identifier, restored.identifier)
      assertEquals(timestamp, (restored.trigger as DateTrigger).timestamp)
      assertEquals("Native alarm recovery", restored.content.text)
      restoreReminderAlarms(context)
      assertEquals(1, store.allNotificationRequests.count { it.identifier == identifier })
    } finally {
      ExpoSchedulingDelegate(context).removeScheduledNotifications(listOf(identifier))
    }
  }
}
