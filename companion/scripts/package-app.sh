#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
bundle=${1:-"$package_dir/dist/ServerDrivenChatCompanion.app"}
swift build -c release --package-path "$package_dir"
bin_dir=$(swift build -c release --package-path "$package_dir" --show-bin-path)
mkdir -p "$bundle/Contents/MacOS"
cp "$bin_dir/ServerDrivenChatCompanion" "$bundle/Contents/MacOS/ServerDrivenChatCompanion"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>ServerDrivenChatCompanion</string>
  <key>CFBundleIdentifier</key><string>com.server-driven-chat.companion</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>ServerDrivenChat Companion</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.15.0</string>
  <key>CFBundleVersion</key><string>15</string>
  <key>LSMinimumSystemVersion</key><string>15.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>CFBundleURLTypes</key>
  <array><dict>
    <key>CFBundleURLName</key><string>ServerDrivenChat Companion OIDC callback</string>
    <key>CFBundleURLSchemes</key><array><string>sdccompanion</string></array>
  </dict></array>
</dict>
</plist>
PLIST
printf 'APPL????' > "$bundle/Contents/PkgInfo"
printf 'Created %s\n' "$bundle"
