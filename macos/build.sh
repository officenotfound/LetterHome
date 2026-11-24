#!/bin/bash
# Builds "Letterhome Admin.app" (universal) into macos/build. Run from anywhere: ./macos/build.sh
set -e
cd "$(dirname "$0")"
APP="build/Letterhome Admin.app"
rm -rf build && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build/tmp
for A in arm64 x86_64; do
  swiftc -O -swift-version 5 -target $A-apple-macos13.0 Sources/main.swift -o build/tmp/app-$A \
    -framework Cocoa -framework WebKit -framework LocalAuthentication -framework UserNotifications -framework ServiceManagement
done
lipo -create build/tmp/app-arm64 build/tmp/app-x86_64 -output "$APP/Contents/MacOS/LetterhomeAdmin"
cp Info.plist "$APP/Contents/Info.plist"
# icon
swiftc -O -swift-version 5 make-icon.swift -o build/tmp/icon -framework Cocoa
build/tmp/icon build/tmp/icon1024.png
mkdir build/tmp/AppIcon.iconset
for s in 16 32 64 128 256 512 1024; do sips -z $s $s build/tmp/icon1024.png --out build/tmp/s$s.png >/dev/null; done
cp build/tmp/s16.png build/tmp/AppIcon.iconset/icon_16x16.png;   cp build/tmp/s32.png build/tmp/AppIcon.iconset/icon_16x16@2x.png
cp build/tmp/s32.png build/tmp/AppIcon.iconset/icon_32x32.png;   cp build/tmp/s64.png build/tmp/AppIcon.iconset/icon_32x32@2x.png
cp build/tmp/s128.png build/tmp/AppIcon.iconset/icon_128x128.png; cp build/tmp/s256.png build/tmp/AppIcon.iconset/icon_128x128@2x.png
cp build/tmp/s256.png build/tmp/AppIcon.iconset/icon_256x256.png; cp build/tmp/s512.png build/tmp/AppIcon.iconset/icon_256x256@2x.png
cp build/tmp/s512.png build/tmp/AppIcon.iconset/icon_512x512.png; cp build/tmp/s1024.png build/tmp/AppIcon.iconset/icon_512x512@2x.png
iconutil -c icns build/tmp/AppIcon.iconset -o "$APP/Contents/Resources/AppIcon.icns"
codesign --force --deep --options runtime --sign - "$APP"
rm -rf build/tmp
echo "Built: $(pwd)/$APP"
