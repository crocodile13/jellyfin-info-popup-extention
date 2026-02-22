# jellyfin-info-popup-extention

Plugin Jellyfin permettant aux administrateurs d’afficher des messages popup aux utilisateurs lors de leur connexion.

Cette extension a été quasi intégralement vibe codée par Claude. C’est assumé : j’avais simplement besoin d’une telle extension et je ne voulais pas me lancer dans un projet de développement de dix jours.

---

## 📸 Aperçu

![Aperçu 1](images/image1.png)
![Aperçu 2](images/image2.png)

---
## Fonctionnalités

- **Popup à la connexion** : détection post-login via MutationObserver (SPA-compatible, testé Jellyfin 10.10–10.11)
- **Affichage unique** : suivi côté serveur — pas de localStorage, fonctionne sur tous les appareils
- **Historique déroulant** : tous les messages passés dans un accordéon replié par défaut
- **Page admin** : publication, sélection multiple, suppression confirmée
- **Suppression totale** : un message supprimé disparaît immédiatement, partout, pour tout le monde
- **Injection automatique** : `client.js` injecté dans `index.html` par le `ScriptInjectionMiddleware` — aucune modification manuelle requise
- **Intégration thème Jellyfin** : variables CSS natives, classes dashboard standard
- **Sécurité XSS** : texte brut exclusivement (`textContent`, jamais `innerHTML`)

---

## Ajouter le dépôt dans Jellyfin

```
Tableau de bord → Plugins → Catalogues → Ajouter
URL : https://raw.githubusercontent.com/crocodile13/jellyfin-info-popup-extention/main/manifest.json
```

Puis installer **Info Popup** depuis le catalogue et redémarrer Jellyfin.

Le script client (`client.js`) est injecté automatiquement dans `index.html` par le `ScriptInjectionMiddleware` au démarrage de Jellyfin. **Aucune modification manuelle de `index.html` n'est nécessaire.**

> **Fallback Docker** : si un volume monte un `index.html` personnalisé qui écrase celui de Jellyfin-Web, ajoutez manuellement avant `</body>` :
> ```html
> <script src="/InfoPopup/client.js"></script>
> ```

---

## Installation manuelle

1. Télécharger `infopopup_X.Y.Z.0.zip` depuis les [Releases](../../releases)
2. Extraire `Jellyfin.Plugin.InfoPopup.dll` dans :
   - Linux : `~/.local/share/jellyfin/plugins/InfoPopup/`
   - Docker : `/config/plugins/InfoPopup/`
3. Redémarrer Jellyfin — `client.js` est injecté automatiquement par le middleware

---

## Développement

### Prérequis

| Outil | Version |
|-------|---------|
| [.NET SDK](https://dotnet.microsoft.com) | 8.x |
| [git](https://git-scm.com) | >= 2.x |
| [jq](https://stedolan.github.io/jq/) | >= 1.6 |
| [GitHub CLI](https://cli.github.com) | >= 2.x |

### Setup initial

```bash
git clone https://github.com/VOTRE_COMPTE/jellyfin-info-popup-extention
cd jellyfin-info-popup-extention

# Configurer votre GitHub user
cp .env.make.example .env.make
# Editer .env.make : GITHUB_USER = votre-login

# Verifier les prerequis
make check
```

### Commandes disponibles

```bash
make              # Aide + URL du depot Jellyfin

# Developpement
make build        # Compile en Debug
make pack         # Compile Release + cree le ZIP dans dist/
make clean        # Nettoie bin/, obj/, dist/*.zip

# Versioning
make bump-patch   # 0.1.4.0 -> 0.1.5.0
make bump-minor   # 0.1.4.0 -> 0.2.0.0
make bump-major   # 0.1.4.0 -> 1.0.0.0

# Release complete (recommande)
make release-patch   # Correctif : bump + build + manifest + push + tag + GitHub Release
make release-minor   # Nouvelle feature : idem
make release-major   # Rupture de compatibilite : idem
```

### Workflow de release

```bash
# 1. Ajouter vos changements dans CHANGELOG.md
# 2. Lancer la release
make release-patch   # ou release-minor / release-major
```

---

## Architecture

```
API REST (/InfoPopup/*)          Client JS (injecte automatiquement dans index.html)
┌─────────────────────────┐      ┌──────────────────────────────────────────────┐
│ GET  /messages           │      │ ScriptInjectionMiddleware -> index.html      │
│ GET  /messages/{id}      │◄─────│ MutationObserver -> toute navigation SPA     │
│ POST /messages [ADMIN]   │      │ Guard : skip si #infoPopupConfigPage present │
│ DELETE /messages [ADMIN] │      │ GET /InfoPopup/unseen                        │
│ GET  /unseen             │      │ showPopup() -> textContent                   │
│ POST /seen               │      │ fermeture -> POST /InfoPopup/seen            │
│ GET  /client.js          │      └──────────────────────────────────────────────┘
└─────────────────────────┘
                                  Page Admin (dashboard Jellyfin)
Persistance                       ┌──────────────────────────────────────────────┐
┌─────────────────────────┐      │ POST /messages -> publier                    │
│ XML : messages           │      │ GET  /messages -> tableau (checkboxes natifs)│
│ JSON: infopopup_seen.json│      │ DELETE /messages -> confirm modal persistant │
└─────────────────────────┘      └──────────────────────────────────────────────┘
```

---

## Compatibilite

| Jellyfin | .NET | Statut |
|----------|------|--------|
| 10.10.x  | 8.0  | Supporte |
| 10.11.x  | 8.0  | Teste (dashboard React/MUI) |

---

## Licence
GPL3

## Contrib
Si vous modifiez le code, si vous rajouter des features ou resolvez des bugs, partagez votre travail !
