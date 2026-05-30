/**
 * jellyfin-info-popup-extention — client.js  v0.6.0.0
 * -----------------------------------------------------
 * Point d'entrée unique injecté dans index.html par ScriptInjectionMiddleware.
 * Rôle : charger les modules dans l'ordre correct via injection de <script>.
 *
 * Ordre de chargement garanti :
 *   1. ip-i18n.js    — détection de langue + dictionnaires FR/EN
 *   2. ip-utils.js   — utilitaires partagés (apiFetch, renderBody, escHtml…)
 *   3. ip-styles.js  — injection CSS idempotente dans <head>
 *   4. ip-admin.js   — page de configuration administrateur
 *   5. ip-popup.js   — popup utilisateur + MutationObserver (auto-démarre)
 *   6. ip-user.js    — page utilisateur sidebar (boîte de réception + envoi)
 *
 * Guard window.__infoPopupLoaded : empêche toute double exécution (SPA).
 */
(function () {
    'use strict';

    if (window.__infoPopupLoaded) return;
    window.__infoPopupLoaded = true;

    // Récupère le `?v=…` de notre propre <script src=...> (ajouté par le middleware) pour
    // le propager aux modules chargés ici. Sans ça, les caches proxy/SW continuent à servir
    // les anciens modules même quand le plugin est mis à jour.
    var versionQuery = '';
    try {
        var cur = document.currentScript;
        if (cur && cur.src) {
            var qIdx = cur.src.indexOf('?');
            if (qIdx >= 0) versionQuery = cur.src.substring(qIdx);
        }
    } catch (e) { /* document.currentScript indisponible : on sert sans query */ }

    var MODULES = [
        '/InfoPopup/ip-i18n.js',
        '/InfoPopup/ip-utils.js',
        '/InfoPopup/ip-styles.js',
        '/InfoPopup/ip-admin.js',
        '/InfoPopup/ip-popup.js',
        '/InfoPopup/ip-user.js'
    ];

    /**
     * Optim v3.8.4.0 — chargement parallèle, exécution ordonnée.
     *
     * Avant : `load` event chaining → 6 round-trips HTTP séquentiels (≈ 6× RTT). Sur
     * une connexion lente derrière un reverse-proxy + service worker (cas typique
     * [[project-nginx-reverse-proxy]]), c'est plusieurs centaines de ms cumulées.
     *
     * Maintenant : on insère les 6 <script async=false> dans <head> en bloc. Pour un
     * script créé DYNAMIQUEMENT, `async` est `true` par défaut ; le forcer à `false`
     * indique au navigateur de PARALLÉLISER le fetch tout en CONSERVANT l'ordre
     * d'exécution (spec HTML "in-order async=false dynamic scripts"). Les dépendances
     * inter-modules via `window.__IP` restent donc résolues correctement.
     *
     * Gain : 1 RTT au lieu de 6 quand le cache est froid. Combiné au
     * `Cache-Control: immutable` côté serveur (v3.8.4.0), les navigations SPA
     * ultérieures ne re-fetch plus rien du tout.
     */
    var frag = document.createDocumentFragment();
    MODULES.forEach(function (path) {
        var script = document.createElement('script');
        script.src = path + versionQuery;
        script.async = false;  // critique : préserve l'ordre d'exécution même en fetch parallèle
        script.addEventListener('error', function () {
            console.error('[InfoPopup] Failed to load module: ' + path);
        });
        frag.appendChild(script);
    });
    document.head.appendChild(frag);

})();
