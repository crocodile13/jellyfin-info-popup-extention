/**
 * jellyfin-info-popup-extention — ip-admin-messages.js
 * ----------------------------------------------------
 * Sous-module onglet « Messages » : tableau d'historique, CRUD (publish/edit/
 * delete), mode édition, modal « Lectures » (qui a vu / pas vu).
 * v4.2.0.0 — extrait de ip-admin.js.
 *
 * Dépendances : ip-i18n.js, ip-utils.js (apiFetch, escHtml, renderBody, formatDate),
 *               ip-admin.js (admin.showToast, admin.showConfirm, admin.updateSelectionUI),
 *               ip-admin-editor.js (admin.syncTextareaToWysiwyg, admin.setEditorMode,
 *                                   admin.updateCharCount),
 *               ip-admin-targets.js (admin.resolveUserNames, admin.getSelectedTargetIds,
 *                                    admin.resetTargetPicker, admin.setTargetPickerIds)
 * Exposition  : ns.__admin.{loadMessages, publishMessage, deleteSelected,
 *                           enterEditMode, exitEditMode, openViewsModal, updateSelectionUI}
 */
(function (ns) {
    'use strict';
    var admin = ns.__admin = ns.__admin || {};

    var t = function () { return ns.t.apply(ns, arguments); };
    var apiFetch = function (p, o) { return ns.apiFetch(p, o); };
    var escHtml = function (s) { return ns.escHtml(s); };
    var renderBody = function (r) { return ns.renderBody(r); };
    var formatDate = function (d) { return ns.formatDate(d); };

    // ════════════════════════════════════════════════════════════════════════
    // Helpers UI propres au tableau
    // ════════════════════════════════════════════════════════════════════════

    function updateSelectionUI(page, selectedIds) {
        var deleteBtn = page.querySelector('#ip-delete-btn');
        var countEl   = page.querySelector('#ip-sel-count');
        var selAll    = page.querySelector('#ip-select-all');
        var boxes     = page.querySelectorAll('.ip-row-check');
        var count     = selectedIds.size;
        if (deleteBtn) deleteBtn.disabled = count === 0;
        if (countEl) {
            countEl.textContent = count === 0 ? '' :
                t(count > 1 ? 'sel_count_plural' : 'sel_count_singular', count);
        }
        if (!boxes.length || count === 0) {
            if (selAll) { selAll.checked = false; selAll.indeterminate = false; }
        } else if (count === boxes.length) {
            if (selAll) { selAll.checked = true;  selAll.indeterminate = false; }
        } else {
            if (selAll) { selAll.checked = false; selAll.indeterminate = true; }
        }
    }

    function renderUserList(users) {
        var ul = document.createElement('ul');
        ul.className = 'ip-views-user-list';
        users.forEach(function (u) {
            var name = u.userName || u.UserName || u.userId || u.UserId || '';
            var isAdmin = u.isAdmin !== undefined ? u.isAdmin : (u.IsAdmin || false);
            var li = document.createElement('li');
            li.className = 'ip-views-user';
            li.textContent = name;
            if (isAdmin) {
                var badge = document.createElement('span');
                badge.className = 'ip-role-badge ip-role-badge-admin';
                badge.textContent = t('role_admin');
                li.appendChild(badge);
            }
            ul.appendChild(li);
        });
        return ul;
    }

    /**
     * Modal « Lectures — {titre} » : deux listes (vu / pas vu) servies par
     * GET /InfoPopup/messages/{id}/views (admin uniquement). v3.8.6.0.
     */
    function openViewsModal(messageId, messageTitle) {
        ns.injectStyles();
        var backdrop = document.createElement('div');
        backdrop.className = 'ip-views-backdrop';
        var box = document.createElement('div');
        box.className = 'ip-views-box';

        var close = function () { backdrop.remove(); document.removeEventListener('keydown', onKey); };
        var onKey = function (e) { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);

        box.innerHTML =
            '<div class="ip-views-header">' +
                '<h4 class="ip-views-title">' + escHtml(t('views_modal_title', messageTitle)) + '</h4>' +
                '<button type="button" class="ip-views-close" aria-label="' + escHtml(t('views_close')) + '">×</button>' +
            '</div>' +
            '<div class="ip-views-body"><p style="opacity:.55">' + escHtml(t('views_loading')) + '</p></div>';
        backdrop.appendChild(box);
        document.body.appendChild(backdrop);

        box.querySelector('.ip-views-close').addEventListener('click', close);
        backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });

        var bodyEl = box.querySelector('.ip-views-body');
        apiFetch('/InfoPopup/messages/' + encodeURIComponent(messageId) + '/views')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var seenUsers   = data.seenUsers   || data.SeenUsers   || [];
                var unseenUsers = data.unseenUsers || data.UnseenUsers || [];
                var targetsAll  = data.targetsAllUsers !== undefined ? data.targetsAllUsers
                                : (data.TargetsAllUsers !== undefined ? data.TargetsAllUsers : false);
                var total = seenUsers.length + unseenUsers.length;

                bodyEl.innerHTML = '';

                if (targetsAll) {
                    var allLbl = document.createElement('div');
                    allLbl.className = 'ip-views-targets-all';
                    allLbl.textContent = t('views_targets_all');
                    bodyEl.appendChild(allLbl);
                }

                var seenH = document.createElement('h5');
                seenH.className = 'ip-views-section-h ip-views-section-seen';
                seenH.textContent = t('views_seen_label', seenUsers.length, total);
                bodyEl.appendChild(seenH);
                if (!seenUsers.length) {
                    var emptyS = document.createElement('p');
                    emptyS.className = 'ip-views-empty';
                    emptyS.textContent = t('views_empty_seen');
                    bodyEl.appendChild(emptyS);
                } else {
                    bodyEl.appendChild(renderUserList(seenUsers));
                }

                var unseenH = document.createElement('h5');
                unseenH.className = 'ip-views-section-h ip-views-section-unseen';
                unseenH.textContent = t('views_unseen_label', unseenUsers.length);
                bodyEl.appendChild(unseenH);
                if (!unseenUsers.length) {
                    var emptyU = document.createElement('p');
                    emptyU.className = 'ip-views-empty';
                    emptyU.textContent = t('views_empty_unseen');
                    bodyEl.appendChild(emptyU);
                } else {
                    bodyEl.appendChild(renderUserList(unseenUsers));
                }
            })
            .catch(function () {
                bodyEl.innerHTML = '<p style="color:#cf6679">' + escHtml(t('views_err')) + '</p>';
            });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Tableau de messages
    // ════════════════════════════════════════════════════════════════════════

    function renderMessages(page, messages, selectedIds, onEdit) {
        var container = page.querySelector('#ip-msg-container');
        var empty     = page.querySelector('#ip-empty');
        selectedIds.clear();
        updateSelectionUI(page, selectedIds);
        if (!messages || !messages.length) {
            container.innerHTML = '';
            if (empty) { container.appendChild(empty); empty.style.display = 'block'; }
            return;
        }
        if (empty) empty.style.display = 'none';
        var table = document.createElement('table');
        table.className = 'ip-table';
        table.innerHTML =
            '<thead><tr>' +
            '<th class="ip-col-check"></th>' +
            '<th>' + escHtml(t('tbl_col_title')) +
            ' <span style="opacity:.45;font-size:.8rem;font-weight:400">' + escHtml(t('tbl_col_title_hint')) + '</span></th>' +
            '<th class="ip-col-target">' + escHtml(t('tbl_col_recipients')) + '</th>' +
            '<th class="ip-col-date">' + escHtml(t('tbl_col_date')) + '</th>' +
            '<th class="ip-col-views">' + escHtml(t('tbl_col_views')) + '</th>' +
            '<th class="ip-col-actions"></th>' +
            '</tr></thead>' +
            '<tbody id="ip-tbody"></tbody>';
        var tbody = table.querySelector('#ip-tbody');

        messages.forEach(function (msg) {
            // Jellyfin peut sérialiser en PascalCase ou camelCase selon la version
            var id            = msg.id            || msg.Id            || '';
            var title         = msg.title         || msg.Title         || '';
            var publishedAt   = msg.publishedAt   || msg.PublishedAt   || '';
            var targetUserIds = msg.targetUserIds || msg.TargetUserIds || [];
            var isDeleted     = msg.isDeleted     || msg.IsDeleted     || false;
            var editCount     = msg.editHistoryCount || msg.EditHistoryCount || 0;
            // v3.8.6.0 : compteurs « accusés de lecture » servis par le backend pour l'admin.
            var seenCount     = msg.seenCount      !== undefined ? msg.seenCount
                              : (msg.SeenCount     !== undefined ? msg.SeenCount : null);
            var targetedCount = msg.targetedCount  !== undefined ? msg.targetedCount
                              : (msg.TargetedCount !== undefined ? msg.TargetedCount : null);

            var tr = document.createElement('tr');
            tr.dataset.id = id;
            var sender = msg.sentByUserName || msg.SentByUserName || '';
            tr.dataset.search = ((title + ' ' + sender) || '').toLowerCase();
            if (isDeleted) tr.classList.add('ip-msg-deleted');

            var targetBadge = targetUserIds.length === 0
                ? '<span class="ip-badge ip-badge-all">' + escHtml(t('tbl_badge_all')) + '</span>'
                : '<span class="ip-badge ip-badge-partial" title="' + escHtml(admin.resolveUserNames(targetUserIds)) + '">' +
                  targetUserIds.length + ' ' +
                  escHtml(t(targetUserIds.length > 1 ? 'tbl_user_plural' : 'tbl_user_singular')) + '</span>';

            var titleBadges = '';
            if (isDeleted) {
                titleBadges += '<span class="ip-msg-deleted-badge">' + escHtml(t('msg_deleted_label')) + '</span>';
            }
            if (editCount > 0) {
                titleBadges += '<span class="ip-msg-edited-badge">' + escHtml(t('msg_edited_label', editCount)) + '</span>';
            }

            // Badge « vues » : « X/Y » cliquable. Caché si compteurs absents (compat backend).
            var viewsCell = '';
            if (seenCount !== null && targetedCount !== null) {
                var pct = targetedCount > 0 ? Math.round((seenCount / targetedCount) * 100) : 0;
                var viewsTitle = t('views_badge_tip', seenCount, targetedCount);
                var viewsCls = pct >= 100 ? 'ip-views-badge ip-views-badge-full'
                             : pct >= 50  ? 'ip-views-badge ip-views-badge-mid'
                             : 'ip-views-badge';
                viewsCell =
                    '<button type="button" class="' + viewsCls + '" data-views-id="' + escHtml(id) +
                    '" title="' + escHtml(viewsTitle) + '">' +
                    escHtml(seenCount + '/' + targetedCount) +
                    '</button>';
            } else {
                viewsCell = '<span style="opacity:.4">—</span>';
            }

            tr.innerHTML =
                '<td class="ip-col-check">' +
                '<input type="checkbox" class="ip-row-check" data-id="' + escHtml(id) +
                '" style="width:16px;height:16px;cursor:pointer;accent-color:var(--theme-accent-color,#00a4dc);"/>' +
                '</td>' +
                '<td class="ip-col-title ip-col-title-toggle">' +
                '<span class="ip-row-title-text">' + escHtml(title) + '</span>' +
                titleBadges +
                '<span class="ip-row-chev">▶</span>' +
                '</td>' +
                '<td class="ip-col-target">' + targetBadge + '</td>' +
                '<td class="ip-col-date">' + escHtml(formatDate(publishedAt)) + '</td>' +
                '<td class="ip-col-views">' + viewsCell + '</td>' +
                '<td class="ip-col-actions">' +
                '<button class="ip-edit-btn" title="' + escHtml(t('tbl_edit_title')) + '">' +
                escHtml(t('tbl_edit_btn')) + '</button>' +
                '</td>';

            var expandTr = document.createElement('tr');
            expandTr.className = 'ip-row-expand';
            var expandTd = document.createElement('td');
            expandTd.colSpan = 6;
            expandTd.className = 'ip-row-expand-td';
            expandTd.textContent = t('tbl_loading');
            expandTr.appendChild(expandTd);

            var isOpen     = false;
            var bodyLoaded = false;
            var msgBody    = null;

            tr.querySelector('.ip-col-title-toggle').addEventListener('click', function () {
                isOpen = !isOpen;
                expandTr.classList.toggle('visible', isOpen);
                tr.querySelector('.ip-row-chev').classList.toggle('open', isOpen);
                if (isOpen && !bodyLoaded) {
                    bodyLoaded = true;
                    apiFetch('/InfoPopup/messages/' + encodeURIComponent(id))
                        .then(function (res) { return res.json(); })
                        .then(function (data) {
                            msgBody = data.body || data.Body || '';
                            expandTd.innerHTML = renderBody(msgBody);
                        })
                        .catch(function () {
                            expandTd.textContent = t('tbl_load_err');
                        });
                }
            });

            tr.querySelector('.ip-edit-btn').addEventListener('click', function (e) {
                e.stopPropagation();
                if (msgBody !== null) {
                    onEdit({ id: id, title: title, body: msgBody, targetUserIds: targetUserIds });
                } else {
                    apiFetch('/InfoPopup/messages/' + encodeURIComponent(id))
                        .then(function (res) { return res.json(); })
                        .then(function (data) {
                            msgBody = data.body || data.Body || '';
                            onEdit({ id: id, title: title, body: msgBody, targetUserIds: targetUserIds });
                        });
                }
            });

            tr.querySelector('.ip-row-check').addEventListener('change', function (e) {
                if (e.target.checked) selectedIds.add(id);
                else selectedIds.delete(id);
                updateSelectionUI(page, selectedIds);
            });

            // Badge « vues » → ouvre la modal détaillée (v3.8.6.0)
            var viewsBtn = tr.querySelector('[data-views-id]');
            if (viewsBtn) {
                viewsBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    openViewsModal(id, title);
                });
            }

            tbody.appendChild(tr);
            tbody.appendChild(expandTr);
        });

        container.innerHTML = '';
        container.appendChild(table);
    }

    function loadMessages(page, selectedIds, onEdit) {
        return apiFetch('/InfoPopup/messages')
            .then(function (res) { return res.json(); })
            .then(function (msgs) { renderMessages(page, msgs, selectedIds, onEdit || function () {}); })
            .catch(function (err) {
                admin.showToast(page, t('toast_err_load', err.message), true);
            });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Actions CRUD
    // ════════════════════════════════════════════════════════════════════════

    function publishMessage(page, selectedIds, editState) {
        var titleEl  = page.querySelector('#ip-title');
        var bodyEl   = page.querySelector('#ip-body');
        var titleErr = page.querySelector('#ip-title-err');
        var bodyErr  = page.querySelector('#ip-body-err');
        if (titleErr) titleErr.style.display = 'none';
        if (bodyErr)  bodyErr.style.display  = 'none';

        var title = titleEl ? titleEl.value.trim() : '';
        var body  = bodyEl  ? bodyEl.value         : '';
        var valid = true;

        var TITLE_MAX = 200;
        var BODY_MAX  = 10000;

        if (!title) {
            if (titleErr) { titleErr.textContent = t('val_title_required'); titleErr.style.display = 'block'; }
            valid = false;
        } else if (title.length > TITLE_MAX) {
            if (titleErr) { titleErr.textContent = t('val_title_too_long', TITLE_MAX); titleErr.style.display = 'block'; }
            valid = false;
        }
        if (!body.trim()) {
            if (bodyErr) { bodyErr.textContent = t('val_body_required'); bodyErr.style.display = 'block'; }
            valid = false;
        } else if (body.length > BODY_MAX) {
            if (bodyErr) { bodyErr.textContent = t('val_body_too_long', BODY_MAX); bodyErr.style.display = 'block'; }
            valid = false;
        }
        if (!valid) return;

        var btn = page.querySelector('#ip-publish-btn');
        if (btn) btn.disabled = true;

        var targetIds = admin.getSelectedTargetIds(page);

        if (editState.id) {
            // ── Mode édition : PUT ──────────────────────────────────────────
            apiFetch('/InfoPopup/messages/' + encodeURIComponent(editState.id), {
                method: 'PUT',
                body: JSON.stringify({ title: title, body: body, targetUserIds: targetIds })
            })
            .then(function () {
                admin.showToast(page, t('toast_updated'));
                editState.id = null;
                exitEditMode(page);
                return loadMessages(page, selectedIds, editState.onEdit);
            })
            .catch(function (err) {
                // v4.0.3.0 : 404 = message supprimé entre-temps (autre admin, rétention auto…).
                // On sort du mode édition pour ne pas bloquer l'UI sur un fantôme.
                var msg = err && err.message ? err.message : '';
                if (msg.indexOf('HTTP 404') !== -1) {
                    admin.showToast(page, t('toast_err_update', msg), true);
                    editState.id = null;
                    exitEditMode(page);
                    loadMessages(page, selectedIds, editState.onEdit);
                } else {
                    admin.showToast(page, t('toast_err_update', msg), true);
                }
            })
            .finally(function () { if (btn) btn.disabled = false; });
        } else {
            // ── Nouveau message : POST ──────────────────────────────────────
            apiFetch('/InfoPopup/messages', {
                method: 'POST',
                body: JSON.stringify({ title: title, body: body, targetUserIds: targetIds })
            })
            .then(function () {
                if (titleEl) titleEl.value = '';
                if (bodyEl)  bodyEl.value  = '';
                var wysiwygEl = page.querySelector('#ip-body-wysiwyg');
                if (wysiwygEl) wysiwygEl.innerHTML = '';
                admin.resetTargetPicker(page);
                admin.showToast(page, t('toast_published'));
                // Retour en mode WYSIWYG après publication
                admin.setEditorMode(page, false);
                admin.updateCharCount(page);
                return loadMessages(page, selectedIds, editState.onEdit);
            })
            .catch(function (err) {
                admin.showToast(page, t('toast_err_publish', err.message), true);
            })
            .finally(function () { if (btn) btn.disabled = false; });
        }
    }

    function deleteSelected(page, selectedIds, editState) {
        if (!selectedIds.size) return;
        var count = selectedIds.size;
        var confirmMsg = t(count > 1 ? 'confirm_delete_p' : 'confirm_delete_s', count);
        admin.showConfirm(confirmMsg).then(function (confirmed) {
            if (!confirmed) return;
            var btn = page.querySelector('#ip-delete-btn');
            if (btn) btn.disabled = true;
            var ids = Array.from(selectedIds);
            // v4.0.3.0 : si le message en cours d'édition fait partie de la suppression,
            // on annule l'édition AVANT le POST — sinon le formulaire reste rempli avec
            // les données d'un message fantôme et un futur clic « Enregistrer » fait
            // un PUT 404 silencieux.
            var editedDeleted = editState && editState.id && ids.indexOf(editState.id) !== -1;
            apiFetch('/InfoPopup/messages/delete', {
                method: 'POST',
                body: JSON.stringify({ ids: ids })
            })
            .then(function () {
                admin.showToast(page, t(count > 1 ? 'toast_deleted_p' : 'toast_deleted_s', count));
                if (editedDeleted) {
                    editState.id = null;
                    exitEditMode(page);
                }
                selectedIds.clear();
                return loadMessages(page, selectedIds, editState ? editState.onEdit : null);
            })
            .catch(function (err) {
                admin.showToast(page, t('toast_err_delete', err.message), true);
                if (btn) btn.disabled = false;
            });
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Modes édition
    // ════════════════════════════════════════════════════════════════════════

    function enterEditMode(page, msg, editState) {
        editState.id = msg.id;
        var titleEl = page.querySelector('#ip-title');
        var bodyEl  = page.querySelector('#ip-body');
        if (titleEl) titleEl.value = msg.title;
        if (bodyEl)  bodyEl.value  = msg.body;
        // Synchroniser vers WYSIWYG et passer en mode WYSIWYG
        admin.syncTextareaToWysiwyg(page);
        admin.setEditorMode(page, false);
        // Restaurer le ciblage du message en cours d'édition
        admin.setTargetPickerIds(page, msg.targetUserIds || []);
        var publishBtn   = page.querySelector('#ip-publish-btn');
        var cancelBtn    = page.querySelector('#ip-cancel-edit-btn');
        var sectionTitle = page.querySelector('#ip-form-section-title');
        if (publishBtn)   publishBtn.textContent = t('cfg_update');
        if (cancelBtn)    cancelBtn.style.display = 'inline-flex';
        if (sectionTitle) sectionTitle.textContent = t('cfg_edit_message');
        page.querySelector('.detailSection').scrollIntoView({ behavior: 'smooth' });
        if (titleEl) titleEl.focus();
    }

    function exitEditMode(page) {
        var titleEl  = page.querySelector('#ip-title');
        var bodyEl   = page.querySelector('#ip-body');
        var wysiwyg  = page.querySelector('#ip-body-wysiwyg');
        if (titleEl) titleEl.value = '';
        if (bodyEl)  bodyEl.value  = '';
        if (wysiwyg) wysiwyg.innerHTML = '';
        // Rester en mode WYSIWYG
        admin.setEditorMode(page, false);
        admin.resetTargetPicker(page);
        var publishBtn   = page.querySelector('#ip-publish-btn');
        var cancelBtn    = page.querySelector('#ip-cancel-edit-btn');
        var sectionTitle = page.querySelector('#ip-form-section-title');
        if (publishBtn)   publishBtn.textContent = t('cfg_publish');
        if (cancelBtn)    cancelBtn.style.display = 'none';
        if (sectionTitle) sectionTitle.textContent = t('cfg_new_message');
    }

    // ── Exposition ───────────────────────────────────────────────────────────
    admin.updateSelectionUI = updateSelectionUI;
    admin.openViewsModal = openViewsModal;
    admin.renderUserList = renderUserList;
    admin.renderMessages = renderMessages;
    admin.loadMessages = loadMessages;
    admin.publishMessage = publishMessage;
    admin.deleteSelected = deleteSelected;
    admin.enterEditMode = enterEditMode;
    admin.exitEditMode = exitEditMode;

}(window.__IP = window.__IP || {}));
