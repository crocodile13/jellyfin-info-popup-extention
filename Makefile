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

PLUGIN_NAME   := Jellyfin.Plugin.InfoPopup
PROJECT_DIR   := $(PLUGIN_NAME)
PROJECT_FILE  := $(PROJECT_DIR)/$(PLUGIN_NAME).csproj
SLN_FILE      := $(PLUGIN_NAME).sln
DIST_DIR      := dist
SCRIPTS_DIR   := scripts

# ---------------------------------------------------------------------------
# CHANNEL — sélection dev vs stable (v3.8.9.0)
# ---------------------------------------------------------------------------
# Par défaut TOUT cible la branche `dev` et `manifest-dev.json` (channel dev).
# Pour cibler le channel stable : passer `STABLE=1` en argument :
#
#     make release-patch              # → release dev (par défaut)
#     make release-patch STABLE=1     # → release stable (rare, normalement via promote)
#     make promote VERSION=3.8.10.0   # → promeut une dev en stable proprement
#
# Le default-dev protège contre les release accidentelles en stable :
# pour shipper en stable il faut un acte intentionnel (STABLE=1 ou promote).
# ---------------------------------------------------------------------------
CHANNEL := $(if $(filter 1,$(STABLE)),stable,dev)

ifeq ($(CHANNEL),stable)
    BRANCH              := main
    MANIFEST_FILE       := manifest.json
    TAG_SUFFIX          :=
    ZIP_SUFFIX          :=
    GH_PRERELEASE_FLAG  :=
    CHANNEL_LABEL       := stable
else
    BRANCH              := dev
    MANIFEST_FILE       := manifest-dev.json
    TAG_SUFFIX          := -dev
    ZIP_SUFFIX          := -dev
    GH_PRERELEASE_FLAG  := --prerelease
    CHANNEL_LABEL       := DEV
endif

# Lecture de la version depuis version.json (requiert jq)
VERSION_MAJOR := $(shell jq -r '.major' version.json)
VERSION_MINOR := $(shell jq -r '.minor' version.json)
VERSION_PATCH := $(shell jq -r '.patch' version.json)
TARGET_ABI    := $(shell jq -r '.targetAbi' version.json)

VERSION       := $(VERSION_MAJOR).$(VERSION_MINOR).$(VERSION_PATCH).0
GIT_TAG       := v$(VERSION)$(TAG_SUFFIX)
ZIP_NAME      := infopopup_$(VERSION)$(ZIP_SUFFIX).zip
ZIP_PATH      := $(DIST_DIR)/$(ZIP_NAME)

RELEASE_URL   := https://github.com/$(GITHUB_USER)/$(GITHUB_REPO)/releases/download/$(GIT_TAG)/$(ZIP_NAME)
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
	@printf "%b\n" "Version courante : $(BOLD)$(CYAN)$(VERSION)$(RESET)  |  targetAbi : $(TARGET_ABI)  |  Channel : $(BOLD)$(CYAN)$(CHANNEL_LABEL)$(RESET) ($(BRANCH))"
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Channel ────────────────────────────────────────────────$(RESET)"
	@printf "%b\n" "  Par défaut $(YELL)tout cible le channel DEV$(RESET) (branche dev, manifest-dev.json,"
	@printf "%b\n" "  pre-release GitHub). Pour shipper en stable : utilisez $(BOLD)make promote$(RESET)."
	@printf "%b\n" "  Override explicite : $(BOLD)STABLE=1$(RESET) (rare en dehors de promote)."
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Développement ───────────────────────────────────────────$(RESET)"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "help"          "Affiche cette aide"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "check"         "Vérifie que tous les outils requis sont installés"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "version"       "Affiche la version courante, channel, URLs"
	@printf "  $(CYAN)%-22s$(RESET) %s\n" "verify"        "Vérifie que le ZIP GitHub == checksum $(MANIFEST_FILE)"
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
	@printf "%b\n" "$(BOLD)── Workflows complets (channel-aware) ─────────────────────$(RESET)"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "release-patch"  "🚀 bump patch  → pack → push → tag → GH release → manifest"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "release-minor"  "🚀 bump minor  → idem"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "release-major"  "🚀 bump major  → idem"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "release-hotfix" "🔧 recompile   → re-upload ZIP → manifest  (même version, current channel)"
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Dev / Stable workflow ──────────────────────────────────$(RESET)"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "init-dev"   "🌱 Crée la branche dev (une seule fois, depuis main)"
	@printf "  $(GREEN)%-22s$(RESET) %s\n" "promote"    "🎯 Promeut une dev en stable : VERSION_ARG=X.Y.Z.W requis"
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)── Dépôts Jellyfin ────────────────────────────────────────$(RESET)"
	@printf "%b\n" "  $(BOLD)Stable$(RESET) (production) :"
	@printf "%b\n" "    $(CYAN)https://raw.githubusercontent.com/$(GITHUB_USER)/$(GITHUB_REPO)/main/manifest.json$(RESET)"
	@printf "%b\n" "  $(BOLD)Dev$(RESET) (testeurs) :"
	@printf "%b\n" "    $(CYAN)https://raw.githubusercontent.com/$(GITHUB_USER)/$(GITHUB_REPO)/dev/manifest-dev.json$(RESET)"
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
	@printf "%b\n" "$(BOLD)Channel :$(RESET) $(CYAN)$(CHANNEL_LABEL)$(RESET)  $(BOLD)Branche :$(RESET) $(BRANCH)"
	@printf "%b\n" "$(BOLD)Version :$(RESET) $(CYAN)$(VERSION)$(RESET)"
	@printf "%b\n" "$(BOLD)Git tag :$(RESET) $(GIT_TAG)"
	@printf "%b\n" "$(BOLD)targetAbi :$(RESET) $(TARGET_ABI)"
	@printf "%b\n" "$(BOLD)Manifest :$(RESET) $(MANIFEST_FILE)"
	@printf "%b\n" "$(BOLD)ZIP :$(RESET) $(ZIP_NAME)"
	@printf "%b\n" "$(BOLD)Release URL :$(RESET) $(RELEASE_URL)"

.PHONY: verify
verify: ## Vérifie que le ZIP sur GitHub correspond au checksum dans $(MANIFEST_FILE)
	@printf "%b\n" "$(BOLD)Vérification de cohérence release ↔ $(MANIFEST_FILE)...$(RESET)"
	@MANIFEST_MD5=$$(jq -r '.[] | .versions[] | select(.version == "$(VERSION)") | .checksum' $(MANIFEST_FILE)); \
	if [ -z "$$MANIFEST_MD5" ]; then \
		printf "%b\n" "$(RED)✗ Version $(VERSION) introuvable dans $(MANIFEST_FILE)$(RESET)"; exit 1; \
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
manifest-update: ## Télécharge le ZIP GitHub, calcule son MD5 réel, met à jour $(MANIFEST_FILE)
	@[ -f "$(ZIP_PATH)" ] || \
		{ printf "%b\n" "$(RED)✗ ZIP local introuvable : $(ZIP_PATH) — lancez 'make pack' d'abord$(RESET)"; exit 1; }
	@printf "%b\n" "$(BOLD)Mise à jour du manifest Jellyfin ($(MANIFEST_FILE))...$(RESET)"
	@bash $(SCRIPTS_DIR)/update_manifest.sh \
		"$(VERSION)" \
		"$(TARGET_ABI)" \
		"$(RELEASE_URL)" \
		"$(TIMESTAMP)" \
		"$(GITHUB_USER)" \
		"$(GITHUB_REPO)" \
		"$(MANIFEST_FILE)" \
		"$(CHANNEL)"
	@printf "%b\n" "$(GREEN)✓ $(MANIFEST_FILE) mis à jour$(RESET)"

# =============================================================================
# GIT & GITHUB
# =============================================================================

# MSG= permet de surcharger le message de commit (ex: make push MSG="fix: mon correctif")
COMMIT_MSG ?= chore: version $(VERSION)

.PHONY: push
push: ## Commit les changements locaux et push sur origin/$(BRANCH)  [MSG="..." pour message custom]
	@printf "%b\n" "$(BOLD)Push vers origin/$(BRANCH) ($(CHANNEL_LABEL))...$(RESET)"
	git add -A
	git diff --cached --quiet && \
		printf "%b\n" "$(YELL)Rien à committer$(RESET)" || \
		git commit -m "$(if $(MSG),$(MSG),$(COMMIT_MSG))"
	git push origin $(BRANCH)
	@printf "%b\n" "$(GREEN)✓ Push effectué sur origin/$(BRANCH)$(RESET)"

.PHONY: tag
tag: ## Crée et push le tag git $(GIT_TAG) (échoue si le tag existe déjà)
	@if git ls-remote --tags origin | grep -q "refs/tags/$(GIT_TAG)$$"; then \
		printf "%b\n" "$(RED)✗ Le tag $(GIT_TAG) existe déjà sur origin$(RESET)"; \
		printf "%b\n" "  → Pour corriger une release existante : make release-hotfix"; exit 1; \
	fi
	@printf "%b\n" "$(BOLD)Création du tag $(GIT_TAG)...$(RESET)"
	git tag -a "$(GIT_TAG)" -m "Release $(GIT_TAG) ($(CHANNEL_LABEL))"
	git push origin "$(GIT_TAG)"
	@printf "%b\n" "$(GREEN)✓ Tag $(GIT_TAG) créé et poussé$(RESET)"

.PHONY: gh-release
gh-release: ## Crée la GitHub Release et upload le ZIP (échoue si la release existe)
	@[ -f "$(ZIP_PATH)" ] || { printf "%b\n" "$(RED)✗ ZIP introuvable : $(ZIP_PATH)$(RESET)"; exit 1; }
	@printf "%b\n" "$(BOLD)Création de la GitHub Release $(GIT_TAG) ($(CHANNEL_LABEL))...$(RESET)"
	@NOTES=$$(bash $(SCRIPTS_DIR)/extract_changelog.sh "$(VERSION)" 2>/dev/null || echo "Release $(GIT_TAG)"); \
	gh release create "$(GIT_TAG)" \
		"$(ZIP_PATH)#$(ZIP_NAME)" \
		--repo "$(GITHUB_USER)/$(GITHUB_REPO)" \
		--title "$(GIT_TAG)" \
		--notes "$$NOTES" \
		$(GH_PRERELEASE_FLAG)
	@printf "%b\n" "$(GREEN)✓ GitHub Release $(GIT_TAG) créée avec le ZIP$(RESET)"

.PHONY: gh-release-upload
gh-release-upload: ## Re-upload le ZIP sur une GitHub Release existante (supprime l'asset pour invalider le cache CDN)
	@[ -f "$(ZIP_PATH)" ] || { printf "%b\n" "$(RED)✗ ZIP introuvable : $(ZIP_PATH)$(RESET)"; exit 1; }
	@printf "%b\n" "$(BOLD)Re-upload du ZIP sur la release $(GIT_TAG)...$(RESET)"
	@printf "%b\n" "  Suppression de l'ancien asset (invalide le cache CDN GitHub)..."
	@gh release delete-asset "$(GIT_TAG)" "$(ZIP_NAME)" \
		--repo "$(GITHUB_USER)/$(GITHUB_REPO)" \
		--yes 2>/dev/null && \
		printf "%b\n" "  $(GREEN)✓ Ancien asset supprimé$(RESET)" || \
		printf "%b\n" "  $(YELL)⚠ Aucun asset existant à supprimer$(RESET)"
	@printf "%b\n" "  Upload du nouveau ZIP..."
	gh release upload "$(GIT_TAG)" \
		"$(ZIP_PATH)#$(ZIP_NAME)" \
		--repo "$(GITHUB_USER)/$(GITHUB_REPO)"
	@printf "%b\n" "$(GREEN)✓ ZIP re-uploadé sur la release $(GIT_TAG)$(RESET)"

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

.PHONY: release-current
release-current: check ## 🚀 Release la version courante SANS bump (version.json tel quel)
	@printf "%b\n" "$(BOLD)$(GREEN)═══ RELEASE $(GIT_TAG) ($(CHANNEL_LABEL)) sans bump ═══$(RESET)"
	@printf "%b\n" "  Utilise la version courante de version.json sans l'incrémenter."
	$(MAKE) _do-release

# =============================================================================
# WORKFLOW DEV/STABLE — v3.8.9.0
# =============================================================================

.PHONY: init-dev
init-dev: ## 🌱 Crée la branche dev locale + remote (à lancer une seule fois)
	@printf "%b\n" "$(BOLD)Initialisation de la branche dev...$(RESET)"
	@if git show-ref --verify --quiet refs/heads/dev; then \
		printf "%b\n" "$(YELL)⚠ La branche dev existe déjà localement$(RESET)"; \
	else \
		git checkout -b dev; \
		printf "%b\n" "$(GREEN)✓ Branche dev créée localement$(RESET)"; \
	fi
	@if git ls-remote --heads origin dev | grep -q dev; then \
		printf "%b\n" "$(YELL)⚠ La branche dev existe déjà sur origin$(RESET)"; \
	else \
		git push -u origin dev; \
		printf "%b\n" "$(GREEN)✓ Branche dev poussée sur origin$(RESET)"; \
	fi
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)Désormais :$(RESET)"
	@printf "%b\n" "  • Toutes les release par défaut visent dev (make release-patch)"
	@printf "%b\n" "  • Pour promouvoir : make promote VERSION=X.Y.Z.W"

.PHONY: promote
promote: check ## 🎯 Promeut une dev en stable [VERSION=X.Y.Z.W requis]
	@[ -n "$(VERSION_ARG)" ] || \
		{ printf "%b\n" "$(RED)✗ Usage : make promote VERSION_ARG=X.Y.Z.W (ex: VERSION_ARG=4.0.0.0)$(RESET)"; exit 1; }
	@printf "%b\n" "$(BOLD)$(GREEN)═══ PROMOTE v$(VERSION_ARG)-dev → v$(VERSION_ARG) (stable) ═══$(RESET)"
	@printf "%b\n" "  Étape 1/4 : vérifier que la dev release existe..."
	@gh release view "v$(VERSION_ARG)-dev" --repo "$(GITHUB_USER)/$(GITHUB_REPO)" >/dev/null 2>&1 || \
		{ printf "%b\n" "$(RED)✗ La release v$(VERSION_ARG)-dev n'existe pas sur GitHub$(RESET)"; exit 1; }
	@printf "%b\n" "  $(GREEN)✓ v$(VERSION_ARG)-dev trouvée$(RESET)"
	@printf "%b\n" "  Étape 2/4 : switch sur main + fast-forward depuis le tag dev..."
	git fetch origin
	git checkout main
	git merge --ff-only "v$(VERSION_ARG)-dev" || \
		{ printf "%b\n" "$(RED)✗ main a divergé — résolvez manuellement (rebase/merge), puis re-promotez$(RESET)"; exit 1; }
	@printf "%b\n" "  $(GREEN)✓ main mis à jour$(RESET)"
	@printf "%b\n" "  Étape 3/4 : forcer version.json à $(VERSION_ARG)..."
	@printf '{\n  "major": %s,\n  "minor": %s,\n  "patch": %s,\n  "targetAbi": "%s"\n}\n' \
		$$(echo "$(VERSION_ARG)" | cut -d. -f1) \
		$$(echo "$(VERSION_ARG)" | cut -d. -f2) \
		$$(echo "$(VERSION_ARG)" | cut -d. -f3) \
		"$(TARGET_ABI)" > version.json
	@printf "%b\n" "  Étape 4/4 : rebuild propre + release stable..."
	$(MAKE) release-current STABLE=1
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)$(GREEN)✓ v$(VERSION_ARG) promue en stable !$(RESET)"
	@printf "%b\n" "  N'oubliez pas de revenir sur dev : git checkout dev"

.PHONY: release-hotfix
release-hotfix: check _check-branch ## 🔧 Recompile + re-upload le ZIP sans changer de version (current channel)
	@printf "%b\n" "$(BOLD)$(YELL)═══ RELEASE HOTFIX $(GIT_TAG) ($(CHANNEL_LABEL)) ═══$(RESET)"
	@printf "%b\n" "  Recompile et remplace le ZIP sur la release existante."
	$(MAKE) _reload-version
	$(MAKE) pack STABLE=$(STABLE) \
		VERSION=$(VERSION) ZIP_NAME=$(ZIP_NAME) ZIP_PATH=$(ZIP_PATH)
	$(MAKE) gh-release-upload STABLE=$(STABLE) \
		VERSION=$(VERSION) GIT_TAG=$(GIT_TAG) ZIP_NAME=$(ZIP_NAME) ZIP_PATH=$(ZIP_PATH)
	$(MAKE) manifest-update STABLE=$(STABLE) \
		VERSION=$(VERSION) TARGET_ABI=$(TARGET_ABI) \
		RELEASE_URL=$(RELEASE_URL) TIMESTAMP=$(TIMESTAMP) \
		MANIFEST_FILE=$(MANIFEST_FILE)
	$(MAKE) verify STABLE=$(STABLE)
	$(MAKE) push STABLE=$(STABLE)
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)$(GREEN)✓ Hotfix $(GIT_TAG) appliqué$(RESET)"
	@printf "%b\n" "  $(MANIFEST_FILE) et ZIP GitHub sont maintenant synchronisés."
	@printf "%b\n" "  Rafraîchissez le dépôt dans Jellyfin puis réinstallez."

# Cible interne — recharge les variables depuis version.json après un bump
.PHONY: _reload-version
_reload-version:
	$(eval VERSION       := $(shell jq -r '"\(.major).\(.minor).\(.patch).0"' version.json))
	$(eval VERSION_MAJOR := $(shell jq -r '.major' version.json))
	$(eval VERSION_MINOR := $(shell jq -r '.minor' version.json))
	$(eval VERSION_PATCH := $(shell jq -r '.patch' version.json))
	$(eval TARGET_ABI    := $(shell jq -r '.targetAbi' version.json))
	$(eval GIT_TAG       := v$(VERSION)$(TAG_SUFFIX))
	$(eval ZIP_NAME      := infopopup_$(VERSION)$(ZIP_SUFFIX).zip)
	$(eval ZIP_PATH      := $(DIST_DIR)/$(ZIP_NAME))
	$(eval RELEASE_URL   := https://github.com/$(GITHUB_USER)/$(GITHUB_REPO)/releases/download/$(GIT_TAG)/$(ZIP_NAME))
	$(eval TIMESTAMP     := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ"))

# Garde-fou : refuse de release dans le mauvais channel/branche.
# Ex : `make release-patch` (dev par défaut) lancé depuis main → erreur explicite.
.PHONY: _check-branch
_check-branch:
	@CURRENT=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$CURRENT" != "$(BRANCH)" ]; then \
		printf "%b\n" "$(RED)✗ Branche actuelle ($$CURRENT) ≠ branche cible du channel $(CHANNEL_LABEL) ($(BRANCH))$(RESET)"; \
		printf "%b\n" "  → Soit checkout $(BRANCH) avant, soit utilisez $(if $(filter dev,$(CHANNEL)),'make release-patch STABLE=1','make release-patch' sans STABLE)"; \
		exit 1; \
	fi

# Cible interne — ne pas appeler directement
.PHONY: _do-release
_do-release: _check-branch _reload-version
	@printf "%b\n" "$(BOLD)Channel : $(CYAN)$(CHANNEL_LABEL)$(RESET)  Branche : $(BRANCH)  Version cible : $(CYAN)$(VERSION)$(RESET)"
	$(MAKE) pack \
		VERSION=$(VERSION) ZIP_NAME=$(ZIP_NAME) ZIP_PATH=$(ZIP_PATH)
	$(MAKE) push STABLE=$(STABLE)
	$(MAKE) tag STABLE=$(STABLE) \
		VERSION=$(VERSION) GIT_TAG=$(GIT_TAG)
	$(MAKE) gh-release STABLE=$(STABLE) \
		VERSION=$(VERSION) GIT_TAG=$(GIT_TAG) ZIP_NAME=$(ZIP_NAME) ZIP_PATH=$(ZIP_PATH)
	$(MAKE) manifest-update STABLE=$(STABLE) \
		VERSION=$(VERSION) TARGET_ABI=$(TARGET_ABI) \
		RELEASE_URL=$(RELEASE_URL) TIMESTAMP=$(TIMESTAMP) \
		MANIFEST_FILE=$(MANIFEST_FILE)
	$(MAKE) verify STABLE=$(STABLE)
	$(MAKE) push STABLE=$(STABLE)
	@printf "%b\n" ""
	@printf "%b\n" "$(BOLD)$(GREEN)✓ Release $(GIT_TAG) ($(CHANNEL_LABEL)) publiée avec succès !$(RESET)"
	@printf "%b\n" "  GitHub  : https://github.com/$(GITHUB_USER)/$(GITHUB_REPO)/releases/tag/$(GIT_TAG)"
	@printf "%b\n" "  Jellyfin: https://raw.githubusercontent.com/$(GITHUB_USER)/$(GITHUB_REPO)/$(BRANCH)/$(MANIFEST_FILE)"
