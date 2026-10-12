import XCTest
import UIKit

final class ProbeTextView: UITextView {
  var forwardedPastes = 0
  override func paste(_ sender: Any?) { forwardedPastes += 1; super.paste(sender) }
}

final class ChitsInlinePasteTests: XCTestCase {
  private var previousClipboard: [[String: Any]] = []
  override func setUp() { super.setUp(); previousClipboard = UIPasteboard.general.items }
  override func tearDown() { UIPasteboard.general.items = previousClipboard; super.tearDown() }
  func testImagePasteUsesNativeSelectionAndLeavesTextIntact() {
    let view = ProbeTextView()
    view.text = "Before After"
    view.selectedRange = NSRange(location: 7, length: 2)
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8))
    UIPasteboard.general.image = renderer.image { context in UIColor.red.setFill(); context.fill(CGRect(x: 0, y: 0, width: 8, height: 8)) }
    let bridge = ChitsInlinePaste()
    var event: (String, Int, Int)?
    XCTAssertTrue(bridge.attach(view, tag: 1, key: "block") { key, start, end, _ in event = (key, start, end) })
    XCTAssertTrue(view.canPerformAction(#selector(UIResponderStandardEditActions.paste(_:)), withSender: nil))
    view.perform(#selector(UIResponderStandardEditActions.paste(_:)), with: nil)
    XCTAssertEqual(event?.0, "block")
    XCTAssertEqual(event?.1, 7)
    XCTAssertEqual(event?.2, 9)
    XCTAssertEqual(view.text, "Before After")
    XCTAssertEqual(view.forwardedPastes, 0)
    let photoSelector = NSSelectorFromString("chitsInsertInlinePhoto:")
    var operation: String?
    XCTAssertTrue(bridge.attach(view, tag: 1, key: "photo") { _, _, _, kind in operation = kind })
    XCTAssertTrue(view.canPerformAction(photoSelector, withSender: nil))
    view.perform(photoSelector, with: nil)
    XCTAssertEqual(operation, "pick")
    bridge.detach(1)
    XCTAssertTrue(type(of: view) == ProbeTextView.self)
  }
  func testTextPasteContinuesThroughUIKitAndRepeatedRegistrationDoesNotNestClasses() {
    let view = ProbeTextView()
    view.text = "AB"
    view.selectedRange = NSRange(location: 1, length: 0)
    let bridge = ChitsInlinePaste()
    var events = 0
    XCTAssertTrue(bridge.attach(view, tag: 2, key: "a") { _, _, _, _ in events += 1 })
    let firstClass = type(of: view)
    XCTAssertTrue(bridge.attach(view, tag: 2, key: "b") { _, _, _, _ in events += 1 })
    XCTAssertTrue(type(of: view) == firstClass)
    UIPasteboard.general.string = "hello"
    view.perform(#selector(UIResponderStandardEditActions.paste(_:)), with: nil)
    XCTAssertEqual(events, 0)
    XCTAssertEqual(view.forwardedPastes, 1)
    bridge.clear()
    XCTAssertTrue(type(of: view) == ProbeTextView.self)
  }
}
