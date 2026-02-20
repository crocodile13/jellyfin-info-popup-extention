# Changelog — jellyfin-info-popup-extention

Toutes les modifications notables sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Versioning : [Semantic Versioning](https://semver.org/) adapté Jellyfin (MAJOR.MINOR.PATCH.0).

---

## [1.0.0.0] — 2026-02-20

### Ajouté
- Popup de messages admin à la connexion utilisateur (SPA-aware via MutationObserver)
- Affichage unique par utilisateur — suivi côté serveur dans `infopopup_seen.json`
- Historique des messages dans un accordéon déroulant replié par défaut
- Page de configuration admin : publication, liste avec sélection multiple, suppression
- API REST complète : `/InfoPopup/messages`, `/InfoPopup/unseen`, `/InfoPopup/seen`
- Suppression définitive : un message supprimé disparaît partout pour tous les utilisateurs
- Intégration graphique thème Jellyfin (variables CSS, classes dashboard natives)
- Sécurité XSS par construction (`textContent` exclusivement)

---

<!-- Template pour les prochaines versions :

## [X.Y.Z.0] — YYYY-MM-DD

### Ajouté
-

### Modifié
-

### Corrigé
-

### Supprimé
-

-->
