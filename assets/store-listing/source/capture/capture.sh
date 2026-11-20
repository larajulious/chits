#!/bin/zsh
# capture.sh <simulator-udid> <out-dir> <layout: phone|docked> [--display=N]
# Runs StoreCaptureTests on the device and answers each ready-<name> with a
# simctl screenshot saved as <out-dir>/<name>.png.
set -u
DEV=$1; OUT=$2; LAYOUT=$3; DISPLAY_ARG=${4:-}
HERE=${0:A:h}; DD=${DD:-/tmp/store-capture-dd}
mkdir -p "$OUT"; rm -f "$OUT"/ready-*(N) "$OUT"/done-*(N)
xcodebuild build-for-testing -project "$HERE/StoreCapture.xcodeproj" -scheme StoreCaptureTests -destination "id=$DEV" -derivedDataPath "$DD" > "$OUT/build.log" 2>&1 || { echo "build failed"; exit 1; }
TEST_RUNNER_SHOTS="$OUT" TEST_RUNNER_LAYOUT="$LAYOUT" TEST_RUNNER_STEPS="${STEPS:-}" xcodebuild test-without-building -project "$HERE/StoreCapture.xcodeproj" -scheme StoreCaptureTests -destination "id=$DEV" -parallel-testing-enabled NO -derivedDataPath "$DD" > "$OUT/test.log" 2>&1 &
TEST_PID=$!
while kill -0 $TEST_PID 2>/dev/null; do
  for f in "$OUT"/ready-*(N); do
    name=${f:t}; name=${name#ready-}
    [[ -e "$OUT/done-$name" ]] && continue
    perl -e 'alarm 40; exec @ARGV' xcrun simctl io "$DEV" screenshot $DISPLAY_ARG "$OUT/$name.png" >/dev/null 2>&1
    echo "captured $name"; touch "$OUT/done-$name"
  done
  sleep 0.5
done
grep -E "STORE|error:" "$OUT/test.log" | cut -c1-200
