package expo.modules.chitsattachments

import android.content.Context
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import com.facebook.react.views.textinput.ReactEditText
import java.util.WeakHashMap

/** Resumes RN's managed focus without blurring selection. Revisions also
 * cancel queued IME requests when Aa/Back changes the mode again. */
internal class ChitsNoteKeyboard {
  private val revisions = WeakHashMap<EditText, Long>()
  fun cancel(input: EditText, revision: Long) {
    if (revision < (revisions[input] ?: -1L)) return
    revisions[input] = revision
    input.showSoftInputOnFocus = false
  }
  fun hide(input: EditText, revision: Long): Boolean {
    if (revision < (revisions[input] ?: -1L)) return false
    cancel(input, revision)
    // Keyboard.dismiss() clears ReactEditText's focus and selection highlight.
    // Hiding the IME directly leaves the selected range visible instead.
    (input.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(input.windowToken, 0)
    return true
  }
  fun show(input: EditText, revision: Long): Boolean {
    if (revision < (revisions[input] ?: -1L)) return false
    revisions[input] = revision
    input.showSoftInputOnFocus = true
    input.post {
      if (revisions[input] == revision && input.isAttachedToWindow && input.showSoftInputOnFocus) {
        if (input is ReactEditText) input.requestFocusFromJS() else input.requestFocus()
        (input.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
      }
    }
    return true
  }
  fun clear() { revisions.clear() }
}
