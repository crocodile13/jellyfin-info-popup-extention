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

    // ── Paramètres client (chargés depuis GET /InfoPopup/client-settings) ────
    var _settings = {
        popupEnabled:       true,
        popupDelayMs:       800,
        maxMessagesInPopup: 5,
        allowReplies:       false,
        historyEnabled:     true
    };

    function loadClientSettings() {
        return apiFetch('/InfoPopup/client-settings')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data) return;
                _settings.popupEnabled       = data.popupEnabled       !== undefined ? data.popupEnabled       : (data.PopupEnabled       !== undefined ? data.PopupEnabled       : true);
                _settings.popupDelayMs       = data.popupDelayMs       !== undefined ? data.popupDelayMs       : (data.PopupDelayMs       !== undefined ? data.PopupDelayMs       : 800);
                _settings.maxMessagesInPopup = data.maxMessagesInPopup !== undefined ? data.maxMessagesInPopup : (data.MaxMessagesInPopup !== undefined ? data.MaxMessagesInPopup : 5);
                _settings.allowReplies       = data.allowReplies       !== undefined ? data.allowReplies       : (data.AllowReplies       !== undefined ? data.AllowReplies       : false);
                _settings.historyEnabled     = data.historyEnabled     !== undefined ? data.historyEnabled     : (data.HistoryEnabled     !== undefined ? data.HistoryEnabled     : true);
            })
            .catch(function () {
                // Silencieux — les valeurs par défaut de _settings sont utilisées.
            });
    }

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
    // Zone de réponse utilisateur
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Construit le bloc HTML de la zone de réponse pour un message.
     * Retourne un Element DOM (pas une string) pour éviter tout risque XSS.
     */
    function buildReplyArea(msgId) {
        var area = document.createElement('div');
        area.className = 'ip-reply-area';

        var textarea = document.createElement('textarea');
        textarea.className   = 'ip-reply-textarea';
        textarea.placeholder = t('reply_placeholder');
        textarea.maxLength   = 2000;
        textarea.setAttribute('data-reply-for', msgId);

        var footer = document.createElement('div');
        footer.className = 'ip-reply-footer';

        var sendBtn = document.createElement('button');
        sendBtn.className = 'ip-reply-send';
        sendBtn.type      = 'button';
        sendBtn.textContent = t('reply_send');
        sendBtn.setAttribute('data-reply-btn', msgId);

        var okSpan = document.createElement('span');
        okSpan.className = 'ip-reply-ok';
        okSpan.setAttribute('data-reply-ok', msgId);
        okSpan.style.display = 'none';

        footer.appendChild(sendBtn);
        footer.appendChild(okSpan);
        area.appendChild(textarea);
        area.appendChild(footer);
        return area;
    }

    /**
     * Bind les boutons d'envoi de réponse dans le container donné.
     * Appelé après que le DOM de la popup soit construit.
     * @param {Element} container — élément racine de la popup (backdrop)
     * @param {Function} close    — fonction de fermeture de la popup
     */
    function bindReplyButtons(container, close) {
        container.querySelectorAll('[data-reply-btn]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var msgId    = btn.getAttribute('data-reply-btn');
                var textarea = container.querySelector('[data-reply-for="' + msgId + '"]');
                var okSpan   = container.querySelector('[data-reply-ok="' + msgId + '"]');
                var replyArea = btn.closest('.ip-reply-area');
                var REPLY_MAX = 2000;
                if (!textarea) return;
                var replyText = textarea.value.trim();
                if (!replyText) {
                    if (okSpan) { okSpan.textContent = t('val_reply_empty'); okSpan.style.display = ''; }
                    return;
                }
                if (replyText.length > REPLY_MAX) {
                    if (okSpan) { okSpan.textContent = t('val_reply_too_long', REPLY_MAX); okSpan.style.display = ''; }
                    return;
                }
                btn.disabled = true;
                apiFetch('/InfoPopup/messages/' + encodeURIComponent(msgId) + '/reply', {
                    method: 'POST',
                    body: JSON.stringify({ body: replyText })
                }).then(function (res) {
                    if (res.status === 409) {
                        // Déjà répondu : remplacer la zone de réponse par un message
                        if (replyArea) {
                            replyArea.innerHTML = '';
                            var done = document.createElement('div');
                            done.className   = 'ip-reply-done';
                            done.textContent = t('reply_already_sent');
                            replyArea.appendChild(done);
                        }
                        return;
                    }
                    textarea.value = '';
                    if (okSpan) {
                        okSpan.textContent   = t('reply_auto_close');
                        okSpan.style.display = '';
                    }
                    // Auto-fermeture après 1.5s
                    setTimeout(function () {
                        if (typeof close === 'function') close();
                    }, 1500);
                }).catch(function (err) {
                    if (okSpan) {
                        okSpan.textContent   = t('reply_err', err && err.message ? err.message : String(err));
                        okSpan.style.display = '';
                    }
                    btn.disabled = false;
                });
            });
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Affichage de la popup
    // ════════════════════════════════════════════════════════════════════════

    function showPopup(unseenMessages, historyMessages, allUnseenFull, popupPermissions) {
        if (popupActive) return;
        popupActive = true;
        ns.injectStyles();

        // Droits utilisateur : canReply depuis popupPermissions (API) ou fallback settings
        var canReply = (popupPermissions && popupPermissions.canReply !== undefined)
            ? popupPermissions.canReply
            : ((popupPermissions && popupPermissions.CanReply !== undefined)
                ? popupPermissions.CanReply
                : _settings.allowReplies);

        // allUnseenFull contient tous les IDs à marquer comme vus (y compris ceux
        // non affichés si maxMessagesInPopup a tronqué la liste).
        var allUnseenIds = (allUnseenFull || unseenMessages).map(function (m) { return m.id || m.Id || ''; });
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

        // ── Barre de progression countdown ──────────────────────────────────
        // Si popupDelayMs > 0 : barre qui se vide de 100% → 0% sur cette durée,
        // puis fermeture automatique. Si 0 : pas de countdown (fermeture manuelle).
        var autoCloseTimer = null;
        var _delayMs = _settings.popupDelayMs > 0 ? _settings.popupDelayMs : 0;
        if (_delayMs > 0) {
            var progressWrap = document.createElement('div');
            progressWrap.id  = 'infopopup-progress-wrap';
            var progressBar  = document.createElement('div');
            progressBar.id   = 'infopopup-progress-bar';
            progressBar.style.transitionDuration = _delayMs + 'ms';
            progressWrap.appendChild(progressBar);
            dialog.appendChild(progressWrap);
        }

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
            if (canReply) {
                body.appendChild(buildReplyArea(unseenMessages[0].id || unseenMessages[0].Id || ''));
            }
            dialog.appendChild(body);
        } else {
            var msgsContainer = document.createElement('div');
            msgsContainer.id  = 'infopopup-msgs';
            unseenMessages.forEach(function (msg) {
                var msgId = msg.id || msg.Id || '';
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
                if (canReply) {
                    card.appendChild(buildReplyArea(msgId));
                }
                msgsContainer.appendChild(card);
            });
            dialog.appendChild(msgsContainer);
        }

        if (_settings.historyEnabled && historyMessages && historyMessages.length > 0) {
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

        // Bloquer les raccourcis globaux Jellyfin lors de la frappe dans la popup.
        // Escape reste propagé (ferme la popup via le handler document ci-dessous).
        dialog.addEventListener('keydown', function (e) {
            var tg = e.target.tagName;
            if ((tg === 'INPUT' || tg === 'TEXTAREA' || e.target.isContentEditable)
                    && e.key !== 'Escape' && e.key !== 'Tab') {
                e.stopPropagation();
            }
        });

        var close = function () {
            // Annuler le countdown si l'utilisateur ferme manuellement avant la fin.
            if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
            backdrop.remove();
            // popupActive reste true jusqu'à confirmation serveur (R4).
            // Évite la race condition entre "Fermer" et l'acquittement du POST /seen.
            markAllSeen(allUnseenIds).finally(function () {
                popupActive = false;
            });
        };

        // Démarrer la transition et le timer en synchronisation via double rAF.
        // Le double rAF garantit que le navigateur a calculé le style initial (width:100%)
        // avant de déclencher la transition. Timer et transition démarrent au même tick.
        if (_delayMs > 0) {
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    var bar = document.getElementById('infopopup-progress-bar');
                    if (bar) bar.style.width = '0%';
                    autoCloseTimer = setTimeout(close, _delayMs);
                });
            });
        }

        // ── Bind des boutons d'envoi de réponse (close disponible) ───────────
        bindReplyButtons(backdrop, close);

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
        // Popup désactivée par l'admin → ne rien afficher.
        if (!_settings.popupEnabled) return;

        apiFetch('/InfoPopup/popup-data')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var unseen  = data.unseen  || data.Unseen  || [];
                var history = data.history || data.History || [];
                if (!unseen.length) return;

                // Extraire les permissions utilisateur retournées par popup-data
                var permsRaw = data.permissions || data.Permissions || {};
                var popupPermissions = {
                    canReply: permsRaw.canReply !== undefined
                        ? permsRaw.canReply
                        : (permsRaw.CanReply !== undefined ? permsRaw.CanReply : _settings.allowReplies)
                };

                // Limiter le nombre de messages affichés simultanément.
                // Le marquage comme "vu" porte sur TOUS les messages reçus.
                var allUnseenFull = unseen;
                var visible = unseen.slice(0, _settings.maxMessagesInPopup);
                showPopup(visible, history, allUnseenFull, popupPermissions);
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
        }, 800);  // Délai fixe avant affichage — indépendant de popupDelayMs (durée du countdown)
    }

    function initObserver() {
        // Charger les settings en premier (silencieux si échec → valeurs par défaut).
        loadClientSettings().then(function () {
            new MutationObserver(function () {
                schedulePopupCheck();
                ns.checkConfigPage();
                ns.checkUserPage();
            }).observe(document.body, { childList: true, subtree: true });

            window.addEventListener('hashchange', schedulePopupCheck);
            window.addEventListener('popstate',   schedulePopupCheck);

            schedulePopupCheck();
            ns.checkConfigPage();
            ns.checkUserPage();
        });
    }

    // ── Démarrage ────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }

}(window.__IP = window.__IP || {}));
