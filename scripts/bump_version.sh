#!/usr/bin/env bash
# =============================================================================
# bump_version.sh — Incrémente la version dans version.json
# Usage : bash bump_version.sh [patch|minor|major]
# =============================================================================
set -euo pipefail

BUMP_TYPE="${1:-patch}"
VERSION_FILE="version.json"

if [ ! -f "$VERSION_FILE" ]; then
    echo "ERREUR : $VERSION_FILE introuvable" >&2
    exit 1
fi

MAJOR=$(jq -r '.major' "$VERSION_FILE")
MINOR=$(jq -r '.minor' "$VERSION_FILE")
PATCH=$(jq -r '.patch' "$VERSION_FILE")
TARGET_ABI=$(jq -r '.targetAbi' "$VERSION_FILE")

OLD_VERSION="${MAJOR}.${MINOR}.${PATCH}.0"

case "$BUMP_TYPE" in
    patch)
        PATCH=$((PATCH + 1))
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    *)
        echo "ERREUR : type de bump invalide '$BUMP_TYPE' (utiliser: patch, minor, major)" >&2
        exit 1
        ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}.0"

# Mise à jour atomique via fichier temporaire
jq \
    --argjson major "$MAJOR" \
    --argjson minor "$MINOR" \
    --argjson patch "$PATCH" \
    '.major = $major | .minor = $minor | .patch = $patch' \
    "$VERSION_FILE" > "${VERSION_FILE}.tmp" && mv "${VERSION_FILE}.tmp" "$VERSION_FILE"

# Mise à jour de la version dans le .csproj
CSPROJ="Jellyfin.Plugin.InfoPopup/Jellyfin.Plugin.InfoPopup.csproj"
if [ -f "$CSPROJ" ]; then
    sed -i.bak "s|<Version>.*</Version>|<Version>${NEW_VERSION}</Version>|g" "$CSPROJ"
    rm -f "${CSPROJ}.bak"
fi

echo "$OLD_VERSION → $NEW_VERSION"
