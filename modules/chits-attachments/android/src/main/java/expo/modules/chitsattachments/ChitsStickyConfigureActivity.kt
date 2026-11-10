package expo.modules.chitsattachments

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.util.concurrent.Executors
import kotlin.math.min

/**
 * Choosing the Space a Sticky Notes widget shows: the Fridge, Desk, Cork board
 * and Wall, each drawn exactly as the widget will draw it, notes and all.
 * Opens when a widget is added and when it's reconfigured. Reads only what the
 * app last published, so it works offline and without starting the app.
 */
class ChitsStickyConfigureActivity : Activity() {
  private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID
  private val renderer = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    widgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
    // Backing out leaves a new widget unplaced, and an existing one as it was.
    setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }

    val data = ChitsStickyProvider.snapshot(this)
    val labels = ChitsStickyProvider.labels(this, data)
    val current = ChitsStickyProvider.chosen(this, widgetId)
    val rtl = data.optBoolean("rtl")
    val fonts = ChitsStickyRenderer.fonts(this)

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(INK)
      layoutDirection = if (rtl) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR
      setPadding(dp(20), dp(20), dp(20), 0)
    }
    if (Build.VERSION.SDK_INT >= 30) {
      // Draw behind the system bars (always so from Android 15) and keep the content clear of them.
      if (Build.VERSION.SDK_INT < 35) @Suppress("DEPRECATION") window.setDecorFitsSystemWindows(false)
      root.setOnApplyWindowInsetsListener { view, insets ->
        val bars = insets.getInsets(WindowInsets.Type.systemBars())
        view.setPadding(dp(20) + bars.left, dp(20) + bars.top, dp(20) + bars.right, bars.bottom)
        insets
      }
    }
    root.addView(TextView(this).apply {
      text = (data.optJSONObject("labels") ?: JSONObject()).optString("choose").ifEmpty { getString(R.string.sticky_widget_choose) }
      typeface = fonts.bold
      setTextColor(PAPER)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
      setPadding(0, 0, 0, dp(16))
      if (Build.VERSION.SDK_INT >= 28) isAccessibilityHeading = true
    })

    val metrics = resources.displayMetrics
    val gap = dp(14)
    val tile = (metrics.widthPixels - dp(40) - gap) / 2
    // Previews at up to 2x keep memory modest.
    val unit = min(metrics.density, 2f)
    val size = (tile / metrics.density * unit).toInt()
    val corner = ChitsStickyProvider.cornerRadius(this) * unit / metrics.density
    val grid = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 0, 0, dp(24)) }
    ChitsStickyProvider.SPACES.chunked(2).forEach { pair ->
      val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
      pair.forEachIndexed { index, spaceId ->
        val selected = spaceId == current
        val name = ChitsStickyProvider.spaceName(this, data, spaceId)
        val image = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER; importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }
        val column = LinearLayout(this).apply {
          orientation = LinearLayout.VERTICAL
          isClickable = true
          isFocusable = true
          contentDescription = name
          isSelected = selected
          setPadding(dp(4), dp(4), dp(4), dp(4))
          background = GradientDrawable().apply { cornerRadius = dp(20).toFloat(); if (selected) setStroke(dp(3), PAPER) }
          addView(FrameLayout(this@ChitsStickyConfigureActivity).apply { addView(image, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, tile - dp(8)))
          addView(TextView(this@ChitsStickyConfigureActivity).apply {
            text = name
            typeface = fonts.bold
            setTextColor(PAPER)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(4))
          })
          setOnClickListener { pick(spaceId) }
        }
        row.addView(column, LinearLayout.LayoutParams(tile, ViewGroup.LayoutParams.WRAP_CONTENT).apply { if (index > 0) marginStart = gap })
        renderer.execute {
          val drawing = ChitsStickyRenderer.drawSpace(this, spaceId, ChitsStickyProvider.space(data, spaceId), labels, size, size, unit, rtl, corner)
          main.post { if (!isDestroyed) image.setImageBitmap(drawing.bitmap) else drawing.bitmap.recycle() }
        }
      }
      grid.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = gap })
    }
    root.addView(ScrollView(this).apply { addView(grid); isVerticalScrollBarEnabled = false }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    setContentView(root)
  }

  override fun onDestroy() {
    renderer.shutdownNow()
    super.onDestroy()
  }

  private fun pick(spaceId: String) {
    ChitsStickyProvider.choose(this, widgetId, spaceId)
    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
    finish()
  }

  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

  private companion object {
    // Spaces' own dark "ink" interface colors (SPACE_UI in src/constants/spaces-theme.ts).
    const val INK = 0xFF17181C.toInt()
    const val PAPER = 0xFFF4F2EC.toInt()
  }
}
