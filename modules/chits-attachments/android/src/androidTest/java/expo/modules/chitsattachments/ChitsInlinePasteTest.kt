package expo.modules.chitsattachments

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import android.view.ActionMode
import android.view.Menu
import android.view.MenuInflater
import android.view.MenuItem
import android.view.View
import android.widget.EditText
import android.widget.PopupMenu

class ChitsInlinePasteTest {
  @Test fun testImageSelectionAndTextFallback() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val activity = instrumentation.startActivitySync(Intent(instrumentation.targetContext, InlinePasteTestActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as InlinePasteTestActivity
    instrumentation.waitForIdleSync()
    instrumentation.runOnMainSync {
      val context = activity
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      val previous = clipboard.primaryClip
      val input = activity.input
      input.setText("Before After")
      input.setSelection(7, 9)
      var forwarded = 0
      val original = object : ActionMode.Callback {
        override fun onCreateActionMode(mode: ActionMode, menu: Menu) = true
        override fun onPrepareActionMode(mode: ActionMode, menu: Menu) = true
        override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean { forwarded++; return true }
        override fun onDestroyActionMode(mode: ActionMode) {}
      }
      input.customInsertionActionModeCallback = original
      input.customSelectionActionModeCallback = original
      val bridge = ChitsInlinePaste()
      var selection: Pair<Int, Int>? = null
      var block: String? = null
      var operation: String? = null
      try {
        bridge.attach(input, 1, "block") { key, start, end, kind -> block = key; selection = start to end; operation = kind }
        clipboard.setPrimaryClip(ClipData(ClipDescription("image", arrayOf("image/png")), ClipData.Item(Uri.parse("content://chits.test/image"))))
        val mode = TestMode(context, input)
        val callback = input.customSelectionActionModeCallback!!
        callback.onCreateActionMode(mode, mode.menu)
        val paste = mode.menu.findItem(android.R.id.paste)
        assertNotNull(paste)
        assertTrue(callback.onActionItemClicked(mode, paste))
        assertEquals("block", block)
        assertEquals("paste", operation)
        assertEquals(7 to 9, selection)
        assertEquals("Before After", input.text.toString())
        assertEquals(0, forwarded)
        assertTrue(mode.finished)
        clipboard.setPrimaryClip(ClipData.newPlainText("text", "hello"))
        assertTrue(callback.onActionItemClicked(mode, paste))
        assertEquals(1, forwarded)
        val photo = mode.menu.findItem(0x43484954)
        assertNotNull(photo)
        assertTrue(callback.onActionItemClicked(mode, photo))
        assertEquals("pick", operation)
        assertEquals(1, forwarded)
        bridge.attach(input, 1, "second") { _, _, _, _ -> }
        bridge.clear()
        assertSame(original, input.customSelectionActionModeCallback)
        assertSame(original, input.customInsertionActionModeCallback)
      } finally {
        bridge.clear()
        if (previous != null) clipboard.setPrimaryClip(previous) else clipboard.clearPrimaryClip()
        activity.finish()
      }
    }
  }
  private class TestMode(private val context: Context, input: View) : ActionMode() {
    private val items = PopupMenu(context, input).menu
    var finished = false
    override fun finish() { finished = true }
    override fun invalidate() {}
    override fun setTitle(title: CharSequence?) {}
    override fun setTitle(resId: Int) {}
    override fun setSubtitle(subtitle: CharSequence?) {}
    override fun setSubtitle(resId: Int) {}
    override fun setCustomView(view: View?) {}
    override fun getTitle(): CharSequence = ""
    override fun getSubtitle(): CharSequence = ""
    override fun getCustomView(): View? = null
    override fun getMenu(): Menu = items
    override fun getMenuInflater() = MenuInflater(context)
  }
}


class InlinePasteTestActivity : Activity() {
  lateinit var input: EditText
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    input = EditText(this)
    setContentView(input)
    input.requestFocus()
  }
}
