#!/usr/bin/env bash
# Finds shape, depth, type and icon values written straight into a screen
# instead of coming from the style tokens (src/constants/style-tokens.ts).
# Usage: scripts/check-style-tokens.sh [files…]   (default: the migrated screens)
# Exits 1 when anything is found. Circles written as `size / 2` are geometry,
# not style, so only literal numbers count.
set -u
cd "$(dirname "$0")/.."

PHASE1=(
  "src/app/(tabs)/index.native.tsx"
  "src/app/(tabs)/attachments.native.tsx"
  "src/app/settings.tsx"
  "src/components/boards/card-list-row.native.tsx"
  "src/components/navigation/bottom-nav.tsx"
  "src/components/navigation/chat-button-face.tsx"
  "src/components/mascot/sticky-greeting.native.tsx"
  "src/components/mascot/chits-guide.native.tsx"
  "src/components/ui/primitives.tsx"
  "src/components/ui/top-bar.tsx"
  "src/components/ui/controls.tsx"
  "src/components/ui/empty-state.tsx"
  "src/components/ui/note-card.tsx"
  "src/components/ui/app-text.tsx"
  "src/components/ui/surface.tsx"
  "src/components/ui/icon.tsx"
)
if [ "$#" -gt 0 ]; then FILES=("$@"); else FILES=("${PHASE1[@]}"); fi
for file in "${FILES[@]}"; do [ -f "$file" ] || { echo "No such file: $file" >&2; exit 2; }; done

declare -a CHECKS=(
  'radius|border(Top|Bottom)?(Left|Right)?Radius: *[0-9.]+ *[,}]'
  'shadow|shadow(Color|Opacity|Radius|Offset) *:|elevation: *[0-9]|boxShadow: *[`'"'"'"]'
  'font weight|fontWeight: *'"'"'[0-9a-z]+'"'"
  'font family|fontFamily: *'"'"
  'icon font|<Ionicons\b'
  'stroke|strokeWidth: *[0-9]'
)
# The primitives whose job is turning tokens into styles.
exempt() {
  case "$1:$2" in
    src/components/ui/surface.tsx:shadow|src/components/ui/icon.tsx:icon\ font|src/components/ui/app-text.tsx:font\ weight) return 0 ;;
  esac
  return 1
}

found=0
for check in "${CHECKS[@]}"; do
  name=${check%%|*}; pattern=${check#*|}
  for file in "${FILES[@]}"; do
    exempt "$file" "$name" && continue
    hits=$(grep -nE "$pattern" "$file") || continue
    while IFS= read -r hit; do echo "$name  $file:${hit%%:*}  $(echo "${hit#*:}" | sed -E 's/^ +//' | cut -c1-110)"; found=1; done <<< "$hits"
  done
done
[ "$found" -eq 0 ] && echo "No hardcoded radius, shadow, font or icon-stroke values in ${#FILES[@]} files."
exit "$found"
