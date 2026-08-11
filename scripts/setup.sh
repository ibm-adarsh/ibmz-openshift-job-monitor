#!/usr/bin/env bash
# One-shot setup: install deps + sync job list from openshift/release configs on disk.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$MONITOR_ROOT"

echo "==> IBM Z OpenShift Job Monitor setup"
echo "    Directory: $MONITOR_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required (https://nodejs.org/)" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required" >&2
  exit 1
fi

echo "==> npm install"
npm install

echo "==> Sync job inventory from openshift/release (main branch configs)"
if [[ -d "../release/ci-operator/config/openshift/multiarch" ]]; then
  export RELEASE_ROOT="$(cd ../release && pwd)"
  echo "    Found sibling release clone: $RELEASE_ROOT"
elif [[ -n "${RELEASE_ROOT:-}" ]]; then
  echo "    Using RELEASE_ROOT=$RELEASE_ROOT"
else
  echo "    Warning: no ../release clone found. Clone openshift/release as a sibling or set RELEASE_ROOT."
fi
python3 "$SCRIPT_DIR/regenerate-inventory.py"

echo ""
echo "Done. Start the dashboard:"
echo "  cd $MONITOR_ROOT"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:5173/"
