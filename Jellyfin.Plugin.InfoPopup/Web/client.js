/**
 * jellyfin-info-popup-extention — client.js
 * ------------------------------------------
 * Injecté dans index.html via : <script src="/InfoPopup/client.js"></script>
 *
 * Ce fichier gère DEUX responsabilités :
 *   A) Popup utilisateur : affiche les messages non vus à la connexion
 *   B) Page de configuration admin : initialise les boutons/formulaires
 *      (les scripts inline de configurationpage.html ne s'exécutent pas
 *       en Jellyfin 10.9+ car le HTML est injecté via innerHTML)
 */
(function () {
    'use strict';

    if (window.__infoPopupLoaded) return;
    window.__infoPopupLoaded = true;

    // ── Utilitaires partagés ─────────────────────────────────────────────────

    function getToken() {
        try {
            var client = window.ApiClient;
            if (!client) return null;
            if (typeof client.accessToken === 'function') return client.accessToken();
            if (typeof client.accessToken === 'string')   return client.accessToken;
            return null;
        } catch (e) { return null; }
    }

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

    function escHtml(str) {
        var d = document.createElement('div');
        d.textContent = String(str == null ? '' : str);
        return d.innerHTML;
    }

    // ── Rendu du markup IP → HTML sécurisé ──────────────────────────────────
    // Syntaxe supportée : **gras**, _italique_, ~~barré~~, __souligné__, - liste
    // Sécurité : escHtml() appliqué AVANT les remplacements → jamais de XSS.

    function formatInline(escaped) {
        // Ordre important : ** avant _, __ avant _
        return escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/~~(.*?)~~/g, '<s>$1</s>')
            .replace(/__(.*?)__/g, '<u>$1</u>')
            .replace(/_(.*?)_/g, '<em>$1</em>');
    }

    function renderBody(raw) {
        if (!raw) return '';
        var lines = raw.split('\n');
        var html = '';
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

    function formatDate(iso) {
        var d = new Date(iso);
        return d.getUTCFullYear() + '-' +
               String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
               String(d.getUTCDate()).padStart(2, '0') + ' ' +
               String(d.getUTCHours()).padStart(2, '0') + ':' +
               String(d.getUTCMinutes()).padStart(2, '0') + ' UTC';
    }

    // ════════════════════════════════════════════════════════════════════════
    // A) PAGE DE CONFIGURATION ADMIN
    // ════════════════════════════════════════════════════════════════════════

    var toastTimer = null;

    function showToast(page, msg, isErr) {
        var el = page.querySelector('#ip-toast');
        if (!el) return;
        el.textContent = msg;
        el.className = isErr ? 'ip-toast-err' : 'ip-toast-ok';
        el.style.display = 'block';
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
    }

    function showConfirm(msg) {
        injectStyles();
        return new Promise(function (resolve) {
            var backdrop = document.createElement('div');
            backdrop.className = 'ip-confirm-backdrop';
            var box = document.createElement('div');
            box.className = 'ip-confirm-box';
            box.innerHTML =
                '<h4>Confirmation</h4>' +
                '<p>' + escHtml(msg).replace(/\n/g, '<br/>') + '</p>' +
                '<div class="ip-confirm-actions">' +
                '<button class="ip-btn-cancel" id="ip-c-cancel">Annuler</button>' +
                '<button class="raised button-delete emby-button" id="ip-c-ok">Supprimer</button>' +
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
        if (countEl) countEl.textContent = count === 0 ? '' :
            count + ' message' + (count > 1 ? 's' : '') +
            ' s\u00e9lectionn\u00e9' + (count > 1 ? 's' : '');
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
            return u ? u.name : id.slice(0, 8) + '...';
        }).join(', ');
    }

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
            '<th>Titre <span style="opacity:.45;font-size:.8rem;font-weight:400">(cliquer pour d\u00e9velopper)</span></th>' +
            '<th class="ip-col-target">Destinataires</th>' +
            '<th class="ip-col-date">Publi\u00e9 le</th>' +
            '<th class="ip-col-actions"></th>' +
            '</tr></thead>' +
            '<tbody id="ip-tbody"></tbody>';
        var tbody = table.querySelector('#ip-tbody');
        messages.forEach(function (msg) {
            // Jellyfin peut sérialiser en PascalCase ou camelCase selon la version
            var id          = msg.id          || msg.Id          || '';
            var title       = msg.title       || msg.Title       || '';
            var publishedAt  = msg.publishedAt  || msg.PublishedAt  || '';
            var targetUserIds = msg.targetUserIds || msg.TargetUserIds || [];
            var tr = document.createElement('tr');
            tr.dataset.id = id;
            var targetBadge = targetUserIds.length === 0
                ? '<span class="ip-badge ip-badge-all">Tous</span>'
                : '<span class="ip-badge ip-badge-partial" title="' + escHtml(resolveUserNames(targetUserIds)) + '">' +
                  targetUserIds.length + '\u00a0utilisateur' + (targetUserIds.length > 1 ? 's' : '') + '</span>';
            tr.innerHTML =
                '<td class="ip-col-check">' +
                '<input type="checkbox" class="ip-row-check" data-id="' + escHtml(id) + '" style="width:16px;height:16px;cursor:pointer;accent-color:var(--theme-accent-color,#00a4dc);"/>' +
                '</td>' +
                '<td class="ip-col-title ip-col-title-toggle">' +
                '<span class="ip-row-title-text">' + escHtml(title) + '</span>' +
                '<span class="ip-row-chev">\u25b6</span>' +
                '</td>' +
                '<td class="ip-col-target">' + targetBadge + '</td>' +
                '<td class="ip-col-date">' + escHtml(formatDate(publishedAt)) + '</td>' +
                '<td class="ip-col-actions">' +
                '<button class="ip-edit-btn" title="Modifier ce message">\u270e Modifier</button>' +
                '</td>';

            // Ligne d'expansion pour le corps du message
            var expandTr = document.createElement('tr');
            expandTr.className = 'ip-row-expand';
            var expandTd = document.createElement('td');
            expandTd.colSpan = 5;
            expandTd.className = 'ip-row-expand-td';
            expandTd.textContent = 'Chargement\u2026';
            expandTr.appendChild(expandTd);

            var isOpen = false;
            var bodyLoaded = false;
            var msgBody = null;

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
                            expandTd.textContent = '(Erreur lors du chargement)';
                        });
                }
            });

            // Bouton modifier : charge le message dans le formulaire
            tr.querySelector('.ip-edit-btn').addEventListener('click', function (e) {
                e.stopPropagation();
                if (msgBody !== null) {
                    onEdit({ id: id, title: title, body: msgBody });
                } else {
                    apiFetch('/InfoPopup/messages/' + encodeURIComponent(id))
                        .then(function (res) { return res.json(); })
                        .then(function (data) {
                            msgBody = data.body || data.Body || '';
                            onEdit({ id: id, title: title, body: msgBody });
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
            .then(function (msgs) { renderMessages(page, msgs, selectedIds, onEdit || function(){}); })
            .catch(function (err) {
                showToast(page, 'Erreur de chargement\u00a0: ' + err.message, true);
            });
    }

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
            if (titleErr) { titleErr.textContent = 'Le titre est obligatoire.'; titleErr.style.display = 'block'; }
            valid = false;
        }
        if (!body.trim()) {
            if (bodyErr) { bodyErr.textContent = 'Le message est obligatoire.'; bodyErr.style.display = 'block'; }
            valid = false;
        }
        if (!valid) return;

        var btn = page.querySelector('#ip-publish-btn');
        if (btn) btn.disabled = true;

        // Mode édition (PUT) ou création (POST)
        if (editState.id) {
            apiFetch('/InfoPopup/messages/' + encodeURIComponent(editState.id), {
                method: 'PUT',
                body: JSON.stringify({ title: title, body: body })
            })
            .then(function () {
                showToast(page, '\u2713 Message mis \u00e0 jour\u00a0!');
                editState.id = null;
                exitEditMode(page);
                return loadMessages(page, selectedIds, editState.onEdit);
            })
            .catch(function (err) {
                showToast(page, 'Erreur de mise \u00e0 jour\u00a0: ' + err.message, true);
            })
            .finally(function () { if (btn) btn.disabled = false; });
        } else {
            var targetIds = getSelectedTargetIds(page);
            apiFetch('/InfoPopup/messages', {
                method: 'POST',
                body: JSON.stringify({ title: title, body: body, targetUserIds: targetIds })
            })
            .then(function () {
                if (titleEl) titleEl.value = '';
                if (bodyEl)  bodyEl.value  = '';
                resetTargetPicker(page);
                showToast(page, '\u2713 Message publi\u00e9 avec succ\u00e8s\u00a0!');
                return loadMessages(page, selectedIds, editState.onEdit);
            })
            .catch(function (err) {
                showToast(page, 'Erreur de publication\u00a0: ' + err.message, true);
            })
            .finally(function () { if (btn) btn.disabled = false; });
        }
    }

    function deleteSelected(page, selectedIds, editState) {
        if (!selectedIds.size) return;
        var count = selectedIds.size;
        showConfirm(
            'Supprimer ' + count + ' message' + (count > 1 ? 's' : '') + '\u00a0?\n\n' +
            'Cette action est irr\u00e9versible.'
        ).then(function (confirmed) {
            if (!confirmed) return;
            var btn = page.querySelector('#ip-delete-btn');
            if (btn) btn.disabled = true;
            var ids = Array.from(selectedIds);
            apiFetch('/InfoPopup/messages', {
                method: 'DELETE',
                body: JSON.stringify({ ids: ids })
            })
            .then(function () {
                showToast(
                    page,
                    '\u2713 ' + count + ' message' + (count > 1 ? 's' : '') +
                    ' supprim\u00e9' + (count > 1 ? 's' : '') + '.'
                );
                selectedIds.clear();
                return loadMessages(page, selectedIds, editState ? editState.onEdit : null);
            })
            .catch(function (err) {
                showToast(page, 'Erreur de suppression\u00a0: ' + err.message, true);
                if (btn) btn.disabled = false;
            });
        });
    }

    // ── Gestion des utilisateurs et ciblage ─────────────────────────────────

    function fetchUsers() {
        if (usersCache !== null) return Promise.resolve(usersCache);
        return apiFetch('/Users')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                // L'API Jellyfin retourne soit un tableau direct, soit { Items: [...] }
                var list = Array.isArray(data) ? data : (data.Items || []);
                usersCache = list.map(function (u) {
                    return { id: u.Id || u.id || '', name: u.Name || u.name || '(sans nom)' };
                }).filter(function (u) { return u.id; });
                return usersCache;
            })
            .catch(function () {
                usersCache = [];
                return usersCache;
            });
    }

    function renderTargetPicker(page, users) {
        var container = page.querySelector('#ip-target-picker');
        if (!container) return;

        var allChecked = true; // état initial : tous cochés

        var box = document.createElement('div');
        box.className = 'ip-target-box';

        // ── Ligne "Tous les utilisateurs" ──────────────────────────────
        var allRow = document.createElement('div');
        allRow.className = 'ip-target-all-row';

        var allLabel = document.createElement('label');
        var allChk = document.createElement('input');
        allChk.type = 'checkbox';
        allChk.id = 'ip-target-all';
        allChk.checked = true;
        allChk.style.cssText = 'width:15px;height:15px;cursor:pointer;accent-color:var(--theme-accent-color,#00a4dc);flex-shrink:0;';
        var allSpan = document.createElement('span');
        allSpan.textContent = 'Tous les utilisateurs';
        allLabel.appendChild(allChk);
        allLabel.appendChild(allSpan);
        allRow.appendChild(allLabel);

        if (users.length === 0) {
            var noUsersNote = document.createElement('span');
            noUsersNote.textContent = '(aucun utilisateur trouvé — vérifiez les droits admin)';
            noUsersNote.style.cssText = 'opacity:.45;font-size:.8rem;margin-left:auto;';
            allRow.appendChild(noUsersNote);
        }

        box.appendChild(allRow);

        // ── Liste individuelle (masquée par défaut) ────────────────────
        var userList = document.createElement('div');
        userList.className = 'ip-target-user-list';
        userList.style.display = 'none';

        var userCheckboxes = [];
        users.forEach(function (u) {
            var label = document.createElement('label');
            var chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.dataset.userId = u.id;
            chk.checked = true;
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

        // ── Toggle : quand on décoche "Tous", on affiche la liste ─────
        allChk.addEventListener('change', function () {
            if (allChk.checked) {
                userList.style.display = 'none';
                userCheckboxes.forEach(function (c) { c.checked = true; });
            } else {
                if (users.length > 0) {
                    userList.style.display = 'block';
                } else {
                    // Aucun user dispo, forcer retour à "tous"
                    allChk.checked = true;
                }
            }
        });
    }

    function getSelectedTargetIds(page) {
        var allChk = page.querySelector('#ip-target-all');
        if (!allChk || allChk.checked) return []; // vide = tous
        var ids = [];
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

    // ── Helpers de formatage textarea ────────────────────────────────────────

    function applyFormat(ta, prefix, suffix) {
        var start = ta.selectionStart, end = ta.selectionEnd;
        var val = ta.value;
        var selected = val.slice(start, end);
        // Toggle : si déjà entouré, on retire ; sinon on entoure
        if (selected.startsWith(prefix) && selected.endsWith(suffix) &&
                selected.length > prefix.length + suffix.length) {
            var inner = selected.slice(prefix.length, selected.length - suffix.length);
            ta.value = val.slice(0, start) + inner + val.slice(end);
            ta.setSelectionRange(start, start + inner.length);
        } else {
            ta.value = val.slice(0, start) + prefix + selected + suffix + val.slice(end);
            ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
        }
    }

    function toggleListLines(ta) {
        var start = ta.selectionStart, end = ta.selectionEnd;
        var val = ta.value;
        var lineStart = val.lastIndexOf('\n', start - 1) + 1;
        var lineEnd = val.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = val.length;
        var block = val.slice(lineStart, lineEnd);
        var lines = block.split('\n');
        var allBullet = lines.every(function (l) { return /^- /.test(l); });
        var newBlock = lines.map(function (l) {
            return allBullet ? l.slice(2) : '- ' + l;
        }).join('\n');
        ta.value = val.slice(0, lineStart) + newBlock + val.slice(lineEnd);
        ta.setSelectionRange(lineStart, lineStart + newBlock.length);
    }

    function enterEditMode(page, msg, editState) {
        editState.id = msg.id;
        var titleEl = page.querySelector('#ip-title');
        var bodyEl  = page.querySelector('#ip-body');
        if (titleEl) titleEl.value = msg.title;
        if (bodyEl)  bodyEl.value  = msg.body;
        var publishBtn   = page.querySelector('#ip-publish-btn');
        var cancelBtn    = page.querySelector('#ip-cancel-edit-btn');
        var sectionTitle = page.querySelector('#ip-form-section-title');
        if (publishBtn)   publishBtn.textContent = '\u2713 Mettre \u00e0 jour';
        if (cancelBtn)    cancelBtn.style.display = 'inline-flex';
        if (sectionTitle) sectionTitle.textContent = 'Modifier le message';
        page.querySelector('.detailSection').scrollIntoView({ behavior: 'smooth' });
        if (titleEl) titleEl.focus();
    }

    function exitEditMode(page) {
        var titleEl  = page.querySelector('#ip-title');
        var bodyEl   = page.querySelector('#ip-body');
        if (titleEl) titleEl.value = '';
        if (bodyEl)  bodyEl.value  = '';
        var publishBtn   = page.querySelector('#ip-publish-btn');
        var cancelBtn    = page.querySelector('#ip-cancel-edit-btn');
        var sectionTitle = page.querySelector('#ip-form-section-title');
        if (publishBtn)   publishBtn.textContent = 'Publier le message';
        if (cancelBtn)    cancelBtn.style.display = 'none';
        if (sectionTitle) sectionTitle.textContent = 'Nouveau message';
    }

        function initConfigPage(page) {
        if (page._ipInitDone) return;
        page._ipInitDone = true;
        // Injecter les styles globaux dès l'init de la page config
        // (injectStyles() est idempotent — sans effet si déjà injecté)
        injectStyles();
        console.log('InfoPopup: config page init OK');

        var selectedIds = new Set();

        // État d'édition partagé entre fonctions
        var editState = { id: null, onEdit: null };

        var onEdit = function (msg) { enterEditMode(page, msg, editState); };
        editState.onEdit = onEdit;

        var publishBtn = page.querySelector('#ip-publish-btn');
        var deleteBtn  = page.querySelector('#ip-delete-btn');
        var selectAll  = page.querySelector('#ip-select-all');
        var cancelBtn  = page.querySelector('#ip-cancel-edit-btn');
        var bodyEl     = page.querySelector('#ip-body');
        var toolbar    = page.querySelector('#ip-format-toolbar');

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

        // ── Toolbar de formatage ─────────────────────────────────────────
        if (toolbar && bodyEl) {
            var fmtMap = { bold: ['**','**'], italic: ['_','_'], strike: ['~~','~~'], underline: ['__','__'] };
            toolbar.addEventListener('click', function (e) {
                var btn = e.target.closest('.ip-fmt-btn');
                if (!btn) return;
                e.preventDefault();
                var action = btn.dataset.action;
                if (action === 'list') {
                    toggleListLines(bodyEl);
                } else if (fmtMap[action]) {
                    applyFormat(bodyEl, fmtMap[action][0], fmtMap[action][1]);
                }
                bodyEl.focus();
            });
        }

        // Charger les utilisateurs d'abord, puis initialiser le picker et le tableau
        fetchUsers().then(function (users) {
            renderTargetPicker(page, users);
            return loadMessages(page, selectedIds, onEdit);
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // B) POPUP UTILISATEUR (messages non vus)
    // ════════════════════════════════════════════════════════════════════════

    var popupActive     = false;
    var lastCheckedPath = null;
    var checkScheduled  = false;

    // Cache des utilisateurs Jellyfin (chargé une fois par session de page admin)
    var usersCache = null; // null = pas encore chargé, [] = chargé mais vide

    function injectStyles() {
        if (document.getElementById('infopopup-styles')) return;
        var s = document.createElement('style');
        s.id = 'infopopup-styles';
        s.textContent = [
            '#infopopup-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99998;display:flex;align-items:center;justify-content:center;animation:ip-fade .2s ease}',
            '@keyframes ip-fade{from{opacity:0}to{opacity:1}}',
            '#infopopup-dialog{background:var(--theme-body-background-color,#202020);color:var(--theme-text-color,#e5e5e5);border:1px solid rgba(255,255,255,.12);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.6);max-width:560px;width:calc(100% - 32px);max-height:80vh;overflow-y:auto;display:flex;flex-direction:column;animation:ip-slide .25s cubic-bezier(.4,0,.2,1);font-family:inherit}',
            '@keyframes ip-slide{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}',
            '#infopopup-header{display:flex;align-items:center;gap:10px;padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,.1)}',
            '.ip-icon{font-size:1.4rem;flex-shrink:0}',
            '.ip-title{flex:1;font-size:1.1rem;font-weight:600;overflow-wrap:break-word;word-break:break-word}',
            '.ip-close-btn{background:none;border:none;cursor:pointer;flex-shrink:0;color:var(--theme-text-color,#e5e5e5);font-size:1.3rem;opacity:.7;padding:4px 6px;border-radius:4px;transition:opacity .15s;line-height:1}',
            '.ip-close-btn:hover{opacity:1}',
            '#infopopup-body{padding:18px 20px;overflow-wrap:break-word;word-break:break-word;line-height:1.6;flex:1}',
            '.ip-history{margin:0 20px 12px;border:1px solid rgba(255,255,255,.1);border-radius:6px;overflow:hidden}',
            '.ip-history-toggle{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;background:rgba(255,255,255,.04);user-select:none;font-size:.9rem;gap:8px}',
            '.ip-history-toggle:hover{background:rgba(255,255,255,.08)}',
            '.ip-chevron{transition:transform .2s;font-size:.75rem;opacity:.7}',
            '.ip-history.expanded .ip-chevron{transform:rotate(180deg)}',
            '.ip-history-list{display:none;border-top:1px solid rgba(255,255,255,.1)}',
            '.ip-history.expanded .ip-history-list{display:block}',
            '.ip-history-item{border-bottom:1px solid rgba(255,255,255,.07)}',
            '.ip-history-item:last-child{border-bottom:none}',
            '.ip-item-hdr{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;cursor:pointer;font-size:.88rem;gap:10px}',
            '.ip-item-hdr:hover{background:rgba(255,255,255,.05)}',
            '.ip-item-title{font-weight:500;flex:1}',
            '.ip-item-date{opacity:.55;font-size:.82rem;flex-shrink:0}',
            '.ip-item-chev{opacity:.55;font-size:.7rem;transition:transform .2s;flex-shrink:0}',
            '.ip-history-item.open .ip-item-chev{transform:rotate(180deg)}',
            '.ip-item-body{display:none;padding:10px 14px 12px;font-size:.9rem;overflow-wrap:break-word;word-break:break-word;background:rgba(0,0,0,.15);line-height:1.55;opacity:.9}',
            '.ip-history-item.open .ip-item-body{display:block}',
            '#infopopup-footer{display:flex;justify-content:flex-end;padding:12px 20px 18px;border-top:1px solid rgba(255,255,255,.08)}',
            '.ip-btn-close{background:var(--theme-accent-color,#00a4dc);color:#fff;border:none;border-radius:4px;padding:9px 22px;font-size:.95rem;font-weight:500;cursor:pointer;transition:filter .15s}',
            '.ip-btn-close:hover{filter:brightness(1.15)}',
            /* ── Listes de corps de message ── */
            '.ip-list{margin:6px 0 4px 0;padding-left:22px;list-style:disc}',
            '.ip-list li{margin:3px 0;line-height:1.55}',
            /* ── Confirm dialog — styles en <head> pour survivre aux transitions SPA ── */
            '.ip-confirm-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center}',
            '.ip-confirm-box{background:var(--theme-body-background-color,#202020);color:var(--theme-text-color,#e5e5e5);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:28px 28px 22px;max-width:420px;width:calc(100% - 32px);box-shadow:0 8px 32px rgba(0,0,0,.6)}',
            '.ip-confirm-box h4{margin:0 0 10px;font-size:1.05rem}',
            '.ip-confirm-box p{margin:0 0 22px;opacity:.8;font-size:.93rem;line-height:1.5}',
            '.ip-confirm-actions{display:flex;justify-content:flex-end;gap:12px}',
            '.ip-confirm-actions .ip-btn-cancel{background:rgba(255,255,255,.1);color:var(--theme-text-color,#e5e5e5);border:1px solid rgba(255,255,255,.2);border-radius:4px;padding:9px 22px;font-size:.95rem;font-weight:500;cursor:pointer;transition:background .15s}',
            '.ip-confirm-actions .ip-btn-cancel:hover{background:rgba(255,255,255,.18)}',
            /* ── Multi-messages non vus ── */
            '#infopopup-msgs{padding:12px 20px;display:flex;flex-direction:column;gap:12px}',
            '.ip-msg-card{border:1px solid rgba(255,255,255,.12);border-radius:6px;overflow:hidden}',
            '.ip-msg-card-title{font-weight:600;font-size:.97rem;padding:11px 14px 10px;background:rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.08);overflow-wrap:break-word;word-break:break-word}',
            '.ip-msg-card-body{padding:11px 14px 13px;overflow-wrap:break-word;word-break:break-word;line-height:1.6;opacity:.92;font-size:.93rem}',
            /* ── Table admin : expand rows + edit btn (en <head> car injectStyles est la seule CSS persistante en SPA) ── */
            '.ip-col-title-toggle{cursor:pointer;user-select:none}',
            '.ip-col-title-toggle:hover .ip-row-title-text{text-decoration:underline;text-underline-offset:2px}',
            '.ip-row-chev{margin-left:8px;opacity:.45;font-size:.72rem;transition:transform .18s;display:inline-block;vertical-align:middle}',
            '.ip-row-chev.open{transform:rotate(90deg)}',
            '.ip-row-expand{display:none}',
            '.ip-row-expand.visible{display:table-row}',
            '.ip-row-expand-td{padding:12px 16px 14px;background:rgba(0,0,0,.2);border-top:1px solid rgba(255,255,255,.05) !important;overflow-wrap:break-word;word-break:break-word;font-size:.9rem;line-height:1.6;opacity:.88}',
            '.ip-row-expand-td .ip-list{margin:4px 0 0 0}',
            '.ip-edit-btn{background:none;border:1px solid rgba(255,255,255,.15);border-radius:4px;cursor:pointer;color:var(--theme-text-color,#e5e5e5);opacity:.55;padding:3px 8px;font-size:.82rem;transition:opacity .15s,background .15s;white-space:nowrap}',
            '.ip-edit-btn:hover{opacity:1;background:rgba(255,255,255,.08)}',
            '.ip-col-actions{width:72px;text-align:center}'
        ].join('\n');
        document.head.appendChild(s);
    }

    function buildHistoryBlock(messages) {
        var block = document.createElement('div');
        block.className = 'ip-history';
        var toggle = document.createElement('div');
        toggle.className = 'ip-history-toggle';
        toggle.setAttribute('role', 'button');
        toggle.setAttribute('tabindex', '0');
        toggle.innerHTML = '<span>Messages pr\u00e9c\u00e9dents (' + messages.length + ')</span><span class="ip-chevron">\u25bc</span>';
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
            // body déjà pré-chargé par checkForUnseenMessages
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

            var loaded = (bodyRaw !== null);
            if (loaded) {
                // Corps disponible immédiatement
                itemBody.innerHTML = renderBody(bodyRaw);
            }

            var loadLazy = function () {
                if (loaded || !id) return;
                loaded = true;
                itemBody.textContent = 'Chargement\u2026';
                apiFetch('/InfoPopup/messages/' + encodeURIComponent(id))
                    .then(function (res) { return res.json(); })
                    .then(function (data) {
                        var b = data.body || data.Body || '';
                        itemBody.innerHTML = b ? renderBody(b) : '<em style="opacity:.5">(message vide)</em>';
                    })
                    .catch(function () { itemBody.textContent = '(Erreur lors du chargement)'; });
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

    function showPopup(unseenMessages, seenMessages) {
        if (popupActive) return;
        popupActive = true;
        injectStyles();

        var allUnseenIds = unseenMessages.map(function (m) { return m.id || m.Id || ''; });
        var isSingle = unseenMessages.length === 1;
        var headerTitle = isSingle
            ? (unseenMessages[0].title || unseenMessages[0].Title || '')
            : unseenMessages.length + ' nouveaux messages';

        var backdrop = document.createElement('div');
        backdrop.id = 'infopopup-backdrop';
        var dialog = document.createElement('div');
        dialog.id = 'infopopup-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', headerTitle);

        var header = document.createElement('div');
        header.id = 'infopopup-header';
        header.innerHTML =
            '<span class="ip-icon" aria-hidden="true">\ud83d\udd14</span>' +
            '<span class="ip-title">' + escHtml(headerTitle) + '</span>' +
            '<button class="ip-close-btn" aria-label="Fermer" title="Fermer">\u2715</button>';

        dialog.appendChild(header);

        if (isSingle) {
            // Un seul message non vu : affichage classique titre + corps
            var body = document.createElement('div');
            body.id = 'infopopup-body';
            body.innerHTML = renderBody(unseenMessages[0].body || unseenMessages[0].Body || '');
            dialog.appendChild(body);
        } else {
            // Plusieurs messages non vus : chaque message dans sa propre carte
            var msgsContainer = document.createElement('div');
            msgsContainer.id = 'infopopup-msgs';
            unseenMessages.forEach(function (msg) {
                var card = document.createElement('div');
                card.className = 'ip-msg-card';
                var cardTitle = document.createElement('div');
                cardTitle.className = 'ip-msg-card-title';
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

        if (seenMessages.length > 0) dialog.appendChild(buildHistoryBlock(seenMessages));

        var footer = document.createElement('div');
        footer.id = 'infopopup-footer';
        var closeBtn = document.createElement('button');
        closeBtn.className = 'ip-btn-close';
        closeBtn.textContent = 'Fermer';
        footer.appendChild(closeBtn);
        dialog.appendChild(footer);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
        closeBtn.focus();

        var close = function () {
            backdrop.remove();
            popupActive = false;
            markAllSeen(allUnseenIds);
        };
        closeBtn.addEventListener('click', close);
        header.querySelector('.ip-close-btn').addEventListener('click', close);
        backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
        var onKey = function (e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
        };
        document.addEventListener('keydown', onKey);
    }

    function markAllSeen(ids) {
        if (!ids || !ids.length) return;
        apiFetch('/InfoPopup/seen', {
            method: 'POST',
            body: JSON.stringify({ ids: ids })
        }).catch(function (err) {
            console.warn('[InfoPopup] markAllSeen failed:', err);
        });
    }

    function checkForUnseenMessages() {
        apiFetch('/InfoPopup/unseen')
            .then(function (res) { return res.json(); })
            .then(function (unseenList) {
                if (!unseenList || !unseenList.length) return;
                var unseenIds = unseenList.map(function (m) { return m.id || m.Id || ''; });
                // Récupérer : corps de tous les non-vus + liste complète des messages
                return Promise.all([
                    Promise.all(unseenIds.map(function (id) {
                        return apiFetch('/InfoPopup/messages/' + encodeURIComponent(id))
                            .then(function (res) { return res.json(); });
                    })),
                    apiFetch('/InfoPopup/messages').then(function (res) { return res.json(); })
                ]).then(function (results) {
                    var unseenFull = results[0];
                    var allMessages = results[1];
                    // Identifier les messages déjà vus
                    var seenSummaries = allMessages.filter(function (m) {
                        return unseenIds.indexOf(m.id || m.Id || '') === -1;
                    });
                    // Pré-charger le corps de chaque message vu (élimine le lazy load)
                    return Promise.all(seenSummaries.map(function (m) {
                        var id = m.id || m.Id || '';
                        if (!id) return Promise.resolve(m); // id vide : on garde le résumé
                        return apiFetch('/InfoPopup/messages/' + encodeURIComponent(id))
                            .then(function (res) { return res.json(); })
                            .catch(function () { return m; }); // en cas d'erreur, résumé sans body
                    })).then(function (seenFull) {
                        showPopup(unseenFull, seenFull);
                    });
                });
            })
            .catch(function () {
                // Silencieux : session expirée, réseau KO, aucun message
            });
    }

    // ── MutationObserver central ─────────────────────────────────────────────
    // Un seul observer gère à la fois :
    //   - la détection de la page home (popup)
    //   - la détection de la page de config (init boutons)

    function schedulePopupCheck() {
        if (checkScheduled) return;
        checkScheduled = true;
        setTimeout(function () {
            checkScheduled = false;
            if (!getToken()) return;
            // Ne pas déclencher le popup si la page de config admin est active
            if (document.querySelector('#infoPopupConfigPage')) return;
            var path = window.location.hash || window.location.pathname;
            if (path === lastCheckedPath) return;
            lastCheckedPath = path;
            checkForUnseenMessages();
        }, 800);
    }

    function checkConfigPage() {
        var page = document.querySelector('#infoPopupConfigPage');
        if (page) initConfigPage(page);
    }

    function initObserver() {
        new MutationObserver(function () {
            // Déclenche le check popup à chaque mutation DOM significative.
            // lastCheckedPath + popupActive empêchent les doublons.
            // On ne restreint plus à la home page car Jellyfin 10.11 (React Router)
            // n'utilise plus #indexPage / .homePage comme sélecteurs.
            schedulePopupCheck();
            // Config page : boutons à initialiser
            checkConfigPage();
        }).observe(document.body, { childList: true, subtree: true });

        window.addEventListener('hashchange', schedulePopupCheck);
        window.addEventListener('popstate',   schedulePopupCheck);

        // Tentative immédiate au cas où la page est déjà présente
        schedulePopupCheck();
        checkConfigPage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }

})();
