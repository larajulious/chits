package expo.modules.chitsattachments

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.math.max

/**
 * Sticky Notes: a Space (Fridge, Desk, Cork board or Wall) on the Home Screen
 * with its notes where they were stuck. The app publishes every Space to
 * `chits_sticky`; each widget remembers only which Space it shows. Everything
 * is local: no network, no background work beyond the launcher's redraws.
 */
class ChitsStickyProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { render(context, manager, it) }
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    render(context, manager, id)
  }

  override fun onDeleted(context: Context, ids: IntArray) {
    val edit = prefs(context).edit()
    ids.forEach { edit.remove(slot(it)) }
    edit.apply()
  }

  /** A restored phone renumbers its widgets; each keeps its Space. */
  override fun onRestored(context: Context, oldIds: IntArray, newIds: IntArray) {
    val prefs = prefs(context)
    val edit = prefs.edit()
    oldIds.forEachIndexed { index, old ->
      val space = prefs.getString(slot(old), null)
      edit.remove(slot(old))
      if (space != null && index < newIds.size) edit.putString(slot(newIds[index]), space)
    }
    edit.apply()
  }

  companion object {
    private const val PREFS = "chits_sticky"
    /** Keeps a bitmap well inside what launchers accept for one widget. */
    private const val MAX_SIDE_PX = 960f
    val SPACES = listOf("fridge", "desk", "cork", "wall")
    /** One tap target per note a large widget can show. */
    private val HITS = intArrayOf(
      R.id.sticky_hit_0, R.id.sticky_hit_1, R.id.sticky_hit_2, R.id.sticky_hit_3, R.id.sticky_hit_4, R.id.sticky_hit_5,
      R.id.sticky_hit_6, R.id.sticky_hit_7, R.id.sticky_hit_8, R.id.sticky_hit_9, R.id.sticky_hit_10, R.id.sticky_hit_11,
    )

    private fun slot(id: Int) = "widget_$id"
    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, 0)

    fun snapshot(context: Context): JSONObject = try {
      JSONObject(prefs(context).getString("snapshot", "{}") ?: "{}").takeIf { it.optInt("version") == 1 } ?: JSONObject()
    } catch (_: Exception) { JSONObject() }

    fun space(snapshot: JSONObject, id: String): JSONObject? {
      val list = snapshot.optJSONArray("spaces") ?: return null
      return (0 until list.length()).mapNotNull { list.optJSONObject(it) }.firstOrNull { it.optString("id") == id }
    }

    /** The Space's name in the app's language, or the system's before the app has published. */
    fun spaceName(context: Context, snapshot: JSONObject, id: String): String = space(snapshot, id)?.optString("name")?.takeIf { it.isNotEmpty() } ?: context.getString(when (id) {
      "desk" -> R.string.sticky_space_desk
      "cork" -> R.string.sticky_space_cork
      "wall" -> R.string.sticky_space_wall
      else -> R.string.sticky_space_fridge
    })

    /** The Space a widget shows, or null before one was chosen. */
    fun chosen(context: Context, id: Int): String? = prefs(context).getString(slot(id), null)?.takeIf { it in SPACES }

    fun labels(context: Context, snapshot: JSONObject): ChitsStickyRenderer.Labels {
      val labels = snapshot.optJSONObject("labels") ?: JSONObject()
      return ChitsStickyRenderer.Labels(
        hidden = labels.optString("hidden").ifEmpty { context.getString(R.string.sticky_widget_hidden) },
        voice = labels.optString("voice").ifEmpty { context.getString(R.string.sticky_widget_voice) },
      )
    }

    /** The widget's rounded corners: the launcher's own on Android 12+. */
    fun cornerRadius(context: Context): Float = if (Build.VERSION.SDK_INT >= 31) {
      try { context.resources.getDimension(android.R.dimen.system_app_widget_background_radius) } catch (_: Exception) { 16 * context.resources.displayMetrics.density }
    } else 16 * context.resources.displayMetrics.density

    /** The app's latest Spaces. Every widget redraws, so an edit shows without a refresh. */
    fun store(context: Context, value: String) {
      check(prefs(context).edit().putString("snapshot", value).commit())
      renderAll(context)
    }

    fun choose(context: Context, id: Int, space: String) {
      check(prefs(context).edit().putString(slot(id), space).commit())
      render(context, AppWidgetManager.getInstance(context), id)
    }

    fun renderAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      manager.getAppWidgetIds(ComponentName(context, ChitsStickyProvider::class.java)).forEach { render(context, manager, it) }
    }

    fun render(context: Context, manager: AppWidgetManager, id: Int) {
      val data = snapshot(context)
      val chosen = chosen(context, id)
      val spaceId = chosen ?: "fridge"
      val space = space(data, spaceId)
      val options = manager.getAppWidgetOptions(id)
      // Launchers report portrait sizes as min width and max height, landscape the reverse.
      val portrait = context.resources.configuration.orientation == Configuration.ORIENTATION_PORTRAIT
      val widthDp = max(80, options.getInt(if (portrait) AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH else AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 160))
      val heightDp = max(80, options.getInt(if (portrait) AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 160))
      val density = context.resources.displayMetrics.density
      val unit = minOf(density, MAX_SIDE_PX / max(widthDp, heightDp))
      val labels = labels(context, data)
      val drawing = ChitsStickyRenderer.drawSpace(context, spaceId, space, labels, (widthDp * unit).toInt(), (heightDp * unit).toInt(), unit, data.optBoolean("rtl"), cornerRadius(context) * unit / density)
      val views = RemoteViews(context.packageName, R.layout.chits_sticky)
      views.setImageViewBitmap(R.id.sticky_image, drawing.bitmap)
      val name = spaceName(context, data, spaceId)
      views.setContentDescription(R.id.sticky_image, (listOf(name) + drawing.placed.map { describe(it.note, labels) }).joinToString(". "))
      // The widget opens its Space; one without a Space opens the picker.
      views.setOnClickPendingIntent(R.id.sticky_root, if (chosen != null) open(context, id, "chits:///sticky?space=$spaceId") else configure(context, id))
      HITS.forEach { views.setViewVisibility(it, View.GONE) }
      if (Build.VERSION.SDK_INT >= 31 && chosen != null) {
        // Each note opens itself: a tap target over its footprint, front notes on top.
        val toView = density / unit
        drawing.placed.take(HITS.size).forEachIndexed { index, placed ->
          val hit = HITS[index]
          views.setViewVisibility(hit, View.VISIBLE)
          views.setViewLayoutWidth(hit, placed.bounds.width() * toView, TypedValue.COMPLEX_UNIT_PX)
          views.setViewLayoutHeight(hit, placed.bounds.height() * toView, TypedValue.COMPLEX_UNIT_PX)
          views.setViewLayoutMargin(hit, RemoteViews.MARGIN_LEFT, placed.bounds.left * toView, TypedValue.COMPLEX_UNIT_PX)
          views.setViewLayoutMargin(hit, RemoteViews.MARGIN_TOP, placed.bounds.top * toView, TypedValue.COMPLEX_UNIT_PX)
          views.setContentDescription(hit, describe(placed.note, labels))
          views.setOnClickPendingIntent(hit, openNote(context, placed.note))
        }
      }
      manager.updateAppWidget(id, views)
    }

    private fun describe(note: JSONObject, labels: ChitsStickyRenderer.Labels): String =
      if (note.optBoolean("hidden")) labels.hidden else note.optString("label")

    private fun launch(context: Context, uri: String) = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setClassName(context, "${context.packageName}.MainActivity")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    private fun open(context: Context, id: Int, uri: String): PendingIntent =
      PendingIntent.getActivity(context, id, launch(context, uri), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun openNote(context: Context, note: JSONObject): PendingIntent {
      val kind = if (note.optString("kind") == "card") "card" else "thought"
      val uri = "chits:///sticky?kind=$kind&id=${Uri.encode(note.optString("id"))}"
      // Distinct intents (their URIs differ), so one request code serves every note.
      return PendingIntent.getActivity(context, 0, launch(context, uri), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun configure(context: Context, id: Int): PendingIntent {
      val intent = Intent(context, ChitsStickyConfigureActivity::class.java)
        .setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
        .setData(Uri.parse("chits-sticky://configure/$id"))
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      return PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
  }
}
