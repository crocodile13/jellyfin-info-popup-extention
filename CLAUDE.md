# CLAUDE.md — Directives de travail pour Claude

> Ce fichier définit **comment Claude doit se comporter** lorsqu'il travaille sur **jellyfin-info-popup-extention**.
> Il est lu en priorité avant toute intervention sur le code.

---

## 1. Contexte du projet

**jellyfin-info-popup-extention** est un plugin Jellyfin qui permet aux administrateurs de diffuser des messages popup aux utilisateurs lors de leur connexion.

### Nommage — règle absolue

| Contexte | Valeur |
|----------|--------|
| Dépôt GitHub / dossier racine | `jellyfin-info-popup-extention` |
| Assembly .NET / namespace C# | `Jellyfin.Plugin.InfoPopup` |
| Nom affiché dans le dashboard Jellyfin | `Info Popup` |
| Préfixe des routes API REST | `/InfoPopup` |
| Fichier de persistance des vues | `infopopup_seen.json` |
| Préfixe CSS et IDs DOM côté client | `.ip-` / `#infopopup-` |
| Garde anti-double-exécution JS | `window.__infoPopupLoaded` |
| Préfixe des messages de log .NET | `InfoPopup:` |
| GUID plugin (immuable) | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |

### Stack
- Backend : C# / .NET 8, `IBasePlugin`, `ControllerBase`, DI ASP.NET Core
- Frontend : JavaScript ES2020 vanilla, zéro framework, zéro dépendance externe
- Persistance : XML pour les messages (`BasePluginConfiguration`) + JSON pour les vues (`infopopup_seen.json`)
- Build / release : **GNU Make** + scripts Bash + GitHub CLI (`gh`)

---

## 2. Structure du dépôt

```
jellyfin-info-popup-extention/
├── Makefile                          ← outil central de build et release
├── version.json                      ← SOURCE UNIQUE DE VÉRITÉ pour la version
├── manifest.json                     ← dépôt Jellyfin (mis à jour par make)
├── CHANGELOG.md                      ← notes de release (format Keep a Changelog)
├── CLAUDE.md                         ← ce fichier
├── README.md
├── .gitignore
├── .env.make.example                 ← template config locale (GITHUB_USER, etc.)
├── scripts/
│   ├── bump_version.sh               ← incrémente version.json + .csproj
│   ├── update_manifest.sh            ← régénère manifest.json avec nouveau ZIP
│   └── extract_changelog.sh         ← extrait les notes pour gh release
├── assets/
│   └── icon.png                      ← icône plugin (256×256 PNG)
├── dist/                             ← ZIPs générés (ignorés par git sauf release)
├── .github/workflows/
│   ├── ci.yml                        ← build + check sur push/PR
│   └── release.yml                   ← package + GitHub Release sur tag v*
└── Jellyfin.Plugin.InfoPopup/
    ├── Jellyfin.Plugin.InfoPopup.csproj
    ├── Plugin.cs
    ├── PluginServiceRegistrator.cs
    ├── Configuration/PluginConfiguration.cs
    ├── Models/{PopupMessage,SeenRecord}.cs
    ├── Services/{MessageStore,SeenTrackerService}.cs
    ├── Controllers/InfoPopupController.cs
    └── Web/{client.js,configurationpage.html}
```

---

## 3. version.json — Source unique de vérité

**Tous les outils lisent la version depuis ce fichier. Ne jamais éditer les numéros de version manuellement ailleurs.**

```json
{
  "major": 1,
  "minor": 0,
  "patch": 0,
  "targetAbi": "10.10.0.0"
}
```

- `major.minor.patch` → version Jellyfin au format `MAJOR.MINOR.PATCH.0`
- `targetAbi` → version minimale de Jellyfin requise (format `X.Y.Z.0`)
- Le `.csproj` `<Version>` est mis à jour automatiquement par `bump_version.sh`
- Le `manifest.json` est mis à jour automatiquement par `update_manifest.sh`

---

## 4. Workflow Makefile — Référence complète

### Commandes du quotidien

```bash
make              # Affiche l'aide et l'URL du dépôt Jellyfin
make check        # Vérifie dotnet, git, jq, gh CLI
make version      # Affiche la version courante et l'URL de release
make build        # Compile en Debug (développement)
make build-release # Compile en Release
make pack         # Release + ZIP dans dist/
make clean        # Supprime bin/, obj/, dist/*.zip
```

### Versioning

```bash
make bump-patch   # 1.0.0.0 → 1.0.1.0 (correctif)
make bump-minor   # 1.0.0.0 → 1.1.0.0 (nouvelle fonctionnalité)
make bump-major   # 1.0.0.0 → 2.0.0.0 (rupture de compatibilité)
```

### Publication complète (séquence automatique)

```bash
make release-patch  # bump patch + pack + manifest + push + tag + GitHub Release
make release-minor  # bump minor + pack + manifest + push + tag + GitHub Release
make release-major  # bump major + pack + manifest + push + tag + GitHub Release
```

**Séquence interne de `release-*` :**
1. `bump-{patch|minor|major}` → met à jour `version.json` et `.csproj`
2. `pack` → build Release + crée `dist/infopopup_X.Y.Z.0.zip`
3. `manifest-update` → calcule MD5, prépend l'entrée dans `manifest.json`
4. `push` → `git add -A && git commit && git push origin main`
5. `tag` → `git tag -a vX.Y.Z.0 && git push origin vX.Y.Z.0`
6. `gh-release` → crée la GitHub Release + upload le ZIP

### Configuration locale requise

Créer `.env.make` (copié depuis `.env.make.example`, non versionné) :

```makefile
GITHUB_USER = votre-login-github
GITHUB_REPO = jellyfin-info-popup-extention
BRANCH      = main
```

### Prérequis système

| Outil | Version | Installation |
|-------|---------|-------------|
| `dotnet` | SDK 8.x | https://dotnet.microsoft.com |
| `git` | ≥ 2.x | https://git-scm.com |
| `jq` | ≥ 1.6 | `apt install jq` / `brew install jq` |
| `gh` | ≥ 2.x | https://cli.github.com — puis `gh auth login` |
| `md5sum` ou `md5` | système | pré-installé Linux/macOS |

---

## 5. manifest.json — Format Jellyfin

Le fichier est lu par Jellyfin via l'URL :
```
https://raw.githubusercontent.com/VOTRE_COMPTE/jellyfin-info-popup-extention/main/manifest.json
```

Chaque version ajoutée par `make manifest-update` suit ce format :
```json
{
  "version":   "1.2.3.0",
  "changelog": "Description des changements",
  "targetAbi": "10.10.0.0",
  "sourceUrl": "https://github.com/.../releases/download/v1.2.3.0/infopopup_1.2.3.0.zip",
  "checksum":  "md5-du-zip",
  "timestamp": "2026-02-20T14:00:00Z"
}
```

- Le tableau `versions[]` est trié du plus récent au plus ancien (nouvelle version en tête)
- Toutes les versions précédentes sont conservées (Jellyfin affiche l'historique)
- Le `checksum` est le MD5 du ZIP — calculé automatiquement par `update_manifest.sh`
- `sourceUrl` pointe vers le ZIP uploadé sur GitHub Releases (pas dans le repo git)

---

## 6. CHANGELOG.md — Convention

Format [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) :

```markdown
## [1.2.3.0] — 2026-03-15

### Ajouté
- Nouvelle fonctionnalité X

### Corrigé
- Bug Y résolu
```

**Le script `extract_changelog.sh` extrait automatiquement la section correspondant à la version pour les notes de la GitHub Release.**

---

## 7. Architecture — Points critiques

### Dual-layer SPA obligatoire
Jellyfin-Web est une SPA. Toute UI client passe par `Web/client.js` injecté dans `index.html`. Aucun rendu HTML côté serveur.

### Détection connexion : MutationObserver uniquement
`document.body` observé avec `{ childList: true, subtree: true }` + listener `hashchange`. Les variables `lastCheckedPath`, `checkScheduled` et le `setTimeout(800ms)` déduplication les appels — **ne pas les supprimer**.

### Suivi des vues : 100% serveur
`infopopup_seen.json` via `SeenTrackerService`. Jamais `localStorage` / `sessionStorage` / cookie.

### XSS impossible par construction
`body` stocké en texte brut → affiché via `element.textContent` exclusivement. `white-space: pre-wrap` gère les sauts de ligne. Jamais `innerHTML` avec données utilisateur.

---

## 8. Règles métier — Non négociables

| # | Règle |
|---|-------|
| R1 | Un message **supprimé disparaît définitivement et partout** — popup ET historique, pour tous les utilisateurs. |
| R2 | Un message est affiché **une seule fois** par utilisateur (suivi serveur). |
| R3 | La popup affiche le **plus récent** non vu en principal, les autres dans le déroulant. |
| R4 | À la fermeture (tous modes), **tous** les non-vus sont marqués vus en batch. |
| R5 | POST/DELETE `/InfoPopup/messages` → **admin uniquement** (`RequiresElevation`). |
| R6 | Nettoyage des orphelins dans `infopopup_seen.json` → **paresseux**, au prochain accès. |
| R7 | `body` toujours **texte brut**. Aucun HTML/Markdown sans refactoring de sécurité complet. |

---

## 9. Procédure de modification du code

### Avant
1. Lire le fichier concerné en entier
2. Identifier tous les fichiers impactés (changement API → `client.js` + `configurationpage.html` + `README.md`)
3. Vérifier cohérence avec les règles R1–R7

### Pendant
- Préserver les commentaires XML C# sur les membres publics
- Ne **jamais** changer le GUID (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- Ne **jamais** éditer `version.json` ou `<Version>` dans le `.csproj` à la main — utiliser `make bump-*`
- Ne **jamais** éditer `manifest.json` à la main — utiliser `make manifest-update`

### Après
- Vérifier les AC-01 à AC-12 de la spec
- Ajouter l'entrée dans `CHANGELOG.md` avant de faire `make release-*`

---

## 10. Pièges récurrents

- `client.js` doit être déclaré `<EmbeddedResource>` dans le `.csproj` sinon 404 sur `/InfoPopup/client.js`
- Le nom de ressource dans l'assembly est exactement `Jellyfin.Plugin.InfoPopup.Web.client.js`
- `HttpContext.User.GetUserId()` (extension Jellyfin) ≠ `User.Identity.Name` (ASP.NET standard)
- Policy admin : `"RequiresElevation"` dans Jellyfin 10.10
- `make release-*` recharge les variables `$(VERSION)` après le bump — c'est pour ça que `_do-release` utilise `$(eval ...)`
- Sur macOS, `md5sum` n'existe pas → le script utilise `md5 -q` automatiquement
- `dist/*.zip` est dans `.gitignore` — le ZIP n'est pas commité dans git, il est uploadé sur GitHub Releases
