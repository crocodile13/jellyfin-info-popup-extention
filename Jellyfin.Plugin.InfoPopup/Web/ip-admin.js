/**
 * jellyfin-info-popup-extention — ip-admin.js
 * --------------------------------------------
 * Module de la page de configuration administrateur.
 * Gère le formulaire, le tableau de messages, la toolbar de formatage
 * et le sélecteur de ciblage utilisateurs.
 *
 * Comportement de l'éditeur :
 *   - Le textarea est TOUJOURS visible pour la saisie directe.
 *   - Le panneau d'aperçu formaté est optionnel (toggle "Aperçu").
 *   - Aucun changement de mode automatique à la frappe ou via la toolbar.
 *
 * Dépendances : ip-i18n.js, ip-utils.js, ip-styles.js
 * Exposition   : window.__IP.initConfigPage(page)
 *                window.__IP.checkConfigPage()
 */
(function (ns) {
    'use strict';

    var t           = function () { return ns.t.apply(ns, arguments); };
    var apiFetch    = function (p, o) { return ns.apiFetch(p, o); };
    var escHtml     = function (s) { return ns.escHtml(s); };
    var renderBody  = function (r) { return ns.renderBody(r); };
    var formatDate  = function (d) { return ns.formatDate(d); };

    // ── État du cache utilisateurs ───────────────────────────────────────────
    // Partagé au niveau module (singleton par session de page).

    var usersCache   = null; // null = non chargé, [] = chargé mais vide
    var usersCacheAt = 0;    // timestamp du dernier chargement (TTL 5 min)
    var toastTimer   = null;

    // ════════════════════════════════════════════════════════════════════════
    // Helpers UI
    // ════════════════════════════════════════════════════════════════════════

    function showToast(page, msg, isErr) {
        var el = page.querySelector('#ip-toast');
        if (!el) return;
        el.textContent = msg;
        el.className = isErr ? 'ip-toast-err' : 'ip-toast-ok';
        el.style.display = 'block';
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('role', 'status');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
    }

    function showConfirm(msg) {
        ns.injectStyles();
        return new Promise(function (resolve) {
            var backdrop = document.createElement('div');
            backdrop.className = 'ip-confirm-backdrop';
            var box = document.createElement('div');
            box.className = 'ip-confirm-box';
            box.innerHTML =
                '<h4>' + escHtml(t('confirm_title')) + '</h4>' +
                '<p>' + escHtml(msg).replace(/\n/g, '<br/>') + '</p>' +
                '<div class="ip-confirm-actions">' +
                '<button class="ip-btn-cancel" id="ip-c-cancel">' + escHtml(t('confirm_cancel')) + '</button>' +
                '<button class="raised button-delete emby-button" id="ip-c-ok">' + escHtml(t('confirm_ok')) + '</button>' +
                '</div>';
            backdrop.appendChild(box);
            document.body.appendChild(backdrop);
            box.querySelector('#ip-c-ok').addEventListener('click', function () {
                backdrop.remove(); resolve(true);
            });
            box.querySelector('#ip-c-cancel').addEventListener('click', function () {
                backdrop.remove(); resolve(false);
            });
        });
    }

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

    function resolveUserNames(ids) {
        if (!usersCache || !ids || !ids.length) return ids.join(', ');
        return ids.map(function (id) {
            var u = usersCache.filter(function (x) { return x.id === id; })[0];
            return u ? u.name : id.slice(0, 8) + t('target_unknown');
        }).join(', ');
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

            var tr = document.createElement('tr');
            tr.dataset.id = id;

            var targetBadge = targetUserIds.length === 0
                ? '<span class="ip-badge ip-badge-all">' + escHtml(t('tbl_badge_all')) + '</span>'
                : '<span class="ip-badge ip-badge-partial" title="' + escHtml(resolveUserNames(targetUserIds)) + '">' +
                  targetUserIds.length + '\u00a0' +
                  escHtml(t(targetUserIds.length > 1 ? 'tbl_user_plural' : 'tbl_user_singular')) + '</span>';

            tr.innerHTML =
                '<td class="ip-col-check">' +
                '<input type="checkbox" class="ip-row-check" data-id="' + escHtml(id) +
                '" style="width:16px;height:16px;cursor:pointer;accent-color:var(--theme-accent-color,#00a4dc);"/>' +
                '</td>' +
                '<td class="ip-col-title ip-col-title-toggle">' +
                '<span class="ip-row-title-text">' + escHtml(title) + '</span>' +
                '<span class="ip-row-chev">\u25b6</span>' +
                '</td>' +
                '<td class="ip-col-target">' + targetBadge + '</td>' +
                '<td class="ip-col-date">' + escHtml(formatDate(publishedAt)) + '</td>' +
                '<td class="ip-col-actions">' +
                '<button class="ip-edit-btn" title="' + escHtml(t('tbl_edit_title')) + '">' +
                escHtml(t('tbl_edit_btn')) + '</button>' +
                '</td>';

            var expandTr = document.createElement('tr');
            expandTr.className = 'ip-row-expand';
            var expandTd = document.createElement('td');
            expandTd.colSpan = 5;
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
                showToast(page, t('toast_err_load', err.message), true);
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

        if (!title) {
            if (titleErr) { titleErr.textContent = t('val_title_required'); titleErr.style.display = 'block'; }
            valid = false;
        }
        if (!body.trim()) {
            if (bodyErr) { bodyErr.textContent = t('val_body_required'); bodyErr.style.display = 'block'; }
            valid = false;
        }
        if (!valid) return;

        var btn = page.querySelector('#ip-publish-btn');
        if (btn) btn.disabled = true;

        // targetIds déclaré une seule fois avant le if/else (évite le double var dans le même scope)
        var targetIds = getSelectedTargetIds(page);

        if (editState.id) {
            // ── Mode édition : PUT ──────────────────────────────────────────
            apiFetch('/InfoPopup/messages/' + encodeURIComponent(editState.id), {
                method: 'PUT',
                body: JSON.stringify({ title: title, body: body, targetUserIds: targetIds })
            })
            .then(function () {
                showToast(page, t('toast_updated'));
                editState.id = null;
                exitEditMode(page);
                return loadMessages(page, selectedIds, editState.onEdit);
            })
            .catch(function (err) {
                showToast(page, t('toast_err_update', err.message), true);
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
                resetTargetPicker(page);
                showToast(page, t('toast_published'));
                // Retour en aperçu après publication
                setPreviewMode(page, true);
                return loadMessages(page, selectedIds, editState.onEdit);
            })
            .catch(function (err) {
                showToast(page, t('toast_err_publish', err.message), true);
            })
            .finally(function () { if (btn) btn.disabled = false; });
        }
    }

    function deleteSelected(page, selectedIds, editState) {
        if (!selectedIds.size) return;
        var count = selectedIds.size;
        var confirmMsg = t(count > 1 ? 'confirm_delete_p' : 'confirm_delete_s', count);
        showConfirm(confirmMsg).then(function (confirmed) {
            if (!confirmed) return;
            var btn = page.querySelector('#ip-delete-btn');
            if (btn) btn.disabled = true;
            var ids = Array.from(selectedIds);
            apiFetch('/InfoPopup/messages/delete', {
                method: 'POST',
                body: JSON.stringify({ ids: ids })
            })
            .then(function () {
                showToast(page, t(count > 1 ? 'toast_deleted_p' : 'toast_deleted_s', count));
                selectedIds.clear();
                return loadMessages(page, selectedIds, editState ? editState.onEdit : null);
            })
            .catch(function (err) {
                showToast(page, t('toast_err_delete', err.message), true);
                if (btn) btn.disabled = false;
            });
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Ciblage utilisateurs
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Charge la liste des utilisateurs Jellyfin avec un TTL de 5 minutes.
     * Permet de voir les utilisateurs créés pendant la session sans recharger.
     */
    function fetchUsers() {
        var now = Date.now();
        if (usersCache !== null && now - usersCacheAt < 5 * 60 * 1000) {
            return Promise.resolve(usersCache);
        }
        return apiFetch('/Users')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var list = Array.isArray(data) ? data : (data.Items || []);
                usersCache = list.map(function (u) {
                    return { id: u.Id || u.id || '', name: u.Name || u.name || '(' + t('target_unknown') + ')' };
                }).filter(function (u) { return u.id; });
                usersCacheAt = Date.now();
                return usersCache;
            })
            .catch(function () {
                usersCache   = [];
                usersCacheAt = Date.now(); // éviter de spammer l'API en cas d'erreur
                return usersCache;
            });
    }

    function renderTargetPicker(page, users) {
        var container = page.querySelector('#ip-target-picker');
        if (!container) return;

        var box = document.createElement('div');
        box.className = 'ip-target-box';

        var allRow = document.createElement('div');
        allRow.className = 'ip-target-all-row';

        var allLabel = document.createElement('label');
        var allChk   = document.createElement('input');
        allChk.type    = 'checkbox';
        allChk.id      = 'ip-target-all';
        allChk.checked = true;
        allChk.style.cssText = 'width:15px;height:15px;cursor:pointer;accent-color:var(--theme-accent-color,#00a4dc);flex-shrink:0;';
        var allSpan = document.createElement('span');
        allSpan.textContent = t('target_all');
        allLabel.appendChild(allChk);
        allLabel.appendChild(allSpan);
        allRow.appendChild(allLabel);

        if (users.length === 0) {
            var noUsersNote = document.createElement('span');
            noUsersNote.textContent = t('target_no_users');
            noUsersNote.style.cssText = 'opacity:.45;font-size:.8rem;margin-left:auto;';
            allRow.appendChild(noUsersNote);
        }

        box.appendChild(allRow);

        // ── Barre « Tout sélectionner / Tout désélectionner » ───────────────────────────
        // Visible uniquement quand la liste individuelle est affichée.
        var selectControls = document.createElement('div');
        selectControls.className = 'ip-target-select-controls';

        var selectAllBtn = document.createElement('button');
        selectAllBtn.type = 'button';
        selectAllBtn.textContent = t('target_select_all');

        var sep = document.createElement('span');
        sep.className = 'ip-sel-sep';
        sep.textContent = '·';

        var deselectAllBtn = document.createElement('button');
        deselectAllBtn.type = 'button';
        deselectAllBtn.textContent = t('target_deselect_all');

        selectControls.appendChild(selectAllBtn);
        selectControls.appendChild(sep);
        selectControls.appendChild(deselectAllBtn);
        box.appendChild(selectControls);

        var userList = document.createElement('div');
        userList.className = 'ip-target-user-list';
        userList.style.display = 'none';

        var userCheckboxes = [];
        users.forEach(function (u) {
            var label = document.createElement('label');
            var chk   = document.createElement('input');
            chk.type  = 'checkbox';
            chk.dataset.userId = u.id;
            // Par défaut : aucun utilisateur pré-sélectionné quand la liste apparaît.
            chk.checked = false;
            chk.style.cssText = 'width:14px;height:14px;cursor:pointer;accent-color:var(--theme-accent-color,#00a4dc);flex-shrink:0;';
            var span = document.createElement('span');
            span.textContent = u.name;
            label.appendChild(chk);
            label.appendChild(span);
            userList.appendChild(label);
            userCheckboxes.push(chk);
        });

        box.appendChild(userList);
        container.innerHTML = '';
        container.appendChild(box);

        // ── Événements ───────────────────────────────────────────────────────

        selectAllBtn.addEventListener('click', function () {
            userCheckboxes.forEach(function (c) { c.checked = true; });
        });

        deselectAllBtn.addEventListener('click', function () {
            userCheckboxes.forEach(function (c) { c.checked = false; });
        });

        allChk.addEventListener('change', function () {
            if (allChk.checked) {
                userList.style.display = 'none';
                selectControls.style.display = 'none';
                userCheckboxes.forEach(function (c) { c.checked = true; });
            } else {
                if (users.length > 0) {
                    userList.style.display = 'block';
                    selectControls.style.display = 'flex';
                } else {
                    allChk.checked = true;
                }
            }
        });
    }

    function getSelectedTargetIds(page) {
        var allChk = page.querySelector('#ip-target-all');
        if (!allChk || allChk.checked) return [];
        var ids    = [];
        var picker = page.querySelector('#ip-target-picker');
        if (picker) {
            picker.querySelectorAll('input[type="checkbox"][data-user-id]').forEach(function (c) {
                if (c.checked) ids.push(c.dataset.userId);
            });
        }
        return ids;
    }

    function resetTargetPicker(page) {
        var allChk = page.querySelector('#ip-target-all');
        if (allChk) {
            allChk.checked = true;
            allChk.dispatchEvent(new Event('change'));
        }
    }

    /**
     * Restaure l'état du sélecteur de ciblage depuis une liste d'IDs.
     * Utilisé lors du passage en mode édition pour refléter le ciblage actuel du message.
     * @param {string[]} ids — IDs à cocher. Vide ou null = tous les utilisateurs.
     */
    function setTargetPickerIds(page, ids) {
        var allChk = page.querySelector('#ip-target-all');
        if (!allChk) return;
        if (!ids || ids.length === 0) {
            // Tous les utilisateurs
            allChk.checked = true;
            allChk.dispatchEvent(new Event('change'));
        } else {
            // Sélection partielle
            allChk.checked = false;
            allChk.dispatchEvent(new Event('change'));
            var picker = page.querySelector('#ip-target-picker');
            if (picker) {
                // D'abord tout décocher
                picker.querySelectorAll('input[data-user-id]').forEach(function (chk) {
                    chk.checked = false;
                });
                // Puis cocher uniquement les IDs ciblés
                ids.forEach(function (id) {
                    var chk = picker.querySelector('input[data-user-id="' + id + '"]');
                    if (chk) chk.checked = true;
                });
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // Toolbar de formatage
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Retourne les indices des occurrences de `marker` dans `line`.
     * Gère la collision _ vs __ : un _ adjacent à un autre _ est ignoré.
     */
    function findMarkerPositions(line, marker) {
        var positions = [];
        var mLen = marker.length;
        var i    = 0;
        while (i <= line.length - mLen) {
            var idx = line.indexOf(marker, i);
            if (idx === -1) break;
            if (marker === '_') {
                var prevUnd = idx > 0 && line[idx - 1] === '_';
                var nextUnd = idx + 1 < line.length && line[idx + 1] === '_';
                if (prevUnd || nextUnd) { i = idx + 1; continue; }
            }
            positions.push(idx);
            i = idx + mLen;
        }
        return positions;
    }

    /**
     * Retourne {from, to, innerFrom, innerTo} de la paire de marqueurs qui
     * entoure cursorPos, ou null. Opère ligne par ligne.
     */
    function getFormatBoundsAroundCursor(val, cursorPos, marker) {
        var lineStart = val.lastIndexOf('\n', cursorPos - 1) + 1;
        var lineEnd   = val.indexOf('\n', cursorPos);
        if (lineEnd === -1) lineEnd = val.length;
        var line = val.slice(lineStart, lineEnd);
        var cp   = cursorPos - lineStart;
        var mLen = marker.length;

        var positions = findMarkerPositions(line, marker);
        for (var i = 0; i + 1 < positions.length; i += 2) {
            var openIdx  = positions[i];
            var closeIdx = positions[i + 1];
            if (cp >= openIdx && cp <= closeIdx + mLen) {
                return {
                    from:      lineStart + openIdx,
                    to:        lineStart + closeIdx + mLen,
                    innerFrom: lineStart + openIdx  + mLen,
                    innerTo:   lineStart + closeIdx
                };
            }
        }
        return null;
    }

    /**
     * Retourne {bold, italic, underline, strike} : true si le curseur/sélection
     * est à l'intérieur du formatage correspondant.
     * __ est testé avant _ pour éviter les faux positifs.
     */
    function getActiveFormats(ta) {
        var val   = ta.value;
        var start = ta.selectionStart;
        var end   = ta.selectionEnd;
        var checks = [
            { key: 'bold',      marker: '**' },
            { key: 'underline', marker: '__' },
            { key: 'italic',    marker: '_'  },
            { key: 'strike',    marker: '~~' }
        ];
        var active = {};
        checks.forEach(function (c) {
            if (start < end) {
                var sel  = val.slice(start, end);
                var mLen = c.marker.length;
                active[c.key] = sel.length > mLen * 2 &&
                                sel.startsWith(c.marker) && sel.endsWith(c.marker);
            } else {
                active[c.key] = getFormatBoundsAroundCursor(val, start, c.marker) !== null;
            }
        });
        return active;
    }

    /** Met à jour l'apparence "enfoncée" des boutons de la toolbar. */
    function updateToolbarActiveState(page, ta) {
        var active  = getActiveFormats(ta);
        var toolbar = page.querySelector('#ip-format-toolbar');
        if (!toolbar) return;
        toolbar.querySelectorAll('.ip-fmt-btn[data-action]').forEach(function (btn) {
            var a = btn.dataset.action;
            if (a && a !== 'list') btn.classList.toggle('active', !!active[a]);
        });
    }

    /**
     * Applique ou retire le formatage sur la sélection (ou autour du curseur).
     * Toggle intelligent : si le texte est déjà formaté, retire les marqueurs.
     */
    function applyFormat(ta, prefix, suffix) {
        var start = ta.selectionStart, end = ta.selectionEnd;
        var val   = ta.value;

        if (start < end) {
            var selected = val.slice(start, end);
            if (selected.startsWith(prefix) && selected.endsWith(suffix) &&
                    selected.length > prefix.length + suffix.length) {
                // Retrait : supprimer les marqueurs, garder le contenu
                var inner = selected.slice(prefix.length, selected.length - suffix.length);
                ta.value = val.slice(0, start) + inner + val.slice(end);
                ta.setSelectionRange(start, start + inner.length);
            } else {
                // Ajout : envelopper la sélection
                ta.value = val.slice(0, start) + prefix + selected + suffix + val.slice(end);
                ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
            }
        } else {
            var bounds = getFormatBoundsAroundCursor(val, start, prefix);
            if (bounds) {
                // Curseur dans une paire existante → retrait
                var inner2 = val.slice(bounds.innerFrom, bounds.innerTo);
                ta.value   = val.slice(0, bounds.from) + inner2 + val.slice(bounds.to);
                var newPos = Math.max(bounds.from, start - prefix.length);
                ta.setSelectionRange(newPos, newPos);
            } else {
                // Hors de toute paire → insertion avec curseur entre les marqueurs
                ta.value = val.slice(0, start) + prefix + suffix + val.slice(start);
                ta.setSelectionRange(start + prefix.length, start + prefix.length);
            }
        }
    }

    function toggleListLines(ta) {
        var start     = ta.selectionStart, end = ta.selectionEnd;
        var val       = ta.value;
        var lineStart = val.lastIndexOf('\n', start - 1) + 1;
        var lineEnd   = val.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = val.length;
        var block     = val.slice(lineStart, lineEnd);
        var lines     = block.split('\n');
        var allBullet = lines.every(function (l) { return /^- /.test(l); });
        var newBlock  = lines.map(function (l) {
            return allBullet ? l.slice(2) : '- ' + l;
        }).join('\n');
        ta.value = val.slice(0, lineStart) + newBlock + val.slice(lineEnd);
        ta.setSelectionRange(lineStart, lineStart + newBlock.length);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Aperçu formaté / mode brut (bascule exclusive comme en v0.5)
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Met à jour le contenu du div d'aperçu avec le rendu formaté du textarea.
     * Affiche un texte d'invite si le textarea est vide.
     * Doit être appelé après chaque modification de bodyEl.value.
     */
    function updatePreview(page) {
        var bodyEl  = page.querySelector('#ip-body');
        var preview = page.querySelector('#ip-body-preview');
        if (!preview) return;
        var raw = bodyEl ? bodyEl.value : '';
        if (!raw.trim()) {
            preview.innerHTML = '<span class="ip-preview-hint">' +
                escHtml(t('preview_hint')) + '</span>';
        } else {
            preview.innerHTML = renderBody(raw);
        }
    }

    /**
     * Bascule entre le mode aperçu (preview visible, textarea caché)
     * et le mode brut (textarea visible, preview caché).
     *
     * Comportement identique à v0.5 :
     *   on=true  → aperçu (défaut, après publish/cancel)
     *   on=false → brut   (pour saisir/formatter)
     *
     * Le toggle "Raw" est coché quand on est en mode brut (textarea visible).
     *
     * @param {boolean} on  true = aperçu, false = brut.
     */
    function setPreviewMode(page, on) {
        var bodyEl  = page.querySelector('#ip-body');
        var preview = page.querySelector('#ip-body-preview');
        var toggle  = page.querySelector('#ip-preview-toggle');
        if (!bodyEl || !preview) return;
        if (on) {
            // Mode aperçu : preview visible, textarea caché
            updatePreview(page);
            preview.style.display = 'block';
            bodyEl.style.display  = 'none';
            if (toggle) toggle.checked = false; // Raw désactivé
        } else {
            // Mode brut : textarea visible, preview caché
            preview.style.display = 'none';
            bodyEl.style.display  = 'block';
            if (toggle) toggle.checked = true;  // Raw activé
            bodyEl.focus();
            updateToolbarActiveState(page, bodyEl);
        }
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
        // Passer en mode brut pour permettre l'édition directe
        setPreviewMode(page, false);
        // Restaurer le ciblage du message en cours d'édition
        setTargetPickerIds(page, msg.targetUserIds || []);
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
        if (titleEl) titleEl.value = '';
        if (bodyEl)  bodyEl.value  = '';
        // Retour en aperçu : montre le placeholder "commencer à saisir"
        setPreviewMode(page, true);
        resetTargetPicker(page);
        var publishBtn   = page.querySelector('#ip-publish-btn');
        var cancelBtn    = page.querySelector('#ip-cancel-edit-btn');
        var sectionTitle = page.querySelector('#ip-form-section-title');
        if (publishBtn)   publishBtn.textContent = t('cfg_publish');
        if (cancelBtn)    cancelBtn.style.display = 'none';
        if (sectionTitle) sectionTitle.textContent = t('cfg_new_message');
    }

    // ════════════════════════════════════════════════════════════════════════
    // Initialisation de la page de configuration
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Applique les traductions aux éléments statiques de configurationpage.html
     * (ceux qui sont dans le HTML initial et non générés dynamiquement).
     */
    function applyStaticTranslations(page) {
        var map = {
            '#ip-form-section-title': 'cfg_new_message',
            '#ip-subtitle':           'cfg_subtitle',
            '#ip-title-label':        'cfg_title_label',
            '#ip-body-label':         'cfg_body_label',
            '#ip-recipients-label':   'cfg_recipients',
            '#ip-publish-btn':        'cfg_publish',
            '#ip-cancel-edit-btn':    'cfg_cancel_edit',
            '#ip-history-title':      'cfg_history',
            '#ip-select-all-label':   'cfg_select_all',
            '#ip-delete-btn-label':   'cfg_delete_sel',
            '#ip-empty':              'cfg_no_messages',
            '#ip-preview-toggle-label': 'preview_toggle_raw'
        };
        Object.keys(map).forEach(function (sel) {
            var el = page.querySelector(sel);
            if (el) el.textContent = t(map[sel]);
        });

        // Placeholders
        var titleInput = page.querySelector('#ip-title');
        if (titleInput) titleInput.placeholder = t('cfg_title_ph');
        var bodyTa = page.querySelector('#ip-body');
        if (bodyTa) bodyTa.placeholder = t('cfg_body_ph');

        // Tooltip de la toolbar (title attributes dans le HTML)
        var toolbarMap = {
            '[data-action="bold"]':      'fmt_bold',
            '[data-action="italic"]':    'fmt_italic',
            '[data-action="underline"]': 'fmt_underline',
            '[data-action="strike"]':    'fmt_strike',
            '[data-action="list"]':      'fmt_list'
        };
        Object.keys(toolbarMap).forEach(function (sel) {
            var el = page.querySelector(sel);
            if (el) el.title = t(toolbarMap[sel]);
        });

        // Tooltip du toggle aperçu
        var toggleWrap = page.querySelector('.ip-preview-toggle-wrap');
        if (toggleWrap) toggleWrap.title = t('fmt_raw_tip');

        // Loading users placeholder
        var pickerPlaceholder = page.querySelector('#ip-target-picker span');
        if (pickerPlaceholder) pickerPlaceholder.textContent = t('cfg_loading_users');
    }

    /**
     * Initialise la page de configuration admin.
     * Idempotent grâce au flag page._ipInitDone.
     */
    function initConfigPage(page) {
        if (page._ipInitDone) return;
        page._ipInitDone = true;
        ns.injectStyles();
        applyStaticTranslations(page);

        var toast = page.querySelector('#ip-toast');
        if (toast) {
            toast.setAttribute('aria-live', 'polite');
            toast.setAttribute('role', 'status');
        }

        console.log('InfoPopup: config page init OK');

        var selectedIds = new Set();
        var editState   = { id: null, onEdit: null };
        var onEdit      = function (msg) { enterEditMode(page, msg, editState); };
        editState.onEdit = onEdit;

        var publishBtn    = page.querySelector('#ip-publish-btn');
        var deleteBtn     = page.querySelector('#ip-delete-btn');
        var selectAll     = page.querySelector('#ip-select-all');
        var cancelBtn     = page.querySelector('#ip-cancel-edit-btn');
        var bodyEl        = page.querySelector('#ip-body');
        var toolbar       = page.querySelector('#ip-format-toolbar');
        var previewToggle = page.querySelector('#ip-preview-toggle');

        // État initial : aperçu activé (textarea caché), comme en v0.5
        setPreviewMode(page, true);

        // Toggle Raw : coché = mode brut (textarea), décoché = mode aperçu
        if (previewToggle) {
            previewToggle.addEventListener('change', function () {
                setPreviewMode(page, !previewToggle.checked);
            });
        }

        // Cliquer sur l'aperçu bascule en mode brut pour éditer
        var bodyPreview = page.querySelector('#ip-body-preview');
        if (bodyPreview) {
            bodyPreview.addEventListener('click', function () {
                setPreviewMode(page, false);
            });
        }

        if (bodyEl) {
            // Mise à jour de l'aperçu à chaque frappe (en arrière-plan, même si caché)
            bodyEl.addEventListener('input', function () {
                updatePreview(page);
            });

            // Mise à jour de l'état actif des boutons de formatage.
            // keyup/mouseup/touchend couvrent toutes les interactions clavier/souris/tactile.
            // selectionchange sur document est intentionnellement absent : il ne serait
            // jamais retiré après navigation SPA et tirerait à chaque sélection de la page.
            var refreshToolbarState = function () { updateToolbarActiveState(page, bodyEl); };
            bodyEl.addEventListener('keyup',    refreshToolbarState);
            bodyEl.addEventListener('mouseup',  refreshToolbarState);
            bodyEl.addEventListener('touchend', refreshToolbarState);
        }

        if (publishBtn) {
            publishBtn.addEventListener('click', function () {
                publishMessage(page, selectedIds, editState);
            });
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function () {
                editState.id = null;
                exitEditMode(page);
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function () {
                deleteSelected(page, selectedIds, editState);
            });
        }
        if (selectAll) {
            selectAll.addEventListener('change', function (e) {
                page.querySelectorAll('.ip-row-check').forEach(function (cb) {
                    cb.checked = e.target.checked;
                    if (e.target.checked) selectedIds.add(cb.dataset.id);
                    else selectedIds.delete(cb.dataset.id);
                });
                updateSelectionUI(page, selectedIds);
            });
        }

        // ── Toolbar de formatage ─────────────────────────────────────────────
        // Si on est en aperçu, basculer en brut d'abord pour que l'utilisateur
        // voie l'effet du formatage dans le textarea (comportement v0.5).
        if (toolbar && bodyEl) {
            var fmtMap = {
                bold:      ['**', '**'],
                italic:    ['_',  '_' ],
                strike:    ['~~', '~~'],
                underline: ['__', '__']
            };
            toolbar.addEventListener('click', function (e) {
                var btn = e.target.closest('.ip-fmt-btn');
                if (!btn) return;
                e.preventDefault();
                // Toujours basculer en mode brut pour voir le résultat
                setPreviewMode(page, false);
                var action = btn.dataset.action;
                if (action === 'list') {
                    toggleListLines(bodyEl);
                } else if (fmtMap[action]) {
                    applyFormat(bodyEl, fmtMap[action][0], fmtMap[action][1]);
                }
                bodyEl.focus();
                updatePreview(page); // mettre à jour l'aperçu en arrière-plan
                updateToolbarActiveState(page, bodyEl);
            });
        }

        // Chargement initial : utilisateurs puis messages
        fetchUsers().then(function (users) {
            renderTargetPicker(page, users);
            return loadMessages(page, selectedIds, onEdit);
        });
    }

    // ── Détection et initialisation depuis l'observer ────────────────────────

    function checkConfigPage() {
        var page = document.querySelector('#infoPopupConfigPage');
        if (page) initConfigPage(page);
    }

    // ── Exposition ───────────────────────────────────────────────────────────
    ns.initConfigPage   = initConfigPage;
    ns.checkConfigPage  = checkConfigPage;

}(window.__IP = window.__IP || {}));
