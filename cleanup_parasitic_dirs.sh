#!/usr/bin/env bash
# =============================================================================
# cleanup_parasitic_dirs.sh
# À lancer UNE SEULE FOIS à la racine du repo pour supprimer les dossiers
# parasites créés par le zip mal formé.
# Usage : bash cleanup_parasitic_dirs.sh
# =============================================================================

set -e

REPO_ROOT="$(pwd)"

echo "🧹 Nettoyage des dossiers parasites dans : $REPO_ROOT"
echo ""

PARASITES=(
    "{Jellyfin.Plugin.InfoPopup"
    "Jellyfin.Plugin.InfoPopup/{Configuration,Models,Services,Controllers,Web}"
)

for dir in "${PARASITES[@]}"; do
    full_path="$REPO_ROOT/$dir"
    if [ -d "$full_path" ]; then
        echo "  Suppression : $dir"
        rm -rf "$full_path"
    else
        echo "  Déjà absent : $dir"
    fi
done

# Nettoyage générique de tout dossier commençant par { à la racine
# (au cas où d'autres artefacts similaires existent)
find "$REPO_ROOT" -maxdepth 2 -type d -name '{*' | while read -r d; do
    echo "  Suppression (détectée) : $d"
    rm -rf "$d"
done

echo ""
echo "✅ Nettoyage terminé."
echo ""
echo "Vérification de la structure :"
ls -la "$REPO_ROOT"
