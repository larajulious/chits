// macOS visual assertion: swift tests/native/check-empty-layout.swift fresh.png cleared.png ...
import Foundation
import Vision
import ImageIO

let placeholder = ProcessInfo.processInfo.environment["CHITS_QA_PLACEHOLDER"]?.lowercased() ?? "write here"

func placeholderRect(_ path: String) throws -> CGRect {
  guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw NSError(domain: "Missing screenshot", code: 1) }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
  guard let line = request.results?.first(where: { $0.topCandidates(1).first?.string.lowercased().contains(placeholder) == true }) else {
    throw NSError(domain: "Placeholder not visible: \(path)", code: 2)
  }
  let approximate = CGRect(x: line.boundingBox.minX * CGFloat(image.width), y: (1 - line.boundingBox.maxY) * CGFloat(image.height), width: line.boundingBox.width * CGFloat(image.width), height: line.boundingBox.height * CGFloat(image.height))
  // OCR locates the phrase; exact gray glyph pixels avoid OCR bounding-box
  // jitter when the colored native caret is blinking alongside the placeholder.
  var pixels = [UInt8](repeating: 0, count: image.width * image.height * 4)
  pixels.withUnsafeMutableBytes { bytes in
    let context = CGContext(data: bytes.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  }
  var minX = image.width, minY = image.height, maxX = 0, maxY = 0
  for y in max(0, Int(approximate.minY) - 8)..<min(image.height, Int(approximate.maxY) + 9) {
    for x in max(0, Int(approximate.minX) - 8)..<min(image.width, Int(approximate.maxX) + 9) {
      let i = (y * image.width + x) * 4
      let r = Int(pixels[i]), g = Int(pixels[i + 1]), b = Int(pixels[i + 2])
      if r >= 65 && r <= 210 && max(r, g, b) - min(r, g, b) <= 25 {
        minX = min(minX, x); minY = min(minY, y); maxX = max(maxX, x); maxY = max(maxY, y)
      }
    }
  }
  guard minX <= maxX && minY <= maxY else { throw NSError(domain: "No placeholder glyphs: \(path)", code: 3) }
  return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}
let paths = Array(CommandLine.arguments.dropFirst())
guard paths.count >= 2 else { fatalError("Supply a fresh screenshot followed by cleared screenshots from the same device") }
let reference = try placeholderRect(paths[0])
print("Fresh placeholder: x=\(reference.minX), y=\(reference.minY)")
for path in paths.dropFirst() {
  let rect = try placeholderRect(path)
  let delta = max(abs(rect.minX - reference.minX), abs(rect.minY - reference.minY))
  guard delta <= 1 else { print("FAIL placeholder moved \(delta) pixels: \(rect), \(path)"); exit(1) }
  print("PASS \(URL(fileURLWithPath: path).lastPathComponent): x=\(rect.minX), y=\(rect.minY), delta=\(delta) pixels")
}
