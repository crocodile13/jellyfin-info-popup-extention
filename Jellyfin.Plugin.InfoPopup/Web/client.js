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
 *
 * Guard window.__infoPopupLoaded : empêche toute double exécution (SPA).
 */
(function () {
    'use strict';

    if (window.__infoPopupLoaded) return;
    window.__infoPopupLoaded = true;

    var MODULES = [
        '/InfoPopup/ip-i18n.js',
        '/InfoPopup/ip-utils.js',
        '/InfoPopup/ip-styles.js',
        '/InfoPopup/ip-admin.js',
        '/InfoPopup/ip-popup.js'
    ];

    /**
     * Charge les scripts séquentiellement : chaque script est injecté
     * dans <head> et attend son événement 'load' avant de passer au suivant.
     * Garantit que les dépendances sont disponibles avant chaque module.
     */
    function loadNext(index) {
        if (index >= MODULES.length) return;
        var script   = document.createElement('script');
        script.src   = MODULES[index];
        script.async = false;
        script.addEventListener('load', function () { loadNext(index + 1); });
        script.addEventListener('error', function () {
            console.error('[InfoPopup] Failed to load module: ' + MODULES[index]);
            // On continue malgré l'erreur pour ne pas bloquer les modules suivants.
            loadNext(index + 1);
        });
        document.head.appendChild(script);
    }

    loadNext(0);

})();
