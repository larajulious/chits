import ExpoModulesCore
import CryptoKit
import Darwin
import Photos
import UIKit
import UniformTypeIdentifiers

internal final class FileUnavailableException: Exception, @unchecked Sendable {
  override var code: String { "ERR_FILE_MISSING" }
  override var reason: String { "The file is not available on this device." }
}

internal final class MissingViewControllerException: Exception, @unchecked Sendable {
  override var reason: String { "Cannot determine the currently presented view controller." }
}

internal final class PhotosAccessDeniedException: Exception, @unchecked Sendable {
  override var code: String { "ERR_EXPORT_PERMISSION" }
  override var reason: String { "Chits isn't allowed to add to Photos." }
}

internal final class PhotosSaveFailedException: GenericException<String>, @unchecked Sendable {
  override var code: String { "ERR_EXPORT_FAILED" }
  override var reason: String { "The item could not be saved to Photos: \(param)" }
}

internal final class ExportInProgressException: Exception, @unchecked Sendable {
  override var code: String { "ERR_EXPORT_IN_PROGRESS" }
  override var reason: String { "A file export is already in progress." }
}

public final class ChitsFilesModule: Module {
  // UIKit holds these weakly; they must outlive the presented UI.
  private var interactionController: UIDocumentInteractionController?
  private var exportDelegate: ExportDelegate?

  public func definition() -> ModuleDefinition {
    Name("ChitsFiles")

    AsyncFunction("atomicWriteFileAsync") { (uri: String, contents: String) in
      guard let url = ChitsLocalFiles.fileURL(from: uri) else { throw FileUnavailableException() }
      let temporary = url.appendingPathExtension("tmp")
      try Data(contents.utf8).write(to: temporary)
      let handle = try FileHandle(forWritingTo: temporary)
      defer { try? handle.close() }
      try handle.synchronize()
      guard Darwin.rename(temporary.path, url.path) == 0 else {
        throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
      }
    }

    AsyncFunction("hashFileAsync") { (uri: String) -> String in
      let handle = try FileHandle(forReadingFrom: Self.readableURL(uri))
      defer { try? handle.close() }
      var hasher = SHA256()
      while true {
        let finished = try autoreleasepool {
          guard let chunk = try handle.read(upToCount: 64 * 1024), !chunk.isEmpty else { return true }
          hasher.update(data: chunk)
          return false
        }
        if finished { break }
      }
      return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    AsyncFunction("prepareNamedFileAsync") { (uri: String, fileName: String) -> String in
      try ChitsLocalFiles.namedLink(to: Self.readableURL(uri), fileName: fileName).absoluteString
    }

    AsyncFunction("shareImagesAsync") { (uris: [String], promise: Promise) in
      guard !uris.isEmpty else { promise.resolve(false); return }
      let urls = try uris.map { try Self.readableURL($0) }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw MissingViewControllerException()
      }
      let controller = UIActivityViewController(activityItems: urls, applicationActivities: nil)
      if let popover = controller.popoverPresentationController {
        popover.sourceView = presenter.view
        popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 1, width: 1, height: 1)
      }
      controller.completionWithItemsHandler = { _, _, _, error in
        if let error { promise.reject(error) } else { promise.resolve(true) }
      }
      presenter.present(controller, animated: true)
    }
    .runOnQueue(.main)

    AsyncFunction("openWithAsync") { (uri: String, mimeType: String?) -> Bool in
      let url = try Self.readableURL(uri)
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw MissingViewControllerException()
      }
      let controller = UIDocumentInteractionController(url: url)
      if let mimeType, let type = UTType(mimeType: mimeType) { controller.uti = type.identifier }
      self.interactionController = controller
      let bounds = presenter.view.bounds
      let anchor = CGRect(x: bounds.midX, y: bounds.maxY - 1, width: 1, height: 1)
      return controller.presentOpenInMenu(from: anchor, in: presenter.view, animated: true)
    }
    .runOnQueue(.main)

    // One-tap "Download" for photos and videos: adds a copy of the original
    // file to the Photos library. Asks only for add-only access (it can't read
    // the library), and keeps the original filename on the asset.
    AsyncFunction("saveToPhotosAsync") { (uri: String, fileName: String, kind: String, promise: Promise) in
      let url = try Self.readableURL(uri)
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
        guard status == .authorized || status == .limited else {
          promise.reject(PhotosAccessDeniedException())
          return
        }
        PHPhotoLibrary.shared().performChanges({
          let options = PHAssetResourceCreationOptions()
          options.originalFilename = ChitsLocalFiles.safeFileName(fileName)
          PHAssetCreationRequest.forAsset().addResource(with: kind == "video" ? .video : .photo, fileURL: url, options: options)
        }) { success, error in
          if success {
            promise.resolve(["status": "saved", "location": "Photos", "fileName": ChitsLocalFiles.safeFileName(fileName)])
          } else {
            promise.reject(PhotosSaveFailedException(error?.localizedDescription ?? "unknown error"))
          }
        }
      }
    }

    // The system Files export sheet: the user picks On My iPhone, iCloud Drive
    // or any other Files provider, and Files itself handles name clashes. The
    // picker copies the file (asCopy), so the Chits original is untouched and
    // never re-encoded.
    AsyncFunction("exportAsync") { (uri: String, fileName: String, _: String?, promise: Promise) in
      guard self.exportDelegate == nil else { throw ExportInProgressException() }
      let named = try ChitsLocalFiles.namedLink(to: Self.readableURL(uri), fileName: fileName)
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw MissingViewControllerException()
      }
      let picker = UIDocumentPickerViewController(forExporting: [named], asCopy: true)
      let delegate = ExportDelegate { [weak self] destination in
        if let destination {
          promise.resolve(["status": "saved", "uri": destination.absoluteString])
        } else {
          promise.resolve(["status": "cancelled"])
        }
        self?.exportDelegate = nil
      }
      picker.delegate = delegate
      self.exportDelegate = delegate
      presenter.present(picker, animated: true)
    }
    .runOnQueue(.main)
  }

  private static func readableURL(_ uri: String) throws -> URL {
    guard let url = ChitsLocalFiles.fileURL(from: uri), FileManager.default.isReadableFile(atPath: url.path) else {
      throw FileUnavailableException()
    }
    return url
  }
}

private final class ExportDelegate: NSObject, UIDocumentPickerDelegate {
  private let completion: (URL?) -> Void
  private var finished = false

  init(completion: @escaping (URL?) -> Void) {
    self.completion = completion
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    finish(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(nil)
  }

  private func finish(_ url: URL?) {
    guard !finished else { return }
    finished = true
    completion(url)
  }
}
