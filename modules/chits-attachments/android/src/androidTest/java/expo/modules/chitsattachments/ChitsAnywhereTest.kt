package expo.modules.chitsattachments

import android.appwidget.AppWidgetManager
import android.os.Bundle
import android.view.View
import android.graphics.Bitmap
import android.graphics.Canvas
import java.io.File
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChitsAnywhereTest {
  @Test fun remoteViewsInflateAcrossSizesAndPrivacyModes() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = instrumentation.targetContext
    instrumentation.runOnMainSync {
      for (dark in listOf(true,false)) {
        for ((width, height, expected) in listOf(Triple(120,120,0), Triple(300,140,2), Triple(300,300,5), Triple(300,400,5))) {
          for (privacy in listOf("hidden", "titles", "previews")) {
            val options = Bundle().apply {
              putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,width)
              putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height)
            }
            val titles = listOf("Weekend groceries and meal prep for the family", "Ideas for the next Chits update", "Books to read", "Trip packing checklist", "A thought worth keeping")
            val previews = listOf("Vegetables, coffee, and something for Sunday", "Keep the capture flow simple and easy to reach", "Recommendations from friends", "Charger, headphones, and travel documents", "Small steps make room for good ideas")
            val notes = JSONArray()
            for (i in 1..5) notes.put(JSONObject().put("kind","thought").put("id","fixture$i").put("title",titles[i-1]).put("preview",previews[i-1]).put("updatedAt",System.currentTimeMillis() - listOf(60000L,1380000L,14400000L,86400000L,604800000L)[i-1]))
            val snapshot = JSONObject().put("version",1).put("privacy",privacy).put("notes",notes).put("background",if (dark) "#171612" else "#F7F8F6").put("foreground",if (dark) "#F7F5EB" else "#24231F").put("secondary",if (dark) "#CBC5B4" else "#5F5C52").put("accent",if (dark) "#FBE47E" else "#0D0D0D").put("onAccent",if (dark) "#2B2410" else "#FFFFFF")
            val widget = ChitsAnywhereProvider.buildViews(context,options,snapshot).apply(context,FrameLayout(context))
            val density = context.resources.displayMetrics.density
            val pixelWidth = (width * density).toInt()
            val pixelHeight = (height * density).toInt()
            widget.measure(View.MeasureSpec.makeMeasureSpec(pixelWidth, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(pixelHeight, View.MeasureSpec.EXACTLY))
            widget.layout(0,0,pixelWidth,pixelHeight)
            val rows = widget.findViewById<LinearLayout>(R.id.anywhere_notes)
            assertEquals(if (privacy == "hidden") 0 else expected, rows.childCount)
            if (rows.childCount > 0) assertTrue("Recent rows must fit inside the widget", rows.getChildAt(rows.childCount-1).bottom <= rows.height)
            if (privacy == "previews") {
              val bitmap = Bitmap.createBitmap(pixelWidth,pixelHeight,Bitmap.Config.ARGB_8888)
              widget.draw(Canvas(bitmap))
              File(context.cacheDir,"chits-anywhere-${width}x${height}-${if (dark) "dark" else "light"}.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }
              bitmap.recycle()
            }
            for (i in 0 until rows.childCount) {
              val child = rows.getChildAt(i)
              val titleView = child.findViewById<TextView>(R.id.anywhere_title)
              val timeView = child.findViewById<TextView>(R.id.anywhere_time)
              assertTrue("Title must fit in row at ${width}x${height}", titleView.bottom <= child.height)
              val metadata = timeView.parent as View
              assertTrue("Metadata must fit in row at ${width}x${height}", metadata.bottom <= child.height)
              val title = titleView.text.toString()
              assertFalse(title.isBlank())
              assertEquals(titles[i], title)
            }
          }
        }
      }
    }
  }
}
