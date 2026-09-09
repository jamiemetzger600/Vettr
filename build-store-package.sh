#!/bin/bash
# Build a Chrome Web Store upload ZIP (extension only — no web app folder).
# Store package drops localhost host_permissions; repo manifest keeps them for unpacked dev.
set -e

VERSION=$(grep "const VERSION = " version.js | cut -d"'" -f2)
if [ -z "$VERSION" ]; then
  echo "❌ Could not read version from version.js"
  exit 1
fi

OUTPUT_NAME="Vettr-Extension-v${VERSION}-store.zip"
BUILD_DIR="build-store-temp"

echo "📦 Building Chrome Web Store package v${VERSION}..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

cp version.js content.js background.js styles.css i18n.js jspdf.min.js privacy-policy.html "$BUILD_DIR/"
cp deals-dashboard.html deals-dashboard.js "$BUILD_DIR/" 2>/dev/null || true
cp -r icons scrapers utils "$BUILD_DIR/"

# Store manifest: strip localhost / 127.0.0.1 from host_permissions only
python3 - <<'PY'
import json
from pathlib import Path

src = Path("manifest.json")
dst = Path("build-store-temp/manifest.json")
data = json.loads(src.read_text())
hosts = data.get("host_permissions") or []
blocked = ("http://localhost/", "http://127.0.0.1/")
data["host_permissions"] = [
    h for h in hosts
    if not any(h.startswith(p) or h == p.rstrip("/") + "/*" for p in blocked)
]
# Also drop exact localhost patterns Chrome uses
data["host_permissions"] = [
    h for h in data["host_permissions"]
    if "localhost" not in h and "127.0.0.1" not in h
]
dst.write_text(json.dumps(data, indent=2) + "\n")
print("   host_permissions (store):", data["host_permissions"])
PY

cd "$BUILD_DIR"
zip -r "../${OUTPUT_NAME}" . -x "*.DS_Store"
cd ..
rm -rf "$BUILD_DIR"

echo "✅ Store package: ${OUTPUT_NAME}"
echo "   Privacy policy URL: https://vettr.pages.dev/privacy-policy.html"
