# iOS pre-Archive: 1.0.6 (17)

Prepared on October 17, 2026 for manual Xcode Product → Archive.

- Expo configuration: version 1.0.6, iOS version 1.0.6, build 17.
- Native Debug/Release project settings: MARKETING_VERSION 1.0.6,
  CURRENT_PROJECT_VERSION 17. Info.plist uses those settings.
- Workspace: `ios/Chits.xcworkspace`; scheme: `Chits`.
- Archive action: Release; destination: Any iOS Device (arm64).
- Bundle identifier: `com.larajulious.chitsapp`; team: `9JQLWTZ683`.
- Minimum iOS: 16.4. Built using Xcode 27.0 / iPhoneOS 27.0 SDK.
- CocoaPods lockfile matches the installed Pods manifest.

## Verified

A signed generic-device Release build completed successfully:

```sh
env -u SKIP_BUNDLING -u EXPO_PUBLIC_CHITS_REVISIT_ENABLED NODE_ENV=production \
  xcodebuild -workspace ios/Chits.xcworkspace -scheme Chits \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/chits-prearchive-derived -quiet build
```

The resulting `Chits.app/Info.plist` reports version 1.0.6, build 17 and the
correct bundle identifier. Embedded Expo configuration reports 1.0.6. The app
contains a nonempty 6,590,936-byte Hermes bundle. The build's JavaScript has
`__DEV__=false`, Revisit enabled, the custom header feature, and the shared
SearchField. Deep strict code-sign verification passes with the local Apple
Development identity and expected team.

TypeScript, full Expo lint and all 62 focused Revisit, header-photo, backup and
checklist tests pass. No dependencies were upgraded and no user data was reset.

Local build log: `/tmp/chits-ios17-release-build.log`.
Build product: `/tmp/chits-prearchive-derived/Build/Products/Release-iphoneos/Chits.app`.

## Next in Xcode

Select `Chits` and `Any iOS Device (arm64)`, then Product → Archive. Organizer
validation, distribution signing and upload are still performed from the
archive. This preflight did not create or submit an App Store archive and does
not replace physical-device acceptance. EAS remote versioning was not changed;
these settings prepare the requested local Xcode workflow.
