#!/usr/bin/env bash
# =============================================================================
# extract_changelog.sh — Extrait les notes de release depuis CHANGELOG.md
# Usage : bash extract_changelog.sh VERSION
# =============================================================================
set -euo pipefail

VERSION="${1:-}"
CHANGELOG_FILE="CHANGELOG.md"

if [ -z "$VERSION" ] || [ ! -f "$CHANGELOG_FILE" ]; then
    echo "Release v${VERSION}"
    exit 0
fi

# Cherche ## [1.2.3.0] ou ## v1.2.3.0 ou ## [1.2.3.0] - 2026-...
NOTES=$(awk \
    "BEGIN{found=0}
     /^## (\[?v?${VERSION//./\\.}\]?)/{ found=1; next }
     /^## / && found { exit }
     found { print }" \
    "$CHANGELOG_FILE" | sed '/^[[:space:]]*$/d' | head -30)

if [ -z "$NOTES" ]; then
    echo "Release v${VERSION}"
else
    echo "$NOTES"
fi
