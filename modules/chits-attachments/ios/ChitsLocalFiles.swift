import Foundation

enum ChitsLocalFiles {
  // Attachments live under the app's Documents directory and arrive as file://
  // URIs, but an unencoded path (spaces, unicode) or a bare absolute path are
  // accepted too so a stored path never fails on formatting alone.
  static func fileURL(from source: String) -> URL? {
    let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasPrefix("/") { return URL(fileURLWithPath: trimmed) }
    guard trimmed.lowercased().hasPrefix("file://") else { return nil }
    if let url = URL(string: trimmed), url.isFileURL { return url }
    let path = String(trimmed.dropFirst("file://".count))
    return URL(fileURLWithPath: path.removingPercentEncoding ?? path)
  }

  // Keeps the user's filename but strips path separators and control
  // characters; never invents or replaces an extension (the caller decides it).
  static func safeFileName(_ name: String?, fallback: String = "Attachment") -> String {
    let forbidden = CharacterSet(charactersIn: "/\\:").union(.controlCharacters)
    let cleaned = (name ?? "")
      .components(separatedBy: forbidden)
      .joined(separator: "-")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return cleaned.isEmpty || cleaned.hasPrefix(".") ? fallback : cleaned
  }

  // A zero-byte hard link (a copy only if linking fails) under `fileName` in a
  // scratch folder, so the system share/export UI shows the real filename
  // rather than Chits' generated storage name. The original is never moved.
  static func namedLink(to source: URL, fileName: String) throws -> URL {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("chits-share", isDirectory: true)
    try? FileManager.default.removeItem(at: directory)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let destination = directory.appendingPathComponent(safeFileName(fileName))
    do {
      try FileManager.default.linkItem(at: source, to: destination)
    } catch {
      try FileManager.default.copyItem(at: source, to: destination)
    }
    return destination
  }
}
