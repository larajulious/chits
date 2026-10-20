package expo.modules.chitsattachments

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.content.res.ColorStateList
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.util.Locale

class ChitsAnywhereProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { render(context, manager, it) }
  }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    render(context, manager, id)
  }
  companion object {
    private fun intent(context: Context, uri: String): PendingIntent {
      val launch = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setClassName(context, "${context.packageName}.MainActivity")
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    fun render(context: Context, manager: AppWidgetManager, id: Int) {
      val data = try { JSONObject(context.getSharedPreferences("chits_anywhere", 0).getString("snapshot", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
      manager.updateAppWidget(id, buildViews(context, manager.getAppWidgetOptions(id), if (data.optInt("version") == 1) data else JSONObject()))
    }
    fun buildViews(context: Context, options: Bundle, data: JSONObject): RemoteViews {
      fun color(key: String, fallback: String) = try { Color.parseColor(data.optString(key, fallback)) } catch (_: Exception) { Color.parseColor(fallback) }
      val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
      val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 250)
      val small = width < 200
      // A row always keeps its title and time; previews need additional height.
      val previews = height >= 340 && data.optString("privacy") == "previews"
      val count = if (small) 0 else if (height >= 260) 5 else 2
      val views = RemoteViews(context.packageName, if (small) R.layout.chits_anywhere_small else if (height < 260) R.layout.chits_anywhere_medium else R.layout.chits_anywhere)
      val fg = color("foreground", "#24231F")
      val secondary = color("secondary", "#5F5C52")
      if (Build.VERSION.SDK_INT >= 31) views.setColorStateList(R.id.anywhere_root, "setBackgroundTintList", ColorStateList.valueOf(color("background", "#F7F8F6")))
      else views.setInt(R.id.anywhere_root, "setBackgroundColor", color("background", "#F7F8F6"))
      views.setInt(R.id.anywhere_root, "setLayoutDirection", if (data.optBoolean("rtl")) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR)
      for ((viewId, key, fallback) in listOf(Triple(R.id.anywhere_brand, "brand", R.string.anywhere_brand), Triple(R.id.anywhere_quick, "quick", R.string.anywhere_quick), Triple(R.id.anywhere_recent, "recent", R.string.anywhere_recent))) {
        views.setTextViewText(viewId, data.optString(key, context.getString(fallback)))
        views.setTextColor(viewId, fg)
      }
      val onAccent = color("onAccent", "#2B2410")
      views.setTextColor(R.id.anywhere_quick, onAccent)
      views.setTextViewCompoundDrawablesRelative(R.id.anywhere_quick, if (Color.luminance(onAccent) > 0.5f) R.drawable.chits_anywhere_compose_light else R.drawable.chits_anywhere_compose, 0, 0, 0)
      if (Build.VERSION.SDK_INT >= 31) views.setColorStateList(R.id.anywhere_quick, "setBackgroundTintList", ColorStateList.valueOf(color("accent", "#FBE47E")))
      else views.setInt(R.id.anywhere_quick, "setBackgroundColor", color("accent", "#FBE47E"))
      val quick = intent(context, "chits:///chat?focusInput=1")
      views.setOnClickPendingIntent(R.id.anywhere_quick, quick)
      views.setOnClickPendingIntent(R.id.anywhere_root, quick)
      views.setViewVisibility(R.id.anywhere_brand, if (small) View.GONE else View.VISIBLE)
      views.setViewVisibility(R.id.anywhere_recent, if (small) View.GONE else View.VISIBLE)
      val hidden = data.optString("privacy") !in listOf("titles", "previews")
      val notes = if (hidden) null else data.optJSONArray("notes")
      views.setViewVisibility(R.id.anywhere_empty, if (!small && (notes == null || notes.length() == 0)) View.VISIBLE else View.GONE)
      views.setTextViewText(R.id.anywhere_empty, if (hidden) data.optString("hidden", context.getString(R.string.anywhere_hidden)) else data.optString("empty", context.getString(R.string.anywhere_empty)))
      views.setTextColor(R.id.anywhere_empty, secondary)
      views.setTextColor(R.id.anywhere_recent, secondary)
      views.setViewVisibility(R.id.anywhere_notes, if (small || notes == null || notes.length() == 0) View.GONE else View.VISIBLE)
      views.removeAllViews(R.id.anywhere_notes)
      val locale = Locale.forLanguageTag(data.optString("locale", "en"))
      val relative = android.icu.text.RelativeDateTimeFormatter.getInstance(locale)
      for (index in 0 until minOf(count, notes?.length() ?: 0)) {
        val note = notes!!.getJSONObject(index)
        val kind = note.optString("kind")
        if (kind != "card" && kind != "thought") continue
        val noteId = note.optString("id")
        if (noteId.isBlank()) continue
        val row = RemoteViews(context.packageName, R.layout.chits_anywhere_row)
        row.setTextViewText(R.id.anywhere_title, note.optString("title").take(100))
        row.setTextColor(R.id.anywhere_title, fg)
        row.setTextViewCompoundDrawablesRelative(R.id.anywhere_title, if (Color.luminance(secondary) > 0.5f) R.drawable.chits_anywhere_note_light else R.drawable.chits_anywhere_note, 0, 0, 0)
        val minutes = ((System.currentTimeMillis() - note.optLong("updatedAt")) / 60000).coerceAtLeast(0)
        val unit = if (minutes < 60) android.icu.text.RelativeDateTimeFormatter.RelativeUnit.MINUTES else if (minutes < 1440) android.icu.text.RelativeDateTimeFormatter.RelativeUnit.HOURS else android.icu.text.RelativeDateTimeFormatter.RelativeUnit.DAYS
        val amount = if (minutes < 60) minutes else if (minutes < 1440) minutes / 60 else minutes / 1440
        row.setTextViewText(R.id.anywhere_time, relative.format(amount.toDouble(), android.icu.text.RelativeDateTimeFormatter.Direction.LAST, unit))
        row.setTextColor(R.id.anywhere_time, secondary)
        row.setViewVisibility(R.id.anywhere_preview, if (previews && !note.isNull("preview")) View.VISIBLE else View.GONE)
        row.setTextViewText(R.id.anywhere_preview, note.optString("preview").take(160))
        row.setTextColor(R.id.anywhere_preview, secondary)
        row.setOnClickPendingIntent(R.id.anywhere_row, intent(context, "chits:///anywhere?kind=$kind&id=${Uri.encode(noteId)}"))
        views.addView(R.id.anywhere_notes, row)
      }
      return views
    }
  }
}
