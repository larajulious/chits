package expo.modules.chitsattachments

import android.content.Intent
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.text.Editable
import android.text.InputType
import android.text.Spanned
import android.text.TextPaint
import android.text.TextWatcher
import android.text.style.ForegroundColorSpan
import android.text.style.MetricAffectingSpan
import android.view.View
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test

class ChitsNoteFormattingTest {
  private fun withInput(action: (android.widget.EditText, ChitsNoteFormatting) -> Unit) {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val activity = instrumentation.startActivitySync(Intent(instrumentation.targetContext, InlinePasteTestActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as InlinePasteTestActivity
    instrumentation.waitForIdleSync()
    instrumentation.runOnMainSync {
      val formatter = ChitsNoteFormatting()
      try {
        activity.input.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        action(activity.input, formatter)
      } finally { formatter.clear(); activity.finish() }
    }
  }
  private val red = """[{"start":6,"end":11,"color":"#C1444C","backgroundColor":"#F7DCE5"}]"""

  @Test fun formattingExistingBufferPreservesNewlinesSelectionCompositionAndTextEvents() = withInput { input, formatter ->
    val original = "textA\ntextB\n\n😀 after\n"
    input.setText(original)
    input.setSelection(6, 11)
    val composing = Any()
    input.text.setSpan(composing, 6, 11, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE or Spanned.SPAN_COMPOSING)
    var textEvents = 0
    input.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { textEvents++ }
      override fun afterTextChanged(s: Editable?) {}
    })
    repeat(20) { index -> assertTrue(formatter.update(input, original, if (index % 2 == 0) red else "[]", index.toLong())) }
    assertEquals(original, input.text.toString())
    assertEquals(6, input.selectionStart)
    assertEquals(11, input.selectionEnd)
    assertEquals(6, input.text.getSpanStart(composing))
    assertTrue(input.text.getSpanFlags(composing) and Spanned.SPAN_COMPOSING != 0)
    assertEquals(0, textEvents)
    input.measure(View.MeasureSpec.makeMeasureSpec(800, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1600, View.MeasureSpec.AT_MOST))
    input.layout(0, 0, 800, input.measuredHeight)
    assertTrue(input.lineCount >= 5)
  }

  @Test fun queuedSnapshotsWaitForMatchingNativeTextAndNeverOverwriteTyping() = withInput { input, formatter ->
    input.setText("Loading")
    assertFalse(formatter.update(input, "textA\ntextB", red, 1))
    assertEquals("Loading", input.text.toString())
    input.setText("textA\ntextB")
    assertEquals(Color.parseColor("#C1444C"), input.text.getSpans(6, 11, ForegroundColorSpan::class.java).single().foregroundColor)
    input.text.append(" typed\nnext")
    assertEquals("textA\ntextB typed\nnext", input.text.toString())
    assertTrue(formatter.update(input, input.text.toString(), red, 2))
    input.text.delete(input.length() - 1, input.length())
    assertEquals("textA\ntextB typed\nnex", input.text.toString())
  }

  @Test fun staleAndMalformedSnapshotsCannotReplaceCurrentFormattingOrForeignSpans() = withInput { input, formatter ->
    input.setText("textA\ntextB")
    val foreign = ForegroundColorSpan(Color.GREEN)
    input.text.setSpan(foreign, 0, 5, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    assertTrue(formatter.update(input, input.text.toString(), red, 8))
    assertFalse(formatter.update(input, input.text.toString(), "[]", 7))
    assertFalse(formatter.update(input, input.text.toString(), """[{"start":6,"end":900}]""", 9))
    assertEquals(2, input.text.getSpans(0, input.length(), ForegroundColorSpan::class.java).size)
    assertTrue(formatter.update(input, input.text.toString(), "[]", 10))
    assertEquals(foreign, input.text.getSpans(0, input.length(), ForegroundColorSpan::class.java).single())
    assertEquals("textA\ntextB", input.text.toString())
  }

  @Test fun inlineFontsDoNotRewriteTheTextOrSelection() = withInput { input, formatter ->
    input.setText("textA\ntextB")
    input.setSelection(6, 11)
    assertTrue(formatter.update(input, input.text.toString(), """[{"start":6,"end":11,"bold":true,"italic":true,"underline":true}]""", 1))
    val paint = TextPaint()
    input.text.getSpans(6, 11, MetricAffectingSpan::class.java).forEach { it.updateDrawState(paint) }
    assertTrue(paint.typeface.isBold)
    assertTrue(paint.typeface.isItalic)
    assertEquals("textA\ntextB", input.text.toString())
    assertEquals(6, input.selectionStart)
    assertEquals(11, input.selectionEnd)
  }

  @Test fun nativeCopyPastePreservesMultilineWordsAndEmoji() = withInput { input, formatter ->
    val clipboard = input.context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val previous = clipboard.primaryClip
    try {
      val original = "textA\ntextB\n\n😀 after\n"
      input.setText(original)
      assertTrue(formatter.update(input, original, red, 1))
      input.setSelection(0, input.length())
      assertTrue(input.onTextContextMenuItem(android.R.id.copy))
      input.setSelection(input.length())
      assertTrue(input.onTextContextMenuItem(android.R.id.paste))
      assertEquals(original + original, input.text.toString())
    } finally {
      if (previous != null) clipboard.setPrimaryClip(previous) else clipboard.clearPrimaryClip()
    }
  }

  @Test fun keyboardTransitionsCancelStaleShowsWithoutChangingSelectionOrText() = withInput { input, _ ->
    val keyboard = ChitsNoteKeyboard()
    input.setText("textA\ntextB")
    input.setSelection(6, 11)
    assertTrue(keyboard.show(input, 1))
    keyboard.cancel(input, 2)
    assertFalse(input.showSoftInputOnFocus)
    assertFalse(keyboard.show(input, 1))
    assertTrue(keyboard.show(input, 3))
    assertTrue(input.showSoftInputOnFocus)
    assertEquals("textA\ntextB", input.text.toString())
    assertEquals(6, input.selectionStart)
    assertEquals(11, input.selectionEnd)
    keyboard.clear()
  }

  @Test fun hidingKeyboardForFormattingKeepsFocusAndTheVisibleSelection() = withInput { input, _ ->
    val keyboard = ChitsNoteKeyboard()
    input.requestFocus()
    input.setText("Before selected words after")
    input.setSelection(7, 21)
    assertTrue(input.isFocused)
    assertTrue(keyboard.hide(input, 2))
    assertTrue(input.isFocused)
    assertFalse(input.showSoftInputOnFocus)
    assertEquals(7, input.selectionStart)
    assertEquals(21, input.selectionEnd)
    assertEquals("Before selected words after", input.text.toString())
    assertFalse(keyboard.show(input, 1))
    keyboard.clear()
  }
}
