package expo.modules.chitsattachments

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import android.widget.RemoteViews
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Draws fixture Spaces (never real notes) the way Sticky Notes widgets do, at
 * Home Screen sizes, and checks each note lands on the widget where the board
 * would put it. Renders land in the test app's cache as PNGs for review.
 */
class ChitsStickyTest {
  private val labels = ChitsStickyRenderer.Labels("Hidden Chit", "Voice note")

  private fun line(text: String, style: String = "p") = JSONObject().put("t", text).put("s", style)
  // fromUnit on a 393x587 board: the room a sticky can move in is 8..253 by 16..453.
  private fun note(id: String, x: Double, y: Double, extra: JSONObject.() -> Unit = {}) = JSONObject()
    .put("key", "thought:$id").put("kind", "thought").put("id", id).put("left", 8 + x * 245).put("top", 16 + y * 437).put("label", id).put("object", "paper").put("paper", "sticky")
    .put("base", "#FFE27A").put("curl", "#F2CB45").put("pinColor", "#E04B2A").put("tilt", -1.6).put("tapeTilt", -3).put("hidden", false).put("lines", JSONArray()).put("images", 0).apply(extra)
  private fun space(id: String, pin: String, vararg notes: JSONObject) = JSONObject().put("id", id).put("name", id.replaceFirstChar { it.uppercase() }).put("pin", pin)
    .put("empty", "Nothing here yet. Stick a note on your ${id.replaceFirstChar { it.uppercase() }}.").put("url", "chits:///sticky?space=$id").put("notes", JSONArray().apply { notes.forEach { put(it) } })

  private val spaces = listOf(
    space("fridge", "magnet",
      note("groceries", 0.08, 0.05) { put("base", "#FFB8C2").put("curl", "#F09AA8").put("tilt", 2.4).put("lines", JSONArray().put(line("Buy groceries"))) },
      note("weekend", 0.92, 0.1) { put("paper", "index").put("base", "#BFDDFB").put("curl", "#9CC6F0").put("pinColor", "#2F6FDE").put("images", 2).put("lines", JSONArray().put(line("Weekend", "h")).put(line("☑ Milk", "x")).put(line("☐ Eggs", "c"))) },
      note("dentist", 0.1, 0.9) { put("base", "#C9EDB8").put("curl", "#A9D993").put("tilt", -3.2).put("pinColor", "#F2B517").put("lines", JSONArray().put(line("Dentist Tuesday 3pm, bring the forms"))) },
      note("secret", 0.88, 0.85) { put("hidden", true).put("pinColor", "#8A4FD8") },
    ),
    space("desk", "tape",
      note("essay", 0.1, 0.1) { put("lines", JSONArray().put(line("Essay outline", "h")).put(line("1. Intro", "b")).put(line("2. Argument", "b"))) },
      note("coffee", 0.9, 0.2) { put("paper", "receipt").put("base", "#FFCF9E").put("curl", "#F3B070").put("tilt", 3.8).put("lines", JSONArray().put(line("Coffee 3.50"))) },
      note("voice", 0.3, 0.9) { put("object", "cassette").put("media", JSONObject().put("type", "audio").put("caption", "Song idea").put("duration", "1:23").put("image", JSONObject.NULL).put("attachmentId", "a")) },
    ),
    space("cork", "pushpin",
      note("trip", 0.5, 0.3) { put("object", "print").put("tilt", -2.8).put("pinColor", "#1F9D6B").put("media", JSONObject().put("type", "video").put("caption", "Beach day").put("duration", JSONObject.NULL).put("image", JSONObject.NULL).put("attachmentId", "v")) },
      note("ideas", 0.05, 0.8) { put("base", "#BFDDFB").put("curl", "#9CC6F0").put("lines", JSONArray().put(line("Ideas for the garden"))) },
    ),
    space("wall", "washi"),
  )

  @Test fun spacesDrawWithTheirNotesAtEverySize() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val density = context.resources.displayMetrics.density
    val out = File(context.cacheDir, "sticky").apply { mkdirs() }
    for (space in spaces) {
      for ((size, dims) in mapOf("small" to (160 to 160), "medium" to (330 to 160), "large" to (330 to 340))) {
        val (w, h) = dims
        val drawing = ChitsStickyRenderer.drawSpace(context, space.optString("id"), space, labels, (w * density).toInt(), (h * density).toInt(), density, false, 16 * density)
        val bitmap = drawing.bitmap
        // Rounded corners are clear; the surface fills the rest.
        assertEquals(0, Color.alpha(bitmap.getPixel(0, 0)))
        assertEquals(255, Color.alpha(bitmap.getPixel(bitmap.width / 2, (6 * density).toInt())))
        assertEquals(space.optJSONArray("notes")!!.length(), drawing.placed.size)
        for (placed in drawing.placed) {
          assertTrue("${placed.note.optString("id")} stays on the widget at $size", placed.bounds.left >= 0 && placed.bounds.top >= 0 && placed.bounds.right <= bitmap.width && placed.bounds.bottom <= bitmap.height)
        }
        File(out, "${space.optString("id")}-$size.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
      }
    }
  }

  @Test fun notesKeepTheirArrangement() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val density = context.resources.displayMetrics.density
    for ((w, h) in listOf(160 to 160, 330 to 160, 330 to 340)) {
      val drawing = ChitsStickyRenderer.drawSpace(context, "fridge", spaces[0], labels, (w * density).toInt(), (h * density).toInt(), density, false, 0f)
      val notes = drawing.placed
      // One scale for all: every gap between two notes is the board's gap times the same factor.
      val scale = notes[0].bounds.width() / (132 * density)
      for (a in notes) for (b in notes) {
        val boardDx = (b.note.optDouble("left") - a.note.optDouble("left")).toFloat()
        val boardDy = (b.note.optDouble("top") - a.note.optDouble("top")).toFloat()
        assertEquals(boardDx * scale * density, b.bounds.left - a.bounds.left, 1.5f)
        assertEquals(boardDy * scale * density, b.bounds.top - a.bounds.top, 1.5f)
      }
    }
  }

  @Test fun widgetLayoutsInflate() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = instrumentation.targetContext
    instrumentation.runOnMainSync {
      for (layout in listOf(R.layout.chits_sticky, R.layout.chits_sticky_preview)) {
        val view = RemoteViews(context.packageName, layout).apply(context, FrameLayout(context))
        view.measure(View.MeasureSpec.makeMeasureSpec(600, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(300, View.MeasureSpec.EXACTLY))
        view.layout(0, 0, 600, 300)
        if (layout == R.layout.chits_sticky_preview) {
          val bitmap = Bitmap.createBitmap(600, 300, Bitmap.Config.ARGB_8888)
          view.draw(Canvas(bitmap))
          File(File(context.cacheDir, "sticky").apply { mkdirs() }, "gallery-preview.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
      }
    }
  }

  @Test fun pickerShowsEverySpace() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = instrumentation.targetContext
    val snapshot = JSONObject().put("version", 1).put("rtl", false).put("labels", JSONObject().put("choose", "Choose a Space").put("hidden", "Hidden Chit").put("voice", "Voice note"))
      .put("spaces", JSONArray().apply { spaces.forEach { put(it) } })
    ChitsStickyProvider.store(context, snapshot.toString())
    val intent = Intent(context, ChitsStickyConfigureActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 4242).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val activity = instrumentation.startActivitySync(intent)
    Thread.sleep(2000)
    instrumentation.runOnMainSync {
      val root = activity.window.decorView
      val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
      root.draw(Canvas(bitmap))
      File(File(context.cacheDir, "sticky").apply { mkdirs() }, "picker.jpg").outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it) }
      activity.finish()
    }
  }
}
