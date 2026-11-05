package expo.modules.chitsattachments

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * Today's plan on the home screen. The app writes two snapshots: today, and the
 * blank day that follows it, so a stale plan can never show under a new date.
 * A tick updates the widget at once and queues the change for the app to save.
 */
class ChitsPlanProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { render(context, manager, it) }
    scheduleMidnight(context)
  }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    render(context, manager, id)
  }
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      ACTION_TOGGLE -> intent.data?.lastPathSegment?.let { toggle(context, it) }
      ACTION_REFRESH -> { renderAll(context); scheduleMidnight(context) }
    }
  }
  companion object {
    private const val PREFS = "chits_plan"
    private const val ACTION_TOGGLE = "expo.modules.chitsattachments.PLAN_TOGGLE"
    private const val ACTION_REFRESH = "expo.modules.chitsattachments.PLAN_REFRESH"
    private val lock = Any()

    private fun today() = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().time)
    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, 0)
    private fun read(context: Context, key: String) = try { JSONObject(prefs(context).getString(key, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }

    fun store(context: Context, snapshot: String, fresh: String) {
      synchronized(lock) { check(prefs(context).edit().putString("today", snapshot).putString("fresh", fresh).commit()) }
      renderAll(context)
      scheduleMidnight(context)
    }

    /** Hands queued ticks to the app, exactly once. */
    fun takePending(context: Context): String = synchronized(lock) {
      val value = prefs(context).getString("pending", "[]") ?: "[]"
      prefs(context).edit().remove("pending").commit()
      value
    }

    private fun toggle(context: Context, id: String) {
      synchronized(lock) {
        val data = read(context, "today")
        if (data.optString("date") != today()) return@synchronized
        val tasks = data.optJSONArray("tasks") ?: return@synchronized
        for (index in 0 until tasks.length()) {
          val task = tasks.getJSONObject(index)
          if (task.optString("id") != id) continue
          val next = !task.optBoolean("done")
          task.put("done", next)
          val done = data.optInt("done") + if (next) 1 else -1
          val total = data.optInt("total")
          val label = data.optString("count").replace(data.optInt("done").toString(), done.toString())
          data.put("done", done).put("count", label).put("state", if (done == total) "allDone" else "active")
          val pending = try { JSONArray(prefs(context).getString("pending", "[]")) } catch (_: Exception) { JSONArray() }
          pending.put(JSONObject().put("id", id).put("done", next).put("at", System.currentTimeMillis()))
          prefs(context).edit().putString("today", data.toString()).putString("pending", pending.toString()).commit()
          break
        }
      }
      renderAll(context)
    }

    private fun renderAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      manager.getAppWidgetIds(ComponentName(context, ChitsPlanProvider::class.java)).forEach { render(context, manager, it) }
    }

    private fun scheduleMidnight(context: Context) {
      val alarms = context.getSystemService(AlarmManager::class.java) ?: return
      val next = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, 1); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 5); set(Calendar.MILLISECOND, 0) }
      val refresh = Intent(context, ChitsPlanProvider::class.java).setAction(ACTION_REFRESH)
      // Inexact on purpose: it needs no alarm permission, and a few minutes late is fine.
      alarms.set(AlarmManager.RTC, next.timeInMillis, PendingIntent.getBroadcast(context, 1, refresh, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }

    private fun open(context: Context, uri: String): PendingIntent {
      val launch = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setClassName(context, "${context.packageName}.MainActivity")
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun render(context: Context, manager: AppWidgetManager, id: Int) {
      val current = read(context, "today")
      val fresh = read(context, "fresh")
      val now = today()
      // Past midnight the saved plan is yesterday's: show the blank day, or nothing of it.
      val data = when { current.optString("date") == now -> current; fresh.optString("date") == now -> fresh; current.has("date") -> JSONObject(fresh.toString()).put("date", now).put("dateLabel", "").put("state", "none"); else -> JSONObject() }
      manager.updateAppWidget(id, build(context, manager.getAppWidgetOptions(id), data))
    }

    private fun build(context: Context, options: Bundle, data: JSONObject): RemoteViews {
      fun color(key: String, fallback: String) = try { Color.parseColor(data.optString(key, fallback)) } catch (_: Exception) { Color.parseColor(fallback) }
      fun label(key: String, fallback: Int) = data.optString(key).ifEmpty { context.getString(fallback) }
      // Launchers report portrait sizes as min width and max height, landscape the reverse.
      val portrait = context.resources.configuration.orientation == Configuration.ORIENTATION_PORTRAIT
      val width = options.getInt(if (portrait) AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH else AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 250)
      val height = options.getInt(if (portrait) AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180)
      val small = width < 200 || height < 150
      val large = !small && height >= 260
      val state = data.optString("state", "none")
      val total = data.optInt("total")
      val done = data.optInt("done")
      val fg = color("foreground", "#24231F")
      val secondary = color("secondary", "#5F5C52")
      val accent = color("accent", "#FBE47E")
      val onAccent = color("onAccent", "#2B2410")
      val views = RemoteViews(context.packageName, R.layout.chits_plan)
      if (Build.VERSION.SDK_INT >= 31) views.setColorStateList(R.id.plan_root, "setBackgroundTintList", ColorStateList.valueOf(color("background", "#F7F8F6")))
      else views.setInt(R.id.plan_root, "setBackgroundColor", color("background", "#F7F8F6"))
      views.setInt(R.id.plan_root, "setLayoutDirection", if (data.optBoolean("rtl")) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR)
      views.setOnClickPendingIntent(R.id.plan_root, open(context, "chits:///plan"))

      views.setTextViewText(R.id.plan_title, if (small) label("today", R.string.plan_widget_today) else data.optString("dateLabel").ifEmpty { label("today", R.string.plan_widget_today) })
      views.setTextColor(R.id.plan_title, fg)
      views.setTextViewText(R.id.plan_count, data.optString("count"))
      views.setTextColor(R.id.plan_count, secondary)
      views.setViewVisibility(R.id.plan_count, if (total > 0) View.VISIBLE else View.GONE)
      views.setViewVisibility(R.id.plan_progress, if (total > 0) View.VISIBLE else View.GONE)
      views.setProgressBar(R.id.plan_progress, maxOf(total, 1), done, false)
      if (Build.VERSION.SDK_INT >= 31) {
        views.setColorStateList(R.id.plan_progress, "setProgressTintList", ColorStateList.valueOf(fg))
        views.setColorStateList(R.id.plan_progress, "setProgressBackgroundTintList", ColorStateList.valueOf(color("track", "#EAE2D5")))
      }

      val tasks = data.optJSONArray("tasks")
      // What fits between the header and the action row, in 36dp rows.
      val limit = if (small) 0 else ((height - 110) / 36).coerceIn(1, 8)
      // A finished day says so instead of listing what's already ticked.
      val shown = if (state == "allDone" || state == "wrapped") 0 else minOf(limit, tasks?.length() ?: 0)
      views.removeAllViews(R.id.plan_tasks)
      for (index in 0 until shown) {
        val task = tasks!!.getJSONObject(index)
        val taskId = task.optString("id")
        if (taskId.isBlank()) continue
        val checked = task.optBoolean("done")
        val row = RemoteViews(context.packageName, R.layout.chits_plan_row)
        row.setTextViewText(R.id.plan_task_title, task.optString("title").take(100))
        row.setTextColor(R.id.plan_task_title, if (checked) secondary else fg)
        row.setImageViewResource(R.id.plan_task_check, if (checked) R.drawable.chits_plan_checked else R.drawable.chits_plan_unchecked)
        row.setInt(R.id.plan_task_check, "setColorFilter", if (checked) fg else secondary)
        row.setContentDescription(R.id.plan_task_check, task.optString("title"))
        if (state != "wrapped") {
          val tick = Intent(context, ChitsPlanProvider::class.java).setAction(ACTION_TOGGLE).setData(Uri.parse("chits-plan://toggle/${Uri.encode(taskId)}"))
          row.setOnClickPendingIntent(R.id.plan_task_check, PendingIntent.getBroadcast(context, 2, tick, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        row.setOnClickPendingIntent(R.id.plan_task_title, open(context, "chits:///plan?task=${Uri.encode(taskId)}"))
        views.addView(R.id.plan_tasks, row)
      }
      views.setViewVisibility(R.id.plan_tasks, if (shown > 0) View.VISIBLE else View.GONE)

      val message = when {
        data.optBoolean("hiddenTasks") && !small -> label("hidden", R.string.plan_widget_hidden)
        state == "none" -> label("none", R.string.plan_widget_none)
        state == "allDone" -> label("allDone", R.string.plan_widget_all_done)
        state == "wrapped" -> label("wrapped", R.string.plan_widget_wrapped)
        else -> label("keepGoing", R.string.plan_widget_keep_going)
      }
      views.setTextViewText(R.id.plan_message, message)
      views.setTextColor(R.id.plan_message, secondary)
      views.setViewVisibility(R.id.plan_message, if (shown > 0) View.GONE else View.VISIBLE)

      fun action(viewId: Int, text: String, uri: String) {
        views.setViewVisibility(viewId, View.VISIBLE)
        views.setTextViewText(viewId, text)
        views.setTextColor(viewId, onAccent)
        if (Build.VERSION.SDK_INT >= 31) views.setColorStateList(viewId, "setBackgroundTintList", ColorStateList.valueOf(accent))
        else views.setInt(viewId, "setBackgroundColor", accent)
        views.setOnClickPendingIntent(viewId, open(context, uri))
      }
      views.setViewVisibility(R.id.plan_primary, View.GONE)
      views.setViewVisibility(R.id.plan_secondary, View.GONE)
      if (!small) when (state) {
        "none" -> action(R.id.plan_primary, label("action", R.string.plan_widget_action), "chits:///plan")
        "wrapped" -> action(R.id.plan_primary, label("recap", R.string.plan_widget_recap), "chits:///plan")
        else -> if (large) {
          action(R.id.plan_primary, label("add", R.string.plan_widget_add), "chits:///plan?add=1")
          action(R.id.plan_secondary, label("wrap", R.string.plan_widget_wrap), "chits:///plan?wrap=1")
        } else action(R.id.plan_primary, label("view", R.string.plan_widget_view), "chits:///plan")
      }
      return views
    }
  }
}
