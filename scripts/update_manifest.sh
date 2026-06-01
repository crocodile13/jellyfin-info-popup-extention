#!/usr/bin/env bash
# =============================================================================
# update_manifest.sh — Ajoute une nouvelle entrée dans un manifest Jellyfin
#
# Usage :
#   bash update_manifest.sh VERSION TARGET_ABI RELEASE_URL TIMESTAMP \
#                          GITHUB_USER GITHUB_REPO [MANIFEST_FILE] [CHANNEL]
#
#   MANIFEST_FILE : par défaut "manifest.json" (canal stable). Passer
#                   "manifest-dev.json" pour le canal dev (v3.8.9.0).
#   CHANNEL       : "stable" (défaut) ou "dev". En "dev", le nom du plugin
#                   est suffixé " (Dev)" pour le distinguer dans le catalogue
#                   Jellyfin si un user a ajouté les deux dépôts.
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
MANIFEST_FILE="${7:-manifest.json}"
CHANNEL="${8:-stable}"

CHANGELOG_FILE="CHANGELOG.md"
SCRIPTS_DIR="$(dirname "$0")"

# Suffixe le nom dans le manifest dev pour éviter la confusion dans le
# catalogue Jellyfin si un user a ajouté les deux dépôts simultanément.
if [ "$CHANNEL" = "dev" ]; then
    PLUGIN_NAME_DISPLAY="Info Popup (Dev)"
else
    PLUGIN_NAME_DISPLAY="Info Popup"
fi

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
# → make: Error 141. On capture la sortie awk dans une variable, puis on
# applique head sur la variable → pas de pipe cassé.
#
# Le markdown est converti en texte brut car Jellyfin affiche le champ
# changelog sans rendu markdown (### et ** apparaissent littéralement).
# Les sauts de ligne sont préservés comme de vrais \n JSON (pas de tr '\n').
# ---------------------------------------------------------------------------
CHANGELOG_ENTRY=""
if [ -f "$CHANGELOG_FILE" ]; then
    # awk avec la même logique que extract_changelog.sh :
    #   - found=1 quand la ligne de version est trouvée (next = on ne l'imprime pas)
    #   - exit quand une autre ligne ## est rencontrée (version suivante)
    #   - found{print} imprime uniquement le contenu de la version courante
    CHANGELOG_RAW=$(awk \
        "BEGIN{found=0}
         /^## (\[?v?${VERSION//./\\.}\]?)/{ found=1; next }
         /^## / && found { exit }
         found { print }" \
        "$CHANGELOG_FILE" | \
        sed \
            -e 's/^### //' \
            -e 's/\*\*//g' \
            -e 's/`//g' \
            -e '/^---$/d' \
            -e '/^[[:space:]]*$/d' \
        || true)
    # head appliqué sur la variable déjà capturée → pas de pipe cassé
    CHANGELOG_ENTRY=$(printf '%s\n' "$CHANGELOG_RAW" | head -20)
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

# Garde anti-corruption (v4.0.4.0) : refuse de continuer si le manifest existant
# contient des null bytes (\x00). Symptôme historique : une session externe a
# corrompu le file local (disque plein / fsync EUCLEAN / éditeur foireux) et
# `make release-*` réécrivait le manifest sans détection → push d'un manifest
# illisible sur GitHub → Jellyfin ne voit plus le plugin du tout (v4.0.3.0).
# Si déclenché : `git checkout <last-good-commit> -- $MANIFEST_FILE` puis relance.
if [ "$(tr -cd '\0' < "$MANIFEST_FILE" | wc -c)" -gt 0 ]; then
    echo "ERREUR : $MANIFEST_FILE contient des null bytes (fichier corrompu)." >&2
    echo "         Restaurer depuis git : git checkout HEAD -- $MANIFEST_FILE" >&2
    echo "         puis relancer la commande." >&2
    exit 1
fi

# Vérifie aussi que le JSON est parseable AVANT d'essayer de l'amender.
if ! jq empty "$MANIFEST_FILE" 2>/dev/null; then
    echo "ERREUR : $MANIFEST_FILE n'est pas un JSON valide." >&2
    echo "         Restaurer depuis git : git checkout HEAD -- $MANIFEST_FILE" >&2
    exit 1
fi

MANIFEST=$(cat "$MANIFEST_FILE")
PLUGIN_GUID=$(jq -r '.[0].guid // empty' <<< "$MANIFEST" 2>/dev/null || echo "")

if [ -z "$PLUGIN_GUID" ]; then
    # Premier build : créer la structure complète
    jq -n \
        --arg guid        "ceeb3040-9fe5-451f-ac05-8587ea3c3718" \
        --arg name        "$PLUGIN_NAME_DISPLAY" \
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
    # Ajouter la nouvelle version en tête (ou remplacer si elle existe déjà).
    # v4.1.0.0 : dédup sur (version, targetAbi) — pas juste version. Sinon en
    # multi-target le 2e appel update_manifest.sh écraserait l'entrée du 1er
    # variant (même version, targetAbi différent). On garde ainsi 1 entrée par
    # (version, targetAbi) pair, et toutes les variants de la même version
    # cohabitent proprement dans le manifest.
    jq \
        --argjson entry "$NEW_VERSION_ENTRY" \
        '.[0].versions = ([$entry] + (.[0].versions | map(select(.version != $entry.version or .targetAbi != $entry.targetAbi))))' \
        "$MANIFEST_FILE" > "${MANIFEST_FILE}.tmp"
fi

# Garde anti-corruption en sortie (v4.0.4.0) : valide le .tmp AVANT de remplacer
# le manifest. Sans ça, un jq qui produit un output vide ou corrompu (disque
# plein, fsync EUCLEAN, jq crash silencieux) écraserait le manifest existant
# par du contenu invalide.
if [ ! -s "${MANIFEST_FILE}.tmp" ]; then
    echo "ERREUR : ${MANIFEST_FILE}.tmp est vide après jq." >&2
    rm -f "${MANIFEST_FILE}.tmp"
    exit 1
fi
if [ "$(tr -cd '\0' < "${MANIFEST_FILE}.tmp" | wc -c)" -gt 0 ]; then
    echo "ERREUR : ${MANIFEST_FILE}.tmp contient des null bytes." >&2
    rm -f "${MANIFEST_FILE}.tmp"
    exit 1
fi
if ! jq empty "${MANIFEST_FILE}.tmp" 2>/dev/null; then
    echo "ERREUR : ${MANIFEST_FILE}.tmp n'est pas un JSON valide." >&2
    rm -f "${MANIFEST_FILE}.tmp"
    exit 1
fi

mv "${MANIFEST_FILE}.tmp" "$MANIFEST_FILE"

echo "  Version $VERSION ajoutée au manifest"
echo "  Total versions dans le manifest : $(jq '.[0].versions | length' "$MANIFEST_FILE")"
