package expo.modules.chitsattachments

import android.net.Uri
import java.io.File

internal object ChitsLocalFiles {
  // Attachments are stored under the app's files directory and arrive as
  // file:// URIs (percent-encoded or not); bare absolute paths are accepted
  // too. Returns null for anything that isn't a local file path.
  fun fileFromSource(source: String): File? {
    val trimmed = source.trim()
    if (trimmed.startsWith("/")) return File(trimmed)
    if (!trimmed.startsWith("file://", ignoreCase = true)) return null
    val path = Uri.parse(trimmed).path ?: return null
    return File(path)
  }

  // Keeps the user's filename but strips path separators and control
  // characters; never invents or replaces an extension (the caller decides it).
  fun safeFileName(name: String?, fallback: String = "Attachment"): String {
    val cleaned = (name ?: "").replace(Regex("[/\\\\:\\u0000-\\u001f]"), "-").trim()
    return if (cleaned.isEmpty() || cleaned.startsWith(".")) fallback else cleaned
  }
}
