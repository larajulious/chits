import ExpoModulesCore
import PDFKit
import UIKit

// A PDFKit-backed viewer for local PDF attachments. PDFDocument memory-maps the
// file and renders pages lazily as they scroll into view, so the document never
// passes through JavaScript and large files stay responsive. Pinch-to-zoom,
// panning and continuous vertical scrolling are PDFView's own native behavior.
final class ChitsPdfView: ExpoView {
  private let pdfView = PDFView()
  private var source: String?
  private var loadToken = 0
  private var lastReportedPage = 0

  let onLoadComplete = EventDispatcher()
  let onPageChanged = EventDispatcher()
  let onError = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    pdfView.displayMode = .singlePageContinuous
    pdfView.displayDirection = .vertical
    pdfView.displaysPageBreaks = true
    pdfView.pageBreakMargins = UIEdgeInsets(top: 6, left: 0, bottom: 6, right: 0)
    pdfView.pageShadowsEnabled = true
    pdfView.autoScales = true
    addSubview(pdfView)
    NotificationCenter.default.addObserver(self, selector: #selector(pageDidChange), name: .PDFViewPageChanged, object: pdfView)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let resized = pdfView.frame.size != bounds.size
    pdfView.frame = bounds
    if resized && pdfView.document != nil {
      updateScaleLimits()
    }
  }

  func setSource(_ nextSource: String?) {
    guard nextSource != source else { return }
    source = nextSource
    load()
  }

  func setCanvasColor(_ hex: String?) {
    pdfView.backgroundColor = hex.flatMap(UIColor.init(chitsHex:)) ?? .secondarySystemBackground
  }

  private func load() {
    loadToken += 1
    let token = loadToken
    pdfView.document = nil
    lastReportedPage = 0
    guard let source, let url = ChitsLocalFiles.fileURL(from: source) else {
      onError(["code": "invalid_uri", "message": "The PDF location is not a local file."])
      return
    }
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let result = ChitsPdfView.openDocument(at: url)
      DispatchQueue.main.async {
        guard let self, token == self.loadToken else { return }
        switch result {
        case .failure(let failure):
          self.onError(["code": failure.code, "message": failure.message])
        case .success(let document):
          self.pdfView.document = document
          self.pdfView.goToFirstPage(nil)
          self.updateScaleLimits()
          self.onLoadComplete(["pageCount": document.pageCount])
          self.reportCurrentPage()
        }
      }
    }
  }

  private struct LoadFailure: Error {
    let code: String
    let message: String
  }

  private static func openDocument(at url: URL) -> Result<PDFDocument, LoadFailure> {
    guard FileManager.default.fileExists(atPath: url.path) else {
      return .failure(LoadFailure(code: "missing", message: "The PDF file is missing from this device."))
    }
    guard FileManager.default.isReadableFile(atPath: url.path) else {
      return .failure(LoadFailure(code: "permission", message: "Chits cannot read this PDF file."))
    }
    guard let document = PDFDocument(url: url) else {
      return .failure(LoadFailure(code: "corrupt", message: "The file is not a readable PDF."))
    }
    if document.isLocked {
      return .failure(LoadFailure(code: "locked", message: "This PDF is password protected."))
    }
    if document.pageCount == 0 {
      return .failure(LoadFailure(code: "empty", message: "This PDF has no pages."))
    }
    return .success(document)
  }

  // Fit-to-width is the resting zoom; the user can pinch in up to 6x from there
  // but never out past the fitted size, so pages can't shrink into a void.
  private func updateScaleLimits() {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.pdfView.document != nil else { return }
      let fit = self.pdfView.scaleFactorForSizeToFit
      guard fit > 0 else { return }
      self.pdfView.minScaleFactor = fit
      self.pdfView.maxScaleFactor = fit * 6
      if self.pdfView.scaleFactor < fit { self.pdfView.scaleFactor = fit }
    }
  }

  @objc private func pageDidChange() {
    reportCurrentPage()
  }

  private func reportCurrentPage() {
    guard let document = pdfView.document, let page = pdfView.currentPage else { return }
    let index = document.index(for: page) + 1
    guard index != lastReportedPage else { return }
    lastReportedPage = index
    onPageChanged(["page": index, "pageCount": document.pageCount])
  }
}

extension UIColor {
  convenience init?(chitsHex hex: String) {
    var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.hasPrefix("#") { value.removeFirst() }
    guard value.count == 6 || value.count == 8, let number = UInt64(value, radix: 16) else { return nil }
    let hasAlpha = value.count == 8
    let red = CGFloat((number >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
    let green = CGFloat((number >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
    let blue = CGFloat((number >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
    let alpha = hasAlpha ? CGFloat(number & 0xFF) / 255 : 1
    self.init(red: red, green: green, blue: blue, alpha: alpha)
  }
}
