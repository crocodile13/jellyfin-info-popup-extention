#!/usr/bin/env bash
# =============================================================================
# gh_checksum.sh — Télécharge un fichier depuis GitHub et retourne son MD5
#
# Usage : bash gh_checksum.sh URL [max_retries]
# Stdout : le MD5 hexadécimal du fichier téléchargé
# Exit 1 : si le téléchargement échoue après tous les essais
#
# Pourquoi ce script existe :
#   Le MD5 qui doit figurer dans manifest.json est celui du fichier que
#   Jellyfin téléchargera depuis GitHub Releases. Si on calcule le MD5
#   du fichier local, tout changement ultérieur sur GitHub (CI qui écrase
#   le ZIP, re-upload, etc.) rend le manifest faux.
#   Ce script garantit que le manifest contient le bon MD5.
# =============================================================================
set -euo pipefail

URL="${1:-}"
MAX_RETRIES="${2:-5}"

if [ -z "$URL" ]; then
    echo "Usage: $0 URL [max_retries]" >&2
    exit 1
fi

# Détection md5
if command -v md5sum >/dev/null 2>&1; then
    md5_cmd() { md5sum "$1" | awk '{print $1}'; }
elif command -v md5 >/dev/null 2>&1; then
    md5_cmd() { md5 -q "$1"; }
else
    echo "ERREUR : md5sum ou md5 introuvable" >&2
    exit 1
fi

TMP=$(mktemp /tmp/gh_checksum_XXXXXX.zip)
trap 'rm -f "$TMP"' EXIT

DELAY=3

for i in $(seq 1 "$MAX_RETRIES"); do
    if curl -fsSL --retry 2 --retry-delay 2 "$URL" -o "$TMP" 2>/dev/null; then
        # Vérifie que c'est bien un ZIP (pas une page d'erreur HTML)
        if [ -s "$TMP" ] && file "$TMP" 2>/dev/null | grep -qi "zip"; then
            md5_cmd "$TMP"
            exit 0
        fi
    fi
    if [ "$i" -lt "$MAX_RETRIES" ]; then
        printf "  [gh_checksum] tentative %d/%d échouée, attente %ds (CDN GitHub)...\n" \
            "$i" "$MAX_RETRIES" "$DELAY" >&2
        sleep "$DELAY"
        DELAY=$((DELAY * 2))
    fi
done

printf "  [gh_checksum] ERREUR : impossible de télécharger %s après %d tentatives\n" \
    "$URL" "$MAX_RETRIES" >&2
exit 1
