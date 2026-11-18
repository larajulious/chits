import ExpoModulesCore
import UIKit

/// Chits stays upright on a phone-sized display, as it always has. On a display
/// with room for a workspace — the iPhone Duo's inner screen, or any display
/// whose shorter side is at least 600pt — it also turns with the device.
///
/// The choice comes from the display the window is on, never the device model,
/// and UIKit is asked again whenever the window's geometry changes: folding or
/// unfolding moves Chits between displays, and the outer display goes back to
/// portrait on its own.
public class ChitsOrientationSubscriber: ExpoAppDelegateSubscriber {
  private static let largeDisplayMinSide: CGFloat = 600
  /// Matches UISupportedInterfaceOrientations in Info.plist (app.json "portrait").
  private static let phoneOrientations: UIInterfaceOrientationMask = [.portrait, .portraitUpsideDown]

  private var observations: [ObjectIdentifier: NSKeyValueObservation] = [:]

  public func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
    guard let scene = window?.windowScene else { return Self.phoneOrientations }
    watch(scene)
    return Self.isLargeDisplay(scene) ? .all : Self.phoneOrientations
  }

  private static func isLargeDisplay(_ scene: UIWindowScene) -> Bool {
    let bounds = scene.screen.bounds
    return min(bounds.width, bounds.height) >= largeDisplayMinSide
  }

  private func watch(_ scene: UIWindowScene) {
    let key = ObjectIdentifier(scene)
    guard observations[key] == nil else { return }
    var wasLarge = Self.isLargeDisplay(scene)
    observations[key] = scene.observe(\.effectiveGeometry, options: [.new]) { scene, _ in
      // Rotating or resizing on the same display keeps the same answer; only
      // moving between the outer and inner displays changes it.
      let isLarge = Self.isLargeDisplay(scene)
      guard isLarge != wasLarge else { return }
      wasLarge = isLarge
      DispatchQueue.main.async {
        for window in scene.windows {
          window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        }
      }
    }
  }
}
