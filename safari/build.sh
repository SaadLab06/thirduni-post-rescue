#!/bin/bash
# Stage the shared extension and hand it to Apple's converter, which writes an Xcode
# project with an iOS app target and a Safari Web Extension target.
#
#   ./safari/build.sh                 both platforms
#   ./safari/build.sh --ios-only      iPhone and iPad only
#   BUNDLE_ID=com.you.postrescue ./safari/build.sh
#
# fix.js is never duplicated: it is copied out of the repo root at build time, so
# Chrome, Firefox and Safari all run the same file.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
stage="$here/.build/extension"
app_name="Thirduni Post Rescue"
bundle_id="${BUNDLE_ID:-com.example.thirduni.postrescue}"

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  cat >&2 <<'MSG'
safari-web-extension-converter was not found.

It ships inside Xcode, not the Command Line Tools. Install Xcode from the App Store,
then point the toolchain at it:

  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

MSG
  exit 1
fi

# The Safari manifest is deliberately its own file (no Firefox-only keys), so guard
# against it drifting away from the one Chrome and Firefox load.
python3 - "$root/manifest.json" "$here/resources/manifest.json" <<'PY'
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:3])
for key in ("manifest_version", "name", "version", "description"):
    if a.get(key) != b.get(key):
        print(f"warning: {key} differs: root={a.get(key)!r} safari={b.get(key)!r}", file=sys.stderr)
if a["content_scripts"][0]["matches"] != b["content_scripts"][0]["matches"]:
    print("warning: content_scripts matches differ between the two manifests", file=sys.stderr)
PY

rm -rf "$here/.build"
mkdir -p "$stage"
cp "$here/resources/manifest.json" "$stage/manifest.json"
cp -R "$here/resources/images" "$stage/images"
cp "$root/fix.js" "$stage/fix.js"

echo "Staged extension:"
find "$stage" -type f | sed "s|$stage|  extension|"
echo

set -x
xcrun safari-web-extension-converter "$stage" \
  --project-location "$here" \
  --app-name "$app_name" \
  --bundle-identifier "$bundle_id" \
  --swift \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force \
  "$@"
