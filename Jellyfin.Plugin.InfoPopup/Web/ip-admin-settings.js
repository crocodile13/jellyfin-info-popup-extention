/**
 * jellyfin-info-popup-extention — ip-admin-settings.js
 * ----------------------------------------------------
 * Sous-module onglets « Paramètres » + « Réponses » + section Maintenance.
 * v4.2.0.0 — extrait de ip-admin.js.
 *
 * Dépendances : ip-i18n.js, ip-utils.js (apiFetch, escHtml, formatDate),
 *               ip-admin.js (admin.showToast, admin.showConfirm, admin.setRateLimitMs),
 *               ip-admin-permissions.js (admin.enhanceSelect — filtre Réponses)
 * Exposition  : ns.__admin.{initSettingsTab, reloadSettingsValues, loadReplies}
 */
(function (ns) {
    'use strict';
    var admin = ns.__admin = ns.__admin || {};

    var t = function () { return ns.t.apply(ns, arguments); };
    var apiFetch = function (p, o) { return ns.apiFetch(p, o); };
    var escHtml = function (s) { return ns.escHtml(s); };
    var formatDate = function (d) { return ns.formatDate(d); };

    // ════════════════════════════════════════════════════════════════════════
    // Onglet Paramètres
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Récupère et applique les valeurs de paramètres dans les champs du formulaire.
     * Pure data refresh (pas de binding d'événement) — appelable plusieurs fois
     * sans accumulation de listeners (v3.8.7.0, pour le bouton Reset).
     */
    function reloadSettingsValues(page) {
        return apiFetch('/InfoPopup/settings')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var cfg = data || {};
                var chkEnabled  = page.querySelector('#ip-set-enabled');
                var inpDelay    = page.querySelector('#ip-set-delay');
                var inpMax      = page.querySelector('#ip-set-max');
                var chkHistory  = page.querySelector('#ip-set-history');
                var chkReplies  = page.querySelector('#ip-set-replies');
                var inpReplyLen = page.querySelector('#ip-set-reply-len');
                var inpRate     = page.querySelector('#ip-set-rate');
                var inpRetAdmin = page.querySelector('#ip-set-ret-admin');
                var inpRetUser  = page.querySelector('#ip-set-ret-user');
                var replyWrap   = page.querySelector('#ip-set-reply-len-wrap');

                var popupEnabled = cfg.popupEnabled       !== undefined ? cfg.popupEnabled       : (cfg.PopupEnabled       !== undefined ? cfg.PopupEnabled       : true);
                var popupDelay   = cfg.popupDelayMs       !== undefined ? cfg.popupDelayMs       : (cfg.PopupDelayMs       !== undefined ? cfg.PopupDelayMs       : 800);
                var maxMsgs      = cfg.maxMessagesInPopup !== undefined ? cfg.maxMessagesInPopup : (cfg.MaxMessagesInPopup !== undefined ? cfg.MaxMessagesInPopup : 5);
                var histEnabled  = cfg.historyEnabled     !== undefined ? cfg.historyEnabled     : (cfg.HistoryEnabled     !== undefined ? cfg.HistoryEnabled     : true);
                var allowReplies = cfg.allowReplies       !== undefined ? cfg.allowReplies       : (cfg.AllowReplies       !== undefined ? cfg.AllowReplies       : false);
                var replyMaxLen  = cfg.replyMaxLength     !== undefined ? cfg.replyMaxLength     : (cfg.ReplyMaxLength     !== undefined ? cfg.ReplyMaxLength     : 500);
                var rateLimit    = cfg.rateLimitMs        !== undefined ? cfg.rateLimitMs        : (cfg.RateLimitMs        !== undefined ? cfg.RateLimitMs        : 2000);
                var retAdminDays = cfg.adminMessageRetentionDays !== undefined ? cfg.adminMessageRetentionDays : (cfg.AdminMessageRetentionDays !== undefined ? cfg.AdminMessageRetentionDays : 0);
                var retUserDays  = cfg.userMessageRetentionDays  !== undefined ? cfg.userMessageRetentionDays  : (cfg.UserMessageRetentionDays  !== undefined ? cfg.UserMessageRetentionDays  : 0);

                if (chkEnabled)  chkEnabled.checked  = popupEnabled;
                if (inpDelay)    inpDelay.value      = popupDelay;
                if (inpMax)      inpMax.value        = maxMsgs;
                if (chkHistory)  chkHistory.checked  = histEnabled;
                if (chkReplies)  chkReplies.checked  = allowReplies;
                if (inpReplyLen) inpReplyLen.value   = replyMaxLen;
                if (inpRate)     inpRate.value       = rateLimit;
                if (inpRetAdmin) inpRetAdmin.value   = retAdminDays;
                if (inpRetUser)  inpRetUser.value    = retUserDays;
                if (replyWrap)   replyWrap.style.display = allowReplies ? '' : 'none';
                if (admin.setRateLimitMs) admin.setRateLimitMs(rateLimit);
            }).catch(function () {});
    }

    function initSettingsTab(page) {
        // Guard idempotence : initSettingsTab ne doit binder ses handlers qu'une fois.
        // Recharger les VALEURS se fait via reloadSettingsValues, qui est ré-appelable.
        if (page._ipSettingsInitDone) {
            reloadSettingsValues(page);
            return;
        }
        page._ipSettingsInitDone = true;

        reloadSettingsValues(page).then(function () {
            // Toggle visibilité longueur réponse — bound une seule fois.
            var chkReplies = page.querySelector('#ip-set-replies');
            var replyWrap  = page.querySelector('#ip-set-reply-len-wrap');
            if (chkReplies && replyWrap) {
                chkReplies.addEventListener('change', function () {
                    replyWrap.style.display = chkReplies.checked ? '' : 'none';
                });
            }
        });

        var saveBtn = page.querySelector('#ip-save-settings-btn');
        if (!saveBtn) return;
        saveBtn.addEventListener('click', function () {
            var chkEnabled  = page.querySelector('#ip-set-enabled');
            var inpDelay    = page.querySelector('#ip-set-delay');
            var inpMax      = page.querySelector('#ip-set-max');
            var chkHistory  = page.querySelector('#ip-set-history');
            var chkReplies  = page.querySelector('#ip-set-replies');
            var inpReplyLen = page.querySelector('#ip-set-reply-len');
            var inpRate     = page.querySelector('#ip-set-rate');
            var inpRetAdmin = page.querySelector('#ip-set-ret-admin');
            var inpRetUser  = page.querySelector('#ip-set-ret-user');
            var toastEl     = page.querySelector('#ip-settings-toast');

            var delayVal    = inpDelay    ? parseInt(inpDelay.value,    10) : 0;
            var maxVal      = inpMax      ? parseInt(inpMax.value,      10) : 5;
            var replyLenVal = inpReplyLen ? parseInt(inpReplyLen.value, 10) : 500;
            var rateVal     = inpRate     ? parseInt(inpRate.value,     10) : 2000;
            var retAdminVal = inpRetAdmin ? parseInt(inpRetAdmin.value, 10) : 0;
            var retUserVal  = inpRetUser  ? parseInt(inpRetUser.value,  10) : 0;

            // Validation client : bloque avant envoi si valeurs hors plage ou NaN.
            var settingsValid = true;
            var settingsToastEl = page.querySelector('#ip-settings-toast');
            function showSettingsErr(msg) {
                if (settingsToastEl) {
                    settingsToastEl.textContent = msg;
                    settingsToastEl.className = 'ip-toast-err';
                    settingsToastEl.style.display = 'block';
                    setTimeout(function () { settingsToastEl.style.display = 'none'; }, 4000);
                }
            }
            if (isNaN(delayVal)    || delayVal    < 0  || delayVal    > 600000) settingsValid = false;
            if (isNaN(maxVal)      || maxVal      < 1  || maxVal      > 50)    settingsValid = false;
            if (isNaN(replyLenVal) || replyLenVal < 10 || replyLenVal > 5000)  settingsValid = false;
            if (isNaN(rateVal)     || rateVal     < 0  || rateVal     > 60000) settingsValid = false;
            if (isNaN(retAdminVal) || retAdminVal < 0  || retAdminVal > 3650)  settingsValid = false;
            if (isNaN(retUserVal)  || retUserVal  < 0  || retUserVal  > 3650)  settingsValid = false;
            if (!settingsValid) { showSettingsErr(t('val_settings_invalid')); return; }

            var body = {
                popupEnabled:              chkEnabled ? chkEnabled.checked : true,
                popupDelayMs:              delayVal,
                maxMessagesInPopup:        maxVal,
                historyEnabled:            chkHistory ? chkHistory.checked : true,
                allowReplies:              chkReplies ? chkReplies.checked : false,
                replyMaxLength:            replyLenVal,
                rateLimitMs:               rateVal,
                adminMessageRetentionDays: retAdminVal,
                userMessageRetentionDays:  retUserVal
            };

            saveBtn.disabled = true;
            apiFetch('/InfoPopup/settings', { method: 'POST', body: JSON.stringify(body) })
                .then(function (res) { return res.json(); })
                .then(function (saved) {
                    var newRate = saved.rateLimitMs || saved.RateLimitMs || 2000;
                    if (admin.setRateLimitMs) admin.setRateLimitMs(newRate);
                    if (toastEl) {
                        toastEl.textContent = t('toast_settings_saved');
                        toastEl.className = 'ip-toast-ok';
                        toastEl.style.display = 'block';
                        setTimeout(function () { toastEl.style.display = 'none'; }, 3000);
                    }
                })
                .catch(function (err) {
                    if (toastEl) {
                        toastEl.textContent = t('toast_err_settings', err.message || err);
                        toastEl.className = 'ip-toast-err';
                        toastEl.style.display = 'block';
                        setTimeout(function () { toastEl.style.display = 'none'; }, 4000);
                    }
                })
                .finally(function () { saveBtn.disabled = false; });
        });

        // Section Maintenance (v3.8.7.0)
        initMaintenanceSection(page);
    }

    /**
     * Section « Maintenance » du panneau Paramètres (v3.8.7.0).
     * Rend 4 boutons d'action — chacun affiche une confirmation native avant exécution :
     *   1) Vider les accusés de lecture   → POST /admin/clear-seen
     *   2) Vider toutes les réponses      → POST /admin/clear-replies
     *   3) Purger les messages supprimés  → POST /admin/purge-deleted
     *   4) Réinitialiser les paramètres   → POST /admin/reset-settings (recharge la section)
     */
    function initMaintenanceSection(page) {
        var container = page.querySelector('#ip-maint-actions');
        var hint      = page.querySelector('#ip-maint-hint');
        var title     = page.querySelector('#ip-maint-title');
        var toastEl   = page.querySelector('#ip-maint-toast');
        if (!container) return;
        if (title) title.textContent = t('maint_title');
        if (hint)  hint.textContent  = t('maint_hint');

        var actions = [
            { key: 'clear_seen',     endpoint: '/InfoPopup/admin/clear-seen',     danger: false,
              resultKey: 'cleared',  okKey: 'maint_clear_seen_ok' },
            { key: 'clear_replies',  endpoint: '/InfoPopup/admin/clear-replies',  danger: false,
              resultKey: 'cleared',  okKey: 'maint_clear_replies_ok' },
            { key: 'purge_deleted',  endpoint: '/InfoPopup/admin/purge-deleted',  danger: true,
              resultKey: 'messagesDeleted', okKey: 'maint_purge_deleted_ok' },
            { key: 'reset_settings', endpoint: '/InfoPopup/admin/reset-settings', danger: true,
              isReset: true, okKey: 'maint_reset_settings_ok' }
        ];

        function showMaintToast(msg, isErr) {
            if (!toastEl) return;
            toastEl.textContent = msg;
            toastEl.className = isErr ? 'ip-toast-err' : 'ip-toast-ok';
            toastEl.style.display = 'block';
            setTimeout(function () { toastEl.style.display = 'none'; }, 4000);
        }

        container.innerHTML = '';
        actions.forEach(function (act) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:flex-start;gap:12px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;';

            var info = document.createElement('div');
            info.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:4px;';
            var lblTitle = document.createElement('div');
            lblTitle.style.fontWeight = '500';
            lblTitle.textContent = t('maint_' + act.key + '_label');
            var lblDesc = document.createElement('div');
            lblDesc.style.cssText = 'opacity:.6;font-size:.82rem;';
            lblDesc.textContent = t('maint_' + act.key + '_desc');
            info.appendChild(lblTitle);
            info.appendChild(lblDesc);

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = act.danger
                ? 'raised emby-button button-delete'
                : 'raised emby-button';
            btn.style.cssText = 'flex-shrink:0;align-self:center;';
            btn.textContent = t('maint_' + act.key + '_btn');

            btn.addEventListener('click', function () {
                admin.showConfirm(t('maint_' + act.key + '_confirm')).then(function (ok) {
                    if (!ok) return;
                    btn.disabled = true;
                    apiFetch(act.endpoint, { method: 'POST' })
                        .then(function (res) {
                            if (!res.ok) throw new Error('HTTP ' + res.status);
                            return res.json();
                        })
                        .then(function (data) {
                            if (act.isReset) {
                                showMaintToast(t(act.okKey), false);
                                // Recharger les champs uniquement (pas re-bind handlers).
                                reloadSettingsValues(page);
                            } else {
                                var n = data[act.resultKey] || 0;
                                showMaintToast(t(act.okKey, n), false);
                            }
                        })
                        .catch(function (err) {
                            showMaintToast(t('maint_err', err.message || err), true);
                        })
                        .finally(function () { btn.disabled = false; });
                });
            });

            row.appendChild(info);
            row.appendChild(btn);
            container.appendChild(row);
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Onglet Réponses (admin)
    // ════════════════════════════════════════════════════════════════════════

    function loadReplies(page) {
        var listEl = page.querySelector('#ip-replies-list');
        var disabledMsg = page.querySelector('#ip-replies-disabled-msg');
        if (!listEl) return;

        // Vérifier si les réponses sont activées
        apiFetch('/InfoPopup/client-settings')
            .then(function (res) { return res.json(); })
            .then(function (cfg) {
                var allowReplies = cfg.allowReplies !== undefined ? cfg.allowReplies : (cfg.AllowReplies || false);
                if (disabledMsg) disabledMsg.style.display = allowReplies ? 'none' : '';
                if (!allowReplies) { listEl.innerHTML = ''; return; }

                listEl.innerHTML = '<div style="opacity:.6">' + escHtml(t('replies_loading')) + '</div>';
                apiFetch('/InfoPopup/replies')
                    .then(function (res2) { return res2.json(); })
                    .then(function (groups) {
                        if (!groups || !groups.length) {
                            listEl.innerHTML = '<div style="opacity:.65;font-style:italic;padding:20px 0">' + escHtml(t('replies_empty')) + '</div>';
                            return;
                        }
                        listEl.innerHTML = '';

                        // ── Filtre par message ────────────────────────────────
                        var filterWrap = document.createElement('div');
                        filterWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:16px;';
                        var filterLbl = document.createElement('label');
                        filterLbl.textContent = t('replies_filter_lbl');
                        filterLbl.style.cssText = 'font-size:.88rem;opacity:.7;';
                        var filterSel = document.createElement('select');
                        var optAll = document.createElement('option');
                        optAll.value = '';
                        optAll.textContent = '— ' + t('tbl_badge_all') + ' —';
                        filterSel.appendChild(optAll);
                        groups.forEach(function (g) {
                            var opt = document.createElement('option');
                            opt.value = g.messageId || g.MessageId || '';
                            opt.textContent = g.messageTitle || g.MessageTitle || opt.value;
                            filterSel.appendChild(opt);
                        });
                        filterWrap.appendChild(filterLbl);
                        filterWrap.appendChild(filterSel);
                        if (admin.enhanceSelect) admin.enhanceSelect(filterSel);
                        listEl.appendChild(filterWrap);

                        var groupsContainer = document.createElement('div');
                        listEl.appendChild(groupsContainer);

                        function renderGroups(filterMsgId) {
                            groupsContainer.innerHTML = '';
                            groups.forEach(function (group) {
                                var messageId    = group.messageId    || group.MessageId    || '';
                                var messageTitle = group.messageTitle || group.MessageTitle || messageId;
                                var replies      = group.replies      || group.Replies      || [];

                                if (filterMsgId && messageId !== filterMsgId) return;

                                var count = replies.length;
                                var groupDiv = document.createElement('div');
                                groupDiv.className = 'ip-replies-group';

                                var header = document.createElement('div');
                                header.className = 'ip-replies-group-header';
                                header.innerHTML =
                                    '<span>' + escHtml(messageTitle) + ' <span style="opacity:.5;font-size:.82rem;font-weight:400">(' + count + ')</span></span>' +
                                    '<button class="ip-replies-del-all" data-msgid="' + escHtml(messageId) + '" type="button">' + escHtml(t('replies_delete_all')) + '</button>';
                                groupDiv.appendChild(header);

                                header.querySelector('.ip-replies-del-all').addEventListener('click', function () {
                                    var mid = this.getAttribute('data-msgid');
                                    apiFetch('/InfoPopup/messages/' + encodeURIComponent(mid) + '/replies/delete', { method: 'POST' })
                                        .then(function () { loadReplies(page); })
                                        .catch(function (err) { admin.showToast(page, t('toast_err_reply_delete', err.message || err), true); });
                                });

                                replies.forEach(function (r) {
                                    var replyId  = r.id       || r.Id       || '';
                                    var userName = r.userName || r.UserName || r.userId || r.UserId || '';
                                    var body     = r.body     || r.Body     || '';
                                    var date     = formatDate(r.repliedAt || r.RepliedAt || '');

                                    var row = document.createElement('div');
                                    row.className = 'ip-reply-row';
                                    row.innerHTML =
                                        '<div>' +
                                            '<div class="ip-reply-row-meta">' + escHtml(userName) + ' — ' + escHtml(date) + '</div>' +
                                            '<div class="ip-reply-row-body">' + escHtml(body) + '</div>' +
                                        '</div>' +
                                        '<button class="ip-reply-del-btn" data-replyid="' + escHtml(replyId) + '" type="button">' + escHtml(t('replies_delete_one')) + '</button>';

                                    row.querySelector('.ip-reply-del-btn').addEventListener('click', function () {
                                        var rid = this.getAttribute('data-replyid');
                                        apiFetch('/InfoPopup/replies/' + encodeURIComponent(rid), { method: 'DELETE' })
                                            .then(function () { loadReplies(page); })
                                            .catch(function (err) { admin.showToast(page, t('toast_err_reply_delete', err.message || err), true); });
                                    });

                                    groupDiv.appendChild(row);
                                });

                                groupsContainer.appendChild(groupDiv);
                            });
                        }

                        renderGroups('');

                        filterSel.addEventListener('change', function () {
                            renderGroups(filterSel.value);
                        });

                    }).catch(function (err) {
                        listEl.innerHTML = '<div style="color:#f66">' + escHtml(t('toast_err_reply_delete', err.message || err)) + '</div>';
                    });
            }).catch(function () {
                if (disabledMsg) disabledMsg.style.display = '';
            });
    }

    // ── Exposition ───────────────────────────────────────────────────────────
    admin.reloadSettingsValues = reloadSettingsValues;
    admin.initSettingsTab = initSettingsTab;
    admin.loadReplies = loadReplies;

}(window.__IP = window.__IP || {}));
