package expo.modules.chitsattachments

import android.content.Context
import android.graphics.Color
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class ChitsPdfView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onLoadComplete by EventDispatcher()
  private val onPageChanged by EventDispatcher()
  private val onError by EventDispatcher()

  private var source: String? = null

  private val pages = PdfPagesView(context).also {
    it.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    it.listener = object : PdfPagesView.Listener {
      override fun onLoaded(pageCount: Int) = onLoadComplete(mapOf("pageCount" to pageCount))
      override fun onPageChanged(page: Int, pageCount: Int) = onPageChanged(mapOf("page" to page, "pageCount" to pageCount))
      override fun onFailed(code: String, message: String) = onError(mapOf("code" to code, "message" to message))
    }
    addView(it)
  }

  // React Native sizes this view through Yoga; the page view simply fills it.
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val width = r - l
    val height = b - t
    pages.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
    pages.layout(0, 0, width, height)
  }

  fun setSource(next: String?) {
    if (next == source) return
    source = next
    pages.open(next)
  }

  fun setCanvasColor(hex: String?) {
    pages.canvasColor = try {
      if (hex.isNullOrBlank()) Color.parseColor("#F0F0F0") else Color.parseColor(hex)
    } catch (_: IllegalArgumentException) {
      Color.parseColor("#F0F0F0")
    }
  }

  fun release() = pages.release()
}
