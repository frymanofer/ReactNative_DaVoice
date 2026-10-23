#!/bin/bash
# EAS Build for this folder only, with the credentials in .eas.env (git-ignored).
#   scripts/eas-build.sh android preview              # installable APK
#   scripts/eas-build.sh ios preview-simulator        # iOS simulator build
#   scripts/eas-build.sh all production
# This folder lives inside a larger git repository: EAS would upload the whole
# repository. EAS_NO_VCS + EAS_PROJECT_ROOT make it upload this folder only,
# filtered by .easignore (no secrets, no node_modules, no generated ios/android).
set -e
cd "$(dirname "$0")/.."
PLATFORM="${1:-all}"
PROFILE="${2:-preview}"

if [ -f .eas.env ]; then
  set -a; . ./.eas.env; set +a
fi
case "${EXPO_TOKEN:-}" in ""|PASTE*) unset EXPO_TOKEN;; esac
export EAS_NO_VCS=1
export EAS_PROJECT_ROOT="$PWD"
EAS="npx --yes eas-cli@latest"

if ! $EAS whoami >/dev/null 2>&1; then
  if [ -z "${EXPO_TOKEN:-}" ] && [ -n "${EXPO_USR:-}" ] && [ -n "${EXPO_PASS:-}" ] && command -v expect >/dev/null; then
    expect >/dev/null 2>&1 <<'EXP' || true
set timeout 90
spawn npx --yes eas-cli@latest login --no-browser
expect -re "Email or username"
sleep 0.5
send -- "$env(EXPO_USR)\r"
expect -re "Password"
sleep 0.5
send -- "$env(EXPO_PASS)\r"
expect eof
EXP
  fi
  $EAS whoami >/dev/null 2>&1 || { echo "Not logged in to Expo: set EXPO_TOKEN or EXPO_USR/EXPO_PASS in .eas.env"; exit 1; }
fi

$EAS build --platform "$PLATFORM" --profile "$PROFILE" --non-interactive --no-wait
