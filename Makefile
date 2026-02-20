# =============================================================================
#  Makefile — jellyfin-info-popup-extention
#  Plugin Jellyfin : messages popup pour les utilisateurs
# =============================================================================
#
#  PRÉREQUIS : dotnet (SDK 8+), git, jq, md5sum (ou md5 sur macOS), gh (GitHub CLI)
#
#  UTILISATION RAPIDE :
#    make                   → affiche cette aide
#    make build             → compile en Debug
#    make pack              → compile Release + ZIP dans dist/
#    make verify            → vérifie que le ZIP GitHub correspond au manifest
#    make release-hotfix    → recompile + re-upload sans changer de version
#    make release-patch     → bump patch + release complète
#    make release-minor     → bump minor + release complète
#    make release-major     → bump major + release complète
#
#  POURQUOI release.yml NE SE DÉCLENCHE PAS SUR LES TAGS :
#    release.yml était en workflow_dispatch + push:tags. Cela provoquait un
#    conflit : le CI recompilait le plugin et écrasait le ZIP uploadé par
#    `make gh-release` avec un binaire différent (environnement CI ≠ local).
#    Le manifest gardait le MD5 local → Jellyfin téléchargeait le ZIP CI →
#    checksum mismatch systématique. release.yml est désormais manuel uniquement.
#
#  POURQUOI manifest-update TÉLÉCHARGE LE ZIP DEPUIS GITHUB :
#    Le manifest.json doit contenir le MD5 du fichier que Jellyfin téléchargera.
#    Ce fichier est servi par GitHub Releases. Calculer le MD5 du fichier local
#    est dangereux : si quoi que ce soit modifie le ZIP sur GitHub après l'upload
#    (CI, re-upload manuel, etc.), le manifest sera faux. La source de vérité
#    est ce que GitHub sert, pas ce qu'il y a dans dist/.
#
#  ORDRE GARANTI DANS UNE RELEASE :
#    pack → push code → tag → gh-release → vérification checksum GitHub
#    → manifest (MD5 GitHub) → push manifest
#
# =============================================================================

# ---------------------------------------------------------------------------
# Configuration — à personnaliser dans .env.make ou en ligne de commande
# ---------------------------------------------------------------------------

-include .env.make           # surcharge locale non versionnée

GITHUB_USER   ?= VOTRE_COMPTE_GITHUB
GITHUB_REPO   ?= jellyfin-info-popup-extention
BRANCH        ?= main

PLUGIN_NAME   := Jellyfin.Plugin.InfoPopup
PROJECT_DIR   := $(PLUGIN_NAME)
PROJECT_FILE  := $(PROJECT_DIR)/$(PLUGIN_NAME).csproj
SLN_FILE      := $(PLUGIN_NAME).sln
DIST_DIR      := dist
SCRIPTS_DIR   := scripts

# Lecture de la version depuis version.json (requiert jq)
VERSION_MAJOR := $(shell jq -r '.major' version.json)
VERSION_MINOR := $(shell jq -r '.minor' version.json)
VERSION_PATCH := $(shell jq -r '.patch' version.json)
TARGET_ABI    := $(shell jq -r '.targetAbi' version.json)

VERSION       := $(VERSION_MAJOR).$(VERSION_MINOR).$(VERSION_PATCH).0
ZIP_NAME      := infopopup_$(VERSION).zip
ZIP_PATH      := $(DIST_DIR)/$(ZIP_NAME)

RELEASE_URL   := https://github.com/$(GITHUB_USER)/$(GITHUB_REPO)/releases/download/v$(VERSION)/$(ZIP_NAME)
TIMESTAMP     := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

# Détection MD5 (Linux: md5sum, macOS: md5 -q)
MD5_CMD       := $(shell command -v md5sum >/dev/null 2>&1 && echo "md5sum" || echo "md5 -q")

# Couleurs terminal
BOLD  := \033[1m
GREEN := \033[32m
CYAN  := \033[36m
YELL  := \033[33m
RED   := \033[31m
RESET := \033[0m

# =============================================================================
# CIBLE PAR DÉFAUT : aide
# =============================================================================

.DEFAULT_GOAL := help

.PHONY: help
help: ## Affiche cette aide
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)jellyfin-info-popup-extention$(RESET) — Plugin Jellyfin"
	@printf "%b\n" "Version courante : $(BOLD)$(CYAN)$(VERSION)$(RESET)  |  targetAbi : $(TARGET_ABI)"
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Développement ───────────────────────────────────────────$(RESET)"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "help"          "Affiche cette aide"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "check"         "Vérifie que tous les outils requis sont installés"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "version"       "Affiche la version courante et les URLs associées"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "verify"        "Vérifie que le ZIP GitHub == checksum manifest"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "restore"       "Restaure les packages NuGet"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "build"         "Compile en mode Debug"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "build-release" "Compile en mode Release (sans ZIP)"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "pack"          "Compile Release + crée le ZIP dans dist/"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "clean"         "Supprime les artefacts de build et les ZIPs dans dist/"
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Versioning ──────────────────────────────────────────────$(RESET)"
	@printf "  $(YELL)%-22s$(RESET) %s\n" "bump-patch"    "Incrémente le patch : 1.0.0 → 1.0.1"
	@printf "  $(YELL)%-22s$(RESET) %s\n" "bump-minor"    "Incrémente le mineur : 1.0.0 → 1.1.0  (remet patch à 0)"
	@printf "  $(YELL)%-22s$(RESET) %s\n" "bump-major"    "Incrémente le majeur : 1.0.0 → 2.0.0  (remet minor+patch à 0)"
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Git & GitHub (low-level) ────────────────────────────────$(RESET)"
	@printf "  $(YELL)%-22s$(RESET) %s\n" "push"               "Commit tout + push sur origin/$(BRANCH)"
	@printf "  $(YELL)%-22s$(RESET) %s\n" "tag"                "Crée et push le tag git v\$$(VERSION)"
	@printf "  $(YELL)%-22s$(RESET) %s\n" "gh-release"         "Crée la GitHub Release + upload le ZIP"
	@printf "  $(YELL)%-22s$(RESET) %s\n" "gh-release-upload"  "Re-upload le ZIP sur une release existante"
	@printf "  $(YELL)%-22s$(RESET) %s\n" "manifest-update"    "Télécharge le ZIP GitHub, calcule MD5, met à jour manifest.json"
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Workflows complets ──────────────────────────────────────$(RESET)"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "release-patch"  "🚀 bump patch  → pack → push → tag → upload ZIP → manifest → push"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "release-minor"  "🚀 bump minor  → pack → push → tag → upload ZIP → manifest → push"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "release-major"  "🚀 bump major  → pack → push → tag → upload ZIP → manifest → push"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "release-hotfix" "🔧 recompile   → re-upload ZIP → manifest → push  (même version)"
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Dépôt Jellyfin ──────────────────────────────────────────$(RESET)"
	@printf "%b\n" "  Ajouter cette URL dans Jellyfin → Extensions → Catalogues :"
	@printf "%b\n" "  $(BOLD)$(CYAN)https://raw.githubusercontent.com/$(GITHUB_USER)/$(GITHUB_REPO)/$(BRANCH)/manifest.json$(RESET)"
	@printf "%b\n" ""

# =============================================================================
# VÉRIFICATIONS
# =============================================================================

.PHONY: check
check: ## Vérifie que tous les outils requis sont installés
	@printf "%b\n" "$(BOLD)Vérification des prérequis...$(RESET)"
	@command -v dotnet >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ dotnet SDK introuvable$(RESET)"; exit 1; }
	@dotnet --version | grep -qE '^([89]|[1-9][0-9])\.' || \
		{ printf "%b\n" "$(RED)✗ dotnet SDK 8+ requis (installé : $$(dotnet --version))$(RESET)"; exit 1; }
	@command -v git >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ git introuvable$(RESET)"; exit 1; }
	@command -v jq  >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ jq introuvable (brew install jq / apt install jq)$(RESET)"; exit 1; }
	@command -v gh  >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ gh CLI introuvable (https://cli.github.com/)$(RESET)"; exit 1; }
	@gh auth status >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ gh non authentifié — lancez: gh auth login$(RESET)"; exit 1; }
	@command -v curl >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ curl introuvable$(RESET)"; exit 1; }
	@printf "%b\n" "$(GREEN)✓ dotnet  $(shell dotnet --version)$(RESET)"
	@printf "%b\n" "$(GREEN)✓ git     $(shell git --version | head -1)$(RESET)"
	@printf "%b\n" "$(GREEN)✓ jq      $(shell jq --version)$(RESET)"
	@printf "%b\n" "$(GREEN)✓ gh CLI  $(shell gh --version | head -1)$(RESET)"
	@printf "%b\n" "$(GREEN)✓ curl    $(shell curl --version | head -1)$(RESET)"
	@printf "%b\n" "$(GREEN)✓ Tout est prêt$(RESET)"

.PHONY: version
version: ## Affiche la version courante
	@printf "%b\n" "$(BOLD)Version :$(RESET) $(CYAN)$(VERSION)$(RESET)"
	@printf "%b\n" "$(BOLD)targetAbi :$(RESET) $(TARGET_ABI)"
	@printf "%b\n" "$(BOLD)ZIP :$(RESET) $(ZIP_NAME)"
	@printf "%b\n" "$(BOLD)Release URL :$(RESET) $(RELEASE_URL)"

.PHONY: verify
verify: ## Vérifie que le ZIP sur GitHub correspond au checksum dans manifest.json
	@printf "%b\n" "$(BOLD)Vérification de cohérence release ↔ manifest...$(RESET)"
	@MANIFEST_MD5=$$(jq -r '.[] | .versions[] | select(.version == "$(VERSION)") | .checksum' manifest.json); \
	if [ -z "$$MANIFEST_MD5" ]; then \
		printf "%b\n" "$(RED)✗ Version $(VERSION) introuvable dans manifest.json$(RESET)"; exit 1; \
	fi; \
	printf "%b\n" "  Checksum manifest : $$MANIFEST_MD5"; \
	printf "%b\n" "  Téléchargement de $(RELEASE_URL) ..."; \
	REMOTE_MD5=$$(bash $(SCRIPTS_DIR)/gh_checksum.sh "$(RELEASE_URL)"); \
	if [ -z "$$REMOTE_MD5" ]; then \
		printf "%b\n" "$(RED)✗ Impossible de télécharger le ZIP depuis GitHub$(RESET)"; exit 1; \
	fi; \
	printf "%b\n" "  Checksum GitHub   : $$REMOTE_MD5"; \
	if [ "$$(echo $$MANIFEST_MD5 | tr '[:upper:]' '[:lower:]')" = "$$(echo $$REMOTE_MD5 | tr '[:upper:]' '[:lower:]')" ]; then \
		printf "%b\n" "$(GREEN)✓ Checksums identiques — Jellyfin pourra installer le plugin$(RESET)"; \
	else \
		printf "%b\n" "$(RED)✗ DÉSYNCHRONISÉ — lancez 'make release-hotfix' pour corriger$(RESET)"; exit 1; \
	fi

# =============================================================================
# BUILD
# =============================================================================

.PHONY: restore
restore: ## Restaure les packages NuGet
	@printf "%b\n" "$(BOLD)Restauration des packages...$(RESET)"
	dotnet restore $(SLN_FILE)

.PHONY: build
build: restore ## Compile en mode Debug
	@printf "%b\n" "$(BOLD)Compilation Debug...$(RESET)"
	dotnet build $(SLN_FILE) --configuration Debug --no-restore
	@printf "%b\n" "$(GREEN)✓ Build Debug terminé$(RESET)"

.PHONY: build-release
build-release: restore ## Compile en mode Release
	@printf "%b\n" "$(BOLD)Compilation Release...$(RESET)"
	dotnet build $(SLN_FILE) --configuration Release --no-restore
	@printf "%b\n" "$(GREEN)✓ Build Release terminé$(RESET)"

.PHONY: clean
clean: ## Supprime les artefacts de build et le dossier dist/
	@printf "%b\n" "$(BOLD)Nettoyage...$(RESET)"
	dotnet clean $(SLN_FILE) --configuration Release 2>/dev/null || true
	rm -rf $(PROJECT_DIR)/bin $(PROJECT_DIR)/obj
	rm -rf $(DIST_DIR)/*.zip
	@printf "%b\n" "$(GREEN)✓ Nettoyé$(RESET)"

# =============================================================================
# PACKAGING
# =============================================================================

.PHONY: pack
pack: build-release ## Compile Release + crée le ZIP dans dist/
	@printf "%b\n" "$(BOLD)Packaging $(VERSION)...$(RESET)"
	@mkdir -p $(DIST_DIR)
	@rm -f $(DIST_DIR)/*.zip
	dotnet publish $(PROJECT_FILE) \
		--configuration Release \
		--output $(DIST_DIR)/_publish \
		--no-build
	@cd $(DIST_DIR)/_publish && zip -j ../$(ZIP_NAME) $(PLUGIN_NAME).dll
	@rm -rf $(DIST_DIR)/_publish
	@LOCAL_MD5=$$($(MD5_CMD) $(ZIP_PATH) | awk '{print $$1}'); \
	printf "%b\n" "$(GREEN)✓ ZIP créé : $(ZIP_PATH)$(RESET)"; \
	printf "%b\n" "   MD5 local : $$LOCAL_MD5 (le MD5 final sera celui servi par GitHub)"

# =============================================================================
# VERSIONING
# =============================================================================

.PHONY: bump-patch
bump-patch: ## Incrémente le patch (1.0.0 → 1.0.1)
	@bash $(SCRIPTS_DIR)/bump_version.sh patch
	@printf "%b\n" "$(GREEN)✓ Version → $$(jq -r '"\(.major).\(.minor).\(.patch).0"' version.json)$(RESET)"

.PHONY: bump-minor
bump-minor: ## Incrémente le mineur (1.0.0 → 1.1.0) — remet le patch à 0
	@bash $(SCRIPTS_DIR)/bump_version.sh minor
	@printf "%b\n" "$(GREEN)✓ Version → $$(jq -r '"\(.major).\(.minor).\(.patch).0"' version.json)$(RESET)"

.PHONY: bump-major
bump-major: ## Incrémente le majeur (1.0.0 → 2.0.0) — remet minor et patch à 0
	@bash $(SCRIPTS_DIR)/bump_version.sh major
	@printf "%b\n" "$(GREEN)✓ Version → $$(jq -r '"\(.major).\(.minor).\(.patch).0"' version.json)$(RESET)"

# =============================================================================
# MANIFEST JELLYFIN
# =============================================================================
#
#  IMPORTANT : manifest-update télécharge le ZIP depuis GitHub pour calculer
#  le vrai MD5 — pas le fichier local. C'est ce que Jellyfin téléchargera.
#  Le script gh_checksum.sh réessaie jusqu'à 5 fois (CDN GitHub peut être lent).
#
# =============================================================================

.PHONY: manifest-update
manifest-update: ## Télécharge le ZIP GitHub, calcule son MD5 réel, met à jour manifest.json
	@[ -f "$(ZIP_PATH)" ] || \
		{ printf "%b\n" "$(RED)✗ ZIP local introuvable : $(ZIP_PATH) — lancez 'make pack' d'abord$(RESET)"; exit 1; }
	@printf "%b\n" "$(BOLD)Mise à jour du manifest Jellyfin...$(RESET)"
	@bash $(SCRIPTS_DIR)/update_manifest.sh \
		"$(VERSION)" \
		"$(TARGET_ABI)" \
		"$(RELEASE_URL)" \
		"$(TIMESTAMP)" \
		"$(GITHUB_USER)" \
		"$(GITHUB_REPO)"
	@printf "%b\n" "$(GREEN)✓ manifest.json mis à jour$(RESET)"

# =============================================================================
# GIT & GITHUB
# =============================================================================

.PHONY: push
push: ## Commit les changements locaux et push sur origin/main
	@printf "%b\n" "$(BOLD)Push vers origin/$(BRANCH)...$(RESET)"
	git add -A
	git diff --cached --quiet && \
		printf "%b\n" "$(YELL)Rien à committer$(RESET)" || \
		git commit -m "chore: version $(VERSION)"
	git push origin $(BRANCH)
	@printf "%b\n" "$(GREEN)✓ Push effectué$(RESET)"

.PHONY: tag
tag: ## Crée et push le tag git v$(VERSION) (échoue si le tag existe déjà)
	@if git ls-remote --tags origin | grep -q "refs/tags/v$(VERSION)$$"; then \
		printf "%b\n" "$(RED)✗ Le tag v$(VERSION) existe déjà sur origin$(RESET)"; \
		printf "%b\n" "  → Pour corriger une release existante : make release-hotfix"; exit 1; \
	fi
	@printf "%b\n" "$(BOLD)Création du tag v$(VERSION)...$(RESET)"
	git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	git push origin "v$(VERSION)"
	@printf "%b\n" "$(GREEN)✓ Tag v$(VERSION) créé et poussé$(RESET)"

.PHONY: gh-release
gh-release: ## Crée la GitHub Release et upload le ZIP (échoue si la release existe)
	@[ -f "$(ZIP_PATH)" ] || { printf "%b\n" "$(RED)✗ ZIP introuvable : $(ZIP_PATH)$(RESET)"; exit 1; }
	@printf "%b\n" "$(BOLD)Création de la GitHub Release v$(VERSION)...$(RESET)"
	@NOTES=$$(bash $(SCRIPTS_DIR)/extract_changelog.sh "$(VERSION)" 2>/dev/null || echo "Release v$(VERSION)"); \
	gh release create "v$(VERSION)" \
		"$(ZIP_PATH)#$(ZIP_NAME)" \
		--repo "$(GITHUB_USER)/$(GITHUB_REPO)" \
		--title "v$(VERSION)" \
		--notes "$$NOTES"
	@printf "%b\n" "$(GREEN)✓ GitHub Release v$(VERSION) créée avec le ZIP$(RESET)"

.PHONY: gh-release-upload
gh-release-upload: ## Re-upload le ZIP sur une GitHub Release existante (supprime l'asset pour invalider le cache CDN)
	@[ -f "$(ZIP_PATH)" ] || { printf "%b\n" "$(RED)✗ ZIP introuvable : $(ZIP_PATH)$(RESET)"; exit 1; }
	@printf "%b\n" "$(BOLD)Re-upload du ZIP sur la release v$(VERSION)...$(RESET)"
	@printf "%b\n" "  Suppression de l'ancien asset (invalide le cache CDN GitHub)..."
	@gh release delete-asset "v$(VERSION)" "$(ZIP_NAME)" \
		--repo "$(GITHUB_USER)/$(GITHUB_REPO)" \
		--yes 2>/dev/null && \
		printf "%b\n" "  $(GREEN)✓ Ancien asset supprimé$(RESET)" || \
		printf "%b\n" "  $(YELL)⚠ Aucun asset existant à supprimer$(RESET)"
	@printf "%b\n" "  Upload du nouveau ZIP..."
	gh release upload "v$(VERSION)" \
		"$(ZIP_PATH)#$(ZIP_NAME)" \
		--repo "$(GITHUB_USER)/$(GITHUB_REPO)"
	@printf "%b\n" "$(GREEN)✓ ZIP re-uploadé sur la release v$(VERSION)$(RESET)"

# =============================================================================
# WORKFLOWS COMPLETS DE RELEASE
# =============================================================================
#
#  ORDRE CRITIQUE :
#    1. pack           → compile + crée le ZIP local
#    2. push code      → pousse version.json + sources (sans manifest)
#    3. tag            → crée le tag git (release.yml est manual-only → pas de conflit)
#    4. gh-release     → upload le ZIP sur GitHub
#    5. manifest-update → télécharge le ZIP depuis GitHub, calcule le VRAI MD5
#    6. push manifest  → manifest avec le bon checksum en dernier
#
#  POURQUOI cet ordre est garanti correct :
#    - Le manifest n'est pushé qu'après que le ZIP soit sur GitHub ET que son
#      MD5 ait été calculé depuis ce que GitHub sert réellement.
#    - release.yml étant manual-only, aucun CI ne peut écraser le ZIP entre
#      l'étape 4 et l'étape 5.
#
# =============================================================================

.PHONY: release-patch
release-patch: check ## 🚀 Release patch complète (bump + pack + upload + manifest)
	@printf "%b\n" "$(BOLD)$(GREEN)═══ RELEASE PATCH ═══$(RESET)"
	$(MAKE) bump-patch
	$(MAKE) _do-release

.PHONY: release-minor
release-minor: check ## 🚀 Release mineure complète (bump + pack + upload + manifest)
	@printf "%b\n" "$(BOLD)$(GREEN)═══ RELEASE MINEURE ═══$(RESET)"
	$(MAKE) bump-minor
	$(MAKE) _do-release

.PHONY: release-major
release-major: check ## 🚀 Release majeure complète (bump + pack + upload + manifest)
	@printf "%b\n" "$(BOLD)$(YELL)═══ RELEASE MAJEURE ═══$(RESET)"
	$(MAKE) bump-major
	$(MAKE) _do-release

.PHONY: release-hotfix
release-hotfix: check ## 🔧 Recompile + re-upload le ZIP sans changer de version
	@printf "%b\n" "$(BOLD)$(YELL)═══ RELEASE HOTFIX v$(VERSION) ═══$(RESET)"
	@printf "%b\n" "  Recompile et remplace le ZIP sur la release existante."
	$(MAKE) _reload-version
	$(MAKE) pack \
		VERSION=$(VERSION) ZIP_NAME=$(ZIP_NAME) ZIP_PATH=$(ZIP_PATH)
	$(MAKE) gh-release-upload \
		VERSION=$(VERSION) ZIP_NAME=$(ZIP_NAME) ZIP_PATH=$(ZIP_PATH)
	$(MAKE) manifest-update \
		VERSION=$(VERSION) TARGET_ABI=$(TARGET_ABI) \
		RELEASE_URL=$(RELEASE_URL) TIMESTAMP=$(TIMESTAMP)
	$(MAKE) push
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)$(GREEN)✓ Hotfix v$(VERSION) appliqué$(RESET)"
	@printf "%b\n" "  Manifest et ZIP GitHub sont maintenant synchronisés."
	@printf "%b\n" "  Rafraîchissez le dépôt dans Jellyfin puis réinstallez."

# Cible interne — recharge les variables depuis version.json après un bump
.PHONY: _reload-version
_reload-version:
	$(eval VERSION       := $(shell jq -r '"\(.major).\(.minor).\(.patch).0"' version.json))
	$(eval VERSION_MAJOR := $(shell jq -r '.major' version.json))
	$(eval VERSION_MINOR := $(shell jq -r '.minor' version.json))
	$(eval VERSION_PATCH := $(shell jq -r '.patch' version.json))
	$(eval TARGET_ABI    := $(shell jq -r '.targetAbi' version.json))
	$(eval ZIP_NAME      := infopopup_$(VERSION).zip)
	$(eval ZIP_PATH      := $(DIST_DIR)/$(ZIP_NAME))
	$(eval RELEASE_URL   := https://github.com/$(GITHUB_USER)/$(GITHUB_REPO)/releases/download/v$(VERSION)/$(ZIP_NAME))
	$(eval TIMESTAMP     := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ"))

# Cible interne — ne pas appeler directement
.PHONY: _do-release
_do-release: _reload-version
	@printf "%b\n" "$(BOLD)Version cible : $(CYAN)$(VERSION)$(RESET)"
	$(MAKE) pack \
		VERSION=$(VERSION) ZIP_NAME=$(ZIP_NAME) ZIP_PATH=$(ZIP_PATH)
	$(MAKE) push
	$(MAKE) tag \
		VERSION=$(VERSION)
	$(MAKE) gh-release \
		VERSION=$(VERSION) ZIP_NAME=$(ZIP_NAME) ZIP_PATH=$(ZIP_PATH)
	$(MAKE) manifest-update \
		VERSION=$(VERSION) TARGET_ABI=$(TARGET_ABI) \
		RELEASE_URL=$(RELEASE_URL) TIMESTAMP=$(TIMESTAMP)
	$(MAKE) push
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)$(GREEN)✓ Release v$(VERSION) publiée avec succès !$(RESET)"
	@printf "%b\n" "  GitHub  : https://github.com/$(GITHUB_USER)/$(GITHUB_REPO)/releases/tag/v$(VERSION)"
	@printf "%b\n" "  Jellyfin: https://raw.githubusercontent.com/$(GITHUB_USER)/$(GITHUB_REPO)/$(BRANCH)/manifest.json"
