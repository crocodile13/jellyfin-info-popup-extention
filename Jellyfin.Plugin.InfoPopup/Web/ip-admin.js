/**
 * jellyfin-info-popup-extention — ip-admin.js
 * --------------------------------------------
 * Module de la page de configuration administrateur.
 * Gère le formulaire, le tableau de messages, la toolbar de formatage,
 * l'éditeur WYSIWYG et le sélecteur de ciblage utilisateurs.
 *
 * Comportement de l'éditeur (v2.0) :
 *   - Mode WYSIWYG par défaut : édition directe du texte formaté
 *   - Toggle "Raw" pour basculer en mode markdown si nécessaire
 *   - Raccourcis clavier : Ctrl+B (gras), Ctrl+I (italique), Ctrl+U (souligné), Ctrl+Shift+S (barré)
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

    // ── Rate Limiting ────────────────────────────────────────────────────────
    var lastPublishTime = 0;
    var _rateLimitMs = 2000; // sera mis à jour depuis les settings
    var _clientSettings = null; // chargé depuis GET /client-settings

    function canPublish() {
        var now = Date.now();
        if (now - lastPublishTime < _rateLimitMs) {
            return false;
        }
        lastPublishTime = now;
        return true;
    }

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
    // WYSIWYG — Conversion Markdown ↔ HTML
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Convertit le markdown simplifié en HTML pour l'affichage WYSIWYG.
     * Supporte : **bold**, _italic_, __underline__, ~~strike~~, - lists, [text](url)
     */
    function markdownToHtml(md) {
        if (!md) return '';
        var html = escHtml(md);
        
        // Liens [text](url) - doit être fait avant les autres transformations
        html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        
        // Formatage inline (ordre important : __ avant _, ** avant *)
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_]+)__/g, '<u>$1</u>');
        html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');
        // Italic : _text_ — __ déjà traité ci-dessus, donc plus aucun __ restant dans html
        html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
        
        // Listes à puces
        var lines = html.split('\n');
        var result = [];
        var inList = false;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (/^- /.test(line)) {
                if (!inList) { result.push('<ul>'); inList = true; }
                result.push('<li>' + line.slice(2) + '</li>');
            } else {
                if (inList) { result.push('</ul>'); inList = false; }
                result.push(line);
            }
        }
        if (inList) result.push('</ul>');
        
        return result.join('\n');
    }

    /**
     * Convertit le HTML du WYSIWYG en markdown simplifié.
     */
    function htmlToMarkdown(html) {
        if (!html) return '';
        
        // Créer un élément temporaire pour parser le HTML
        var temp = document.createElement('div');
        temp.innerHTML = html;
        
        function processNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return '';
            
            var tag = node.tagName.toLowerCase();
            var content = Array.from(node.childNodes).map(processNode).join('');
            
            switch (tag) {
                case 'strong':
                case 'b':
                    return '**' + content + '**';
                case 'em':
                case 'i':
                    return '_' + content + '_';
                case 'u':
                    return '__' + content + '__';
                case 's':
                case 'strike':
                case 'del':
                    return '~~' + content + '~~';
                case 'a':
                    var href = node.getAttribute('href') || '';
                    return '[' + content + '](' + href + ')';
                case 'li':
                    return '- ' + content;
                case 'ul':
                case 'ol':
                    return content;
                case 'br':
                    return '\n';
                case 'div':
                case 'p':
                    return content + (node.nextSibling ? '\n' : '');
                case 'span': {
                    // Chrome génère parfois des <span style="..."> au lieu de <strong>/<em>/etc.
                    var st = node.style || {};
                    var fw = st.fontWeight;
                    var fs = st.fontStyle;
                    var td = st.textDecoration;
                    if (fw === 'bold' || fw === '700') return '**' + content + '**';
                    if (fs === 'italic') return '_' + content + '_';
                    if (td === 'underline') return '__' + content + '__';
                    if (td === 'line-through') return '~~' + content + '~~';
                    return content;
                }
                default:
                    return content;
            }
        }
        
        var md = processNode(temp);
        // Nettoyer les sauts de ligne multiples
        md = md.replace(/\n{3,}/g, '\n\n').trim();
        return md;
    }

    /**
     * Synchronise le contenu du WYSIWYG vers le textarea caché.
     */
    function syncWysiwygToTextarea(page) {
        var wysiwyg = page.querySelector('#ip-body-wysiwyg');
        var textarea = page.querySelector('#ip-body');
        if (!wysiwyg || !textarea) return;
        textarea.value = htmlToMarkdown(wysiwyg.innerHTML);
        updateCharCount(page);
    }

    /**
     * Synchronise le contenu du textarea vers le WYSIWYG.
     */
    function syncTextareaToWysiwyg(page) {
        var wysiwyg = page.querySelector('#ip-body-wysiwyg');
        var textarea = page.querySelector('#ip-body');
        if (!wysiwyg || !textarea) return;
        wysiwyg.innerHTML = markdownToHtml(textarea.value);
    }

    /**
     * Met à jour le compteur de caractères.
     */
    function updateCharCount(page) {
        var textarea = page.querySelector('#ip-body');
        var counter = page.querySelector('#ip-char-count');
        if (!textarea || !counter) return;
        var len = textarea.value.length;
        var max = parseInt(textarea.maxLength) || 10000;
        counter.textContent = len + '/' + max;
        counter.classList.remove('warning', 'danger');
        if (len > max * 0.9) counter.classList.add('danger');
        else if (len > max * 0.75) counter.classList.add('warning');
    }

    /**
     * Applique un formatage dans le WYSIWYG (bold, italic, etc.)
     */
    function applyWysiwygFormat(command, value) {
        document.execCommand(command, false, value || null);
    }

    /**
     * Bascule entre mode WYSIWYG et mode Raw (textarea).
     * @param {boolean} rawMode - true = textarea visible, false = WYSIWYG visible
     */
    function setEditorMode(page, rawMode) {
        var wysiwyg = page.querySelector('#ip-body-wysiwyg');
        var textarea = page.querySelector('#ip-body');
        var toggle = page.querySelector('#ip-preview-toggle');
        
        if (!wysiwyg || !textarea) return;
        
        if (rawMode) {
            // Mode Raw : montrer textarea, cacher WYSIWYG
            syncWysiwygToTextarea(page);
            wysiwyg.style.display = 'none';
            textarea.style.display = 'block';
            textarea.focus();
            if (toggle) toggle.checked = true;
        } else {
            // Mode WYSIWYG : montrer WYSIWYG, cacher textarea
            syncTextareaToWysiwyg(page);
            textarea.style.display = 'none';
            wysiwyg.style.display = 'block';
            if (toggle) toggle.checked = false;
            wysiwyg.focus();
        }
        updateCharCount(page);
    }

    /**
     * Retourne true si on est en mode Raw (textarea visible).
     */
    function isRawMode(page) {
        var textarea = page.querySelector('#ip-body');
        return textarea && textarea.style.display !== 'none';
    }

    /**
     * Met à jour l'état actif des boutons toolbar en mode WYSIWYG.
     */
    function updateToolbarActiveStateWysiwyg(page) {
        var toolbar = page.querySelector('#ip-format-toolbar');
        if (!toolbar) return;
        
        var cmdMap = {
            bold: 'bold',
            italic: 'italic',
            underline: 'underline',
            strike: 'strikeThrough'
        };
        
        toolbar.querySelectorAll('.ip-fmt-btn[data-action]').forEach(function (btn) {
            var action = btn.dataset.action;
            if (action && action !== 'list' && cmdMap[action]) {
                btn.classList.toggle('active', document.queryCommandState(cmdMap[action]));
            }
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

            var tr = document.createElement('tr');
            tr.dataset.id = id;
            if (isDeleted) tr.classList.add('ip-msg-deleted');

            var targetBadge = targetUserIds.length === 0
                ? '<span class="ip-badge ip-badge-all">' + escHtml(t('tbl_badge_all')) + '</span>'
                : '<span class="ip-badge ip-badge-partial" title="' + escHtml(resolveUserNames(targetUserIds)) + '">' +
                  targetUserIds.length + '\u00a0' +
                  escHtml(t(targetUserIds.length > 1 ? 'tbl_user_plural' : 'tbl_user_singular')) + '</span>';

            // Badges deleted / edited
            var titleBadges = '';
            if (isDeleted) {
                titleBadges += '<span class="ip-msg-deleted-badge">' + escHtml(t('msg_deleted_label')) + '</span>';
            }
            if (editCount > 0) {
                titleBadges += '<span class="ip-msg-edited-badge">' + escHtml(t('msg_edited_label', editCount)) + '</span>';
            }

            tr.innerHTML =
                '<td class="ip-col-check">' +
                '<input type="checkbox" class="ip-row-check" data-id="' + escHtml(id) +
                '" style="width:16px;height:16px;cursor:pointer;accent-color:var(--theme-accent-color,#00a4dc);"/>' +
                '</td>' +
                '<td class="ip-col-title ip-col-title-toggle">' +
                '<span class="ip-row-title-text">' + escHtml(title) + '</span>' +
                titleBadges +
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
                var wysiwygEl = page.querySelector('#ip-body-wysiwyg');
                if (wysiwygEl) wysiwygEl.innerHTML = '';
                resetTargetPicker(page);
                showToast(page, t('toast_published'));
                // Retour en mode WYSIWYG après publication
                setEditorMode(page, false);
                updateCharCount(page);
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
    // Modes édition
    // ════════════════════════════════════════════════════════════════════════

    function enterEditMode(page, msg, editState) {
        editState.id = msg.id;
        var titleEl = page.querySelector('#ip-title');
        var bodyEl  = page.querySelector('#ip-body');
        if (titleEl) titleEl.value = msg.title;
        if (bodyEl)  bodyEl.value  = msg.body;
        // Synchroniser vers WYSIWYG et passer en mode WYSIWYG
        syncTextareaToWysiwyg(page);
        setEditorMode(page, false);
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
        var wysiwyg  = page.querySelector('#ip-body-wysiwyg');
        if (titleEl) titleEl.value = '';
        if (bodyEl)  bodyEl.value  = '';
        if (wysiwyg) wysiwyg.innerHTML = '';
        // Rester en mode WYSIWYG
        setEditorMode(page, false);
        resetTargetPicker(page);
        var publishBtn   = page.querySelector('#ip-publish-btn');
        var cancelBtn    = page.querySelector('#ip-cancel-edit-btn');
        var sectionTitle = page.querySelector('#ip-form-section-title');
        if (publishBtn)   publishBtn.textContent = t('cfg_publish');
        if (cancelBtn)    cancelBtn.style.display = 'none';
        if (sectionTitle) sectionTitle.textContent = t('cfg_new_message');
    }

    // ════════════════════════════════════════════════════════════════════════
    // Onglet Droits (permissions) — système de rôles
    // ════════════════════════════════════════════════════════════════════════

    var ROLES = {
        reader:      { canSendMessages: false, canReply: false, canEditOwnMessages: false, canDeleteOwnMessages: false, canEditOthersMessages: false, canDeleteOthersMessages: false },
        contributor: { canSendMessages: true,  canReply: true,  canEditOwnMessages: true,  canDeleteOwnMessages: true,  canEditOthersMessages: false, canDeleteOthersMessages: false },
        moderator:   { canSendMessages: true,  canReply: true,  canEditOwnMessages: true,  canDeleteOwnMessages: true,  canEditOthersMessages: true,  canDeleteOthersMessages: true  }
    };

    function detectRole(u) {
        // Si l'admin a choisi explicitement un rôle (persisté en v3.7.6.0), on l'honore —
        // y compris « custom » même si la combinaison de bools correspond fortuitement à un preset.
        var explicitRole = u.role || u.Role || '';
        if (explicitRole === 'reader' || explicitRole === 'contributor'
                || explicitRole === 'moderator' || explicitRole === 'custom') {
            return explicitRole;
        }
        var cs  = u.canSendMessages       || u.CanSendMessages       || false;
        var cr  = u.canReply              || u.CanReply              || false;
        var ceo = u.canEditOwnMessages    || u.CanEditOwnMessages    || false;
        var cdo = u.canDeleteOwnMessages  || u.CanDeleteOwnMessages  || false;
        var cet = u.canEditOthersMessages || u.CanEditOthersMessages || false;
        var cdt = u.canDeleteOthersMessages || u.CanDeleteOthersMessages || false;
        if (!cs && !cr && !ceo && !cdo && !cet && !cdt) return 'reader';
        if (cs && cr && ceo && cdo && cet && cdt)       return 'moderator';
        if (cs && cr && ceo && cdo && !cet && !cdt)     return 'contributor';
        return 'custom';
    }

    // Remplace un <select> natif par une liste déroulante stylée (le natif reste dans le DOM,
    // caché, et garde sa valeur/son état — toute la logique existante lit sel.value et écoute
    // l'évènement 'change', tous deux préservés). Le rendu de la liste ouverte est ainsi
    // entièrement contrôlable par le thème (les <option> natifs ne sont pas stylables).
    function enhanceSelect(sel) {
        if (!sel || sel.__ipEnhanced) return sel;
        sel.__ipEnhanced = true;

        var wrap = document.createElement('span');
        wrap.className = 'ip-sel';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ip-sel-btn';
        btn.setAttribute('aria-haspopup', 'listbox');
        btn.setAttribute('aria-expanded', 'false');
        var lbl = document.createElement('span');
        lbl.className = 'ip-sel-label';
        btn.appendChild(lbl);

        var list = document.createElement('div');
        list.className = 'ip-sel-list';
        list.setAttribute('role', 'listbox');

        sel.parentNode.insertBefore(wrap, sel);
        wrap.appendChild(btn);
        wrap.appendChild(list);
        wrap.appendChild(sel);
        sel.classList.add('ip-sel-native');

        function syncLabel() {
            var opt = sel.options[sel.selectedIndex];
            lbl.textContent = opt ? opt.textContent : '';
            Array.prototype.forEach.call(list.children, function (el) {
                var on = el.getAttribute('data-value') === sel.value;
                el.classList.toggle('ip-sel-opt-active', on);
                el.classList.remove('ip-sel-opt-focus');
                el.setAttribute('aria-selected', on ? 'true' : 'false');
            });
        }

        function buildOptions() {
            list.innerHTML = '';
            Array.prototype.forEach.call(sel.options, function (o) {
                var item = document.createElement('div');
                item.className = 'ip-sel-opt';
                item.setAttribute('role', 'option');
                item.setAttribute('data-value', o.value);
                item.textContent = o.textContent;
                item.addEventListener('click', function () {
                    sel.value = o.value;
                    close();
                    btn.focus();
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    syncLabel();
                });
                list.appendChild(item);
            });
            syncLabel();
        }

        var outsideHandler = null;
        function open() {
            if (wrap.classList.contains('ip-open')) return;
            wrap.classList.add('ip-open');
            btn.setAttribute('aria-expanded', 'true');
            outsideHandler = function (e) { if (!wrap.contains(e.target)) close(); };
            setTimeout(function () { document.addEventListener('mousedown', outsideHandler, true); }, 0);
            var active = list.querySelector('.ip-sel-opt-active');
            if (active) active.scrollIntoView({ block: 'nearest' });
        }
        function close() {
            if (!wrap.classList.contains('ip-open')) return;
            wrap.classList.remove('ip-open');
            btn.setAttribute('aria-expanded', 'false');
            if (outsideHandler) { document.removeEventListener('mousedown', outsideHandler, true); outsideHandler = null; }
        }
        function toggle() { if (wrap.classList.contains('ip-open')) { close(); } else { open(); } }

        function moveFocus(dir) {
            var items = Array.prototype.slice.call(list.children);
            if (!items.length) return;
            var idx = -1;
            items.forEach(function (el, i) {
                if (el.classList.contains('ip-sel-opt-focus')) idx = i;
            });
            if (idx < 0) items.forEach(function (el, i) { if (el.classList.contains('ip-sel-opt-active')) idx = i; });
            idx = Math.max(0, Math.min(items.length - 1, idx + dir));
            items.forEach(function (el) { el.classList.remove('ip-sel-opt-focus'); });
            items[idx].classList.add('ip-sel-opt-focus');
            items[idx].scrollIntoView({ block: 'nearest' });
        }

        btn.addEventListener('click', toggle);
        btn.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!wrap.classList.contains('ip-open')) { open(); return; }
                moveFocus(e.key === 'ArrowDown' ? 1 : -1);
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (wrap.classList.contains('ip-open')) {
                    var cur = list.querySelector('.ip-sel-opt-focus') || list.querySelector('.ip-sel-opt-active');
                    if (cur) { cur.click(); } else { close(); }
                } else { open(); }
            } else if (e.key === 'Escape') {
                close();
            }
        });

        sel.__ipSync = syncLabel;
        sel.__ipRefresh = buildOptions;
        buildOptions();
        return sel;
    }

    function buildRoleOptions() {
        return [
            { value: 'reader',      label: t('perm_role_reader') },
            { value: 'contributor', label: t('perm_role_contributor') },
            { value: 'moderator',   label: t('perm_role_moderator') },
            { value: 'custom',      label: t('perm_role_custom') }
        ];
    }

    function buildPermCard(page, u, allCards) {
        var userId   = u.userId   || u.UserId   || '';
        var userName = u.userName || u.UserName  || userId;
        var role     = detectRole(u);
        var isAdmin  = u.isAdmin  || u.IsAdmin  || false;

        var card = document.createElement('div');
        card.className = 'ip-perm-card' + (isAdmin ? ' ip-perm-card-admin' : '');
        card.dataset.userId = userId;
        if (isAdmin) card.title = t('perm_admin_hint');

        // ── Header row ──────────────────────────────────────────────────
        var header = document.createElement('div');
        header.className = 'ip-perm-card-header';

        var selChk = document.createElement('input');
        selChk.type = 'checkbox';
        selChk.className = 'ip-perm-card-sel';
        selChk.setAttribute('aria-label', t('perm_sel_all'));
        if (isAdmin) selChk.disabled = true;
        header.appendChild(selChk);

        var nameEl = document.createElement('span');
        nameEl.className = 'ip-perm-card-name';
        nameEl.textContent = userName;
        header.appendChild(nameEl);

        // Badge ADMIN (v3.8.3.0) : indique clairement les comptes admin dont les droits
        // sont toujours intégraux, et que le tableau de droits ne contrôle pas.
        if (isAdmin) {
            var adminBadge = document.createElement('span');
            adminBadge.className = 'ip-role-badge ip-role-badge-admin';
            adminBadge.textContent = t('perm_admin_badge');
            header.appendChild(adminBadge);
        }

        var roleWrap = document.createElement('span');
        roleWrap.className = 'ip-perm-card-role';
        var roleSel = document.createElement('select');
        buildRoleOptions().forEach(function (o) {
            var opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            if (o.value === role) opt.selected = true;
            roleSel.appendChild(opt);
        });
        roleWrap.appendChild(roleSel);
        enhanceSelect(roleSel);
        header.appendChild(roleWrap);

        // Limits
        var limitsWrap = document.createElement('span');
        limitsWrap.className = 'ip-perm-card-limits';
        var inpMsgs = document.createElement('input');
        inpMsgs.type = 'number'; inpMsgs.min = '0'; inpMsgs.max = '1000';
        inpMsgs.value = String(u.maxMessagesPerDay !== undefined ? u.maxMessagesPerDay : (u.MaxMessagesPerDay !== undefined ? u.MaxMessagesPerDay : 5));
        var inpRep = document.createElement('input');
        inpRep.type = 'number'; inpRep.min = '0'; inpRep.max = '1000';
        inpRep.value = String(u.maxRepliesPerDay !== undefined ? u.maxRepliesPerDay : (u.MaxRepliesPerDay !== undefined ? u.MaxRepliesPerDay : 10));
        limitsWrap.appendChild(inpMsgs);
        limitsWrap.appendChild(document.createTextNode(' ' + t('perm_col_max_msgs')));
        limitsWrap.appendChild(document.createTextNode(' · '));
        limitsWrap.appendChild(inpRep);
        limitsWrap.appendChild(document.createTextNode(' ' + t('perm_col_max_replies')));
        header.appendChild(limitsWrap);

        // Actions: details toggle (sauvegarde désormais globale, voir loadPermissions)
        var actWrap = document.createElement('span');
        actWrap.className = 'ip-perm-card-actions';

        var detailsBtn = document.createElement('button');
        detailsBtn.type = 'button';
        detailsBtn.className = 'ip-perm-toggle-details';
        detailsBtn.textContent = t('perm_details_show');
        actWrap.appendChild(detailsBtn);
        header.appendChild(actWrap);

        card.appendChild(header);

        // ── Details row (checkboxes, only visible for Custom) ────────────
        var details = document.createElement('div');
        details.className = 'ip-perm-details';
        var boolFields = [
            { key: 'canSendMessages',       label: t('perm_col_send'),           val: u.canSendMessages       || u.CanSendMessages       || false },
            { key: 'canReply',              label: t('perm_col_reply'),          val: u.canReply              || u.CanReply              || false },
            { key: 'canEditOwnMessages',    label: t('perm_col_edit_own'),       val: u.canEditOwnMessages    || u.CanEditOwnMessages    || false },
            { key: 'canDeleteOwnMessages',  label: t('perm_col_delete_own'),     val: u.canDeleteOwnMessages  || u.CanDeleteOwnMessages  || false },
            { key: 'canEditOthersMessages', label: t('perm_col_edit_others'),    val: u.canEditOthersMessages || u.CanEditOthersMessages || false },
            { key: 'canDeleteOthersMessages', label: t('perm_col_delete_others'),val: u.canDeleteOthersMessages || u.CanDeleteOthersMessages || false }
        ];
        var checkboxMap = {};
        boolFields.forEach(function (f) {
            var lbl = document.createElement('label');
            var chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = f.val;
            checkboxMap[f.key] = chk;
            lbl.appendChild(chk);
            lbl.appendChild(document.createTextNode(' ' + f.label));
            details.appendChild(lbl);
        });
        card.appendChild(details);

        // ── Sync role ↔ checkboxes ──────────────────────────────────────
        function applyRole(r) {
            var perms = ROLES[r];
            if (!perms) return;
            Object.keys(perms).forEach(function (k) {
                if (checkboxMap[k]) checkboxMap[k].checked = perms[k];
            });
        }

        function syncRoleFromCheckboxes() {
            var cur = {};
            Object.keys(checkboxMap).forEach(function (k) { cur[k] = checkboxMap[k].checked; });
            var found = 'custom';
            ['reader', 'contributor', 'moderator'].forEach(function (r) {
                var match = true;
                Object.keys(ROLES[r]).forEach(function (k) { if (ROLES[r][k] !== cur[k]) match = false; });
                if (match) found = r;
            });
            roleSel.value = found;
            if (roleSel.__ipSync) roleSel.__ipSync();
            if (found !== 'custom') details.classList.remove('open');
        }

        roleSel.addEventListener('change', function () {
            var r = roleSel.value;
            if (r === 'custom') {
                details.classList.add('open');
            } else {
                details.classList.remove('open');
                applyRole(r);
            }
        });

        Object.keys(checkboxMap).forEach(function (k) {
            checkboxMap[k].addEventListener('change', syncRoleFromCheckboxes);
        });

        detailsBtn.addEventListener('click', function () {
            details.classList.toggle('open');
            if (details.classList.contains('open') && roleSel.value !== 'custom') {
                roleSel.value = 'custom';
                if (roleSel.__ipSync) roleSel.__ipSync();
            }
        });

        if (role === 'custom') details.classList.add('open');

        // Admin (v3.8.3.0) : on grise tous les contrôles. Le user reste visible dans la liste
        // pour transparence (« voilà l'admin, ses droits sont intégraux par défaut »), mais
        // rien n'est modifiable ni inclus dans la sauvegarde globale (cf. loadPermissions).
        if (isAdmin) {
            roleSel.disabled = true;
            inpMsgs.disabled = true;
            inpRep.disabled  = true;
            detailsBtn.disabled = true;
            Object.keys(checkboxMap).forEach(function (k) { checkboxMap[k].disabled = true; });
        }

        allCards.push({
            card: card, roleSel: roleSel, checkboxMap: checkboxMap,
            inpMsgs: inpMsgs, inpRep: inpRep, userId: userId, details: details,
            selChk: selChk, applyRole: applyRole, isAdmin: isAdmin
        });
        return card;
    }

    function loadPermissions(page) {
        var container = page.querySelector('#ip-perm-container');
        if (!container) return;
        container.innerHTML = '<p style="opacity:.55;">' + escHtml(t('perm_loading')) + '</p>';
        apiFetch('/InfoPopup/permissions')
            .then(function (res) { return res.json(); })
            .then(function (users) {
                if (!users || !users.length) {
                    container.innerHTML = '<p style="opacity:.55;">' + escHtml(t('perm_no_users')) + '</p>';
                    return;
                }
                container.innerHTML = '';
                var allCards = [];

                // ── Barre d'outils : sélection + édition groupée ──────────
                var toolbar = document.createElement('div');
                toolbar.className = 'ip-perm-toolbar';

                // Ligne 1 : contrôles de sélection
                var selRow = document.createElement('div');
                selRow.className = 'ip-perm-toolbar-row';
                function mkToolBtn(label) {
                    var b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'ip-perm-tool-btn';
                    b.textContent = label;
                    return b;
                }
                var btnSelAll    = mkToolBtn(t('perm_sel_all'));
                var btnSelNone   = mkToolBtn(t('perm_sel_none'));
                var btnSelInvert = mkToolBtn(t('perm_sel_invert'));
                var selCount     = document.createElement('span');
                selCount.className = 'ip-perm-sel-count';
                selRow.appendChild(btnSelAll);
                selRow.appendChild(btnSelNone);
                selRow.appendChild(btnSelInvert);
                selRow.appendChild(selCount);
                toolbar.appendChild(selRow);

                // Ligne 2 : application groupée à la sélection
                var bulkRow = document.createElement('div');
                bulkRow.className = 'ip-perm-toolbar-row';
                var bulkLabel = document.createElement('span');
                bulkLabel.textContent = t('perm_bulk_label');
                bulkLabel.style.fontWeight = '500';
                bulkRow.appendChild(bulkLabel);

                var bulkSel = document.createElement('select');
                buildRoleOptions().filter(function (o) { return o.value !== 'custom'; }).forEach(function (o) {
                    var opt = document.createElement('option');
                    opt.value = o.value;
                    opt.textContent = o.label;
                    bulkSel.appendChild(opt);
                });
                bulkRow.appendChild(bulkSel);
                enhanceSelect(bulkSel);

                var bulkMsgs = document.createElement('input');
                bulkMsgs.type = 'number'; bulkMsgs.min = '0'; bulkMsgs.max = '1000'; bulkMsgs.value = '5';
                bulkMsgs.className = 'ip-perm-bulk-num';
                bulkMsgs.setAttribute('aria-label', t('perm_col_max_msgs'));
                var bulkRep = document.createElement('input');
                bulkRep.type = 'number'; bulkRep.min = '0'; bulkRep.max = '1000'; bulkRep.value = '10';
                bulkRep.className = 'ip-perm-bulk-num';
                bulkRep.setAttribute('aria-label', t('perm_col_max_replies'));
                bulkRow.appendChild(bulkMsgs);
                bulkRow.appendChild(document.createTextNode(' ' + t('perm_col_max_msgs') + ' · '));
                bulkRow.appendChild(bulkRep);
                bulkRow.appendChild(document.createTextNode(' ' + t('perm_col_max_replies')));

                var bulkBtn = document.createElement('button');
                bulkBtn.type = 'button';
                bulkBtn.className = 'raised emby-button';
                bulkBtn.textContent = t('perm_apply_sel');
                bulkRow.appendChild(bulkBtn);
                toolbar.appendChild(bulkRow);
                container.appendChild(toolbar);

                // ── Cartes utilisateurs ───────────────────────────────────
                users.forEach(function (u) {
                    container.appendChild(buildPermCard(page, u, allCards));
                });

                function updateSelCount() {
                    var n = allCards.filter(function (c) { return c.selChk.checked && !c.isAdmin; }).length;
                    selCount.textContent = t('perm_sel_count', n);
                }
                allCards.forEach(function (c) { c.selChk.addEventListener('change', updateSelCount); });
                updateSelCount();

                // Les admins sont exclus de la sélection (leurs droits sont intégraux par défaut,
                // les modifier serait sans effet et trompeur — v3.8.3.0).
                btnSelAll.addEventListener('click', function () {
                    allCards.forEach(function (c) { if (!c.isAdmin) c.selChk.checked = true; });
                    updateSelCount();
                });
                btnSelNone.addEventListener('click', function () {
                    allCards.forEach(function (c) { c.selChk.checked = false; });
                    updateSelCount();
                });
                btnSelInvert.addEventListener('click', function () {
                    allCards.forEach(function (c) { if (!c.isAdmin) c.selChk.checked = !c.selChk.checked; });
                    updateSelCount();
                });

                // Applique le rôle + limites choisis aux cartes SÉLECTIONNÉES (en mémoire,
                // persisté ensuite par le bouton « Enregistrer » global).
                bulkBtn.addEventListener('click', function () {
                    var role = bulkSel.value;
                    if (!ROLES[role]) return;
                    var selected = allCards.filter(function (c) { return c.selChk.checked && !c.isAdmin; });
                    if (!selected.length) { flashSaveStatus(t('perm_bulk_none_selected'), false); return; }
                    var mMsgs = bulkMsgs.value;
                    var mRep  = bulkRep.value;
                    selected.forEach(function (c) {
                        c.roleSel.value = role;
                        if (c.roleSel.__ipSync) c.roleSel.__ipSync();
                        c.applyRole(role);
                        c.details.classList.remove('open');
                        c.inpMsgs.value = mMsgs;
                        c.inpRep.value  = mRep;
                    });
                    flashSaveStatus(t('perm_bulk_applied', selected.length), true);
                });

                // ── Barre d'enregistrement global ─────────────────────────
                var saveBar = document.createElement('div');
                saveBar.className = 'ip-perm-savebar';
                var saveAllBtn = document.createElement('button');
                saveAllBtn.type = 'button';
                saveAllBtn.className = 'raised button-submit emby-button';
                saveAllBtn.textContent = t('perm_save_all');
                var saveStatus = document.createElement('span');
                saveStatus.className = 'ip-perm-save-status';
                saveBar.appendChild(saveAllBtn);
                saveBar.appendChild(saveStatus);

                var statusTimer = null;
                function flashSaveStatus(text, ok) {
                    saveStatus.textContent = text;
                    saveStatus.className = 'ip-perm-save-status ' + (ok ? 'ip-perm-save-ok' : 'ip-perm-save-err');
                    if (statusTimer) clearTimeout(statusTimer);
                    statusTimer = setTimeout(function () {
                        saveStatus.textContent = '';
                        saveStatus.className = 'ip-perm-save-status';
                    }, 3000);
                }

                saveAllBtn.addEventListener('click', function () {
                    saveAllBtn.disabled = true;
                    if (statusTimer) clearTimeout(statusTimer);
                    saveStatus.textContent = '';
                    saveStatus.className = 'ip-perm-save-status';
                    // Skip les admins (v3.8.3.0) : leurs droits effectifs sont toujours
                    // intégraux côté serveur, persister leur état d'UI serait sans effet.
                    var reqs = allCards.filter(function (c) { return !c.isAdmin; }).map(function (c) {
                        var payload = {
                            canSendMessages:         c.checkboxMap.canSendMessages.checked,
                            canReply:                c.checkboxMap.canReply.checked,
                            canEditOwnMessages:      c.checkboxMap.canEditOwnMessages.checked,
                            canDeleteOwnMessages:    c.checkboxMap.canDeleteOwnMessages.checked,
                            canEditOthersMessages:   c.checkboxMap.canEditOthersMessages.checked,
                            canDeleteOthersMessages: c.checkboxMap.canDeleteOthersMessages.checked,
                            maxMessagesPerDay: parseInt(c.inpMsgs.value, 10) || 0,
                            maxRepliesPerDay:  parseInt(c.inpRep.value, 10)  || 0,
                            role: c.roleSel.value || ''
                        };
                        return apiFetch('/InfoPopup/permissions/' + encodeURIComponent(c.userId), {
                            method: 'PUT',
                            body: JSON.stringify(payload)
                        });
                    });
                    Promise.all(reqs).then(function () {
                        flashSaveStatus(t('perm_saved_all'), true);
                        saveAllBtn.disabled = false;
                    }).catch(function () {
                        flashSaveStatus(t('perm_save_err'), false);
                        saveAllBtn.disabled = false;
                    });
                });

                var hint = document.createElement('p');
                hint.style.cssText = 'opacity:.5;font-size:.78rem;margin-top:8px;';
                hint.textContent = t('perm_hint_0');
                saveBar.appendChild(hint);
                container.appendChild(saveBar);
            })
            .catch(function (err) {
                var msg = err && err.message ? err.message : String(err);
                container.innerHTML = '<p style="color:#cf6679;">' + escHtml(t('perm_save_err')) + ' — ' + escHtml(msg) + '</p>';
                console.error('InfoPopup: loadPermissions error:', err);
            });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Onglets
    // ════════════════════════════════════════════════════════════════════════

    function initTabs(page) {
        var tabs = [
            { btnId: 'ip-tab-messages',    panelId: 'ip-panel-messages'    },
            { btnId: 'ip-tab-settings',    panelId: 'ip-panel-settings'    },
            { btnId: 'ip-tab-replies',     panelId: 'ip-panel-replies'     },
            { btnId: 'ip-tab-permissions', panelId: 'ip-panel-permissions' }
        ];
        tabs.forEach(function(tab) {
            var btn = page.querySelector('#' + tab.btnId);
            if (!btn) return;
            btn.addEventListener('click', function() {
                tabs.forEach(function(t2) {
                    var b = page.querySelector('#' + t2.btnId);
                    var p = page.querySelector('#' + t2.panelId);
                    if (b) { b.classList.remove('ip-tab-active'); }
                    if (p) { p.style.display = 'none'; }
                });
                btn.classList.add('ip-tab-active');
                var panel = page.querySelector('#' + tab.panelId);
                if (panel) { panel.style.display = ''; }
                // Charger les réponses quand on clique sur l'onglet Réponses
                if (tab.btnId === 'ip-tab-replies') { loadReplies(page); }
                // Charger les permissions quand on clique sur l'onglet Droits
                if (tab.btnId === 'ip-tab-permissions') { loadPermissions(page); }
            });
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Onglet Paramètres
    // ════════════════════════════════════════════════════════════════════════

    function initSettingsTab(page) {
        apiFetch('/InfoPopup/settings')
            .then(function(res) { return res.json(); })
            .then(function(data) {
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

            // Compatibilité camelCase / PascalCase
            var popupEnabled    = cfg.popupEnabled         !== undefined ? cfg.popupEnabled         : (cfg.PopupEnabled         !== undefined ? cfg.PopupEnabled         : true);
            var popupDelay      = cfg.popupDelayMs         !== undefined ? cfg.popupDelayMs         : (cfg.PopupDelayMs         !== undefined ? cfg.PopupDelayMs         : 800);
            var maxMsgs         = cfg.maxMessagesInPopup   !== undefined ? cfg.maxMessagesInPopup   : (cfg.MaxMessagesInPopup   !== undefined ? cfg.MaxMessagesInPopup   : 5);
            var histEnabled     = cfg.historyEnabled       !== undefined ? cfg.historyEnabled       : (cfg.HistoryEnabled       !== undefined ? cfg.HistoryEnabled       : true);
            var allowReplies    = cfg.allowReplies         !== undefined ? cfg.allowReplies         : (cfg.AllowReplies         !== undefined ? cfg.AllowReplies         : false);
            var replyMaxLen     = cfg.replyMaxLength       !== undefined ? cfg.replyMaxLength       : (cfg.ReplyMaxLength       !== undefined ? cfg.ReplyMaxLength       : 500);
            var rateLimit       = cfg.rateLimitMs          !== undefined ? cfg.rateLimitMs          : (cfg.RateLimitMs          !== undefined ? cfg.RateLimitMs          : 2000);
            var retAdminDays    = cfg.adminMessageRetentionDays !== undefined ? cfg.adminMessageRetentionDays : (cfg.AdminMessageRetentionDays !== undefined ? cfg.AdminMessageRetentionDays : 0);
            var retUserDays     = cfg.userMessageRetentionDays  !== undefined ? cfg.userMessageRetentionDays  : (cfg.UserMessageRetentionDays  !== undefined ? cfg.UserMessageRetentionDays  : 0);

            if (chkEnabled)  chkEnabled.checked  = popupEnabled;
            if (inpDelay)    inpDelay.value       = popupDelay;
            if (inpMax)      inpMax.value         = maxMsgs;
            if (chkHistory)  chkHistory.checked   = histEnabled;
            if (chkReplies)  chkReplies.checked   = allowReplies;
            if (inpReplyLen) inpReplyLen.value     = replyMaxLen;
            if (inpRate)     inpRate.value         = rateLimit;
            if (inpRetAdmin) inpRetAdmin.value     = retAdminDays;
            if (inpRetUser)  inpRetUser.value      = retUserDays;
            if (replyWrap)   replyWrap.style.display = allowReplies ? '' : 'none';

            // Sync _rateLimitMs pour canPublish()
            _rateLimitMs = rateLimit;

            // Toggle visibilité longueur réponse
            if (chkReplies) {
                chkReplies.addEventListener('change', function() {
                    if (replyWrap) replyWrap.style.display = chkReplies.checked ? '' : 'none';
                });
            }
        }).catch(function() {});

        var saveBtn = page.querySelector('#ip-save-settings-btn');
        if (!saveBtn) return;
        saveBtn.addEventListener('click', function() {
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
            var retAdminVal = inpRetAdmin ? parseInt(inpRetAdmin.value,  10) : 0;
            var retUserVal  = inpRetUser  ? parseInt(inpRetUser.value,   10) : 0;

            // Validation côté client : bloque avant envoi si valeurs hors plage ou NaN.
            var settingsValid = true;
            var settingsToastEl = page.querySelector('#ip-settings-toast');
            function showSettingsErr(msg) {
                if (settingsToastEl) {
                    settingsToastEl.textContent = msg;
                    settingsToastEl.className = 'ip-toast-err';
                    settingsToastEl.style.display = 'block';
                    setTimeout(function() { settingsToastEl.style.display = 'none'; }, 4000);
                }
            }
            if (isNaN(delayVal)    || delayVal    < 0     || delayVal    > 600000) settingsValid = false;
            if (isNaN(maxVal)      || maxVal      < 1     || maxVal      > 50)    settingsValid = false;
            if (isNaN(replyLenVal) || replyLenVal < 10    || replyLenVal > 5000)  settingsValid = false;
            if (isNaN(rateVal)     || rateVal     < 0     || rateVal     > 60000) settingsValid = false;
            if (isNaN(retAdminVal) || retAdminVal < 0     || retAdminVal > 3650)  settingsValid = false;
            if (isNaN(retUserVal)  || retUserVal  < 0     || retUserVal  > 3650)  settingsValid = false;
            if (!settingsValid) { showSettingsErr(t('val_settings_invalid')); return; }

            var body = {
                popupEnabled:               chkEnabled  ? chkEnabled.checked : true,
                popupDelayMs:               delayVal,
                maxMessagesInPopup:         maxVal,
                historyEnabled:             chkHistory  ? chkHistory.checked  : true,
                allowReplies:               chkReplies  ? chkReplies.checked  : false,
                replyMaxLength:             replyLenVal,
                rateLimitMs:                rateVal,
                adminMessageRetentionDays:  retAdminVal,
                userMessageRetentionDays:   retUserVal
            };

            saveBtn.disabled = true;
            apiFetch('/InfoPopup/settings', { method: 'POST', body: JSON.stringify(body) })
                .then(function(res) { return res.json(); })
                .then(function(saved) {
                    _rateLimitMs = saved.rateLimitMs || saved.RateLimitMs || 2000;
                    if (toastEl) {
                        toastEl.textContent = t('toast_settings_saved');
                        toastEl.className = 'ip-toast-ok';
                        toastEl.style.display = 'block';
                        setTimeout(function() { toastEl.style.display = 'none'; }, 3000);
                    }
                })
                .catch(function(err) {
                    if (toastEl) {
                        toastEl.textContent = t('toast_err_settings', err.message || err);
                        toastEl.className = 'ip-toast-err';
                        toastEl.style.display = 'block';
                        setTimeout(function() { toastEl.style.display = 'none'; }, 4000);
                    }
                })
                .finally(function() { saveBtn.disabled = false; });
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
            .then(function(res) { return res.json(); })
            .then(function(cfg) {
                var allowReplies = cfg.allowReplies !== undefined ? cfg.allowReplies : (cfg.AllowReplies || false);
                if (disabledMsg) disabledMsg.style.display = allowReplies ? 'none' : '';
                if (!allowReplies) { listEl.innerHTML = ''; return; }

                listEl.innerHTML = '<div style="opacity:.6">' + escHtml(t('replies_loading')) + '</div>';
                apiFetch('/InfoPopup/replies')
                    .then(function(res2) { return res2.json(); })
                    .then(function(groups) {
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
                        groups.forEach(function(g) {
                            var opt = document.createElement('option');
                            opt.value = g.messageId || g.MessageId || '';
                            opt.textContent = g.messageTitle || g.MessageTitle || opt.value;
                            filterSel.appendChild(opt);
                        });
                        filterWrap.appendChild(filterLbl);
                        filterWrap.appendChild(filterSel);
                        enhanceSelect(filterSel);
                        listEl.appendChild(filterWrap);

                        var groupsContainer = document.createElement('div');
                        listEl.appendChild(groupsContainer);

                        // Rendre tous les groupes
                        function renderGroups(filterMsgId) {
                            groupsContainer.innerHTML = '';
                            groups.forEach(function(group) {
                                var messageId    = group.messageId    || group.MessageId    || '';
                                var messageTitle = group.messageTitle || group.MessageTitle || messageId;
                                var replies      = group.replies      || group.Replies      || [];

                                // Appliquer le filtre
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

                                header.querySelector('.ip-replies-del-all').addEventListener('click', function() {
                                    var mid = this.getAttribute('data-msgid');
                                    apiFetch('/InfoPopup/messages/' + encodeURIComponent(mid) + '/replies/delete', { method: 'POST' })
                                        .then(function() { loadReplies(page); })
                                        .catch(function(err) { showToast(page, t('toast_err_reply_delete', err.message || err), true); });
                                });

                                replies.forEach(function(r) {
                                    var replyId  = r.id       || r.Id       || '';
                                    var userName = r.userName || r.UserName || r.userId || r.UserId || '';
                                    var body     = r.body     || r.Body     || '';
                                    var date     = formatDate(r.repliedAt || r.RepliedAt || '');

                                    var row = document.createElement('div');
                                    row.className = 'ip-reply-row';
                                    row.innerHTML =
                                        '<div>' +
                                            '<div class="ip-reply-row-meta">' + escHtml(userName) + ' \u2014 ' + escHtml(date) + '</div>' +
                                            '<div class="ip-reply-row-body">' + escHtml(body) + '</div>' +
                                        '</div>' +
                                        '<button class="ip-reply-del-btn" data-replyid="' + escHtml(replyId) + '" type="button">' + escHtml(t('replies_delete_one')) + '</button>';

                                    row.querySelector('.ip-reply-del-btn').addEventListener('click', function() {
                                        var rid = this.getAttribute('data-replyid');
                                        apiFetch('/InfoPopup/replies/' + encodeURIComponent(rid), { method: 'DELETE' })
                                            .then(function() { loadReplies(page); })
                                            .catch(function(err) { showToast(page, t('toast_err_reply_delete', err.message || err), true); });
                                    });

                                    groupDiv.appendChild(row);
                                });

                                groupsContainer.appendChild(groupDiv);
                            });
                        }

                        // Rendu initial (sans filtre)
                        renderGroups('');

                        // Appliquer le filtre au changement
                        filterSel.addEventListener('change', function() {
                            renderGroups(filterSel.value);
                        });

                    }).catch(function(err) {
                        listEl.innerHTML = '<div style="color:#f66">' + escHtml(t('toast_err_reply_delete', err.message || err)) + '</div>';
                    });
            }).catch(function() {
                if (disabledMsg) disabledMsg.style.display = '';
            });
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
            // ── Onglet Messages (existant) ─────────────────────────────────
            '#ip-form-section-title':   'cfg_new_message',
            '#ip-subtitle':             'cfg_subtitle',
            '#ip-title-label':          'cfg_title_label',
            '#ip-body-label':           'cfg_body_label',
            '#ip-recipients-label':     'cfg_recipients',
            '#ip-publish-btn':          'cfg_publish',
            '#ip-cancel-edit-btn':      'cfg_cancel_edit',
            '#ip-history-title':        'cfg_history',
            '#ip-select-all-label':     'cfg_select_all',
            '#ip-delete-btn-label':     'cfg_delete_sel',
            '#ip-empty':                'cfg_no_messages',
            '#ip-preview-toggle-label': 'preview_toggle_raw',
            // ── Onglets ────────────────────────────────────────────────────
            '#ip-tab-messages-lbl':     'tab_messages',
            '#ip-tab-settings-lbl':     'tab_settings',
            '#ip-tab-replies-lbl':      'tab_replies',
            // ── Paramètres ─────────────────────────────────────────────────
            '#ip-set-title':            'set_title',
            '#ip-set-enabled-lbl':      'set_popup_enabled',
            '#ip-set-delay-lbl':        'set_popup_delay',
            '#ip-set-max-lbl':          'set_max_messages',
            '#ip-set-history-lbl':      'set_history_enabled',
            '#ip-set-replies-lbl':      'set_allow_replies',
            '#ip-set-reply-len-lbl':    'set_reply_max_len',
            '#ip-set-rate-lbl':         'set_rate_limit',
            '#ip-save-settings-lbl':    'set_save',
            // ── Réponses ───────────────────────────────────────────────────
            '#ip-replies-disabled-hint-lbl': 'replies_disabled_hint',
            // ── Droits ─────────────────────────────────────────────────────
            '#ip-tab-permissions-lbl':  'tab_permissions',
            '#ip-perm-title':           'perm_section_title',
            // ── Rétention ──────────────────────────────────────────────────
            '#ip-set-ret-admin-lbl':    'ret_admin_days_lbl',
            '#ip-set-ret-user-lbl':     'ret_user_days_lbl'
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
        initTabs(page);
        initSettingsTab(page);

        // ── Bloquer les raccourcis globaux Jellyfin lors de la frappe ────────
        // Jellyfin-Web enregistre des handlers sur document (ex: "q"=quick connect,
        // "f"=fullscreen). stopPropagation empêche les keydown émis depuis les champs
        // du plugin de remonter jusqu'à ces handlers. Escape et Tab sont laissés passer.
        page.addEventListener('keydown', function (e) {
            var tg = e.target.tagName;
            if ((tg === 'INPUT' || tg === 'TEXTAREA' || e.target.isContentEditable)
                    && e.key !== 'Escape' && e.key !== 'Tab') {
                e.stopPropagation();
            }
        });

        var toast = page.querySelector('#ip-toast');
        if (toast) {
            toast.setAttribute('aria-live', 'polite');
            toast.setAttribute('role', 'status');
        }

        console.log('InfoPopup: config page init OK (v3.3.0)');

        var selectedIds = new Set();
        var editState   = { id: null, onEdit: null };
        var onEdit      = function (msg) { enterEditMode(page, msg, editState); };
        editState.onEdit = onEdit;

        var publishBtn    = page.querySelector('#ip-publish-btn');
        var deleteBtn     = page.querySelector('#ip-delete-btn');
        var selectAll     = page.querySelector('#ip-select-all');
        var cancelBtn     = page.querySelector('#ip-cancel-edit-btn');
        var bodyEl        = page.querySelector('#ip-body');
        var wysiwygEl     = page.querySelector('#ip-body-wysiwyg');
        var toolbar       = page.querySelector('#ip-format-toolbar');
        var previewToggle = page.querySelector('#ip-preview-toggle');

        // État initial : mode WYSIWYG (pas Raw)
        setEditorMode(page, false);

        // Toggle Raw : coché = mode textarea, décoché = mode WYSIWYG
        if (previewToggle) {
            previewToggle.addEventListener('change', function () {
                setEditorMode(page, previewToggle.checked);
            });
        }

        // ── WYSIWYG : raccourcis clavier et synchronisation ───────────────────
        if (wysiwygEl) {
            // Raccourcis clavier dans le WYSIWYG
            wysiwygEl.addEventListener('keydown', function (e) {
                if (e.ctrlKey || e.metaKey) {
                    var handled = true;
                    switch (e.key.toLowerCase()) {
                        case 'b':
                            applyWysiwygFormat('bold');
                            break;
                        case 'i':
                            applyWysiwygFormat('italic');
                            break;
                        case 'u':
                            applyWysiwygFormat('underline');
                            break;
                        case 's':
                            if (e.shiftKey) {
                                applyWysiwygFormat('strikeThrough');
                            } else {
                                handled = false;
                            }
                            break;
                        default:
                            handled = false;
                    }
                    if (handled) {
                        e.preventDefault();
                        syncWysiwygToTextarea(page);
                        updateToolbarActiveStateWysiwyg(page);
                    }
                }
            });

            // Synchroniser à chaque modification
            wysiwygEl.addEventListener('input', function () {
                syncWysiwygToTextarea(page);
                updateToolbarActiveStateWysiwyg(page);
            });

            // Mise à jour des boutons actifs au clic/sélection
            wysiwygEl.addEventListener('mouseup', function () {
                updateToolbarActiveStateWysiwyg(page);
            });
            wysiwygEl.addEventListener('keyup', function () {
                updateToolbarActiveStateWysiwyg(page);
            });
        }

        // ── Textarea (mode Raw) : mise à jour des états ───────────────────────
        if (bodyEl) {
            bodyEl.addEventListener('input', function () {
                updateCharCount(page);
            });
            
            var refreshToolbarState = function () { updateToolbarActiveState(page, bodyEl); };
            bodyEl.addEventListener('keyup',    refreshToolbarState);
            bodyEl.addEventListener('mouseup',  refreshToolbarState);
            bodyEl.addEventListener('touchend', refreshToolbarState);
        }

        if (publishBtn) {
            publishBtn.addEventListener('click', function () {
                if (!canPublish()) {
                    showToast(page, t('toast_rate_limit'), true);
                    return;
                }
                // Synchroniser avant publication si en mode WYSIWYG
                if (!isRawMode(page)) {
                    syncWysiwygToTextarea(page);
                }
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
        if (toolbar) {
            // mousedown + preventDefault en mode WYSIWYG : empêche le clic sur un bouton
            // de retirer le focus du contenteditable et d'effacer la sélection courante.
            // L'event click se déclenche quand même, mais execCommand trouve la sélection intacte.
            toolbar.addEventListener('mousedown', function (e) {
                var btn = e.target.closest('.ip-fmt-btn');
                if (!btn || isRawMode(page)) return;
                e.preventDefault();
            });

            var fmtMap = {
                bold:      ['**', '**'],
                italic:    ['_',  '_' ],
                strike:    ['~~', '~~'],
                underline: ['__', '__']
            };
            var wysiwygCmdMap = {
                bold:      'bold',
                italic:    'italic',
                underline: 'underline',
                strike:    'strikeThrough'
            };
            
            toolbar.addEventListener('click', function (e) {
                var btn = e.target.closest('.ip-fmt-btn');
                if (!btn) return;
                e.preventDefault();
                
                var action = btn.dataset.action;
                
                if (isRawMode(page)) {
                    // Mode Raw : utiliser le formatage markdown
                    if (action === 'list') {
                        toggleListLines(bodyEl);
                    } else if (fmtMap[action]) {
                        applyFormat(bodyEl, fmtMap[action][0], fmtMap[action][1]);
                    }
                    if (bodyEl) bodyEl.focus();
                    updateToolbarActiveState(page, bodyEl);
                } else if (wysiwygEl) {
                    // Mode WYSIWYG : utiliser execCommand
                    if (action === 'list') {
                        applyWysiwygFormat('insertUnorderedList');
                    } else if (wysiwygCmdMap[action]) {
                        applyWysiwygFormat(wysiwygCmdMap[action]);
                    }
                    wysiwygEl.focus();
                    syncWysiwygToTextarea(page);
                    updateToolbarActiveStateWysiwyg(page);
                }
            });
        }

        // Chargement initial — optim v3.8.4.0 : fetchUsers et loadMessages en PARALLÈLE.
        // loadMessages ne dépend pas des users (les noms d'auteur sont déjà résolus
        // côté serveur dans MessageSummary.SentByUserName). Le picker de destinataires
        // se rafraîchit dès que fetchUsers retourne, indépendamment du rendu de la liste.
        // Gain : 1 RTT au lieu de 2 séquentiels sur l'ouverture du dashboard.
        fetchUsers().then(function (users) { renderTargetPicker(page, users); });
        loadMessages(page, selectedIds, onEdit);
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
