#!/usr/bin/env bash
# Copies the kit fixtures to the booted iOS simulator (Files > On My iPhone)
# and to the connected Android emulator (Downloads).
set -euo pipefail

cd "$(dirname "$0")/../mobile-engineer-kit/fixtures"
files=(statement.csv statement.pdf spoofed.pdf)
[ -f oversize.csv ] && files+=(oversize.csv) || echo "oversize.csv missing, run: npm run fixtures:oversize"

if xcrun simctl list devices booted 2>/dev/null | grep -q Booted; then
  group=$(xcrun simctl get_app_container booted com.apple.DocumentsApp groups | awk '/FileProvider.LocalStorage/ {print $2}')
  mkdir -p "$group/File Provider Storage"
  cp "${files[@]}" "$group/File Provider Storage/"
  echo "iOS: copied to Files > On My iPhone"
fi

adb=${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb
if [ -x "$adb" ] && "$adb" get-state >/dev/null 2>&1; then
  for f in "${files[@]}"; do "$adb" push "$f" "/sdcard/Download/$f" >/dev/null; done
  echo "Android: copied to Downloads"
fi
