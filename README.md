# jellyfin-info-popup-extention

Plugin Jellyfin permettant aux administrateurs d'afficher des messages popup aux utilisateurs lors de leur connexion.

Cette extension a été quasi intégralement vibe codée par Claude. C'est assumé : j'avais simplement besoin d'une telle extension et je ne voulais pas me lancer dans un projet de développement de dix jours.

---

## 📸 Aperçu

![Aperçu 1](images/image1.png)
![Aperçu 2](images/image2.png)

---

## Fonctionnalités

- **Popup à la connexion** : détection post-login via MutationObserver (SPA-compatible, testé Jellyfin 10.10–10.11)
- **Affichage unique** : suivi côté serveur — pas de localStorage, fonctionne sur tous les appareils
- **Multi-messages non vus** : si plusieurs messages n'ont pas encore été lus, chacun s'affiche dans sa propre carte (titre + corps) dans la même popup
- **Historique déroulant** : messages déjà vus dans un accordéon replié par défaut, avec corps disponible au clic
- **Formatage du corps** : syntaxe légère — `**gras**`, `_italique_`, `__souligné__`, `~~barré~~`, lignes `- liste`
- **Page admin** : publication, sélection multiple, suppression confirmée, modification de messages existants
- **Modification sans réaffichage** : un message modifié (`PUT`) conserve son ID — les utilisateurs qui l'avaient déjà vu ne le reverront pas
- **Toolbar de formatage** : barre de boutons au-dessus du textarea pour appliquer le formatage sans taper la syntaxe à la main
- **Déroulant par ligne** : clic sur le titre d'un message dans le tableau admin pour afficher son corps inline
- **Suppression totale** : un message supprimé disparaît immédiatement, partout, pour tout le monde
- **Injection automatique** : `client.js` injecté dans `index.html` par le `ScriptInjectionMiddleware` — aucune modification manuelle requise
- **Intégration thème Jellyfin** : variables CSS natives, classes dashboard standard
- **Sécurité XSS** : `escHtml()` appliqué avant tout rendu, jamais de HTML utilisateur brut dans le DOM
- **Contrôle d'accès ciblage** : les utilisateurs ne peuvent voir que les messages qui leur sont destinés, y compris via l'API directe

---

## Ajouter le dépôt dans Jellyfin

```
Tableau de bord → Plugins → Catalogues → Ajouter
URL : https://raw.githubusercontent.com/crocodile13/jellyfin-info-popup-extention/main/manifest.json
```

Puis installer **Info Popup** depuis le catalogue et redémarrer Jellyfin.

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
3. Redémarrer Jellyfin

---

## Syntaxe de formatage des messages

Le corps des messages supporte une syntaxe légère :

| Syntaxe | Rendu |
|---------|-------|
| `**texte**` | **gras** |
| `_texte_` | *italique* |
| `__texte__` | souligné |
| `~~texte~~` | barré |
| Ligne commençant par `- ` | élément de liste à puces |

Le formatage est rendu dans la popup utilisateur, dans l'historique et dans le déroulant du tableau admin.

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

cp .env.make.example .env.make
# Editer .env.make : GITHUB_USER = votre-login

make check
```

### Commandes disponibles

```bash
make              # Aide + URL du depot Jellyfin

make build        # Compile en Debug
make pack         # Compile Release + cree le ZIP dans dist/
make clean        # Nettoie bin/, obj/, dist/*.zip

make bump-patch   # 0.4.0.0 -> 0.4.1.0
make bump-minor   # 0.4.0.0 -> 0.5.0.0
make bump-major   # 0.4.0.0 -> 1.0.0.0

make release-patch
make release-minor
make release-major
```

### Workflow de release

```bash
# 1. Ajouter vos changements dans CHANGELOG.md
# 2. Lancer la release
make release-minor   # ou patch / major
```

### Nettoyer les artefacts de build du dépôt

Si `bin/` et `obj/` ont été commités par erreur avant d'être dans `.gitignore` :

```bash
git rm -r --cached Jellyfin.Plugin.InfoPopup/bin/ Jellyfin.Plugin.InfoPopup/obj/
git commit -m "chore: untrack bin/ and obj/ build artifacts"
```

---

## Architecture

```
API REST (/InfoPopup/*)               Client JS (injecté dans index.html)
┌─────────────────────────────────┐   ┌────────────────────────────────────────────┐
│ GET    /messages          [user]│   │ ScriptInjectionMiddleware → index.html     │
│ GET    /messages/{id}     [user]│◄──│ MutationObserver → toute navigation SPA    │
│ POST   /messages         [ADMIN]│   │ Guards : popupActive, #infoPopupConfigPage  │
│ PUT    /messages/{id}    [ADMIN]│   │ GET /InfoPopup/popup-data (1 seul appel)   │
│ POST   /messages/delete  [ADMIN]│   │ showPopup() → renderBody() → innerHTML     │
│ GET    /popup-data        [user]│   │ fermeture → POST /seen → popupActive=false │
│ GET    /unseen            [user]│   └────────────────────────────────────────────┘
│ POST   /seen              [user]│
│ GET    /client.js         [anon]│   Page Admin (dashboard Jellyfin)
└─────────────────────────────────┘   ┌────────────────────────────────────────────┐
                                       │ POST /messages        → publier            │
Contrôle d'accès                       │ PUT  /messages/{id}   → modifier (ID stable│
┌─────────────────────────────────┐   │ POST /messages/delete → confirm modal      │
│ Admins : tous les messages      │   │ GET  /messages        → tableau + édition  │
│ Users  : uniquement ciblés      │   │ Toolbar : B I U S • Liste                 │
│ UserId absent → 401             │   └────────────────────────────────────────────┘
│ Non ciblé → 404 (pas 403)       │
└─────────────────────────────────┘   Persistance
                                       ┌────────────────────────────────────────────┐
                                       │ XML  : messages (BasePluginConfiguration)  │
                                       │ JSON : infopopup_seen.json (cache mémoire) │
                                       └────────────────────────────────────────────┘
```

---

## Compatibilité

| Jellyfin | .NET | Statut |
|----------|------|--------|
| 10.10.x  | 8.0  | Supporté |
| 10.11.x  | 8.0  | Testé (dashboard React/MUI) |

---

## Licence
GPL3

## Contrib
Si vous modifiez le code, si vous rajoutez des features ou résolvez des bugs, partagez votre travail !
