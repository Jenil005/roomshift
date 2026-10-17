#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it, then run: gh auth login" >&2
  exit 1
fi

gh auth status
# Private-first for safety. Change --private to --public if desired.
gh repo create Jenil005/roomshift --private --source . --remote origin --push

echo "Created and pushed: https://github.com/Jenil005/roomshift"
