/**
 * jellyfin-info-popup-extention — ip-popup.js
 * --------------------------------------------
 * Module popup utilisateur + MutationObserver central.
 *
 * Responsabilités :
 *   - Détection de navigation via MutationObserver + hashchange + popstate
 *   - Chargement des messages non vus (GET /InfoPopup/popup-data)
 *   - Affichage de la popup (messages non vus + historique accordéon)
 *   - Marquage comme vu en batch avec protection de race condition
 *
 * Dépendances : ip-i18n.js, ip-utils.js, ip-styles.js, ip-admin.js
 * Exposition   : (aucune — auto-démarre via initObserver)
 */
(function (ns) {
    'use strict';

    var t          = function () { return ns.t.apply(ns, arguments); };
    var apiFetch   = function (p, o) { return ns.apiFetch(p, o); };
    var escHtml    = function (s) { return ns.escHtml(s); };
    var renderBody = function (r) { return ns.renderBody(r); };
    var formatDate = function (d) { return ns.formatDate(d); };
    var getToken   = function () { return ns.getToken(); };

    // ── État partagé ─────────────────────────────────────────────────────────
    // popupActive : true pendant l'affichage ET le marquage POST /seen.
    // Garantit qu'aucune re-vérification ne se déclenche pendant ce laps.
    var popupActive     = false;
    var lastCheckedPath = null;
    var checkScheduled  = false;

    // ════════════════════════════════════════════════════════════════════════
    // Historique accordéon dans la popup
    // ════════════════════════════════════════════════════════════════════════

    function buildHistoryBlock(messages) {
        var block  = document.createElement('div');
        block.className = 'ip-history';
        var toggle = document.createElement('div');
        toggle.className = 'ip-history-toggle';
        toggle.setAttribute('role', 'button');
        toggle.setAttribute('tabindex', '0');
        toggle.innerHTML =
            '<span>' + escHtml(t('popup_history_label', messages.length)) + '</span>' +
            '<span class="ip-chevron">\u25bc</span>';
        toggle.addEventListener('click', function () { block.classList.toggle('expanded'); });
        toggle.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') block.classList.toggle('expanded');
        });

        var list = document.createElement('div');
        list.className = 'ip-history-list';

        messages.forEach(function (msg) {
            var id          = msg.id          || msg.Id          || '';
            var title       = msg.title       || msg.Title       || '';
            var publishedAt = msg.publishedAt || msg.PublishedAt || '';
            var bodyRaw     = msg.body        || msg.Body        || null;

            var item = document.createElement('div');
            item.className = 'ip-history-item';

            var hdr = document.createElement('div');
            hdr.className = 'ip-item-hdr';
            hdr.setAttribute('role', 'button');
            hdr.setAttribute('tabindex', '0');
            hdr.innerHTML =
                '<span class="ip-item-title">' + escHtml(title) + '</span>' +
                '<span class="ip-item-date">' + escHtml(formatDate(publishedAt)) + '</span>' +
                '<span class="ip-item-chev">\u25bc</span>';

            var itemBody = document.createElement('div');
            itemBody.className = 'ip-item-body';

            // Corps déjà disponible (depuis popup-data) ou chargement paresseux
            var loaded = (bodyRaw !== null);
            if (loaded) itemBody.innerHTML = renderBody(bodyRaw);

            var loadLazy = function () {
                if (loaded || !id) return;
                loaded = true;
                itemBody.textContent = t('popup_hist_loading');
                apiFetch('/InfoPopup/messages/' + encodeURIComponent(id))
                    .then(function (res) { return res.json(); })
                    .then(function (data) {
                        var b = data.body || data.Body || '';
                        itemBody.innerHTML = b
                            ? renderBody(b)
                            : '<em style="opacity:.5">' + escHtml(t('popup_empty_body')) + '</em>';
                    })
                    .catch(function () { itemBody.textContent = t('popup_hist_err'); });
            };

            var toggleItem = function () {
                item.classList.toggle('open');
                if (item.classList.contains('open')) loadLazy();
            };
            hdr.addEventListener('click', toggleItem);
            hdr.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') toggleItem();
            });

            item.appendChild(hdr);
            item.appendChild(itemBody);
            list.appendChild(item);
        });

        block.appendChild(toggle);
        block.appendChild(list);
        return block;
    }

    // ════════════════════════════════════════════════════════════════════════
    // Affichage de la popup
    // ════════════════════════════════════════════════════════════════════════

    function showPopup(unseenMessages, historyMessages) {
        if (popupActive) return;
        popupActive = true;
        ns.injectStyles();

        var allUnseenIds  = unseenMessages.map(function (m) { return m.id || m.Id || ''; });
        var isSingle      = unseenMessages.length === 1;
        var headerTitle   = isSingle
            ? (unseenMessages[0].title || unseenMessages[0].Title || '')
            : t('popup_n_messages', unseenMessages.length);

        var backdrop = document.createElement('div');
        backdrop.id  = 'infopopup-backdrop';
        var dialog   = document.createElement('div');
        dialog.id    = 'infopopup-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', headerTitle);

        var header = document.createElement('div');
        header.id  = 'infopopup-header';
        header.innerHTML =
            '<span class="ip-icon" aria-hidden="true">\ud83d\udd14</span>' +
            '<span class="ip-title">' + escHtml(headerTitle) + '</span>' +
            '<button class="ip-close-btn" aria-label="' + escHtml(t('popup_close_aria')) +
            '" title="' + escHtml(t('popup_close_aria')) + '">\u2715</button>';
        dialog.appendChild(header);

        if (isSingle) {
            var body = document.createElement('div');
            body.id  = 'infopopup-body';
            body.innerHTML = renderBody(unseenMessages[0].body || unseenMessages[0].Body || '');
            dialog.appendChild(body);
        } else {
            var msgsContainer = document.createElement('div');
            msgsContainer.id  = 'infopopup-msgs';
            unseenMessages.forEach(function (msg) {
                var card = document.createElement('div');
                card.className = 'ip-msg-card';
                var cardTitle = document.createElement('div');
                cardTitle.className   = 'ip-msg-card-title';
                cardTitle.textContent = msg.title || msg.Title || '';
                var cardBody = document.createElement('div');
                cardBody.className = 'ip-msg-card-body';
                cardBody.innerHTML = renderBody(msg.body || msg.Body || '');
                card.appendChild(cardTitle);
                card.appendChild(cardBody);
                msgsContainer.appendChild(card);
            });
            dialog.appendChild(msgsContainer);
        }

        if (historyMessages && historyMessages.length > 0) {
            dialog.appendChild(buildHistoryBlock(historyMessages));
        }

        var footer   = document.createElement('div');
        footer.id    = 'infopopup-footer';
        var closeBtn = document.createElement('button');
        closeBtn.className   = 'ip-btn-close';
        closeBtn.textContent = t('popup_close_btn');
        footer.appendChild(closeBtn);
        dialog.appendChild(footer);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
        closeBtn.focus();

        var close = function () {
            backdrop.remove();
            // popupActive reste true jusqu'à confirmation serveur (R4).
            // Évite la race condition entre "Fermer" et l'acquittement du POST /seen.
            markAllSeen(allUnseenIds).finally(function () {
                popupActive = false;
            });
        };

        closeBtn.addEventListener('click', close);
        header.querySelector('.ip-close-btn').addEventListener('click', close);
        backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
        var onKey = function (e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
        };
        document.addEventListener('keydown', onKey);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Marquage comme vu
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Marque des messages comme vus côté serveur.
     * Retourne une Promise qui se résout toujours (erreurs swallowed)
     * pour permettre un .finally() fiable dans close().
     */
    function markAllSeen(ids) {
        if (!ids || !ids.length) return Promise.resolve();
        return apiFetch('/InfoPopup/seen', {
            method: 'POST',
            body: JSON.stringify({ ids: ids })
        }).catch(function (err) {
            console.warn('[InfoPopup] markAllSeen failed:', err);
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Vérification des messages non vus
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Récupère en un seul appel (GET /popup-data) :
     *   - les messages non vus avec leurs corps complets,
     *   - l'historique des messages déjà vus en résumé (corps chargé au clic).
     */
    function checkForUnseenMessages() {
        apiFetch('/InfoPopup/popup-data')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var unseen  = data.unseen  || data.Unseen  || [];
                var history = data.history || data.History || [];
                if (!unseen.length) return;
                showPopup(unseen, history);
            })
            .catch(function () {
                // Silencieux : session expirée, réseau KO, aucun message non vu.
            });
    }

    // ════════════════════════════════════════════════════════════════════════
    // MutationObserver central
    // ════════════════════════════════════════════════════════════════════════

    function schedulePopupCheck() {
        if (checkScheduled) return;
        checkScheduled = true;
        setTimeout(function () {
            checkScheduled = false;
            if (!getToken()) return;
            // Popup ouverte ou marquage en transit → ne pas re-déclencher.
            if (popupActive) return;
            // Page de config admin active → ne pas afficher la popup.
            if (document.querySelector('#infoPopupConfigPage')) return;
            var path = window.location.hash || window.location.pathname;
            if (path === lastCheckedPath) return;
            lastCheckedPath = path;
            checkForUnseenMessages();
        }, 800);
    }

    function initObserver() {
        new MutationObserver(function () {
            schedulePopupCheck();
            ns.checkConfigPage();
        }).observe(document.body, { childList: true, subtree: true });

        window.addEventListener('hashchange', schedulePopupCheck);
        window.addEventListener('popstate',   schedulePopupCheck);

        schedulePopupCheck();
        ns.checkConfigPage();
    }

    // ── Démarrage ────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }

}(window.__IP = window.__IP || {}));
