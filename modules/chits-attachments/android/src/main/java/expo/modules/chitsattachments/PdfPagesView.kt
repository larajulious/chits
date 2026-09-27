package expo.modules.chitsattachments

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.util.Log
import android.util.LruCache
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.OverScroller
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

private const val TAG = "ChitsPdf"
private const val MAX_ZOOM = 5f
private const val DOUBLE_TAP_ZOOM = 2.5f
private const val DETAIL_DELAY_MS = 120L
private const val MAX_BASE_PIXELS = 6_000_000f

/**
 * Continuous, vertically scrolling PDF pages drawn directly on a canvas.
 *
 * All PdfRenderer access happens on one background thread (PdfRenderer is not
 * thread-safe and allows one open page at a time), so the UI thread only ever
 * draws finished bitmaps and stays responsive for large documents. Two layers:
 *  - base: one fit-to-width bitmap per page, kept in a memory-bounded LRU cache
 *  - detail: when zoomed in and idle, the visible part of each on-screen page
 *    re-rendered at the exact zoom so text stays sharp, without ever
 *    allocating a full-page bitmap at 5x.
 */
@SuppressLint("ViewConstructor")
class PdfPagesView(context: Context) : View(context) {
  interface Listener {
    fun onLoaded(pageCount: Int)
    fun onPageChanged(page: Int, pageCount: Int)
    fun onFailed(code: String, message: String)
  }

  var listener: Listener? = null

  var canvasColor: Int = Color.parseColor("#F0F0F0")
    set(value) { field = value; invalidate() }

  private val density = resources.displayMetrics.density
  private val pageGap = 8 * density
  private val sideMargin = 8 * density

  private val renderThread = HandlerThread("ChitsPdfRender").apply { start() }
  private val renderHandler = Handler(renderThread.looper)
  private val mainHandler = Handler(Looper.getMainLooper())

  // Render-thread state.
  private var descriptor: ParcelFileDescriptor? = null
  private var renderer: PdfRenderer? = null
  private var fallbackCopy: File? = null

  // Main-thread state.
  @Volatile private var generation = 0
  private var pageWidths = FloatArray(0)
  private var pageHeights = FloatArray(0)
  private var pageTops = FloatArray(0) // page top in unzoomed layout px
  private var pageDisplayHeights = FloatArray(0)
  private var contentHeight = 0f
  private var zoom = 1f
  private var offsetX = 0f
  private var offsetY = 0f
  private var lastReportedPage = 0
  private var released = false

  private val pendingBase = HashSet<Int>()
  @Volatile private var wantedPages: Set<Int> = emptySet()
  private val baseCache = object : LruCache<Int, Bitmap>(cacheBudgetBytes()) {
    override fun sizeOf(key: Int, value: Bitmap) = value.byteCount
  }

  private class DetailTile(val page: Int, val left: Float, val top: Float, val bitmap: Bitmap)
  private var detailToken = 0
  private var detailTiles: List<DetailTile> = emptyList()
  private val scheduleDetail = Runnable { requestDetail() }

  private val pagePaint = Paint().apply { color = Color.WHITE }
  private val edgePaint = Paint().apply { color = Color.argb(28, 0, 0, 0); style = Paint.Style.STROKE; strokeWidth = density }
  private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)
  private val pageRect = RectF()
  private val scroller = OverScroller(context)
  private var zoomAnimator: ValueAnimator? = null

  private val scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
    override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
      zoomAnimator?.cancel()
      return true
    }

    override fun onScale(detector: ScaleGestureDetector): Boolean {
      zoomAround(zoom * detector.scaleFactor, detector.focusX, detector.focusY)
      return true
    }
  })

  private val gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
    override fun onDown(e: MotionEvent): Boolean {
      scroller.forceFinished(true)
      return true
    }

    override fun onScroll(e1: MotionEvent?, e2: MotionEvent, distanceX: Float, distanceY: Float): Boolean {
      if (scaleDetector.isInProgress) return true
      offsetX += distanceX
      offsetY += distanceY
      onViewportChanged()
      return true
    }

    override fun onFling(e1: MotionEvent?, e2: MotionEvent, velocityX: Float, velocityY: Float): Boolean {
      if (scaleDetector.isInProgress) return true
      scroller.fling(
        offsetX.roundToInt(), offsetY.roundToInt(), -velocityX.roundToInt(), -velocityY.roundToInt(),
        minOffsetX().roundToInt(), maxOffsetX().roundToInt(), minOffsetY().roundToInt(), maxOffsetY().roundToInt()
      )
      postInvalidateOnAnimation()
      return true
    }

    override fun onDoubleTap(e: MotionEvent): Boolean {
      animateZoom(if (zoom > 1.2f) 1f else DOUBLE_TAP_ZOOM, e.x, e.y)
      return true
    }
  })

  // ---- Loading ----------------------------------------------------------

  fun open(source: String?) {
    if (released) return
    val gen = ++generation
    resetDocumentState()
    if (source.isNullOrBlank()) {
      listener?.onFailed("invalid_uri", "No PDF location was provided.")
      return
    }
    renderHandler.post {
      closeRenderer()
      try {
        val opened = openRenderer(source)
        val count = opened.pageCount
        if (count <= 0) throw EmptyPdfException()
        val widths = FloatArray(count)
        val heights = FloatArray(count)
        for (index in 0 until count) {
          opened.openPage(index).use { page ->
            widths[index] = page.width.toFloat()
            heights[index] = page.height.toFloat()
          }
        }
        mainHandler.post {
          if (gen != generation || released) return@post
          pageWidths = widths
          pageHeights = heights
          layoutPages()
          listener?.onLoaded(count)
          reportCurrentPage()
          invalidate()
        }
      } catch (error: Throwable) {
        Log.w(TAG, "Unable to open PDF", error)
        closeRenderer()
        val (code, message) = describe(error)
        mainHandler.post { if (gen == generation && !released) listener?.onFailed(code, message) }
      }
    }
  }

  private class EmptyPdfException : IOException("This PDF has no pages.")

  private fun describe(error: Throwable): Pair<String, String> = when (error) {
    is SecurityException -> "locked" to "This PDF is password protected."
    is FileNotFoundException -> "missing" to "The PDF file is missing from this device."
    is EmptyPdfException -> "empty" to "This PDF has no pages."
    is IllegalArgumentException -> "invalid_uri" to "The PDF location is not a local file."
    is IOException -> "corrupt" to "The file is not a readable PDF."
    else -> "unknown" to (error.message ?: "The PDF could not be opened.")
  }

  // Runs on the render thread.
  private fun openRenderer(source: String): PdfRenderer {
    val fd = openDescriptor(source)
    return try {
      PdfRenderer(fd).also { descriptor = fd; renderer = it }
    } catch (error: IOException) {
      fd.close()
      // Some content providers hand out non-seekable descriptors (pipes), which
      // PdfRenderer can't read. Copy those once into the cache and retry.
      if (!source.startsWith("content://", ignoreCase = true)) throw error
      val copy = File(context.cacheDir, "chits-pdf-view-${System.nanoTime()}.pdf")
      context.contentResolver.openInputStream(Uri.parse(source)).use { input ->
        input ?: throw FileNotFoundException(source)
        copy.outputStream().use { input.copyTo(it) }
      }
      fallbackCopy = copy
      val copyFd = ParcelFileDescriptor.open(copy, ParcelFileDescriptor.MODE_READ_ONLY)
      PdfRenderer(copyFd).also { descriptor = copyFd; renderer = it }
    }
  }

  private fun openDescriptor(source: String): ParcelFileDescriptor {
    val trimmed = source.trim()
    if (trimmed.startsWith("content://", ignoreCase = true)) {
      return context.contentResolver.openFileDescriptor(Uri.parse(trimmed), "r") ?: throw FileNotFoundException(trimmed)
    }
    val file = ChitsLocalFiles.fileFromSource(trimmed) ?: throw IllegalArgumentException(trimmed)
    if (!file.exists()) throw FileNotFoundException(file.path)
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  private fun closeRenderer() {
    try { renderer?.close() } catch (_: Throwable) {}
    try { descriptor?.close() } catch (_: Throwable) {}
    renderer = null
    descriptor = null
    fallbackCopy?.delete()
    fallbackCopy = null
  }

  fun release() {
    if (released) return
    released = true
    generation++
    zoomAnimator?.cancel()
    mainHandler.removeCallbacksAndMessages(null)
    renderHandler.removeCallbacksAndMessages(null)
    renderHandler.post { closeRenderer() }
    renderThread.quitSafely()
    baseCache.evictAll()
    detailTiles = emptyList()
  }

  private fun resetDocumentState() {
    pageWidths = FloatArray(0)
    pageHeights = FloatArray(0)
    pageTops = FloatArray(0)
    pageDisplayHeights = FloatArray(0)
    contentHeight = 0f
    zoom = 1f
    offsetX = 0f
    offsetY = 0f
    lastReportedPage = 0
    pendingBase.clear()
    baseCache.evictAll()
    detailTiles = emptyList()
    detailToken++
    invalidate()
  }

  // ---- Layout -----------------------------------------------------------

  private fun pageLayoutWidth() = max(1f, width - sideMargin * 2)

  private fun layoutPages() {
    val count = pageWidths.size
    if (count == 0 || width == 0) return
    val layoutWidth = pageLayoutWidth()
    pageTops = FloatArray(count)
    pageDisplayHeights = FloatArray(count)
    var y = pageGap
    for (index in 0 until count) {
      pageTops[index] = y
      pageDisplayHeights[index] = layoutWidth * pageHeights[index] / max(1f, pageWidths[index])
      y += pageDisplayHeights[index] + pageGap
    }
    contentHeight = y
    clampOffsets()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    if (w != oldw) {
      // Base bitmaps are sized to the view width, so a width change invalidates them.
      val progress = if (contentHeight > 0) (offsetY + oldh / 2f) / (contentHeight * zoom) else 0f
      baseCache.evictAll()
      pendingBase.clear()
      layoutPages()
      offsetY = progress * contentHeight * zoom - h / 2f
    }
    onViewportChanged()
  }

  private fun minOffsetX() = 0f
  private fun maxOffsetX() = max(0f, width * zoom - width)
  private fun minOffsetY() = if (contentHeight * zoom < height) -(height - contentHeight * zoom) / 2f else 0f
  private fun maxOffsetY() = if (contentHeight * zoom < height) minOffsetY() else contentHeight * zoom - height

  private fun clampOffsets() {
    offsetX = offsetX.coerceIn(minOffsetX(), maxOffsetX())
    offsetY = offsetY.coerceIn(minOffsetY(), maxOffsetY())
  }

  private fun zoomAround(target: Float, focusX: Float, focusY: Float) {
    val next = target.coerceIn(1f, MAX_ZOOM)
    val contentX = (focusX + offsetX) / zoom
    val contentY = (focusY + offsetY) / zoom
    zoom = next
    offsetX = contentX * next - focusX
    offsetY = contentY * next - focusY
    onViewportChanged()
  }

  private fun animateZoom(target: Float, focusX: Float, focusY: Float) {
    zoomAnimator?.cancel()
    zoomAnimator = ValueAnimator.ofFloat(zoom, target).apply {
      duration = 220
      interpolator = DecelerateInterpolator()
      addUpdateListener { zoomAround(it.animatedValue as Float, focusX, focusY) }
      start()
    }
  }

  private fun onViewportChanged() {
    clampOffsets()
    if (detailTiles.isNotEmpty()) detailTiles = emptyList()
    detailToken++
    mainHandler.removeCallbacks(scheduleDetail)
    reportCurrentPage()
    invalidate()
  }

  // ---- Touch ------------------------------------------------------------

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) parent?.requestDisallowInterceptTouchEvent(true)
    scaleDetector.onTouchEvent(event)
    gestureDetector.onTouchEvent(event)
    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
      maybeScheduleDetail()
    }
    return true
  }

  override fun computeScroll() {
    if (scroller.computeScrollOffset()) {
      offsetX = scroller.currX.toFloat()
      offsetY = scroller.currY.toFloat()
      onViewportChanged()
      if (scroller.isFinished) maybeScheduleDetail() else postInvalidateOnAnimation()
    }
  }

  private fun maybeScheduleDetail() {
    mainHandler.removeCallbacks(scheduleDetail)
    if (zoom > 1.05f && scroller.isFinished && zoomAnimator?.isRunning != true) {
      mainHandler.postDelayed(scheduleDetail, DETAIL_DELAY_MS)
    }
  }

  // ---- Drawing ----------------------------------------------------------

  private fun screenRectFor(index: Int, out: RectF) {
    out.set(
      sideMargin * zoom - offsetX,
      pageTops[index] * zoom - offsetY,
      (sideMargin + pageLayoutWidth()) * zoom - offsetX,
      (pageTops[index] + pageDisplayHeights[index]) * zoom - offsetY
    )
  }

  private fun visiblePages(): IntRange {
    val count = pageTops.size
    if (count == 0) return IntRange.EMPTY
    val top = offsetY / zoom
    val bottom = (offsetY + height) / zoom
    var first = pageTops.binarySearchFloor(top)
    while (first > 0 && pageTops[first] + pageDisplayHeights[first] > top) first--
    var last = first
    while (last + 1 < count && pageTops[last + 1] < bottom) last++
    return first..last
  }

  override fun onDraw(canvas: Canvas) {
    canvas.drawColor(canvasColor)
    if (pageTops.isEmpty()) return
    val visible = visiblePages()
    // Keep one page of lookahead on each side warm so normal scrolling never shows a blank page.
    val wanted = HashSet<Int>()
    for (index in max(0, visible.first - 1)..min(pageTops.size - 1, visible.last + 1)) wanted.add(index)
    wantedPages = wanted

    for (index in visible) {
      screenRectFor(index, pageRect)
      if (pageRect.bottom < 0 || pageRect.top > height) continue
      canvas.drawRect(pageRect, pagePaint)
      baseCache.get(index)?.let { canvas.drawBitmap(it, null, pageRect, bitmapPaint) }
      canvas.drawRect(pageRect, edgePaint)
    }
    for (tile in detailTiles) {
      canvas.drawBitmap(tile.bitmap, tile.left, tile.top, null)
    }
    for (index in wanted) requestBase(index)
  }

  private fun requestBase(index: Int) {
    if (baseCache.get(index) != null || !pendingBase.add(index)) return
    val gen = generation
    val layoutWidth = pageLayoutWidth().roundToInt()
    // Unusually tall pages (receipts, scrolls) are rendered at a reduced
    // resolution rather than as one enormous bitmap; the detail layer restores
    // sharpness when the user zooms in.
    val fullHeight = max(1f, pageDisplayHeights[index])
    val downscale = min(1f, sqrt(MAX_BASE_PIXELS / (layoutWidth * fullHeight)))
    val targetWidth = max(1, (layoutWidth * downscale).roundToInt())
    val targetHeight = max(1, (fullHeight * downscale).roundToInt())
    renderHandler.post {
      val bitmap = if (gen == generation && index in wantedPages) renderPage(index, targetWidth, targetHeight, null) else null
      mainHandler.post {
        if (gen != generation || released) return@post
        pendingBase.remove(index)
        if (bitmap != null && layoutWidth == pageLayoutWidth().roundToInt()) {
          baseCache.put(index, bitmap)
          invalidate()
        }
      }
    }
  }

  private fun requestDetail() {
    if (zoom <= 1.05f || pageTops.isEmpty()) return
    val token = ++detailToken
    val gen = generation
    val viewBounds = RectF(0f, 0f, width.toFloat(), height.toFloat())
    val jobs = ArrayList<Triple<Int, RectF, RectF>>() // page, page screen rect, visible screen rect
    for (index in visiblePages()) {
      val pageScreen = RectF()
      screenRectFor(index, pageScreen)
      val visibleRect = RectF(pageScreen)
      if (!visibleRect.intersect(viewBounds) || visibleRect.width() < 1 || visibleRect.height() < 1) continue
      jobs.add(Triple(index, pageScreen, visibleRect))
    }
    renderHandler.post {
      val tiles = ArrayList<DetailTile>()
      for ((index, pageScreen, visibleRect) in jobs) {
        if (token != detailToken || gen != generation) break
        val tileWidth = visibleRect.width().roundToInt()
        val tileHeight = visibleRect.height().roundToInt()
        val matrix = Matrix().apply {
          val scale = pageScreen.width() / max(1f, pageWidths[index])
          postScale(scale, scale)
          postTranslate(pageScreen.left - visibleRect.left, pageScreen.top - visibleRect.top)
        }
        renderPage(index, tileWidth, tileHeight, matrix)?.let { tiles.add(DetailTile(index, visibleRect.left, visibleRect.top, it)) }
      }
      mainHandler.post {
        if (token != detailToken || gen != generation || released) return@post
        detailTiles = tiles
        invalidate()
      }
    }
  }

  // Runs on the render thread.
  private fun renderPage(index: Int, bitmapWidth: Int, bitmapHeight: Int, transform: Matrix?): Bitmap? {
    val pdf = renderer ?: return null
    if (bitmapWidth <= 0 || bitmapHeight <= 0) return null
    return try {
      val bitmap = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
      bitmap.eraseColor(Color.WHITE)
      pdf.openPage(index).use { page ->
        val clip = Rect(0, 0, bitmapWidth, bitmapHeight)
        page.render(bitmap, clip, transform, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
      }
      bitmap
    } catch (error: Throwable) {
      Log.w(TAG, "Unable to render PDF page $index", error)
      null
    }
  }

  // ---- Page reporting / accessibility -----------------------------------

  private fun reportCurrentPage() {
    if (pageTops.isEmpty() || height == 0) return
    val centerY = (offsetY + height / 2f) / zoom
    val page = pageTops.binarySearchFloor(centerY) + 1
    if (page == lastReportedPage) return
    lastReportedPage = page
    contentDescription = "PDF document, page $page of ${pageTops.size}"
    listener?.onPageChanged(page, pageTops.size)
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    zoomAnimator?.cancel()
    scroller.forceFinished(true)
  }

  private fun cacheBudgetBytes(): Int {
    val maxMemory = Runtime.getRuntime().maxMemory()
    return min(maxMemory / 6, 96L * 1024 * 1024).toInt()
  }
}

// Index of the last element <= value (0 when value precedes every element).
private fun FloatArray.binarySearchFloor(value: Float): Int {
  var low = 0
  var high = size - 1
  var result = 0
  while (low <= high) {
    val mid = (low + high) ushr 1
    if (this[mid] <= value) { result = mid; low = mid + 1 } else high = mid - 1
  }
  return result
}
