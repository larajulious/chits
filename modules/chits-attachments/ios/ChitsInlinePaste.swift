import UIKit
import ObjectiveC

// Scope the overrides to registered React Native text views. All other editing
// behavior stays on the original RN class; ordinary text pastes call RN's paste.
final class ChitsInlinePaste {
  private final class Registration: NSObject {
    let key: String
    let emit: (String, Int, Int, String) -> Void
    init(_ key: String, _ emit: @escaping (String, Int, Int, String) -> Void) { self.key = key; self.emit = emit }
  }
  private static var association: UInt8 = 0
  private var inputs: [Int: UITextView] = [:]

  func attach(_ root: UIView, tag: Int, key: String, emit: @escaping (String, Int, Int, String) -> Void) -> Bool {
    guard let input = textView(root) else { return false }
    detach(tag)
    let original: AnyClass = object_getClass(input)!
    let name = "ChitsImagePaste_" + NSStringFromClass(original)
    var hooked: AnyClass? = NSClassFromString(name)
    if hooked == nil {
      guard let subclass = objc_allocateClassPair(original, name, 0),
            let pasteMethod = class_getInstanceMethod(original, #selector(UIResponderStandardEditActions.paste(_:))),
            let actionMethod = class_getInstanceMethod(original, #selector(UIResponder.canPerformAction(_:withSender:))) else { return false }
      let pasteIMP = method_getImplementation(pasteMethod)
      let actionIMP = method_getImplementation(actionMethod)
      let paste: @convention(block) (UITextView, AnyObject?) -> Void = { view, sender in
        if let registration = objc_getAssociatedObject(view, &Self.association) as? Registration, UIPasteboard.general.hasImages {
          let range = view.selectedRange
          registration.emit(registration.key, range.location, range.location + range.length, "paste")
        } else {
          typealias Original = @convention(c) (AnyObject, Selector, AnyObject?) -> Void
          unsafeBitCast(pasteIMP, to: Original.self)(view, #selector(UIResponderStandardEditActions.paste(_:)), sender)
        }
      }
      let insertSelector = NSSelectorFromString("chitsInsertInlinePhoto:")
      let insert: @convention(block) (UITextView, AnyObject?) -> Void = { view, _ in
        if let registration = objc_getAssociatedObject(view, &Self.association) as? Registration {
          let range = view.selectedRange
          registration.emit(registration.key, range.location, range.location + range.length, "pick")
        }
      }
      if let menuMethod = class_getInstanceMethod(original, #selector(UIResponder.buildMenu(with:))) {
        let menuIMP = method_getImplementation(menuMethod)
        let build: @convention(block) (UITextView, AnyObject) -> Void = { view, object in
          typealias Original = @convention(c) (AnyObject, Selector, AnyObject) -> Void
          unsafeBitCast(menuIMP, to: Original.self)(view, #selector(UIResponder.buildMenu(with:)), object)
          if objc_getAssociatedObject(view, &Self.association) != nil, let builder = object as? UIMenuBuilder {
            let command = UICommand(title: "Insert photo inline", action: insertSelector)
            builder.insertChild(UIMenu(title: "", options: .displayInline, children: [command]), atEndOfMenu: .standardEdit)
          }
        }
        class_addMethod(subclass, #selector(UIResponder.buildMenu(with:)), imp_implementationWithBlock(build), method_getTypeEncoding(menuMethod))
      }
      class_addMethod(subclass, insertSelector, imp_implementationWithBlock(insert), method_getTypeEncoding(pasteMethod))
      let action: @convention(block) (UITextView, Selector, AnyObject?) -> Bool = { view, selector, sender in
        if selector == insertSelector, objc_getAssociatedObject(view, &Self.association) != nil { return true }
        if selector == #selector(UIResponderStandardEditActions.paste(_:)), objc_getAssociatedObject(view, &Self.association) != nil, UIPasteboard.general.hasImages { return true }
        typealias Original = @convention(c) (AnyObject, Selector, Selector, AnyObject?) -> Bool
        return unsafeBitCast(actionIMP, to: Original.self)(view, #selector(UIResponder.canPerformAction(_:withSender:)), selector, sender)
      }
      class_addMethod(subclass, #selector(UIResponderStandardEditActions.paste(_:)), imp_implementationWithBlock(paste), method_getTypeEncoding(pasteMethod))
      if let deleteMethod = class_getInstanceMethod(original, #selector(UIKeyInput.deleteBackward)) {
        let deleteIMP = method_getImplementation(deleteMethod)
        let delete: @convention(block) (UITextView) -> Void = { view in
          if let registration = objc_getAssociatedObject(view, &Self.association) as? Registration,
             view.selectedRange.location == 0, view.selectedRange.length == 0,
             view.markedTextRange == nil {
            registration.emit(registration.key, 0, 0, "backspace")
          } else {
            typealias Original = @convention(c) (AnyObject, Selector) -> Void
            unsafeBitCast(deleteIMP, to: Original.self)(view, #selector(UIKeyInput.deleteBackward))
          }
        }
        class_addMethod(subclass, #selector(UIKeyInput.deleteBackward), imp_implementationWithBlock(delete), method_getTypeEncoding(deleteMethod))
      }
      class_addMethod(subclass, #selector(UIResponder.canPerformAction(_:withSender:)), imp_implementationWithBlock(action), method_getTypeEncoding(actionMethod))
      objc_registerClassPair(subclass)
      hooked = subclass
    }
    objc_setAssociatedObject(input, &Self.association, Registration(key, emit), .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    object_setClass(input, hooked!)
    inputs[tag] = input
    return true
  }

  func detach(_ tag: Int) {
    guard let input = inputs.removeValue(forKey: tag) else { return }
    objc_setAssociatedObject(input, &Self.association, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    if let current = object_getClass(input), NSStringFromClass(current).hasPrefix("ChitsImagePaste_"), let original = class_getSuperclass(current) { object_setClass(input, original) }
  }
  func clear() { for tag in Array(inputs.keys) { detach(tag) } }
  private func textView(_ root: UIView) -> UITextView? {
    if let input = root as? UITextView { return input }
    for child in root.subviews { if let input = textView(child) { return input } }
    return nil
  }
}
