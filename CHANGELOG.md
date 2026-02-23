# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)

---

## [0.3.0.0] — 2026-02-23

### Ajouté

- **Affichage de tous les messages non vus en zone principale** — si un utilisateur a plusieurs messages non lus au moment de la connexion, chacun s'affiche désormais dans sa propre carte titrée (avec titre en gras + corps), sans être relégué dans l'historique déroulant. L'historique ne contient plus que les messages déjà vus.
- **Titre du message affiché dans l'en-tête de la popup** — lorsqu'un seul message est non vu, son titre apparaît directement dans la barre d'en-tête de la popup (à côté de l'icône 🔔). Lorsque plusieurs messages sont non vus, l'en-tête affiche « N nouveaux messages ».
- **Déroulant par ligne dans le tableau d'administration** — la colonne Titre de chaque message dans la page de config est désormais cliquable : un clic insère une ligne d'expansion en dessous affichant le corps du message, chargé à la demande (lazy-load). Un chevron animé (▶ → ↓) indique l'état ouvert/fermé.

### Modifié

- `checkForUnseenMessages` récupère maintenant le corps complet de tous les messages non vus en parallèle (`Promise.all`) avant d'ouvrir la popup, au lieu de ne charger que le plus récent.
- `showPopup` accepte désormais deux arguments (`unseenMessages`, `seenMessages`) au lieu de trois, et adapte son rendu dynamiquement selon le nombre de messages non vus.
- `renderMessages` génère une ligne d'expansion `<tr>` pour chaque message du tableau admin, avec chargement lazy du corps via l'API.

---

## [0.2.1.0] — 2026-02-20

*(version initiale publiée)*

### Ajouté

- Popup à la connexion avec détection post-login via MutationObserver (SPA-compatible, Jellyfin 10.10–10.11)
- Affichage unique par utilisateur — suivi côté serveur (`infopopup_seen.json`), sans localStorage
- Historique déroulant des messages passés dans un accordéon replié par défaut
- Page d'administration : publication de messages, sélection multiple, suppression confirmée
- Suppression totale : un message supprimé disparaît immédiatement pour tous les utilisateurs
- Injection automatique de `client.js` via `ScriptInjectionMiddleware` — aucune modification manuelle de `index.html`
- Ciblage par utilisateurs spécifiques ou diffusion à tous
- Sécurité XSS : texte brut exclusivement (`textContent`, jamais `innerHTML`)
- Intégration thème Jellyfin (variables CSS natives, classes dashboard standard)
