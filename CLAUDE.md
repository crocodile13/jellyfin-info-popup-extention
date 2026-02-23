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
├── Makefile
├── version.json                      ← SOURCE UNIQUE DE VÉRITÉ pour la version
├── manifest.json
├── CHANGELOG.md
├── CLAUDE.md                         ← ce fichier
├── README.md
├── .gitignore
├── .env.make.example
├── scripts/
│   ├── bump_version.sh
│   ├── update_manifest.sh
│   └── extract_changelog.sh
├── assets/
│   └── icon.png
├── dist/
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
└── Jellyfin.Plugin.InfoPopup/
    ├── Jellyfin.Plugin.InfoPopup.csproj
    ├── Plugin.cs
    ├── PluginServiceRegistrator.cs
    ├── Configuration/PluginConfiguration.cs
    ├── Models/{PopupMessage,SeenRecord}.cs
    ├── DTOs/MessageDtos.cs            ← DTOs requête/réponse (séparés du controller)
    ├── Services/{MessageStore,SeenTrackerService}.cs
    ├── Controllers/InfoPopupController.cs
    ├── Middleware/{ScriptInjectionMiddleware,ScriptInjectionStartupFilter}.cs
    └── Web/{client.js,configurationpage.html}
```

---

## 3. version.json — Source unique de vérité

**Ne jamais éditer les numéros de version manuellement. Utiliser `make bump-*`.**

```json
{
  "major": 0,
  "minor": 5,
  "patch": 0,
  "targetAbi": "10.10.0.0"
}
```

---

## 4. Workflow Makefile — Référence complète

```bash
make              # Aide
make check        # Vérifie dotnet, git, jq, gh CLI
make build        # Compile en Debug
make build-release
make pack         # Release + ZIP dans dist/
make clean

make bump-patch / bump-minor / bump-major
make release-patch / release-minor / release-major
```

**Séquence interne de `release-*` :**
1. bump version → `version.json` + `.csproj`
2. `pack` → `dist/infopopup_X.Y.Z.0.zip`
3. `manifest-update` → MD5, prépend entrée dans `manifest.json`
4. `push` → commit + push main
5. `tag` → git tag + push
6. `gh-release` → GitHub Release + upload ZIP

---

## 5. Architecture — Points critiques

### Dual-layer SPA obligatoire
Jellyfin-Web est une SPA. Toute UI client passe par `Web/client.js` injecté dans `index.html`. Aucun rendu HTML côté serveur.

### Injection automatique via middleware
`ScriptInjectionMiddleware` intercepte `/`, `/web`, `/web/`, `/web/index.html` et injecte `<script src="/InfoPopup/client.js"></script>` avant `</body>`.

### Détection connexion : MutationObserver uniquement
`document.body` observé avec `{ childList: true, subtree: true }` + listeners `hashchange` et `popstate`. `lastCheckedPath`, `checkScheduled` et `setTimeout(800ms)` dédupliquent les appels.
**Guards obligatoires** : `schedulePopupCheck` retourne immédiatement si `#infoPopupConfigPage` est dans le DOM, ou si `popupActive === true`.

### Suivi des vues : 100% serveur
`infopopup_seen.json` via `SeenTrackerService`. Jamais `localStorage` / `sessionStorage` / cookie.

### Modification de message : ID stable
`PUT /InfoPopup/messages/{id}` met à jour titre et corps sans changer l'ID. `infopopup_seen.json` n'est pas touché. Un utilisateur ayant déjà vu le message ne le revoit pas après modification.

### Contrôle d'accès sur les messages
- **Admins** (`RequiresElevation`) : voient tous les messages sur tous les endpoints.
- **Utilisateurs** : `GET /messages` et `GET /messages/{id}` filtrent selon `TargetUserIds`. Un message non ciblé retourne `404` (pas `403`) pour ne pas révéler son existence.
- **UserId manquant** : tous les endpoints utilisateur retournent `401 Unauthorized` si le claim `Jellyfin-UserId` est absent du token.

### Appel popup unique via /popup-data
`GET /InfoPopup/popup-data` retourne en un seul appel :
- `unseen` : messages non vus avec corps complet
- `history` : résumés des messages déjà vus (corps chargé en lazy au clic)

Ne jamais revenir à l'ancien pattern qui enchaînait `/unseen` + N×`/messages/{id}` + `/messages` + M×`/messages/{id}`.

### Race condition popup/marquage
`popupActive` doit rester `true` pendant toute la durée entre le clic sur "Fermer" et la résolution du `POST /seen` côté serveur. La remise à `false` se fait exclusivement dans le `.finally()` de `markAllSeen()`. Ne jamais remettre `popupActive = false` avant cela.

### Suppression : POST /messages/delete
Utiliser `POST /InfoPopup/messages/delete` et non `DELETE /messages` avec body. Certains proxies et pare-feux rejettent silencieusement le body sur DELETE.

### Cache SeenTrackerService
`SeenTrackerService` maintient un cache mémoire `_cache` du fichier JSON. Il est invalidé uniquement à l'écriture (`WriteStore`). Ne pas appeler `File.ReadAllText` à l'intérieur d'un lock sans passer par `ReadStore()`.

### Référence config dans MessageStore
Dans `MessageStore`, toujours capturer `var cfg = GetConfig()` à l'intérieur du bloc lockté. Ne jamais appeler `GetConfig()` plusieurs fois dans la même opération : si Jellyfin recharge la config entre deux appels, la référence change et les modifications pourraient être perdues.

### Formatage du corps : markup IP
Syntaxe supportée : `**gras**`, `_italique_`, `__souligné__`, `~~barré~~`, lignes `- liste`.
Pipeline de rendu dans `renderBody()` :
1. `escHtml()` sur chaque ligne ou token — **le texte brut est toujours échappé en premier**
2. Remplacement regex sur le texte échappé → balises HTML whitelistées (`<strong>`, `<em>`, `<u>`, `<s>`, `<ul>`, `<li>`)
3. Résultat injecté via `innerHTML` — XSS impossible car aucune donnée utilisateur ne passe en clair

**Ne jamais inverser l'ordre `escHtml` / remplacement.**

### injectStyles() — portée et idempotence
`injectStyles()` injecte toutes les CSS globales dans `<head>` (popup, historique, confirm dialog, tableau admin). Elle est idempotente (guard sur `#infopopup-styles`).
**Règle** : tout composant JS qui crée des éléments stylisés par ces classes doit s'assurer que `injectStyles()` a été appelé avant. `initConfigPage()` l'appelle en premier.

### Styles SPA-persistants
Tous les CSS pour des éléments ajoutés dynamiquement au `<body>` doivent être dans `injectStyles()`. Les `<style>` de `configurationpage.html` ne persistent pas lors des transitions SPA.

### Sérialisation JSON Jellyfin
Jellyfin peut sérialiser en camelCase ou PascalCase. Toujours `msg.field || msg.Field || ''` pour tous les champs lus depuis l'API.

### Checkboxes dans le tableau admin
Utiliser `<input type="checkbox">` natif avec `accent-color` inline. Ne jamais utiliser `emby-checkbox` dans du HTML généré dynamiquement (masque l'input natif, zone de clic nulle si `<span>` vide).

---

## 6. API REST — Référence complète

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/InfoPopup/messages` | user/admin | Résumés filtrés par ciblage (admin : tous) |
| GET | `/InfoPopup/messages/{id}` | user/admin | Détail complet (404 si non ciblé et non-admin) |
| POST | `/InfoPopup/messages` | **admin** | Créer un message |
| PUT | `/InfoPopup/messages/{id}` | **admin** | Modifier titre/corps (ID stable, vues préservées) |
| POST | `/InfoPopup/messages/delete` | **admin** | Supprimer (body `{ ids: [...] }`) |
| GET | `/InfoPopup/popup-data` | user | Non-vus + historique en un seul appel |
| GET | `/InfoPopup/unseen` | user | Messages non vus (compatibilité, préférer popup-data) |
| POST | `/InfoPopup/seen` | user | Marquer vus (body `{ ids: [...] }`) |
| GET | `/InfoPopup/client.js` | anonyme | Script client embarqué |

---

## 7. Règles métier — Non négociables

| # | Règle |
|---|-------|
| R1 | Un message **supprimé disparaît définitivement et partout** — popup ET historique, pour tous les utilisateurs. |
| R2 | Un message est affiché **une seule fois** par utilisateur (suivi serveur). |
| R3 | La popup affiche **tous** les messages non vus simultanément — le plus récent en principal ou en première carte. |
| R4 | À la fermeture, **tous** les non-vus sont marqués vus en batch. `popupActive` reste `true` jusqu'à confirmation serveur. |
| R5 | POST/PUT/POST(delete) `/InfoPopup/messages` → **admin uniquement** (`RequiresElevation`). |
| R6 | Nettoyage des orphelins dans `infopopup_seen.json` → **paresseux**, au prochain accès. |
| R7 | `escHtml()` **toujours avant** les remplacements de formatage. Jamais de données utilisateur brutes dans `innerHTML`. |
| R8 | `PUT /InfoPopup/messages/{id}` ne modifie **jamais** l'ID ni `infopopup_seen.json` — un message modifié n'est pas réaffiché aux utilisateurs qui l'avaient vu. |
| R9 | `GET /messages` et `GET /messages/{id}` filtrent par `TargetUserIds` pour les non-admins. Retourner `404` (pas `403`) si non ciblé. |
| R10 | Tout endpoint user retourne `401` si le claim `Jellyfin-UserId` est absent. Jamais de fallback sur `string.Empty`. |

---

## 8. Procédure de modification du code

### Avant
1. Lire le fichier concerné en entier
2. Identifier tous les fichiers impactés (changement API → `client.js` + `configurationpage.html` + `README.md`)
3. Vérifier cohérence avec les règles R1–R10

### Pendant
- Préserver les commentaires XML C# sur les membres publics
- Ne **jamais** changer le GUID
- Ne **jamais** éditer `version.json` ou `<Version>` dans le `.csproj` à la main
- Ne **jamais** éditer `manifest.json` à la main

### Après
- Vérifier les règles R1–R10
- Ajouter l'entrée dans `CHANGELOG.md`
- Mettre à jour `README.md` et `CLAUDE.md` si l'architecture ou une règle change

---

## 9. Pièges récurrents

- `client.js` doit être `<EmbeddedResource>` dans le `.csproj` — sinon 404 sur `/InfoPopup/client.js`
- Le nom de ressource assembly est exactement `Jellyfin.Plugin.InfoPopup.Web.client.js`
- `HttpContext.User.FindFirst("Jellyfin-UserId")` — pas `User.Identity.Name`
- Policy admin : `"RequiresElevation"` dans Jellyfin 10.10+
- **`popupActive` remis trop tôt** : ne jamais faire `popupActive = false` avant le `.finally()` de `markAllSeen()`. Symptôme : la popup réapparaît immédiatement après fermeture si navigation rapide.
- **DELETE avec body** : utiliser `POST /InfoPopup/messages/delete`. Ne jamais revenir à `DELETE` avec body — peut être ignoré silencieusement par des proxies.
- **`GetConfig()` hors lock** : toujours capturer `var cfg = GetConfig()` à l'intérieur du bloc lockté dans `MessageStore`. Ne jamais accéder via la propriété statique directement dans une opération multi-étapes.
- **Cache SeenTrackerService** : ne pas lire le fichier JSON directement — toujours passer par `ReadStore()` qui gère le cache.
- **`injectStyles()` non appelée** : tout composant qui génère des éléments DOM stylisés par les classes IP doit s'assurer que `injectStyles()` a été appelée. Symptôme : styles absents en navigation directe vers la page config.
- **`renderBody()` vs `textContent`** : utiliser `renderBody()` + `innerHTML` pour les corps de messages. Ne jamais utiliser `textContent` pour le rendu final.
- **`emby-checkbox` dynamique** : `<span></span>` vide = 0px = zone de clic nulle. Toujours `<input type="checkbox">` natif avec `accent-color` inline.
- **Styles SPA** : les `<style>` de `configurationpage.html` disparaissent lors des transitions. Tout CSS pour des overlays/éléments ajoutés au `<body>` doit être dans `injectStyles()`.
- **Fallback PascalCase** : toujours `msg.body || msg.Body || ''` — jamais un seul casing.
- **Jellyfin 10.11** : React Router + MUI. Les sélecteurs legacy (`#indexPage`, `.homePage`) n'existent plus. MutationObserver sur `document.body` sans restriction de sélecteur est la seule approche fiable.
- **`PUT` sans changer l'ID** : ne jamais recréer un message pour simuler une modification. Toujours passer par `MessageStore.Update()` qui préserve l'ID et ne touche pas à `infopopup_seen.json`.
