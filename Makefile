# =============================================================================
#  Makefile — jellyfin-info-popup-extention
#  Plugin Jellyfin : messages popup pour les utilisateurs
# =============================================================================
#
#  PRÉREQUIS : dotnet (SDK 8+), git, jq, md5sum (ou md5 sur macOS), gh (GitHub CLI)
#
#  UTILISATION RAPIDE :
#    make                  → affiche cette aide
#    make build            → compile en Debug
#    make pack             → compile Release + ZIP dans dist/
#    make release-patch    → bump patch, pack, manifest, push, tag, GitHub Release
#    make release-minor    → bump minor, pack, manifest, push, tag, GitHub Release
#    make release-major    → bump major, pack, manifest, push, tag, GitHub Release
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

# Détection MD5 (Linux: md5sum, macOS: md5)
MD5_CMD       := $(shell command -v md5sum 2>/dev/null && echo "md5sum" || echo "md5 -q")

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
	@printf "%b\n" "$(BOLD)── Développement ──────────────────────────────────────────$(RESET)"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; /^[a-z]/ {printf "  $(CYAN)%-22s$(RESET) %s\n", $$1, $$2}' | \
		grep -v "release\|bump\|push\|tag\|manifest" || true
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Versioning ──────────────────────────────────────────────$(RESET)"
	@grep -hE '^(bump|tag)[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELL)%-22s$(RESET) %s\n", $$1, $$2}'
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Publication ─────────────────────────────────────────────$(RESET)"
	@grep -hE '^(manifest|push|release)[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-22s$(RESET) %s\n", $$1, $$2}'
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Config repo GitHub ──────────────────────────────────────$(RESET)"
	@printf "%b\n" "  URL du dépôt à ajouter dans Jellyfin :"
	@printf "%b\n" "  $(BOLD)https://raw.githubusercontent.com/$(GITHUB_USER)/$(GITHUB_REPO)/$(BRANCH)/manifest.json$(RESET)"
	@printf "%b\n" ""

# =============================================================================
# VÉRIFICATIONS
# =============================================================================

.PHONY: check
check: ## Vérifie que tous les outils requis sont installés
	@printf "%b\n" "$(BOLD)Vérification des prérequis...$(RESET)"
	@command -v dotnet >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ dotnet SDK introuvable$(RESET)"; exit 1; }
	@dotnet --version | grep -qE '^([89]|[1-9][0-9])\.' || { printf "%b\n" "$(RED)✗ dotnet SDK 8+ requis (installé : $$(dotnet --version))$(RESET)"; exit 1; }
	@command -v git    >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ git introuvable$(RESET)"; exit 1; }
	@command -v jq     >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ jq introuvable (brew install jq / apt install jq)$(RESET)"; exit 1; }
	@command -v gh     >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ gh CLI introuvable (https://cli.github.com/)$(RESET)"; exit 1; }
	@gh auth status >/dev/null 2>&1 || { printf "%b\n" "$(RED)✗ gh non authentifié — lancez: gh auth login$(RESET)"; exit 1; }
	@printf "%b\n" "$(GREEN)✓ dotnet  $(shell dotnet --version)$(RESET)"
	@printf "%b\n" "$(GREEN)✓ git     $(shell git --version | head -1)$(RESET)"
	@printf "%b\n" "$(GREEN)✓ jq      $(shell jq --version)$(RESET)"
	@printf "%b\n" "$(GREEN)✓ gh CLI  $(shell gh --version | head -1)$(RESET)"
	@printf "%b\n" "$(GREEN)✓ Tout est prêt$(RESET)"

.PHONY: version
version: ## Affiche la version courante
	@printf "%b\n" "$(BOLD)Version :$(RESET) $(CYAN)$(VERSION)$(RESET)"
	@printf "%b\n" "$(BOLD)targetAbi :$(RESET) $(TARGET_ABI)"
	@printf "%b\n" "$(BOLD)ZIP :$(RESET) $(ZIP_NAME)"
	@printf "%b\n" "$(BOLD)Release URL :$(RESET) $(RELEASE_URL)"

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
	@printf "%b\n" "$(GREEN)✓ ZIP créé : $(ZIP_PATH)$(RESET)"
	@printf "%b\n" "   MD5 : $$($(MD5_CMD) $(ZIP_PATH) | awk '{print $$1}')"

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

.PHONY: manifest-update
manifest-update: ## Régénère manifest.json avec la nouvelle version (requiert dist/ prêt)
	@[ -f "$(ZIP_PATH)" ] || { printf "%b\n" "$(RED)✗ ZIP introuvable : $(ZIP_PATH) — lancez 'make pack' d'abord$(RESET)"; exit 1; }
	@printf "%b\n" "$(BOLD)Mise à jour du manifest Jellyfin...$(RESET)"
	@bash $(SCRIPTS_DIR)/update_manifest.sh \
		"$(VERSION)" \
		"$(TARGET_ABI)" \
		"$(RELEASE_URL)" \
		"$(TIMESTAMP)" \
		"$(ZIP_PATH)" \
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
	git diff --cached --quiet && printf "%b\n" "$(YELL)Rien à committer$(RESET)" || \
		git commit -m "chore: version $(VERSION)"
	git push origin $(BRANCH)
	@printf "%b\n" "$(GREEN)✓ Push effectué$(RESET)"

.PHONY: tag
tag: ## Crée et push le tag git v$(VERSION)
	@printf "%b\n" "$(BOLD)Création du tag v$(VERSION)...$(RESET)"
	git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	git push origin "v$(VERSION)"
	@printf "%b\n" "$(GREEN)✓ Tag v$(VERSION) créé et poussé$(RESET)"

.PHONY: gh-release
gh-release: ## Crée la GitHub Release et upload le ZIP (requiert gh CLI + tag)
	@[ -f "$(ZIP_PATH)" ] || { printf "%b\n" "$(RED)✗ ZIP introuvable$(RESET)"; exit 1; }
	@printf "%b\n" "$(BOLD)Création de la GitHub Release v$(VERSION)...$(RESET)"
	@NOTES=$$(bash $(SCRIPTS_DIR)/extract_changelog.sh "$(VERSION)" 2>/dev/null || echo "Release v$(VERSION)"); \
	gh release create "v$(VERSION)" \
		"$(ZIP_PATH)#$(ZIP_NAME)" \
		--repo "$(GITHUB_USER)/$(GITHUB_REPO)" \
		--title "v$(VERSION)" \
		--notes "$$NOTES"
	@printf "%b\n" "$(GREEN)✓ GitHub Release v$(VERSION) créée$(RESET)"

# =============================================================================
# WORKFLOWS COMPLETS DE RELEASE
# =============================================================================
# Séquence complète :
#   1. bump version.json
#   2. pack (build Release + ZIP)
#   3. manifest-update (mise à jour manifest.json)
#   4. push (commit + push)
#   5. tag (crée + push le tag git)
#   6. gh-release (crée la Release GitHub + upload ZIP)
# =============================================================================

.PHONY: release-patch
release-patch: check ## 🚀 Release patch complète (bump + pack + manifest + push + tag + GitHub Release)
	@printf "%b\n" "$(BOLD)$(GREEN)═══ RELEASE PATCH ═══$(RESET)"
	$(MAKE) bump-patch
	$(MAKE) _do-release

.PHONY: release-minor
release-minor: check ## 🚀 Release mineure complète (bump + pack + manifest + push + tag + GitHub Release)
	@printf "%b\n" "$(BOLD)$(GREEN)═══ RELEASE MINEURE ═══$(RESET)"
	$(MAKE) bump-minor
	$(MAKE) _do-release

.PHONY: release-major
release-major: check ## 🚀 Release majeure complète (bump + pack + manifest + push + tag + GitHub Release)
	@printf "%b\n" "$(BOLD)$(YELL)═══ RELEASE MAJEURE ═══$(RESET)"
	$(MAKE) bump-major
	$(MAKE) _do-release

# Cible interne — ne pas appeler directement
.PHONY: _do-release
_do-release:
	@# Recharger la version depuis version.json (après bump)
	$(eval VERSION       := $(shell jq -r '"\(.major).\(.minor).\(.patch).0"' version.json))
	$(eval VERSION_MAJOR := $(shell jq -r '.major' version.json))
	$(eval VERSION_MINOR := $(shell jq -r '.minor' version.json))
	$(eval VERSION_PATCH := $(shell jq -r '.patch' version.json))
	$(eval TARGET_ABI    := $(shell jq -r '.targetAbi' version.json))
	$(eval ZIP_NAME      := infopopup_$(VERSION).zip)
	$(eval ZIP_PATH      := $(DIST_DIR)/$(ZIP_NAME))
	$(eval RELEASE_URL   := https://github.com/$(GITHUB_USER)/$(GITHUB_REPO)/releases/download/v$(VERSION)/$(ZIP_NAME))
	$(eval TIMESTAMP     := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ"))
	@printf "%b\n" "$(BOLD)Version cible : $(CYAN)$(VERSION)$(RESET)"
	$(MAKE) pack \
		VERSION=$(VERSION) ZIP_NAME=$(ZIP_NAME) ZIP_PATH=$(ZIP_PATH)
	$(MAKE) manifest-update \
		VERSION=$(VERSION) TARGET_ABI=$(TARGET_ABI) \
		RELEASE_URL=$(RELEASE_URL) TIMESTAMP=$(TIMESTAMP) \
		ZIP_PATH=$(ZIP_PATH)
	$(MAKE) push
	$(MAKE) tag VERSION=$(VERSION)
	$(MAKE) gh-release VERSION=$(VERSION) ZIP_NAME=$(ZIP_NAME) ZIP_PATH=$(ZIP_PATH)
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)$(GREEN)✓ Release v$(VERSION) publiée avec succès !$(RESET)"
	@printf "%b\n" "  GitHub : https://github.com/$(GITHUB_USER)/$(GITHUB_REPO)/releases/tag/v$(VERSION)"
	@printf "%b\n" "  Repo Jellyfin : https://raw.githubusercontent.com/$(GITHUB_USER)/$(GITHUB_REPO)/$(BRANCH)/manifest.json"
