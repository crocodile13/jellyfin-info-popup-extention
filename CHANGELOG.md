# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)

---

## [0.4.0.0] — 2026-02-23

### Ajouté

- **Formatage du corps des messages** — syntaxe légère rendue côté client en HTML sécurisé (escHtml() toujours appliqué avant tout remplacement, XSS impossible) :
  - `**texte**` → gras
  - `_texte_` → italique
  - `__texte__` → souligné
  - `~~texte~~` → barré
  - Lignes préfixées `- ` → liste à puces avec indentation (`<ul><li>`)
  - Rendu actif dans la popup utilisateur, dans l'historique et dans le déroulant du tableau admin.
- **Toolbar de formatage** au-dessus du textarea d'administration — cinq boutons (B, I, U, S, • Liste) qui wrappent la sélection courante. Chaque bouton est un toggle : appuyer une seconde fois retire le formatage.
- **Modification de messages existants** — bouton « ✎ Modifier » sur chaque ligne du tableau admin. Charge le message dans le formulaire, passe en mode édition (titre de section + libellé du bouton changent, bouton « Annuler » apparaît). Utilise `PUT /InfoPopup/messages/{id}` : l'ID est conservé, le suivi des vues n'est pas affecté — un utilisateur ayant déjà vu le message ne le reverra pas.
- **Endpoint `PUT /InfoPopup/messages/{id}`** (admin uniquement) — met à jour titre et corps sans toucher à l'ID ni à `infopopup_seen.json`.

### Corrigé

- **Corps vide dans l'historique de la popup** — les messages déjà vus passés à `buildHistoryBlock` étaient des `MessageSummary` sans `body`. `checkForUnseenMessages` pré-charge désormais le détail complet de chaque message vu (via `Promise.all` en parallèle) avant d'ouvrir la popup.
- **Mise en forme cassée du tableau admin** — CSS de `.ip-row-expand`, `.ip-row-chev`, `.ip-edit-btn` absent lors d'une navigation directe vers la page config (car `injectStyles()` n'était appelé que par `showPopup`). `initConfigPage()` appelle maintenant `injectStyles()` en premier.

### Modifié

- `MessageStore` — nouvelle méthode `Update(id, title, body)`.
- `renderMessages` — colonne Actions + colSpan des expand rows passé de 4 à 5.
- `publishMessage` — bifurque sur PUT ou POST selon `editState.id`.
- `buildHistoryBlock` — affichage immédiat si body pré-chargé, lazy load en fallback.

---

## [0.3.0.0] — 2026-02-23

### Ajouté

- **Tous les messages non vus en zone principale** — chaque non-lu apparaît dans sa propre carte (titre + corps). L'historique ne contient plus que les messages déjà vus.
- **Titre du message en en-tête de la popup** — un message : son titre dans le header. Plusieurs : « N nouveaux messages ».
- **Déroulant par ligne dans le tableau admin** — clic sur la colonne Titre → ligne d'expansion avec corps en lazy load, chevron animé.

### Modifié

- `checkForUnseenMessages` — corps de tous les non-vus récupérés en parallèle (`Promise.all`).
- `showPopup` — deux arguments (`unseenMessages`, `seenMessages`), rendu adaptatif.
- `renderMessages` — génère une `<tr class="ip-row-expand">` pour chaque ligne.

---

## [0.2.1.0] — 2026-02-20

### Ajouté

- Popup à la connexion via MutationObserver (SPA-compatible, Jellyfin 10.10–10.11)
- Affichage unique par utilisateur — suivi côté serveur, sans localStorage
- Historique déroulant des messages passés
- Page admin : publication, sélection multiple, suppression confirmée
- Suppression totale : disparaît immédiatement pour tous les utilisateurs
- Injection automatique de `client.js` via `ScriptInjectionMiddleware`
- Ciblage par utilisateurs spécifiques ou diffusion à tous
- Sécurité XSS : `textContent` exclusivement, jamais `innerHTML`
- Intégration thème Jellyfin
