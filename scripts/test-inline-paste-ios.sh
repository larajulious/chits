#!/bin/bash
set -euo pipefail
# Runs scoped paste interception against UIKit on an already booted simulator.
CHITS_ROOT=$(cd "$(dirname "$0")/.." && pwd)
CHITS_DEVELOPER=$(xcode-select -p)
CHITS_PLATFORM="$CHITS_DEVELOPER/Platforms/iPhoneSimulator.platform/Developer"
CHITS_SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
CHITS_TEST_DIR=$(mktemp -d /tmp/chits-inline-paste.XXXXXX)
trap 'rm -rf "$CHITS_TEST_DIR"' EXIT
CHITS_BUNDLE="$CHITS_TEST_DIR/ChitsInlinePasteTests.xctest"
mkdir -p "$CHITS_BUNDLE"
cat > "$CHITS_BUNDLE/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>ChitsInlinePasteTests</string><key>CFBundleIdentifier</key><string>com.chits.inline-paste-tests</string><key>CFBundlePackageType</key><string>BNDL</string></dict></plist>
PLIST
xcrun swiftc -swift-version 5 -emit-library -module-name ChitsInlinePasteTests \
  -target "$(uname -m)-apple-ios17.0-simulator" -sdk "$CHITS_SDK" \
  -I "$CHITS_PLATFORM/usr/lib" -L "$CHITS_PLATFORM/usr/lib" \
  -F "$CHITS_PLATFORM/Library/Frameworks" -framework XCTest \
  -Xlinker -rpath -Xlinker "$CHITS_PLATFORM/Library/Frameworks" \
  "$CHITS_ROOT/modules/chits-attachments/ios/ChitsInlinePaste.swift" \
  "$CHITS_ROOT/tests/native/inline-paste-ios.swift" -o "$CHITS_BUNDLE/ChitsInlinePasteTests"
xcrun simctl spawn "${1:-booted}" "$CHITS_PLATFORM/Library/Xcode/Agents/xctest" "$CHITS_BUNDLE"
