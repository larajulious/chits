# iOS pre-Archive: 1.0.12 (26)

Prepared November 9, 2026 for manual Xcode Product → Archive.

- Expo version and iOS version: `1.0.12`; iOS build number: `26`.
- Native app and ExpoWidgetsTarget: Debug/Release marketing version `1.0.12`
  and project build number `26` in the generated Xcode project.
- App and widget Info.plist values: `1.0.12` / `26`.
- Workspace: `ios/Chits.xcworkspace`; shared scheme: `Chits`.
- Archive action: `Release`.
- App bundle identifier: `com.larajulious.chitsapp`.
- Widget bundle identifier: `com.larajulious.chitsapp.ExpoWidgetsTarget`.
- Signing team: `9JQLWTZ683`; minimum iOS: `16.4`.

Checks completed: plist/project syntax validation, whitespace check, matching
CocoaPods lockfile and installed Pods manifest, valid local Node executable,
and Xcode's resolved app Release build settings for a generic iOS device. These
settings report `1.0.12` / `26`. The native `ios/` files are ignored by Git in
this checkout; their on-disk values have been updated for Xcode's local archive.

No build, Archive, tests, dependency upgrade, prebuild, or upload was run.
Existing UI/device testing remains manual, as requested. EAS remote versioning
was not changed; this prepares the local Xcode workflow.

In Xcode:

1. Open `ios/Chits.xcworkspace`.
2. Choose scheme `Chits` and `Any iOS Device (arm64)`.
3. Check app and widget Version `1.0.12`, Build `26`, then Product → Archive.
4. In Organizer, confirm `1.0.12 (26)` and use Validate App before distribution.

Archive compilation, distribution signing, App Store Connect build-number
availability, and Organizer validation have not been verified by these checks.
