/**
 * jellyfin-info-popup-extention — client.js  v0.5.1.0
 * -----------------------------------------------------
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

    // ── État partagé ─────────────────────────────────────────────────────────
    // Regroupé en tête pour visibility immédiate et éviter la confusion due
    // au hoisting de var en JS.

    var popupActive     = false; // true pendant l'affichage ET le marquage comme vu
    var lastCheckedPath = null;
    var checkScheduled  = false;
    var usersCache      = null;  // null = non chargé, [] = chargé mais vide
    var usersCacheAt    = 0;     // timestamp du dernier chargement (TTL 5 min)

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
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('role', 'status');
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
            var id            = msg.id            || msg.Id            || '';
            var title         = msg.title         || msg.Title         || '';
            var publishedAt   = msg.publishedAt   || msg.PublishedAt   || '';
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

        if (editState.id) {
            // ── Mode édition : PUT ────────────────────────────────────────────
            apiFetch('/InfoPopup/messages/' + encodeURIComponent(editState.id), {
                method: 'PUT',
                body: JSON.stringify({ title: title, body: body })
            })
            .then(function () {
                showToast(page, '\u2713 Message mis \u00e0 jour\u00a0!');
                editState.id = null;
                exitEditMode(page);  // efface les champs + repasse en aperçu
                return loadMessages(page, selectedIds, editState.onEdit);
            })
            .catch(function (err) {
                showToast(page, 'Erreur de mise \u00e0 jour\u00a0: ' + err.message, true);
            })
            .finally(function () { if (btn) btn.disabled = false; });
        } else {
            // ── Nouveau message : POST ────────────────────────────────────────
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
                setPreviewMode(page, true); // repasser en aperçu après publication
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
            apiFetch('/InfoPopup/messages/delete', {
                method: 'POST',
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

    /**
     * Charge la liste des utilisateurs Jellyfin avec un cache de 5 minutes.
     * Invalide le cache si le TTL est dépassé (permet de voir les nouveaux
     * utilisateurs créés pendant la session sans recharger la page entière).
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
                    return { id: u.Id || u.id || '', name: u.Name || u.name || '(sans nom)' };
                }).filter(function (u) { return u.id; });
                usersCacheAt = Date.now();
                return usersCache;
            })
            .catch(function () {
                usersCache = [];
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
            noUsersNote.textContent = '(aucun utilisateur trouv\u00e9 \u2014 v\u00e9rifiez les droits admin)';
            noUsersNote.style.cssText = 'opacity:.45;font-size:.8rem;margin-left:auto;';
            allRow.appendChild(noUsersNote);
        }

        box.appendChild(allRow);

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

        allChk.addEventListener('change', function () {
            if (allChk.checked) {
                userList.style.display = 'none';
                userCheckboxes.forEach(function (c) { c.checked = true; });
            } else {
                if (users.length > 0) {
                    userList.style.display = 'block';
                } else {
                    allChk.checked = true;
                }
            }
        });
    }

    function getSelectedTargetIds(page) {
        var allChk = page.querySelector('#ip-target-all');
        if (!allChk || allChk.checked) return [];
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

    // ── Détection de contexte de formatage ───────────────────────────────────

    // Retourne les indices des occurrences de `marker` dans `line`, en gérant
    // la collision _ vs __ : un _ adjacent à un autre _ est ignoré quand on cherche _.
    function findMarkerPositions(line, marker) {
        var positions = [];
        var mLen = marker.length;
        var i = 0;
        while (i <= line.length - mLen) {
            var idx = line.indexOf(marker, i);
            if (idx === -1) break;
            // Pour _ seul : sauter si précédé ou suivi d'un autre _
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

    // Retourne {from, to, innerFrom, innerTo} de la paire de marqueurs qui
    // entoure `cursorPos`, ou null si le curseur n'est pas dedans.
    // Opère ligne par ligne (les marqueurs ne traversent pas les sauts de ligne).
    function getFormatBoundsAroundCursor(val, cursorPos, marker) {
        var lineStart = val.lastIndexOf('\n', cursorPos - 1) + 1;
        var lineEnd   = val.indexOf('\n', cursorPos);
        if (lineEnd === -1) lineEnd = val.length;
        var line = val.slice(lineStart, lineEnd);
        var cp   = cursorPos - lineStart;
        var mLen = marker.length;

        var positions = findMarkerPositions(line, marker);
        // Les marqueurs fonctionnent par paires ; on itère deux par deux.
        for (var i = 0; i + 1 < positions.length; i += 2) {
            var openIdx  = positions[i];
            var closeIdx = positions[i + 1];
            // Le curseur est "dedans" s'il est entre le début du marqueur ouvrant
            // et la fin du marqueur fermant (inclus — pour qu'un clic juste après
            // le dernier marqueur soit aussi reconnu).
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

    // Retourne {bold, italic, underline, strike} : true si le curseur ou la
    // sélection est à l'intérieur du formatage correspondant.
    // __ est testé avant _ pour éviter les faux positifs (__ contient _).
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
                // Avec sélection : vérifier si le texte sélectionné est enveloppé
                var sel  = val.slice(start, end);
                var mLen = c.marker.length;
                active[c.key] = sel.length > mLen * 2 &&
                                sel.startsWith(c.marker) && sel.endsWith(c.marker);
            } else {
                // Sans sélection : curseur à l'intérieur d'une paire ?
                active[c.key] = getFormatBoundsAroundCursor(val, start, c.marker) !== null;
            }
        });
        return active;
    }

    // Met à jour l'apparence "enfoncée" des boutons de la toolbar.
    function updateToolbarActiveState(page, ta) {
        var active  = getActiveFormats(ta);
        var toolbar = page.querySelector('#ip-format-toolbar');
        if (!toolbar) return;
        toolbar.querySelectorAll('.ip-fmt-btn[data-action]').forEach(function (btn) {
            var a = btn.dataset.action;
            if (a && a !== 'list') btn.classList.toggle('active', !!active[a]);
        });
    }

    // ── Formatage du textarea ────────────────────────────────────────────────

    // applyFormat — version intelligente :
    //   • Sélection enveloppée dans les marqueurs → retrait
    //   • Sélection sans marqueurs → ajout
    //   • Pas de sélection + curseur dans une paire → retrait de la paire
    //   • Pas de sélection + curseur hors paire → insertion des marqueurs (curseur entre eux)
    function applyFormat(ta, prefix, suffix) {
        var start = ta.selectionStart, end = ta.selectionEnd;
        var val = ta.value;

        if (start < end) {
            // ── Avec sélection ──
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
            // ── Sans sélection ──
            var bounds = getFormatBoundsAroundCursor(val, start, prefix);
            if (bounds) {
                // Curseur dans une paire existante → retrait
                var inner2  = val.slice(bounds.innerFrom, bounds.innerTo);
                ta.value    = val.slice(0, bounds.from) + inner2 + val.slice(bounds.to);
                var newPos  = Math.max(bounds.from, start - prefix.length);
                ta.setSelectionRange(newPos, newPos);
            } else {
                // Hors de toute paire → insertion avec curseur entre les marqueurs
                ta.value = val.slice(0, start) + prefix + suffix + val.slice(start);
                ta.setSelectionRange(start + prefix.length, start + prefix.length);
            }
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

    // ── Aperçu en temps réel (v0.6) ──────────────────────────────────────────

    /**
     * Met à jour le div d'aperçu avec le rendu formaté du textarea.
     * Affiche un texte d'invite si le textarea est vide.
     * Doit être appelé après chaque modification de bodyEl.value.
     */
    function updatePreview(page) {
        var bodyEl  = page.querySelector('#ip-body');
        var preview = page.querySelector('#ip-body-preview');
        if (!preview) return;
        var raw = bodyEl ? bodyEl.value : '';
        if (!raw.trim()) {
            preview.innerHTML = '<span class="ip-preview-hint">Cliquez ici ou sur \u00ab\u00a0Brut\u00a0\u00bb pour commencer \u00e0 saisir\u2026</span>';
        } else {
            preview.innerHTML = renderBody(raw);
        }
    }

    /**
     * Bascule entre le mode aperçu (preview visible, textarea caché)
     * et le mode brut (textarea visible, preview caché).
     *
     * @param {Element} page  - Élément racine de la page config.
     * @param {boolean} on    - true = aperçu, false = brut.
     */
    function setPreviewMode(page, on) {
        var bodyEl  = page.querySelector('#ip-body');
        var preview = page.querySelector('#ip-body-preview');
        var toggle  = page.querySelector('#ip-preview-toggle');
        var label   = page.querySelector('#ip-preview-toggle-label');
        if (!bodyEl || !preview) return;
        if (on) {
            // Mode aperçu : preview visible, textarea caché
            updatePreview(page);
            preview.style.display = 'block';
            bodyEl.style.display  = 'none';
            if (toggle) toggle.checked = false; // Raw est désactivé
            if (label)  label.textContent = 'Raw';
        } else {
            // Mode brut : textarea visible, preview caché
            preview.style.display = 'none';
            bodyEl.style.display  = 'block';
            if (toggle) toggle.checked = true;  // Raw est activé
            if (label)  label.textContent = 'Raw';
            bodyEl.focus();
            // Mettre à jour l'état des boutons de la toolbar selon la position du curseur
            var configPage = bodyEl.closest('#infoPopupConfigPage');
            if (configPage) updateToolbarActiveState(configPage, bodyEl);
        }
    }

    // ── Modes édition ────────────────────────────────────────────────────────

    function enterEditMode(page, msg, editState) {
        editState.id = msg.id;
        var titleEl = page.querySelector('#ip-title');
        var bodyEl  = page.querySelector('#ip-body');
        if (titleEl) titleEl.value = msg.title;
        if (bodyEl)  bodyEl.value  = msg.body;
        // Passer automatiquement en mode brut pour permettre l'édition directe
        setPreviewMode(page, false);
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
        // Repasser en aperçu : montre le placeholder "commencer à saisir"
        setPreviewMode(page, true);
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
        injectStyles();

        var toast = page.querySelector('#ip-toast');
        if (toast) {
            toast.setAttribute('aria-live', 'polite');
            toast.setAttribute('role', 'status');
        }

        console.log('InfoPopup: config page init OK');

        var selectedIds = new Set();
        var editState = { id: null, onEdit: null };
        var onEdit = function (msg) { enterEditMode(page, msg, editState); };
        editState.onEdit = onEdit;

        var publishBtn    = page.querySelector('#ip-publish-btn');
        var deleteBtn     = page.querySelector('#ip-delete-btn');
        var selectAll     = page.querySelector('#ip-select-all');
        var cancelBtn     = page.querySelector('#ip-cancel-edit-btn');
        var bodyEl        = page.querySelector('#ip-body');
        var toolbar       = page.querySelector('#ip-format-toolbar');
        var previewToggle = page.querySelector('#ip-preview-toggle');
        var bodyPreview   = page.querySelector('#ip-body-preview');

        // ── État initial : aperçu activé ─────────────────────────────────────
        setPreviewMode(page, true);

        // ── Toggle Raw : coché = mode brut (textarea), décoché = mode aperçu ──
        if (previewToggle) {
            previewToggle.addEventListener('change', function () {
                // Raw coché = textarea visible, aperçu caché
                setPreviewMode(page, !previewToggle.checked);
            });
        }

        // Cliquer sur l'aperçu bascule en mode brut pour éditer
        if (bodyPreview) {
            bodyPreview.addEventListener('click', function () {
                setPreviewMode(page, false);
            });
        }

        // Mise à jour de l'aperçu à chaque frappe (en arrière-plan, même si caché)
        if (bodyEl) {
            bodyEl.addEventListener('input', function () {
                updatePreview(page);
            });

            // ── Mise à jour de l'état actif des boutons de formatage ─────────────
            // Appelé à chaque déplacement de curseur ou modification de sélection,
            // qu'il y ait du texte sélectionné ou non.
            var refreshToolbarState = function () {
                updateToolbarActiveState(page, bodyEl);
            };
            bodyEl.addEventListener('keyup',    refreshToolbarState);
            bodyEl.addEventListener('mouseup',  refreshToolbarState);
            bodyEl.addEventListener('touchend', refreshToolbarState);
            // selectionchange sur document : filtré par focus pour ne traiter
            // que les changements dans notre textarea.
            document.addEventListener('selectionchange', function () {
                if (document.activeElement === bodyEl) refreshToolbarState();
            });
        }

        // ── Boutons principaux ───────────────────────────────────────────────
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
        if (toolbar && bodyEl) {
            var fmtMap = { bold: ['**','**'], italic: ['_','_'], strike: ['~~','~~'], underline: ['__','__'] };
            toolbar.addEventListener('click', function (e) {
                var btn = e.target.closest('.ip-fmt-btn');
                if (!btn) return;
                e.preventDefault();
                // Si on est en aperçu, basculer en brut pour que l'utilisateur
                // voie l'effet du formatage dans le textarea
                setPreviewMode(page, false);
                var action = btn.dataset.action;
                if (action === 'list') {
                    toggleListLines(bodyEl);
                } else if (fmtMap[action]) {
                    applyFormat(bodyEl, fmtMap[action][0], fmtMap[action][1]);
                }
                bodyEl.focus();
                updatePreview(page); // mettre à jour l'aperçu en arrière-plan
                updateToolbarActiveState(page, bodyEl); // refléter l'état du curseur
            });
        }

        // ── Chargement initial : utilisateurs + messages ──────────────────────
        fetchUsers().then(function (users) {
            renderTargetPicker(page, users);
            return loadMessages(page, selectedIds, onEdit);
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // B) POPUP UTILISATEUR (messages non vus)
    // ════════════════════════════════════════════════════════════════════════

    function injectStyles() {
        if (document.getElementById('infopopup-styles')) return;
        var s = document.createElement('style');
        s.id = 'infopopup-styles';
        s.textContent = [
            // ── Popup utilisateur ───────────────────────────────────────────
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
            '.ip-list{margin:6px 0 4px 0;padding-left:22px;list-style:disc}',
            '.ip-list li{margin:3px 0;line-height:1.55}',
            // ── Confirm dialog ──────────────────────────────────────────────
            '.ip-confirm-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center}',
            '.ip-confirm-box{background:var(--theme-body-background-color,#202020);color:var(--theme-text-color,#e5e5e5);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:28px 28px 22px;max-width:420px;width:calc(100% - 32px);box-shadow:0 8px 32px rgba(0,0,0,.6)}',
            '.ip-confirm-box h4{margin:0 0 10px;font-size:1.05rem}',
            '.ip-confirm-box p{margin:0 0 22px;opacity:.8;font-size:.93rem;line-height:1.5}',
            '.ip-confirm-actions{display:flex;justify-content:flex-end;gap:12px}',
            '.ip-confirm-actions .ip-btn-cancel{background:rgba(255,255,255,.1);color:var(--theme-text-color,#e5e5e5);border:1px solid rgba(255,255,255,.2);border-radius:4px;padding:9px 22px;font-size:.95rem;font-weight:500;cursor:pointer;transition:background .15s}',
            '.ip-confirm-actions .ip-btn-cancel:hover{background:rgba(255,255,255,.18)}',
            // ── Multi-messages cards ────────────────────────────────────────
            '#infopopup-msgs{padding:12px 20px;display:flex;flex-direction:column;gap:12px}',
            '.ip-msg-card{border:1px solid rgba(255,255,255,.12);border-radius:6px;overflow:hidden}',
            '.ip-msg-card-title{font-weight:600;font-size:.97rem;padding:11px 14px 10px;background:rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.08);overflow-wrap:break-word;word-break:break-word}',
            '.ip-msg-card-body{padding:11px 14px 13px;overflow-wrap:break-word;word-break:break-word;line-height:1.6;opacity:.92;font-size:.93rem}',
            // ── Tableau admin (déroulants) ──────────────────────────────────
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
            '.ip-col-actions{width:72px;text-align:center}',
            // ── Tableau admin (structure) — migré depuis configurationpage.html ──
            '.ip-table{width:100%;border-collapse:collapse;font-size:.92rem}',
            '.ip-table thead th{text-align:left;padding:10px 12px;border-bottom:2px solid rgba(255,255,255,.15);font-weight:600;opacity:.8}',
            '.ip-table tbody tr{border-bottom:1px solid rgba(255,255,255,.07);transition:background .12s}',
            '.ip-table tbody tr:hover{background:rgba(255,255,255,.04)}',
            '.ip-table td{padding:10px 12px;vertical-align:middle}',
            '.ip-col-check{width:40px}',
            '.ip-col-date{width:160px;opacity:.65;white-space:nowrap}',
            '.ip-col-target{width:150px}',
            '.ip-col-title{font-weight:500;overflow-wrap:break-word;word-break:break-word}',
            // ── Badges destinataires ────────────────────────────────────────
            '.ip-badge{display:inline-block;padding:2px 9px;border-radius:10px;font-size:.78rem;font-weight:500;white-space:nowrap}',
            '.ip-badge-all{background:rgba(255,255,255,.1);color:rgba(255,255,255,.7)}',
            '.ip-badge-partial{background:rgba(0,164,220,.18);border:1px solid rgba(0,164,220,.35);color:var(--theme-accent-color,#00a4dc)}',
            // ── Toast ───────────────────────────────────────────────────────
            '.ip-toast-ok{background:rgba(0,180,100,.2);border:1px solid rgba(0,180,100,.5);color:#6ee09f}',
            '.ip-toast-err{background:rgba(207,102,121,.2);border:1px solid rgba(207,102,121,.5);color:#cf6679}',
            // ── Ciblage utilisateurs ────────────────────────────────────────
            '.ip-target-box{border:1px solid rgba(255,255,255,.12);border-radius:6px;overflow:hidden}',
            '.ip-target-all-row{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,.03)}',
            '.ip-target-all-row label{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.93rem;user-select:none}',
            '.ip-target-user-list{border-top:1px solid rgba(255,255,255,.1);max-height:200px;overflow-y:auto;padding:8px 0}',
            '.ip-target-user-list label{display:flex;align-items:center;gap:8px;padding:5px 14px;cursor:pointer;font-size:.88rem;transition:background .1s;user-select:none}',
            '.ip-target-user-list label:hover{background:rgba(255,255,255,.04)}',
            // ── Toolbar de formatage ────────────────────────────────────────
            '.ip-fmt-btn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:var(--theme-text-color,#e5e5e5);cursor:pointer;font-size:.88rem;min-width:32px;padding:4px 10px;transition:background .15s,border-color .15s;line-height:1.4}',
            '.ip-fmt-btn:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3)}',
            '.ip-fmt-btn:active{background:rgba(255,255,255,.2)}',
            '.ip-fmt-btn-sep{margin-left:6px;border-left:1px solid rgba(255,255,255,.2)}',
            // ── Éditeur aperçu / brut (v0.6) ────────────────────────────────
            '.ip-editor-wrap{display:block}',
            '.ip-body-preview{min-height:130px;border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:10px 12px;line-height:1.55;font-size:.92rem;background:rgba(0,0,0,.12);cursor:text;overflow-y:auto;color:var(--theme-text-color,#e5e5e5);transition:border-color .15s;word-break:break-word;overflow-wrap:break-word;white-space:pre-wrap;width:100%;box-sizing:border-box}',
            '.ip-body-preview:hover{border-color:rgba(255,255,255,.3)}',
            '.ip-preview-hint{opacity:.4;font-style:italic;white-space:normal}',
            // ── Toggle switch aperçu/brut (v0.6) ────────────────────────────
            '.ip-preview-toggle-wrap{display:flex;align-items:center;gap:7px;font-size:.83rem;opacity:.75;cursor:pointer;user-select:none;margin-left:auto;padding:2px 6px;border-radius:4px;transition:opacity .15s}',
            '.ip-preview-toggle-wrap:hover{opacity:1}',
            '.ip-toggle-switch{position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0}',
            '.ip-toggle-switch input{opacity:0;width:0;height:0;position:absolute}',
            '.ip-toggle-slider{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,.2);border-radius:9px;transition:background .2s}',
            '.ip-toggle-slider::before{content:\'\';position:absolute;height:12px;width:12px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.4)}',
            '.ip-toggle-switch input:checked+.ip-toggle-slider{background:var(--theme-accent-color,#00a4dc)}',
            '.ip-toggle-switch input:checked+.ip-toggle-slider::before{transform:translateX(14px)}',
            // ── État actif des boutons de formatage (curseur dans une paire de marqueurs) ──
            '.ip-fmt-btn.active{background:rgba(0,164,220,.22);border-color:rgba(0,164,220,.55);color:var(--theme-accent-color,#00a4dc);box-shadow:inset 0 0 0 1px rgba(0,164,220,.25)}'
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
            if (loaded) itemBody.innerHTML = renderBody(bodyRaw);

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

    function showPopup(unseenMessages, historyMessages) {
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
            var body = document.createElement('div');
            body.id = 'infopopup-body';
            body.innerHTML = renderBody(unseenMessages[0].body || unseenMessages[0].Body || '');
            dialog.appendChild(body);
        } else {
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

        if (historyMessages && historyMessages.length > 0)
            dialog.appendChild(buildHistoryBlock(historyMessages));

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
            // popupActive reste true jusqu'à confirmation du serveur.
            // Évite la race condition où schedulePopupCheck se déclencherait
            // entre le clic sur "Fermer" et l'acquittement du POST /seen.
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

    /**
     * Récupère en un seul appel (GET /popup-data) :
     *   - les messages non vus avec leurs corps complets,
     *   - l'historique des messages déjà vus en résumé (corps chargé au clic).
     *
     * Remplace l'ancien pattern N+1 :
     *   GET /unseen + N×GET /messages/{id} + GET /messages + M×GET /messages/{id}
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

    // ── MutationObserver central ─────────────────────────────────────────────

    function schedulePopupCheck() {
        if (checkScheduled) return;
        checkScheduled = true;
        setTimeout(function () {
            checkScheduled = false;
            if (!getToken()) return;
            // Si la popup est ouverte ou en cours de marquage, ne pas re-déclencher.
            if (popupActive) return;
            // Ne pas déclencher si la page de config admin est active.
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
            schedulePopupCheck();
            checkConfigPage();
        }).observe(document.body, { childList: true, subtree: true });

        window.addEventListener('hashchange', schedulePopupCheck);
        window.addEventListener('popstate',   schedulePopupCheck);

        schedulePopupCheck();
        checkConfigPage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }

})();
