# jellyfin-info-popup-extention

Plugin Jellyfin permettant aux administrateurs de diffuser des **messages popup** à tous les utilisateurs lors de leur connexion.

Chaque message s'affiche **une seule fois** par utilisateur. Un message supprimé disparaît **définitivement et partout**, pour tous les utilisateurs, sans exception.

---

## Fonctionnalités

- **Popup à la connexion** : détection post-login via MutationObserver (SPA-compatible)
- **Affichage unique** : suivi côté serveur — pas de localStorage, fonctionne sur tous les appareils
- **Historique déroulant** : tous les messages passés dans un accordéon replié par défaut
- **Page admin** : publication, sélection multiple, suppression confirmée
- **Suppression totale** : un message supprimé disparaît immédiatement, partout, pour tout le monde
- **Intégration thème Jellyfin** : variables CSS natives, classes dashboard standard
- **Sécurité XSS** : texte brut exclusivement (`textContent`, jamais `innerHTML`)

---

## Ajouter le dépôt dans Jellyfin

```
Tableau de bord → Plugins → Catalogues → Ajouter
URL : https://raw.githubusercontent.com/VOTRE_COMPTE/jellyfin-info-popup-extention/main/manifest.json
```

Puis installer **Info Popup** depuis le catalogue et redémarrer Jellyfin.

### Injection du script client (obligatoire)

Ajouter avant `</body>` dans `index.html` de Jellyfin-Web :

```html
<script src="/InfoPopup/client.js"></script>
```

**Docker** — monter `index.html` en volume :

```yaml
volumes:
  - /chemin/vers/mon/index.html:/usr/share/jellyfin/web/index.html
```

---

## Installation manuelle

1. Télécharger `infopopup_X.Y.Z.0.zip` depuis les [Releases](../../releases)
2. Extraire `Jellyfin.Plugin.InfoPopup.dll` dans :
   - Linux : `~/.local/share/jellyfin/plugins/InfoPopup/`
   - Docker : `/config/plugins/InfoPopup/`
3. Redémarrer Jellyfin + injecter le script client (voir ci-dessus)

---

## Développement

### Prérequis

| Outil | Version |
|-------|---------|
| [.NET SDK](https://dotnet.microsoft.com) | 8.x |
| [git](https://git-scm.com) | ≥ 2.x |
| [jq](https://stedolan.github.io/jq/) | ≥ 1.6 |
| [GitHub CLI](https://cli.github.com) | ≥ 2.x |

### Setup initial

```bash
git clone https://github.com/VOTRE_COMPTE/jellyfin-info-popup-extention
cd jellyfin-info-popup-extention

# Configurer votre GitHub user
cp .env.make.example .env.make
# Éditer .env.make : GITHUB_USER = votre-login

# Vérifier les prérequis
make check
```

### Commandes disponibles

```bash
make              # Aide + URL du dépôt Jellyfin

# Développement
make build        # Compile en Debug
make pack         # Compile Release + crée le ZIP dans dist/
make clean        # Nettoie bin/, obj/, dist/*.zip

# Versioning
make bump-patch   # 1.0.0.0 → 1.0.1.0
make bump-minor   # 1.0.0.0 → 1.1.0.0
make bump-major   # 1.0.0.0 → 2.0.0.0

# Release complète (recommandé)
make release-patch   # Correctif : bump + build + manifest + push + tag + GitHub Release
make release-minor   # Nouvelle feature : idem
make release-major   # Rupture de compatibilité : idem
```

### Workflow de release

```bash
# 1. Ajouter vos changements dans CHANGELOG.md
# 2. Lancer la release
make release-patch   # ou release-minor / release-major
```

La commande effectue automatiquement :
1. Incrémentation de `version.json` et du `.csproj`
2. Build Release + création du ZIP dans `dist/`
3. Calcul du MD5 + mise à jour de `manifest.json`
4. `git commit && git push`
5. Création du tag `vX.Y.Z.0` + push
6. Création de la GitHub Release avec le ZIP uploadé

---

## Architecture

```
API REST (/InfoPopup/*)          Client JS (injecté dans index.html)
┌─────────────────────────┐      ┌──────────────────────────────────┐
│ GET  /messages           │      │ MutationObserver → page home ?   │
│ GET  /messages/{id}      │◄─────│ GET /InfoPopup/unseen            │
│ POST /messages [ADMIN]   │      │ showPopup() → textContent        │
│ DELETE /messages [ADMIN] │      │ fermeture → POST /InfoPopup/seen │
│ GET  /unseen             │      └──────────────────────────────────┘
│ POST /seen               │
│ GET  /client.js          │      Page Admin (dashboard Jellyfin)
└─────────────────────────┘      ┌──────────────────────────────────┐
                                  │ POST /messages → publier         │
Persistance                       │ GET  /messages → tableau         │
┌─────────────────────────┐      │ DELETE /messages → supprimer     │
│ XML : messages           │      └──────────────────────────────────┘
│ JSON: infopopup_seen.json│
└─────────────────────────┘
```

---

## Compatibilité

| Jellyfin | .NET | Statut |
|----------|------|--------|
| 10.10.x  | 8.0  | ✅ Supporté |

---

## Licence

MIT
