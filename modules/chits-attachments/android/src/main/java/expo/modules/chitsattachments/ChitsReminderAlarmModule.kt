package expo.modules.chitsattachments

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.notifications.service.delegates.ExpoSchedulingDelegate

internal fun canScheduleReminderAlarms(context: Context): Boolean =
  Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()

/** Uses Expo's existing stored requests and identifiers; no SQLite or note data changes. */
internal fun restoreReminderAlarms(context: Context) {
  if (canScheduleReminderAlarms(context)) ExpoSchedulingDelegate(context).setupScheduledNotifications()
}

class ChitsReminderAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ChitsReminderAlarm")
    AsyncFunction("canScheduleAsync") { canScheduleReminderAlarms(context) }
    AsyncFunction("restorePendingAsync") { restoreReminderAlarms(context) }
    AsyncFunction("openSettingsAsync") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
          Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }
  }
}

/** Granting access upgrades existing inexact alarms even if JS is no longer running. */
class ChitsReminderAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      intent.action == AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED) {
      restoreReminderAlarms(context)
    }
  }
}
