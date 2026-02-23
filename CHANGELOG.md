# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)

---

## [0.5.0.0] — 2026-02-23

### Sécurité

- **Contrôle d'accès sur `GET /messages` et `GET /messages/{id}`** — ces endpoints étaient accessibles à tout utilisateur authentifié, exposant la liste complète des messages y compris leurs `TargetUserIds` et leurs corps, indépendamment du ciblage. Désormais : les admins voient tout ; les utilisateurs ne voient que les messages qui leur sont destinés. `GET /messages/{id}` retourne `404` (et non `403`) si l'utilisateur n'est pas ciblé, pour ne pas révéler l'existence d'un message non destiné.
- **UserId vide → 401 explicite** — quand le claim `Jellyfin-UserId` est absent du token, le code retournait silencieusement un ID vide qui créait un enregistrement fantôme dans `infopopup_seen.json`. Tous les endpoints utilisateur retournent maintenant `401 Unauthorized` explicitement si l'ID est absent.

### Ajouté

- **Endpoint `GET /InfoPopup/popup-data`** — retourne en un seul appel tout ce dont la popup a besoin : messages non vus avec corps complet + historique en résumés. Remplace l'ancien pattern N+1 qui générait jusqu'à `2 + N + M` requêtes HTTP pour afficher une popup.
- **Endpoint `POST /InfoPopup/messages/delete`** (admin) — remplace `DELETE /messages` avec body. Certains proxies et pare-feux rejettent silencieusement les requêtes `DELETE` avec un body. L'ancien endpoint `DELETE` est supprimé.
- **Dossier `DTOs/`** — `MessageDtos.cs` regroupe tous les DTOs (`CreateMessageRequest`, `DeleteMessagesRequest`, `UpdateMessageRequest`, `MarkSeenRequest`, `MessageSummary`, `MessageDetail`, `PopupDataResponse`). Ils étaient précédemment définis en tête du fichier controller.

### Corrigé

- **Race condition popup/marquage** — `popupActive` était remis à `false` immédiatement à la fermeture de la popup, avant que le `POST /seen` ait été confirmé par le serveur. `popupActive` reste maintenant à `true` jusqu'au `.finally()` de `markAllSeen()`.
- **Guard `popupActive` dans `schedulePopupCheck`** — sans ce guard, une navigation rapide après fermeture pouvait re-déclencher un check réseau pendant que le marquage était encore en transit.
- **Référence config capturée dans le lock** (`MessageStore`) — `Plugin.Instance?.Configuration` était accédé via une propriété sans assignation locale dans le bloc lockté. La référence est maintenant capturée avec `var cfg = GetConfig()` à l'intérieur de chaque bloc.
- **Cache mémoire dans `SeenTrackerService`** — `ReadStore()` lisait le fichier JSON depuis le disque à chaque appel, y compris sous `ReadLock`. Un cache `_cache` est maintenant maintenu en mémoire et invalidé uniquement à l'écriture.
- **Accessibilité du toast admin** — `aria-live="polite"` et `role="status"` ajoutés sur le toast lors de l'init de la page config et à chaque affichage.

### Modifié

- `checkForUnseenMessages` utilise désormais `GET /InfoPopup/popup-data` (1 requête).
- `deleteSelected` dans `client.js` appelle `POST /InfoPopup/messages/delete` au lieu de `DELETE`.
- `markAllSeen` retourne une `Promise` pour permettre le `.finally()` dans `close()`.
- Variables d'état global JS regroupées en début d'IIFE.

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
- **Modification de messages existants** — bouton « ✎ Modifier » sur chaque ligne du tableau admin. Charge le message dans le formulaire, passe en mode édition (titre de section + libellé du bouton changent, bouton « Annuler » apparaît). Utilise `PUT /InfoPopup/messages/{id}` : l'ID est conservé, le suivi des vues n'est pas affecté.
- **Endpoint `PUT /InfoPopup/messages/{id}`** (admin uniquement) — met à jour titre et corps sans toucher à l'ID ni à `infopopup_seen.json`.

### Corrigé

- **Corps vide dans l'historique de la popup** — les messages déjà vus passés à `buildHistoryBlock` étaient des `MessageSummary` sans `body`. `checkForUnseenMessages` pré-charge désormais le détail complet de chaque message vu avant d'ouvrir la popup.
- **Mise en forme cassée du tableau admin** — CSS de `.ip-row-expand`, `.ip-row-chev`, `.ip-edit-btn` absent lors d'une navigation directe vers la page config. `initConfigPage()` appelle maintenant `injectStyles()` en premier.

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
