import XCTest

/// Walks the installed Chits (seeded with fictional data by seed/seed_store_data.py)
/// through the eight store-listing screens. At each screen it writes
/// `<SHOTS>/ready-<name>` and waits for the host to answer with `<SHOTS>/done-<name>`
/// after it has taken the screenshot with `xcrun simctl io … screenshot`.
/// LAYOUT=phone uses the sliding side panel; LAYOUT=docked uses the docked one
/// (iPhone Duo inner display on its side).
final class StoreCaptureTests: XCTestCase {
  let out = ProcessInfo.processInfo.environment["SHOTS"] ?? NSTemporaryDirectory()
  let docked = ProcessInfo.processInfo.environment["LAYOUT"] == "docked"
  lazy var app = XCUIApplication(bundleIdentifier: "com.larajulious.chitsapp")
  let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

  func log(_ s: String) { print("STORE \(s)") }
  func el(_ prefix: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH[c] %@", prefix)).firstMatch
  }
  func tap(_ prefix: String, wait: TimeInterval = 5) -> Bool {
    let e = el(prefix)
    guard e.waitForExistence(timeout: wait) else { log("missing \(prefix)"); return false }
    e.tap(); return true
  }
  func dismissAlerts() {
    for label in ["Allow", "Not Now", "Don’t Allow", "OK"] {
      let b = springboard.buttons[label]
      if b.exists { b.tap(); sleep(1) }
    }
  }
  /// Hands the screen to the host for its screenshot.
  func capture(_ name: String) {
    sleep(2)
    dismissAlerts()
    let fm = FileManager.default
    fm.createFile(atPath: "\(out)/ready-\(name)", contents: nil)
    log("ready \(name)")
    let deadline = Date().addingTimeInterval(90)
    while !fm.fileExists(atPath: "\(out)/done-\(name)") && Date() < deadline { usleep(250_000) }
  }
  /// The screen's own back control ("Go back" on most screens, "Back" in Chat).
  func backButton() -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label == 'Go back' OR label == 'Back'")).firstMatch
  }
  func home() {
    for _ in 0..<4 { let back = backButton(); if back.exists && back.isHittable { back.tap(); sleep(2) } else { break } }
    // Screens without a back control (Spaces, Calendar…) go home through the panel.
    if el("View Today").exists || el("Plan My Day").exists { return }
    navigate("Notes")
  }
  func navigate(_ row: String) {
    if !docked { _ = tap("Open navigation"); sleep(1) }
    _ = tap(row); sleep(3)
  }

  /// STEPS="01,02,…" limits the run to those screens (all by default).
  func want(_ step: String) -> Bool {
    guard let steps = ProcessInfo.processInfo.environment["STEPS"], !steps.isEmpty else { return true }
    return steps.split(separator: ",").contains(Substring(step))
  }

  func testCaptureStoreScreens() {
    continueAfterFailure = true
    // A simulator left idle turns its display off; Home wakes it without losing Chits' screen.
    XCUIDevice.shared.press(.home); sleep(2)
    app.activate(); sleep(3); dismissAlerts()

    // 05 first, on a fresh launch: the Notes grid, where checklists show inside notes and cards.
    if want("05") { capture("05-notes-checklists") }

    // 01 — Chat: the timeline of quick notes.
    if want("01") { if tap("Open Chat") { sleep(3) }; capture("01-chat"); home() }

    // 02 — A board, both columns that have work in them.
    if want("02") {
      navigate("Apartment Move. Board.")
      capture("02-board")
      if !docked { _ = tap("Doing", wait: 3); sleep(2); capture("02b-board-doing") }
      home()
    }

    // 03 — Spaces: Pick a Space, then the Fridge itself.
    if want("03") {
      navigate("Spaces")
      capture("03a-spaces-pick")
      _ = tap("Stick them on the Fridge", wait: 3); sleep(3)
      capture("03b-fridge")
      home()
    }

    // 04 — Plan My Day.
    if want("04") { if tap("View Today") { sleep(3) }; capture("04-plan"); home() }

    // 06 — Calendar.
    if want("06") { navigate("Calendar"); capture("06-calendar"); home() }

    // 07 — Attachments, then the PDF in Chits' viewer.
    if want("07") {
      navigate("Attachments")
      capture("07-attachments")
      if tap("Lisbon itinerary", wait: 3) { sleep(3) }
      capture("07b-pdf")
      _ = tap("Close", wait: 2); sleep(1)
      home()
    }

    // 08 — Notes on the free board.
    if want("08") { if tap("Switch to board view", wait: 3) { sleep(3) }; capture("08-notes-board") }
  }

  /// Wakes a simulator whose display went to sleep, then brings Chits back.
  func testWake() {
    XCUIDevice.shared.press(.home); sleep(2)
    let swipeUp = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.98))
    swipeUp.press(forDuration: 0.1, thenDragTo: springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)))
    sleep(2)
    app.activate(); sleep(3)
    log("woke; chits state=\(app.state.rawValue)")
  }
}
