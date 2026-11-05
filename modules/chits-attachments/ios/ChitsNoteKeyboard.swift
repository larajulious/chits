import UIKit

/** Swap the keyboard without resigning first responder, so UIKit continues
 * drawing the text selection while the formatting controls are in use. */
final class ChitsNoteKeyboard {
  private let revisions = NSMapTable<UIView, NSNumber>(keyOptions: .weakMemory, valueOptions: .strongMemory)

  private func input(_ root: UIView) -> UIView? {
    if root is UITextView || root is UITextField { return root }
    for child in root.subviews { if let found = input(child) { return found } }
    return nil
  }
  private func accept(_ root: UIView, revision: Double) -> UIView? {
    guard let view = input(root), revision >= (revisions.object(forKey: view)?.doubleValue ?? -1) else { return nil }
    revisions.setObject(NSNumber(value: revision), forKey: view)
    return view
  }
  func cancel(_ root: UIView, revision: Double) {
    _ = accept(root, revision: revision)
  }
  func hide(_ root: UIView, revision: Double) -> Bool {
    guard let view = accept(root, revision: revision) else { return false }
    if let text = view as? UITextView { text.inputView = UIView(frame: .zero) }
    if let text = view as? UITextField { text.inputView = UIView(frame: .zero) }
    if view.isFirstResponder { view.reloadInputViews() }
    return true
  }
  func show(_ root: UIView, revision: Double) -> Bool {
    guard let view = accept(root, revision: revision) else { return false }
    if let text = view as? UITextView { text.inputView = nil }
    if let text = view as? UITextField { text.inputView = nil }
    view.becomeFirstResponder()
    view.reloadInputViews()
    return true
  }
  func clear() { revisions.removeAllObjects() }
}
