#!/usr/bin/env bash
# =============================================================================
# update_manifest.sh — Ajoute une nouvelle entrée dans manifest.json
#
# Usage :
#   bash update_manifest.sh VERSION TARGET_ABI RELEASE_URL TIMESTAMP GITHUB_USER GITHUB_REPO
#
# Le checksum MD5 est calculé depuis le ZIP téléchargé sur GitHub Releases
# via gh_checksum.sh — c'est ce que Jellyfin téléchargera et vérifiera.
# Ne jamais utiliser le MD5 du fichier local : si le ZIP est modifié sur
# GitHub après l'upload (CI, re-upload...), le manifest serait faux.
#
# La nouvelle version est PREPEND dans le tableau versions[].
# Les versions précédentes sont conservées (historique complet).
# =============================================================================
set -euo pipefail

VERSION="$1"
TARGET_ABI="$2"
RELEASE_URL="$3"
TIMESTAMP="$4"
GITHUB_USER="$5"
GITHUB_REPO="$6"

MANIFEST_FILE="manifest.json"
CHANGELOG_FILE="CHANGELOG.md"
SCRIPTS_DIR="$(dirname "$0")"

# ---------------------------------------------------------------------------
# Calcul du checksum depuis GitHub (source de vérité pour Jellyfin)
# ---------------------------------------------------------------------------
echo "  Calcul du checksum depuis GitHub..."
CHECKSUM=$(bash "$SCRIPTS_DIR/gh_checksum.sh" "$RELEASE_URL")

if [ -z "$CHECKSUM" ]; then
    echo "ERREUR : impossible d'obtenir le checksum depuis GitHub" >&2
    exit 1
fi

echo "  Checksum MD5 (GitHub) : $CHECKSUM"

# ---------------------------------------------------------------------------
# Extraction du changelog pour cette version (optionnel)
#
# IMPORTANT : ne PAS écrire "awk ... | head -20" avec pipefail actif.
# head -20 ferme le pipe avant qu'awk ait fini de lire → SIGPIPE → exit 141
# → make: Error 141. On sépare les deux opérations pour éviter le pipe cassé.
# ---------------------------------------------------------------------------
CHANGELOG_ENTRY=""
if [ -f "$CHANGELOG_FILE" ]; then
    # awk s'arrête seul via "exit" dans l'action → pas de SIGPIPE
    CHANGELOG_RAW=$(awk \
        "/^## \[${VERSION}\]|^## v${VERSION}/"',/^## /{if(found) exit; found=1; next} found{print}' \
        "$CHANGELOG_FILE" || true)
    # head appliqué sur la variable déjà capturée → plus de pipe cassé
    CHANGELOG_ENTRY=$(printf '%s\n' "$CHANGELOG_RAW" | head -20 | tr '\n' '\\n' | sed 's/\\n$//')
fi
if [ -z "$CHANGELOG_ENTRY" ]; then
    CHANGELOG_ENTRY="Release v${VERSION}"
fi

# ---------------------------------------------------------------------------
# Construction de la nouvelle entrée version
# ---------------------------------------------------------------------------
NEW_VERSION_ENTRY=$(jq -n \
    --arg version    "$VERSION" \
    --arg changelog  "$CHANGELOG_ENTRY" \
    --arg targetAbi  "$TARGET_ABI" \
    --arg sourceUrl  "$RELEASE_URL" \
    --arg checksum   "$CHECKSUM" \
    --arg timestamp  "$TIMESTAMP" \
    '{
        version:   $version,
        changelog: $changelog,
        targetAbi: $targetAbi,
        sourceUrl: $sourceUrl,
        checksum:  $checksum,
        timestamp: $timestamp
    }')

# ---------------------------------------------------------------------------
# Lecture ou création du manifest
# ---------------------------------------------------------------------------
if [ ! -f "$MANIFEST_FILE" ] || [ ! -s "$MANIFEST_FILE" ]; then
    echo "  Création d'un nouveau manifest.json"
    echo "[]" > "$MANIFEST_FILE"
fi

MANIFEST=$(cat "$MANIFEST_FILE")
PLUGIN_GUID=$(jq -r '.[0].guid // empty' <<< "$MANIFEST" 2>/dev/null || echo "")

if [ -z "$PLUGIN_GUID" ]; then
    # Premier build : créer la structure complète
    jq -n \
        --arg guid        "a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
        --arg name        "Info Popup" \
        --arg description "Permet aux administrateurs de diffuser des messages popup aux utilisateurs lors de leur connexion." \
        --arg overview    "Messages popup pour les utilisateurs Jellyfin" \
        --arg owner       "$GITHUB_USER" \
        --arg imageUrl    "https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/assets/icon.png" \
        --argjson entry   "$NEW_VERSION_ENTRY" \
        '[{
            guid:        $guid,
            name:        $name,
            description: $description,
            overview:    $overview,
            owner:       $owner,
            category:    "General",
            imageUrl:    $imageUrl,
            versions:    [$entry]
        }]' > "${MANIFEST_FILE}.tmp"
else
    # Ajouter la nouvelle version en tête (ou remplacer si elle existe déjà)
    jq \
        --argjson entry "$NEW_VERSION_ENTRY" \
        '.[0].versions = ([$entry] + (.[0].versions | map(select(.version != $entry.version))))' \
        "$MANIFEST_FILE" > "${MANIFEST_FILE}.tmp"
fi

mv "${MANIFEST_FILE}.tmp" "$MANIFEST_FILE"

echo "  Version $VERSION ajoutée au manifest"
echo "  Total versions dans le manifest : $(jq '.[0].versions | length' "$MANIFEST_FILE")"
