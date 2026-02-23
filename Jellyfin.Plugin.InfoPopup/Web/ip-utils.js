/**
 * jellyfin-info-popup-extention — ip-utils.js
 * --------------------------------------------
 * Utilitaires partagés entre les modules admin et popup.
 *
 * Dépendances : ip-i18n.js (window.__IP.t)
 * Exposition   : window.__IP.{getToken, apiFetch, escHtml, renderBody, formatDate}
 */
(function (ns) {
    'use strict';

    // ── Jeton d'authentification Jellyfin ────────────────────────────────────

    function getToken() {
        try {
            var client = window.ApiClient;
            if (!client) return null;
            if (typeof client.accessToken === 'function') return client.accessToken();
            if (typeof client.accessToken === 'string')   return client.accessToken;
            return null;
        } catch (e) { return null; }
    }

    // ── Fetch authentifiée ───────────────────────────────────────────────────

    function apiFetch(path, opts) {
        opts = opts || {};
        var token = getToken();
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'MediaBrowser Token="' + token + '"';
        if (opts.headers) {
            Object.keys(opts.headers).forEach(function (k) { headers[k] = opts.headers[k]; });
        }
        return fetch(path, Object.assign({}, opts, { headers: headers }))
            .then(function (res) {
                if (!res.ok) {
                    return res.text().catch(function () { return ''; }).then(function (body) {
                        throw new Error('HTTP ' + res.status + ' \u2014 ' + body);
                    });
                }
                return res;
            });
    }

    // ── Sécurité HTML ────────────────────────────────────────────────────────

    /** Échappe les caractères HTML spéciaux. Toujours appelé AVANT tout remplacement regex. */
    function escHtml(str) {
        var d = document.createElement('div');
        d.textContent = String(str == null ? '' : str);
        return d.innerHTML;
    }

    // ── Rendu du markup IP → HTML sécurisé ──────────────────────────────────
    // Syntaxe : **gras**, _italique_, ~~barré~~, __souligné__, - liste
    // Sécurité : escHtml() appliqué AVANT les remplacements → jamais de XSS.

    /** Applique le formatage inline sur du texte déjà échappé. */
    function formatInline(escaped) {
        return escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/~~(.*?)~~/g,     '<s>$1</s>')
            .replace(/__(.*?)__/g,     '<u>$1</u>')
            .replace(/_(.*?)_/g,       '<em>$1</em>');
    }

    /**
     * Transforme le texte brut (markup IP) en HTML sécurisé.
     * Pipeline garanti : escHtml → formatInline → innerHTML.
     */
    function renderBody(raw) {
        if (!raw) return '';
        var lines  = raw.split('\n');
        var html   = '';
        var inList = false;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (/^- /.test(line)) {
                if (!inList) { html += '<ul class="ip-list">'; inList = true; }
                html += '<li>' + formatInline(escHtml(line.slice(2))) + '</li>';
            } else {
                if (inList) { html += '</ul>'; inList = false; }
                html += formatInline(escHtml(line));
                if (i < lines.length - 1) html += '<br>';
            }
        }
        if (inList) html += '</ul>';
        return html;
    }

    // ── Formatage de date ────────────────────────────────────────────────────

    /** Formate une date ISO en "YYYY-MM-DD HH:MM UTC". */
    function formatDate(iso) {
        var d = new Date(iso);
        return d.getUTCFullYear() + '-' +
               String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
               String(d.getUTCDate()).padStart(2, '0') + ' ' +
               String(d.getUTCHours()).padStart(2, '0') + ':' +
               String(d.getUTCMinutes()).padStart(2, '0') + ' ' +
               ns.t('date_suffix');
    }

    // ── Exposition ───────────────────────────────────────────────────────────
    ns.getToken  = getToken;
    ns.apiFetch  = apiFetch;
    ns.escHtml   = escHtml;
    ns.renderBody = renderBody;
    ns.formatDate = formatDate;

}(window.__IP = window.__IP || {}));
