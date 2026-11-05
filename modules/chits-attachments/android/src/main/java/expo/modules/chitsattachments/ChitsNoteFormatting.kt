package expo.modules.chitsattachments

import android.graphics.Color
import android.graphics.Typeface
import android.text.Editable
import android.text.Spanned
import android.text.TextPaint
import android.text.TextWatcher
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.MetricAffectingSpan
import android.text.style.UnderlineSpan
import android.widget.EditText
import com.facebook.react.common.assets.ReactFontManager
import org.json.JSONArray
import java.lang.ref.WeakReference
import java.util.WeakHashMap

/** Appearance only. Never replace text, selection, composing spans or input type. */
internal class ChitsNoteFormatting {
  private interface OwnedSpan
  private class Foreground(color: Int) : ForegroundColorSpan(color), OwnedSpan
  private class Background(color: Int) : BackgroundColorSpan(color), OwnedSpan
  private class Underline : UnderlineSpan(), OwnedSpan
  private class Font(private val face: Typeface) : MetricAffectingSpan(), OwnedSpan {
    private fun apply(paint: TextPaint) { paint.typeface = face; paint.isFakeBoldText = false; paint.textSkewX = 0f }
    override fun updateDrawState(paint: TextPaint) { apply(paint) }
    override fun updateMeasureState(paint: TextPaint) { apply(paint) }
  }
  private data class Run(val start: Int, val end: Int, val family: String?, val bold: Boolean, val italic: Boolean, val underline: Boolean, val color: Int?, val background: Int?)
  private inner class Pending(input: EditText) : TextWatcher {
    val input = WeakReference(input)
    var revision = -1L
    var text = ""
    var runs = emptyList<Run>()
    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
    override fun afterTextChanged(s: Editable?) { applyPending(this) }
  }
  private val pending = WeakHashMap<EditText, Pending>()

  fun update(input: EditText, text: String, json: String, revision: Long): Boolean {
    // Validate the complete snapshot before changing any existing formatting.
    val runs = try {
      val array = JSONArray(json)
      List(array.length()) { index ->
        val item = array.getJSONObject(index)
        val start = item.getInt("start")
        val end = item.getInt("end")
        require(start >= 0 && end > start && end <= text.length)
        fun color(key: String): Int? = if (item.has(key)) Color.parseColor(item.getString(key)) else null
        Run(start, end, if (item.has("fontFamily")) item.getString("fontFamily") else null,
          item.optBoolean("bold"), item.optBoolean("italic"), item.optBoolean("underline"), color("color"), color("backgroundColor"))
      }
    } catch (_: Exception) { return false }
    val state = pending.getOrPut(input) { Pending(input).also { input.addTextChangedListener(it) } }
    if (revision < state.revision) return false
    state.revision = revision
    state.text = text
    state.runs = runs
    return applyPending(state)
  }

  private fun applyPending(state: Pending): Boolean {
    val input = state.input.get() ?: return false
    val buffer = input.text ?: return false
    // Fabric and native typing may be ahead of a JS commit. Hold the snapshot
    // until that exact buffer arrives; never apply stale UTF-16 offsets.
    if (buffer.toString() != state.text) return false
    input.beginBatchEdit()
    try {
      buffer.getSpans(0, buffer.length, OwnedSpan::class.java).forEach { buffer.removeSpan(it) }
      for (run in state.runs) {
        fun span(value: Any) { buffer.setSpan(value, run.start, run.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
        if (run.bold || run.italic) {
          val style = (if (run.bold) Typeface.BOLD else 0) or (if (run.italic) Typeface.ITALIC else 0)
          val face = if (run.family != null) ReactFontManager.getInstance().getTypeface(run.family, Typeface.NORMAL, input.context.assets)
            else Typeface.create(input.typeface, style)
          span(Font(face))
        }
        run.color?.let { span(Foreground(it)) }
        run.background?.let { span(Background(it)) }
        if (run.underline) span(Underline())
      }
    } finally { input.endBatchEdit() }
    return true
  }

  fun detach(input: EditText) { pending.remove(input)?.let { input.removeTextChangedListener(it) } }
  fun clear() { pending.keys.toList().forEach { detach(it) } }
}
