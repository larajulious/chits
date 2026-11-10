package expo.modules.chitsattachments

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Build
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextDirectionHeuristics
import android.text.TextPaint
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.text.style.MetricAffectingSpan
import android.text.style.StrikethroughSpan
import org.json.JSONObject
import java.io.File
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.cos

/**
 * Draws a Space the way the app draws it (SpaceSurface, PaperNote, SpacePhoto,
 * Cassette and PinDecoration in src/components/spaces): its surface, then its
 * front notes where they were stuck, tilted, each with the Space's pin. Notes
 * are the board's stickies at a fraction of their size, so every measurement
 * below is the board's, in board units. Colors and positions come from the
 * app's snapshot, which takes them from the same definitions the board uses.
 */
object ChitsStickyRenderer {
  private const val INK = 0xFF2A2622.toInt()
  private const val INK_FADED = 0x8C2A2622.toInt()
  private const val SHADOW = 0x38000000
  private const val PRINT_WHITE = 0xFFFBFAF6.toInt()
  private const val PICTURE = 0xFF2A2622.toInt()
  private const val SHELL = 0xFF2B2C31.toInt()
  private const val SHELL_DARK = 0xFF1E1F23.toInt()
  private const val SHELL_LIGHT = 0xFF3B3C42.toInt()
  private const val TAPE_BROWN = 0xFF5A3B2A.toInt()
  private const val STRIPE_RED = 0xBFD8432A.toInt()
  private const val CLEAR_TAPE = 0x9EFAF8F0.toInt()
  private const val RULE = 0xFFBCD2EA.toInt()
  private const val MARGIN = 0xFFE9A3A3.toInt()
  private const val STICKY_WIDTH = 132f
  private const val STICKY_HEIGHT = 124f

  class Fonts(val body: Typeface, val bold: Typeface, val mono: Typeface)
  class Labels(val hidden: String, val voice: String)
  /** A drawn note and its untilted footprint in the bitmap, for its tap target. */
  class Placed(val note: JSONObject, val bounds: RectF)
  class Drawing(val bitmap: Bitmap, val placed: List<Placed>)

  @Volatile private var loaded: Fonts? = null

  /** Nunito and Space Mono, the faces Spaces writes stickies and tape labels in. */
  fun fonts(context: Context): Fonts = loaded ?: Fonts(
    font(context, R.font.chits_sticky_body, "body", Typeface.DEFAULT),
    font(context, R.font.chits_sticky_bold, "bold", Typeface.DEFAULT_BOLD),
    font(context, R.font.chits_sticky_mono, "mono", Typeface.MONOSPACE),
  ).also { loaded = it }

  private fun font(context: Context, id: Int, name: String, fallback: Typeface): Typeface = try {
    if (Build.VERSION.SDK_INT >= 26) context.resources.getFont(id)
    else {
      // Before Android 8 a font resource is still a plain file: copy it out once and load that.
      val file = File(context.cacheDir, "chits_sticky_$name.ttf")
      if (!file.exists()) context.resources.openRawResource(id).use { input -> file.outputStream().use { input.copyTo(it) } }
      Typeface.createFromFile(file)
    }
  } catch (_: Exception) { fallback }

  private fun color(value: String?, fallback: Int) = try { if (value.isNullOrEmpty()) fallback else Color.parseColor(value) } catch (_: Exception) { fallback }
  private fun fill(color: Int, shadow: Float = 0f, dy: Float = 0f, shadowColor: Int = SHADOW, dx: Float = 0f) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    this.color = color
    if (shadow > 0f) setShadowLayer(shadow, dx, dy, shadowColor)
  }

  /** A Space holds at most this many notes (SPACE_CAPACITY). */
  const val CAPACITY = 12

  /**
   * [spaceId]'s surface with its notes as the user arranged them, [unit] pixels
   * per dp. [space] is the Space from the app's snapshot; without one the bare
   * surface is drawn.
   */
  fun drawSpace(context: Context, spaceId: String, space: JSONObject?, labels: Labels, widthPx: Int, heightPx: Int, unit: Float, rtl: Boolean, cornerRadius: Float): Drawing {
    val bitmap = Bitmap.createBitmap(max(1, widthPx), max(1, heightPx), Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val fonts = fonts(context)
    val bounds = RectF(0f, 0f, widthPx.toFloat(), heightPx.toFloat())
    canvas.save()
    canvas.clipPath(Path().apply { addRoundRect(bounds, cornerRadius, cornerRadius, Path.Direction.CW) })
    surface(canvas, spaceId, bounds, unit * if (widthPx / unit < 220f) 0.6f else 0.85f)

    val list = space?.optJSONArray("notes")
    val notes = (0 until (list?.length() ?: 0)).mapNotNull { list!!.optJSONObject(it) }.takeLast(CAPACITY)
    // The board in miniature (widgetLayout in snapshot.ts): every note at its own
    // spot on the user's board (board points), all scaled by one factor so
    // spacing, overlaps and order stay as arranged; fitted with the board's room
    // for pins and shadows, centered, never larger than on the board.
    val spots = notes.map { it.optDouble("left", 0.0).toFloat() to it.optDouble("top", 0.0).toFloat() }
    val fitLeft = (spots.minOfOrNull { it.first } ?: 0f) - 8
    val fitTop = (spots.minOfOrNull { it.second } ?: 0f) - 16
    val fitRight = (spots.maxOfOrNull { it.first } ?: 0f) + STICKY_WIDTH + 8
    val fitBottom = (spots.maxOfOrNull { it.second } ?: 0f) + STICKY_HEIGHT + 10
    val widthDp = widthPx / unit
    val heightDp = heightPx / unit
    val scale = minOf(1f, widthDp / (fitRight - fitLeft), heightDp / (fitBottom - fitTop))
    val originX = ((widthDp - (fitRight - fitLeft) * scale) / 2 - fitLeft * scale) * unit
    val originY = ((heightDp - (fitBottom - fitTop) * scale) / 2 - fitTop * scale) * unit
    val u = unit * scale
    val w = STICKY_WIDTH * u
    val h = STICKY_HEIGHT * u
    val placed = notes.mapIndexed { index, note ->
      val left = originX + spots[index].first * u
      val top = originY + spots[index].second * u
      val rect = RectF(left, top, left + w, top + h)
      canvas.save()
      canvas.rotate(note.optDouble("tilt", 0.0).toFloat().coerceIn(-4f, 4f), rect.centerX(), rect.centerY())
      when (note.optString("object")) {
        "cassette" -> cassette(canvas, RectF(rect.left, rect.top, rect.right, rect.top + w * 0.64f), note, labels, fonts, u)
        "print" -> print(canvas, rect, note, fonts, u)
        else -> paper(canvas, rect, note, labels, fonts, u, rtl)
      }
      pin(canvas, rect, space?.optString("pin").orEmpty(), color(note.optString("pinColor"), 0xFFE04B2A.toInt()), note.optDouble("tapeTilt", -3.0).toFloat(), u)
      canvas.restore()
      Placed(note, rect)
    }
    if (space != null && notes.isEmpty()) emptyTag(canvas, bounds, space.optString("empty"), fonts, unit, rtl)
    canvas.restore()
    return Drawing(bitmap, placed)
  }

  // ── Surfaces (SpaceSurface) ──────────────────────────────────────────────

  private fun scatter(index: Int, salt: Int): Float {
    val value = sin(index * 12.9898 + salt * 78.233) * 43758.5453
    return (value - floor(value)).toFloat()
  }

  private fun surface(canvas: Canvas, spaceId: String, b: RectF, s: Float) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    when (spaceId) {
      "desk" -> {
        paint.shader = LinearGradient(b.width() * 0.33f, 0f, b.width() * 0.67f, b.height(), 0xFFA8723F.toInt(), 0xFF8A5A2E.toInt(), Shader.TileMode.CLAMP)
        canvas.drawRect(b, paint)
        // The grain: thin dark and light lines, a little uneven.
        val grain = Paint(Paint.ANTI_ALIAS_FLAG)
        for (line in 0 until ceil(b.height() / (11 * s)).toInt() + 2) {
          grain.color = if (line % 4 != 0) 0xFF5C3818.toInt() else 0xFFC48A52.toInt()
          grain.alpha = ((0.1f + scatter(line, 3) * 0.12f) * 255).toInt()
          val y = line * 11 * s + scatter(line, 1) * 5 * s
          canvas.save()
          canvas.rotate((scatter(line, 4) - 0.5f) * 1.4f, b.centerX(), y)
          canvas.drawRect(b.left - 20 * s, y, b.right + 20 * s, y + max(1f, (0.8f + scatter(line, 2) * 1.8f) * s), grain)
          canvas.restore()
        }
        vignette(canvas, b, 0x8C1C0E04.toInt())
      }
      "cork" -> {
        paint.shader = LinearGradient(0f, 0f, b.width(), b.height(), 0xFF7C5A37.toInt(), 0xFF5F4226.toInt(), Shader.TileMode.CLAMP)
        canvas.drawRect(b, paint)
        val frame = s / 0.85f * 10f
        val cork = RectF(b.left + frame, b.top + frame, b.right - frame, b.bottom - frame)
        canvas.drawRect(cork, fill(0xFFC79764.toInt()))
        val dot = Paint(Paint.ANTI_ALIAS_FLAG)
        for (index in 0 until min(240, (cork.width() * cork.height() / (240 * s * s)).toInt())) {
          dot.color = if (index % 3 != 0) 0xFF8A5E33.toInt() else 0xFFE7C08D.toInt()
          dot.alpha = 115
          canvas.drawCircle(cork.left + scatter(index, 6) * cork.width(), cork.top + scatter(index, 7) * cork.height(), (1.2f + scatter(index, 5) * 2.6f) * s / 2, dot)
        }
        // The frame's shadow falling onto the cork.
        canvas.drawRect(cork.left, cork.top, cork.right, cork.top + 12 * s, Paint().apply { shader = LinearGradient(0f, cork.top, 0f, cork.top + 12 * s, 0x73000000, 0x00000000, Shader.TileMode.CLAMP) })
      }
      "wall" -> {
        canvas.drawRect(b, fill(0xFF8FA897.toInt()))
        paint.shader = RadialGradient(b.centerX(), b.height() * 0.14f, max(b.width(), b.height()) * 0.58f, 0x4DFFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP)
        canvas.drawRect(b, paint)
        vignette(canvas, b, 0x4D1E2D24)
      }
      else -> {
        paint.shader = LinearGradient(0f, 0f, b.width(), 0f, intArrayOf(0xFFD7DAD6.toInt(), 0xFFF8F9F7.toInt(), 0xFFD7DAD6.toInt()), null, Shader.TileMode.CLAMP)
        canvas.drawRect(b, paint)
        // A soft reflection band, the freezer seam and the chrome handle.
        val band = RectF(b.width() * 0.22f, b.top, b.width() * 0.42f, b.bottom)
        canvas.drawRect(band, Paint().apply { shader = LinearGradient(band.left, 0f, band.right, 0f, intArrayOf(0x00FFFFFF, 0x99FFFFFF.toInt(), 0x00FFFFFF), null, Shader.TileMode.CLAMP) })
        val seam = Math.round(b.height() * 0.1f).toFloat()
        canvas.drawRect(b.left, seam, b.right, seam + max(1f, 2 * s), fill(0x38282C2A))
        canvas.drawRect(b.left, seam + max(1f, 2 * s), b.right, seam + max(1f, 2 * s) + max(1f, s), fill(0xCCFFFFFF.toInt()))
        val handle = RectF(b.right - 10 * s - 11 * s, b.height() * 0.17f, b.right - 10 * s, b.height() * 0.41f)
        canvas.drawRoundRect(handle, 6 * s, 6 * s, fill(0xFFB9BEC1.toInt(), 4 * s, 3 * s, 0x47000000, -2 * s))
        canvas.drawRoundRect(handle, 6 * s, 6 * s, Paint(Paint.ANTI_ALIAS_FLAG).apply {
          shader = LinearGradient(handle.left, 0f, handle.right, 0f, intArrayOf(0xFF8F9498.toInt(), 0xFFF4F5F5.toInt(), 0xFFB9BEC1.toInt(), 0xFF7F8488.toInt()), floatArrayOf(0f, 0.45f, 0.7f, 1f), Shader.TileMode.CLAMP)
        })
      }
    }
  }

  private fun vignette(canvas: Canvas, b: RectF, edge: Int) {
    canvas.drawRect(b, Paint().apply {
      shader = RadialGradient(b.centerX(), b.centerY(), max(b.width(), b.height()) * 0.75f, intArrayOf(edge and 0x00FFFFFF, edge and 0x00FFFFFF, edge), floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP)
    })
  }

  /** Nothing stuck up yet: the board's own words, on a slip of paper. */
  private fun emptyTag(canvas: Canvas, b: RectF, text: String, fonts: Fonts, d: Float, rtl: Boolean) {
    if (text.isEmpty()) return
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = fonts.body; textSize = 14 * d; color = INK }
    val width = min(b.width() - 48 * d, paint.measureText(text) + 1).toInt().coerceAtLeast(1)
    val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, width).setAlignment(Layout.Alignment.ALIGN_CENTER).setMaxLines(4).setEllipsize(TextUtils.TruncateAt.END)
      .setTextDirection(if (rtl) TextDirectionHeuristics.FIRSTSTRONG_RTL else TextDirectionHeuristics.FIRSTSTRONG_LTR).build()
    val slip = RectF(b.centerX() - width / 2f - 10 * d, b.centerY() - layout.height / 2f - 7 * d, b.centerX() + width / 2f + 10 * d, b.centerY() + layout.height / 2f + 7 * d)
    canvas.save()
    canvas.rotate(-1.5f, slip.centerX(), slip.centerY())
    canvas.drawRoundRect(slip, 2 * d, 2 * d, fill(PRINT_WHITE, 3 * d, 3 * d))
    canvas.translate(slip.left + 10 * d, slip.top + 7 * d)
    layout.draw(canvas)
    canvas.restore()
  }

  // ── Paper (PaperNote), at u pixels per board unit ────────────────────────

  private fun paper(canvas: Canvas, rect: RectF, note: JSONObject, labels: Labels, fonts: Fonts, u: Float, rtl: Boolean) {
    val base = color(note.optString("base"), 0xFFFFE27A.toInt())
    val curl = color(note.optString("curl"), 0xFFF2CB45.toInt())
    val style = note.optString("paper", "sticky")
    val receipt = style == "receipt"
    val index = style == "index"
    val outline = Path()
    if (receipt) {
      // The torn edge: a tooth every 8 units below the receipt.
      val tooth = 7 * u
      val step = 8 * u
      val body = RectF(rect.left, rect.top, rect.right, rect.bottom - tooth)
      outline.moveTo(body.left, body.top); outline.lineTo(body.right, body.top); outline.lineTo(body.right, body.bottom)
      var x = body.right
      while (x > body.left) {
        val next = max(body.left, x - step)
        outline.lineTo((x + next) / 2, body.bottom + tooth); outline.lineTo(next, body.bottom)
        x = next
      }
      outline.close()
    } else outline.addRoundRect(rect, 2 * u, 2 * u, Path.Direction.CW)
    canvas.drawPath(outline, fill(base, 4.5f * u, 4.5f * u))
    if (!index && !receipt) canvas.drawPath(outline, Paint(Paint.ANTI_ALIAS_FLAG).apply {
      // linear-gradient(172deg, base 0%, base 70%, curl 100%)
      val lean = 0.07f * rect.height()
      shader = LinearGradient(rect.centerX() - lean, rect.top, rect.centerX() + lean, rect.bottom, intArrayOf(base, base, curl), floatArrayOf(0f, 0.7f, 1f), Shader.TileMode.CLAMP)
    })
    canvas.save()
    canvas.clipPath(outline)
    val area: RectF
    var pitch: Float? = null
    var lines = 3
    if (index) {
      pitch = 22 * u
      val rule = fill(RULE)
      var y = rect.top + pitch
      var count = 0
      while (y < rect.bottom) { canvas.drawRect(rect.left, y, rect.right, y + max(1f, u), rule); y += pitch; count++ }
      val margin = if (rtl) rect.right - 24 * u else rect.left + 24 * u
      canvas.drawRect(margin, rect.top, margin + max(1f, u), rect.bottom, fill(MARGIN))
      area = if (rtl) RectF(rect.left + 10 * u, rect.top + 5 * u, rect.right - 30 * u, rect.bottom) else RectF(rect.left + 30 * u, rect.top + 5 * u, rect.right - 10 * u, rect.bottom)
      lines = max(1, count - 1)
    } else if (receipt) {
      area = RectF(rect.left + 12 * u, rect.top + 16 * u, rect.right - 12 * u, rect.bottom - 7 * u)
    } else {
      area = RectF(rect.left + 13 * u, rect.top + 18 * u, rect.right - 13 * u, rect.bottom - 8 * u)
    }
    if (note.optBoolean("hidden")) hiddenMark(canvas, rect, labels.hidden, fonts, u)
    else {
      val text = SpannableStringBuilder()
      val list = note.optJSONArray("lines")
      for (i in 0 until (list?.length() ?: 0)) {
        val line = list!!.optJSONObject(i) ?: continue
        val words = line.optString("t")
        if (words.isEmpty()) continue
        if (text.isNotEmpty()) text.append('\n')
        val start = text.length
        text.append(words)
        when (line.optString("s")) {
          "h" -> text.setSpan(FaceSpan(fonts.bold), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          "x" -> {
            text.setSpan(ForegroundColorSpan(INK_FADED), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            text.setSpan(StrikethroughSpan(), min(text.length, start + 2), text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          }
        }
      }
      writing(canvas, area, text, fonts.body, (if (index || receipt) 18 else 21) * u, pitch ?: ((if (receipt) 23 else 24) * u), lines, rtl)
      imageCount(canvas, rect, note.optInt("images"), u)
    }
    canvas.restore()
  }

  private class FaceSpan(private val face: Typeface) : MetricAffectingSpan() {
    override fun updateDrawState(paint: TextPaint) { paint.typeface = face }
    override fun updateMeasureState(paint: TextPaint) { paint.typeface = face }
  }

  /** The note's first lines at the board's size and line height; the rest ends in "…". */
  private fun writing(canvas: Canvas, area: RectF, text: CharSequence, face: Typeface, sizePx: Float, lineHeight: Float, maxLines: Int, rtl: Boolean) {
    if (text.isEmpty() || area.width() < 1 || area.height() < 1) return
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = face; textSize = sizePx; color = INK }
    val metrics = paint.fontMetrics
    val extra = lineHeight - (metrics.descent - metrics.ascent)
    val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, area.width().toInt())
      .setAlignment(Layout.Alignment.ALIGN_NORMAL)
      .setLineSpacing(extra, 1f)
      .setIncludePad(false)
      .setMaxLines(maxLines)
      .setEllipsize(TextUtils.TruncateAt.END)
      .setTextDirection(if (rtl) TextDirectionHeuristics.FIRSTSTRONG_RTL else TextDirectionHeuristics.FIRSTSTRONG_LTR)
      .build()
    canvas.save()
    canvas.translate(area.left, area.top)
    canvas.clipRect(0f, -lineHeight * 0.2f, area.width(), area.height())
    layout.draw(canvas)
    canvas.restore()
  }

  /** Images pasted into the note, counted in the paper's own ink (bottom right, as on the board). */
  private fun imageCount(canvas: Canvas, rect: RectF, count: Int, u: Float) {
    if (count <= 0) return
    val ink = 0xB82A2622.toInt()
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.DEFAULT_BOLD; textSize = 11 * u; color = ink }
    val label = count.toString()
    val badge = RectF(rect.right - 8 * u - (5 + 11 + 3 + 5) * u - paint.measureText(label), rect.bottom - 7 * u - 15 * u, rect.right - 8 * u, rect.bottom - 7 * u)
    canvas.drawRoundRect(badge, 8 * u, 8 * u, fill(0x73FFFFFF))
    val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.2f * u; color = ink }
    val glyph = RectF(badge.left + 5 * u, badge.centerY() - 4.5f * u, badge.left + 16 * u, badge.centerY() + 4.5f * u)
    canvas.drawRoundRect(glyph, 2 * u, 2 * u, stroke)
    canvas.drawPath(Path().apply { moveTo(glyph.left + 2 * u, glyph.bottom - 2 * u); lineTo(glyph.left + 5 * u, glyph.centerY()); lineTo(glyph.left + 7.5f * u, glyph.bottom - 3.5f * u); lineTo(glyph.left + 9 * u, glyph.bottom - 4.5f * u); lineTo(glyph.right - 2 * u, glyph.bottom - 2 * u); close() }, fill(ink))
    canvas.drawText(label, glyph.right + 3 * u, badge.centerY() - (paint.descent() + paint.ascent()) / 2, paint)
  }

  /** A note hidden in Chat: covered, never its words. */
  private fun hiddenMark(canvas: Canvas, rect: RectF, label: String, fonts: Fonts, u: Float) {
    val x = rect.centerX()
    val y = rect.centerY() - 8 * u
    val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.6f * u; color = INK_FADED; strokeCap = Paint.Cap.ROUND }
    canvas.drawOval(RectF(x - 9 * u, y - 5.5f * u, x + 9 * u, y + 5.5f * u), stroke)
    canvas.drawCircle(x, y, 2.5f * u, stroke)
    canvas.drawLine(x - 8 * u, y + 7.5f * u, x + 8 * u, y - 7.5f * u, stroke)
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = fonts.body; textSize = 15 * u; color = 0xA62A2622.toInt(); textAlign = Paint.Align.CENTER }
    canvas.drawText(TextUtils.ellipsize(label, paint, rect.width() - 10 * u, TextUtils.TruncateAt.END).toString(), x, y + 24 * u, paint)
  }

  // ── Prints (SpacePhoto) and tapes (Cassette) ─────────────────────────────

  private fun print(canvas: Canvas, rect: RectF, note: JSONObject, fonts: Fonts, u: Float) {
    canvas.drawRoundRect(rect, 2 * u, 2 * u, fill(PRINT_WHITE, 4.5f * u, 4.5f * u))
    val picture = RectF(rect.left + 7 * u, rect.top + 7 * u, rect.right - 7 * u, rect.bottom - 22 * u)
    canvas.drawRect(picture, fill(PICTURE))
    val media = note.optJSONObject("media")
    val type = media?.optString("type")
    val image = media?.optString("image")?.takeIf { it.isNotEmpty() && it != "null" }
    if (type == "photo" && image != null) photo(image, picture.width().toInt(), picture.height().toInt())?.let { bitmap ->
      // Cover: fill the window, cropping the longer side.
      val scale = max(picture.width() / bitmap.width, picture.height() / bitmap.height)
      val sw = picture.width() / scale
      val sh = picture.height() / scale
      val left = ((bitmap.width - sw) / 2).toInt()
      val top = ((bitmap.height - sh) / 2).toInt()
      canvas.drawBitmap(bitmap, Rect(left, top, left + sw.toInt(), top + sh.toInt()), picture, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
      bitmap.recycle()
    }
    if (type == "video") {
      val r = 13 * u
      canvas.drawCircle(picture.centerX(), picture.centerY(), r, fill(0x80000000.toInt()))
      canvas.drawCircle(picture.centerX(), picture.centerY(), r, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.5f * u; color = 0xD9FFFFFF.toInt() })
      canvas.drawPath(Path().apply { moveTo(picture.centerX() - 4 * u, picture.centerY() - 6 * u); lineTo(picture.centerX() + 7 * u, picture.centerY()); lineTo(picture.centerX() - 4 * u, picture.centerY() + 6 * u); close() }, fill(Color.WHITE))
    }
    val caption = media?.optString("caption")?.takeIf { it.isNotEmpty() && it != "null" } ?: return
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = fonts.body; textSize = 14 * u; color = INK }
    canvas.drawText(TextUtils.ellipsize(caption, paint, picture.width(), TextUtils.TruncateAt.END).toString(), picture.left, rect.bottom - 11 * u - (paint.descent() + paint.ascent()) / 2, paint)
  }

  private fun photo(path: String, width: Int, height: Int): Bitmap? = try {
    val file = path.removePrefix("file://")
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file, bounds)
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= width && bounds.outHeight / (sample * 2) >= height) sample *= 2
    BitmapFactory.decodeFile(file, BitmapFactory.Options().apply { inSampleSize = sample })
  } catch (_: Exception) { null }

  private fun cassette(canvas: Canvas, rect: RectF, note: JSONObject, labels: Labels, fonts: Fonts, s: Float) {
    canvas.drawRoundRect(rect, 7 * s, 7 * s, fill(SHELL, 4.5f * s, 4.5f * s, 0x42000000))
    canvas.drawRoundRect(rect, 7 * s, 7 * s, Paint(Paint.ANTI_ALIAS_FLAG).apply {
      shader = LinearGradient(0f, rect.top, 0f, rect.bottom, intArrayOf(SHELL_LIGHT, SHELL, SHELL_DARK), floatArrayOf(0f, 0.3f, 1f), Shader.TileMode.CLAMP)
    })
    for ((x, y) in listOf(rect.left + 7 * s to rect.top + 7 * s, rect.right - 7 * s to rect.top + 7 * s, rect.left + 7 * s to rect.bottom - 7 * s, rect.right - 7 * s to rect.bottom - 7 * s)) canvas.drawCircle(x, y, 2 * s, fill(SHELL_LIGHT))
    val base = color(note.optString("base"), 0xFFFFE27A.toInt())
    val curl = color(note.optString("curl"), 0xFFF2CB45.toInt())
    val label = RectF(rect.left + 10 * s, rect.top + 7 * s, rect.right - 10 * s, rect.top + 7 * s + rect.height() * 0.66f)
    canvas.drawRoundRect(label, 3 * s, 3 * s, Paint(Paint.ANTI_ALIAS_FLAG).apply {
      shader = LinearGradient(0f, label.top, 0f, label.bottom, intArrayOf(base, base, curl), floatArrayOf(0f, 0.75f, 1f), Shader.TileMode.CLAMP)
    })
    val media = note.optJSONObject("media")
    val time = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = fonts.mono; textSize = 7.5f * s; color = 0xB32A2622.toInt(); letterSpacing = 0.05f }
    val duration = media?.optString("duration")?.takeIf { it.isNotEmpty() && it != "null" } ?: "0:00"
    val timeWidth = time.measureText(duration)
    val captionPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = fonts.body; textSize = 12.5f * s; color = INK }
    val caption = media?.optString("caption")?.takeIf { it.isNotEmpty() && it != "null" } ?: labels.voice
    val baseline = label.top + 3 * s + 8 * s - (captionPaint.descent() + captionPaint.ascent()) / 2
    canvas.drawText(TextUtils.ellipsize(caption, captionPaint, label.width() - 14 * s - timeWidth, TextUtils.TruncateAt.END).toString(), label.left + 5 * s, baseline, captionPaint)
    canvas.drawText(duration, label.right - 5 * s - timeWidth, baseline, time)
    val stripeTop = label.top + 21 * s
    canvas.drawRect(label.left + 5 * s, stripeTop, label.right - 5 * s, stripeTop + 2 * s, fill(STRIPE_RED))
    val reel = 17 * s
    val window = RectF(label.left + 17 * s, stripeTop + 6 * s, label.right - 17 * s, stripeTop + 6 * s + reel + 5 * s)
    canvas.drawRoundRect(window, window.height() / 2, window.height() / 2, fill(SHELL_DARK))
    val left = window.left + 2.5f * s + reel / 2
    val right = window.right - 2.5f * s - reel / 2
    canvas.drawRoundRect(RectF(left, window.centerY() - reel * 0.31f, right, window.centerY() + reel * 0.31f), 2 * s, 2 * s, fill(TAPE_BROWN))
    val spoke = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = SHELL; strokeWidth = reel * 0.12f; strokeCap = Paint.Cap.ROUND }
    for (x in listOf(left, right)) {
      canvas.drawCircle(x, window.centerY(), reel / 2, fill(PRINT_WHITE))
      for (angle in listOf(0.0, 60.0, 120.0)) {
        val dx = (sin(Math.toRadians(angle)) * reel * 0.25).toFloat()
        val dy = (cos(Math.toRadians(angle)) * reel * 0.25).toFloat()
        canvas.drawLine(x - dx, window.centerY() - dy, x + dx, window.centerY() + dy, spoke)
      }
    }
    val head = RectF(rect.centerX() - rect.width() * 0.28f, rect.bottom - 13 * s, rect.centerX() + rect.width() * 0.28f, rect.bottom)
    canvas.drawPath(Path().apply { addRoundRect(head, floatArrayOf(4 * s, 4 * s, 4 * s, 4 * s, 0f, 0f, 0f, 0f), Path.Direction.CW) }, fill(SHELL_LIGHT))
    canvas.drawCircle(head.centerX() - 12.5f * s, head.centerY(), 2.5f * s, fill(SHELL_DARK))
    canvas.drawCircle(head.centerX() + 12.5f * s, head.centerY(), 2.5f * s, fill(SHELL_DARK))
  }

  // ── Pins (PinDecoration) ─────────────────────────────────────────────────

  /** How notes are held on: a magnet (Fridge), clear tape (Desk), a pushpin (Cork board) or washi tape (Wall). */
  private fun pin(canvas: Canvas, rect: RectF, style: String, color: Int, tapeTilt: Float, u: Float) {
    when (style) {
      "magnet" -> knob(canvas, rect.centerX(), rect.top + 1 * u, 11 * u, color, 0f, u)
      "pushpin" -> knob(canvas, rect.centerX(), rect.top + 14 * u, 8 * u, color, 2.5f * u, u)
      "washi" -> tape(canvas, rect, color, tapeTilt, true, u)
      else -> tape(canvas, rect, CLEAR_TAPE, tapeTilt, false, u)
    }
  }

  private fun knob(canvas: Canvas, x: Float, y: Float, r: Float, color: Int, dx: Float, u: Float) {
    canvas.drawCircle(x, y, r, fill(color, 2 * u, 2.5f * u, 0x61000000, dx))
    canvas.drawCircle(x, y, r, Paint(Paint.ANTI_ALIAS_FLAG).apply {
      shader = RadialGradient(x - 0.4f * r, y - 0.48f * r, 1.75f * r, intArrayOf(0xBFFFFFFF.toInt(), 0x26FFFFFF, 0x00000000, 0x47000000), floatArrayOf(0f, 0.34f, 0.55f, 1f), Shader.TileMode.CLAMP)
    })
  }

  private fun tape(canvas: Canvas, rect: RectF, color: Int, tilt: Float, washi: Boolean, u: Float) {
    val w = (if (washi) 64f else 60f) * u
    val h = 20 * u
    canvas.save()
    canvas.rotate(tilt, rect.centerX(), rect.top)
    val strip = RectF(rect.centerX() - w / 2, rect.top - h / 2, rect.centerX() + w / 2, rect.top + h / 2)
    canvas.drawRect(strip, Paint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      if (washi) alpha = (Color.alpha(color) * 0.85f).toInt() else setShadowLayer(1.5f * u, 0f, 1 * u, 0x1F000000)
    })
    if (washi) {
      canvas.save()
      canvas.clipRect(strip)
      val stripe = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = 0x61FFFFFF; strokeWidth = 3.5f * u }
      var x = strip.left - strip.height()
      while (x < strip.right) { canvas.drawLine(x, strip.bottom, x + strip.height(), strip.top, stripe); x += 7 * u }
      canvas.restore()
    }
    canvas.restore()
  }
}
