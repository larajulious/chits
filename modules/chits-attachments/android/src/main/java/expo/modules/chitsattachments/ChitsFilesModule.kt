package expo.modules.chitsattachments

import android.app.Activity
import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.DocumentsContract
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.util.Log
import android.webkit.MimeTypeMap
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest
import kotlin.concurrent.thread

private const val TAG = "ChitsFiles"
private const val EXPORT_REQUEST_CODE = 7143

internal class FileUnavailableException : CodedException("ERR_FILE_MISSING", "The file is not available on this device.", null)
internal class ExportInProgressException : CodedException("ERR_EXPORT_IN_PROGRESS", "A file export is already in progress.", null)
internal class UnsupportedOnThisAndroidException : CodedException("ERR_UNSUPPORTED", "Direct downloads need Android 10 or later.", null)

class ChitsFilesModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private class PendingExport(val source: String, val promise: Promise)
  private var pendingExport: PendingExport? = null

  override fun definition() = ModuleDefinition {
    Name("ChitsFiles")

    AsyncFunction("atomicWriteFileAsync") { uri: String, contents: String ->
      val destination = ChitsLocalFiles.fileFromSource(uri) ?: throw FileUnavailableException()
      val temporary = File(destination.parentFile, "${destination.name}.tmp")
      temporary.outputStream().use { output ->
        output.write(contents.toByteArray(Charsets.UTF_8))
        output.fd.sync()
      }
      Os.rename(temporary.absolutePath, destination.absolutePath)
    }

    AsyncFunction("hashFileAsync") { uri: String ->
      val digest = MessageDigest.getInstance("SHA-256")
      openSource(uri).use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          digest.update(buffer, 0, count)
        }
      }
      digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }

    // A zero-byte hard link (a copy only if linking fails) in the cache, named
    // after the attachment's original filename, so Share / Open with show the
    // real name instead of the generated storage name.
    AsyncFunction("prepareNamedFileAsync") { uri: String, fileName: String ->
      val source = readableFile(uri)
      val directory = File(context.cacheDir, "chits-share")
      directory.deleteRecursively()
      directory.mkdirs()
      val destination = File(directory, ChitsLocalFiles.safeFileName(fileName))
      try {
        Os.link(source.absolutePath, destination.absolutePath)
      } catch (error: Throwable) {
        source.copyTo(destination, overwrite = true)
      }
      Uri.fromFile(destination).toString()
    }

    // Takes a content:// URI (expo-file-system's FileProvider) so the other app
    // gets a temporary read grant — no storage permission is involved.
    AsyncFunction("openWithAsync") { contentUri: String, mimeType: String? ->
      val activity = appContext.throwingActivity
      val uri = Uri.parse(contentUri)
      val view = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeType ?: "*/*")
        clipData = ClipData.newRawUri("", uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      if (activity.packageManager.queryIntentActivities(view, 0).isEmpty()) {
        return@AsyncFunction false
      }
      activity.startActivity(Intent.createChooser(view, null).apply { addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) })
      true
    }.runOnQueue(Queues.MAIN)

    // Storage Access Framework "Save as": the user picks the folder/provider
    // (Downloads, Documents, Drive, …) and the name; the provider resolves
    // name clashes itself (e.g. "Invoice (1).pdf") so nothing is overwritten.
    // The original bytes are streamed natively — no storage permission, no
    // re-encoding, and nothing passes through JavaScript.
    AsyncFunction("exportAsync") { uri: String, fileName: String, mimeType: String?, promise: Promise ->
      if (pendingExport != null) throw ExportInProgressException()
      // Fail before showing the picker, so a missing source never leaves an empty file behind.
      openSource(uri).close()
      val name = ChitsLocalFiles.safeFileName(fileName)
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = platformMimeType(name, mimeType)
        putExtra(Intent.EXTRA_TITLE, name)
      }
      pendingExport = PendingExport(uri, promise)
      try {
        appContext.throwingActivity.startActivityForResult(intent, EXPORT_REQUEST_CODE)
      } catch (error: Throwable) {
        pendingExport = null
        throw error
      }
    }

    // One-tap "Download": writes a copy straight into the public
    // Download/Chits folder through MediaStore (Android 10+), so it shows up in
    // Files and gallery apps with no permission and no picker. MediaStore
    // resolves name clashes itself ("Invoice (1).pdf"). A failed copy removes
    // the pending entry so no empty file is left behind.
    AsyncFunction("saveToDownloadsAsync") { uri: String, fileName: String, mimeType: String? ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) throw UnsupportedOnThisAndroidException()
      val resolver = context.contentResolver
      val name = ChitsLocalFiles.safeFileName(fileName)
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
        put(MediaStore.MediaColumns.MIME_TYPE, platformMimeType(name, mimeType))
        put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Chits")
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val destination = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IOException("Downloads could not create the file.")
      try {
        openSource(uri).use { input ->
          val output = resolver.openOutputStream(destination, "w") ?: throw IOException("Downloads could not open the file.")
          output.use { input.copyTo(it) }
        }
        resolver.update(destination, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
      } catch (error: Throwable) {
        try { resolver.delete(destination, null, null) } catch (_: Throwable) {}
        Log.w(TAG, "Unable to save to Downloads", error)
        val code = when {
          isOutOfSpace(error) -> "ERR_EXPORT_NO_SPACE"
          error is FileNotFoundException || error is FileUnavailableException -> "ERR_FILE_MISSING"
          else -> "ERR_EXPORT_FAILED"
        }
        throw CodedException(code, error.message ?: "The file could not be saved.", error)
      }
      // The name MediaStore actually used (it may have added " (1)").
      val savedName = resolver.query(destination, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      } ?: name
      mapOf("status" to "saved", "uri" to destination.toString(), "location" to "Downloads/Chits", "fileName" to savedName)
    }

    OnActivityResult { _, (requestCode, resultCode, data) ->
      if (requestCode != EXPORT_REQUEST_CODE) return@OnActivityResult
      val pending = pendingExport ?: return@OnActivityResult
      pendingExport = null
      val destination = data?.data
      if (resultCode != Activity.RESULT_OK || destination == null) {
        pending.promise.resolve(mapOf("status" to "cancelled"))
        return@OnActivityResult
      }
      val resolver = context.contentResolver
      thread(name = "ChitsFilesExport") {
        try {
          openSource(pending.source).use { input ->
            val output = resolver.openOutputStream(destination, "w") ?: throw IOException("Destination could not be opened.")
            output.use { input.copyTo(it) }
          }
          pending.promise.resolve(mapOf("status" to "saved", "uri" to destination.toString()))
        } catch (error: Throwable) {
          Log.w(TAG, "Unable to export file", error)
          // The picker already created the destination; don't leave an empty or partial copy behind.
          try { DocumentsContract.deleteDocument(resolver, destination) } catch (_: Throwable) {}
          val code = when {
            isOutOfSpace(error) -> "ERR_EXPORT_NO_SPACE"
            error is FileNotFoundException || error is FileUnavailableException -> "ERR_FILE_MISSING"
            error is SecurityException -> "ERR_EXPORT_PERMISSION"
            else -> "ERR_EXPORT_FAILED"
          }
          pending.promise.reject(code, error.message ?: "The file could not be saved.", error)
        }
      }
    }
  }

  private fun readableFile(uri: String): File {
    val file = ChitsLocalFiles.fileFromSource(uri) ?: throw FileUnavailableException()
    if (!file.canRead()) throw FileUnavailableException()
    return file
  }

  // file:// (and bare paths) for Chits' own storage; content:// for anything
  // still referenced through a provider.
  private fun openSource(uri: String): InputStream {
    if (uri.trim().startsWith("content://", ignoreCase = true)) {
      return context.contentResolver.openInputStream(Uri.parse(uri.trim())) ?: throw FileUnavailableException()
    }
    return readableFile(uri).inputStream()
  }

  // Storage providers append an extension when the MIME type and filename
  // disagree (e.g. "Voice note.m4a" + "audio/m4a" → "Voice note.m4a.mp4"), so
  // prefer the platform's own mapping for the file's extension when it has one.
  private fun platformMimeType(fileName: String, fallback: String?): String {
    val extension = fileName.substringAfterLast('.', "").lowercase()
    val fromExtension = if (extension.isNotEmpty()) MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) else null
    return fromExtension ?: fallback?.takeIf { it.contains('/') } ?: "application/octet-stream"
  }

  private fun isOutOfSpace(error: Throwable): Boolean {
    var current: Throwable? = error
    while (current != null) {
      if (current is ErrnoException && current.errno == OsConstants.ENOSPC) return true
      if (current.message?.contains("ENOSPC") == true || current.message?.contains("No space left", ignoreCase = true) == true) return true
      current = current.cause
    }
    return false
  }
}
