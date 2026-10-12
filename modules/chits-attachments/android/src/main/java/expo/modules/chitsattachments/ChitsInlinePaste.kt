package expo.modules.chitsattachments

import android.content.ClipboardManager
import android.content.Context
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.widget.EditText

// Wrap RN's existing menu callbacks; text cut/copy/paste continue through RN.
internal class ChitsInlinePaste {
  private data class Registration(val input: EditText, val selection: ActionMode.Callback?, val insertion: ActionMode.Callback?)
  private val inputs = mutableMapOf<Int, Registration>()

  fun attach(input: EditText, tag: Int, key: String, emit: (String, Int, Int, String) -> Unit) {
    detach(tag)
    val registration = Registration(input, input.customSelectionActionModeCallback, input.customInsertionActionModeCallback)
    inputs[tag] = registration
    fun hasImage(): Boolean {
      val clipboard = input.context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      return clipboard.primaryClipDescription?.hasMimeType("image/*") == true
    }
    val insertPhotoId = 0x43484954
    fun wrapped(original: ActionMode.Callback?) = object : ActionMode.Callback {
      override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
        val allowed = original?.onCreateActionMode(mode, menu) ?: true
        if (menu.findItem(insertPhotoId) == null) menu.add(0, insertPhotoId, 1, "Insert photo inline")
        if (hasImage() && menu.findItem(android.R.id.paste) == null) menu.add(0, android.R.id.paste, 0, android.R.string.paste)
        return allowed
      }
      override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
        val changed = original?.onPrepareActionMode(mode, menu) ?: true
        if (menu.findItem(insertPhotoId) == null) menu.add(0, insertPhotoId, 1, "Insert photo inline")
        if (hasImage() && menu.findItem(android.R.id.paste) == null) menu.add(0, android.R.id.paste, 0, android.R.string.paste)
        return changed
      }
      override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
        if (item.itemId == insertPhotoId) {
          emit(key, input.selectionStart.coerceAtLeast(0), input.selectionEnd.coerceAtLeast(0), "pick")
          mode.finish()
          return true
        }
        if ((item.itemId == android.R.id.paste || item.itemId == android.R.id.pasteAsPlainText) && hasImage()) {
          emit(key, input.selectionStart.coerceAtLeast(0), input.selectionEnd.coerceAtLeast(0), "paste")
          mode.finish()
          return true
        }
        return original?.onActionItemClicked(mode, item) ?: false
      }
      override fun onDestroyActionMode(mode: ActionMode) { original?.onDestroyActionMode(mode) }
    }
    input.customSelectionActionModeCallback = wrapped(registration.selection)
    input.customInsertionActionModeCallback = wrapped(registration.insertion)
  }
  fun detach(tag: Int) {
    val registration = inputs.remove(tag) ?: return
    registration.input.customSelectionActionModeCallback = registration.selection
    registration.input.customInsertionActionModeCallback = registration.insertion
  }
  fun clear() { inputs.keys.toList().forEach(::detach) }
}
