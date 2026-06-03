/**
 * jellyfin-info-popup-extention — ip-admin-targets.js
 * ---------------------------------------------------
 * Sous-module ciblage utilisateurs : cache 5min des users Jellyfin,
 * picker checkbox « Tous / liste individuelle », helpers de get/set.
 * v4.2.0.0 — extrait de ip-admin.js.
 *
 * Dépendances : ip-i18n.js, ip-utils.js (apiFetch)
 * Exposition  : ns.__admin.{fetchUsers, renderTargetPicker, getSelectedTargetIds,
 *                           resetTargetPicker, setTargetPickerIds, resolveUserNames,
 *                           getUsersCache}
 *
 * Cache TTL 5min (`fetchUsers`) — voir CLAUDE.md pitfall « usersCache TTL » :
 * sans TTL, les users créés pendant la session sont invisibles dans le picker.
 */
(function (ns) {
    'use strict';
    var admin = ns.__admin = ns.__admin || {};

    var t = function () { return ns.t.apply(ns, arguments); };
    var apiFetch = function (p, o) { return ns.apiFetch(p, o); };

    // État partagé au niveau module (singleton par session de page).
    var usersCache = null; // null = non chargé, [] = chargé mais vide
    var usersCacheAt = 0;  // timestamp du dernier chargement (TTL 5 min)

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
                usersCache = [];
                usersCacheAt = Date.now(); // éviter de spammer l'API en cas d'erreur
                return usersCache;
            });
    }

    function getUsersCache() {
        return usersCache;
    }

    function resolveUserNames(ids) {
        if (!usersCache || !ids || !ids.length) return ids.join(', ');
        return ids.map(function (id) {
            var u = usersCache.filter(function (x) { return x.id === id; })[0];
            return u ? u.name : id.slice(0, 8) + t('target_unknown');
        }).join(', ');
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

        // ── Barre « Tout sélectionner / Tout désélectionner » ───────────────
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
            var chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.dataset.userId = u.id;
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

    /**
     * Restaure l'état du sélecteur de ciblage depuis une liste d'IDs.
     * Utilisé lors du passage en mode édition pour refléter le ciblage actuel.
     * @param {string[]} ids — IDs à cocher. Vide ou null = tous les utilisateurs.
     */
    function setTargetPickerIds(page, ids) {
        var allChk = page.querySelector('#ip-target-all');
        if (!allChk) return;
        if (!ids || ids.length === 0) {
            allChk.checked = true;
            allChk.dispatchEvent(new Event('change'));
        } else {
            allChk.checked = false;
            allChk.dispatchEvent(new Event('change'));
            var picker = page.querySelector('#ip-target-picker');
            if (picker) {
                picker.querySelectorAll('input[data-user-id]').forEach(function (chk) {
                    chk.checked = false;
                });
                ids.forEach(function (id) {
                    var chk = picker.querySelector('input[data-user-id="' + id + '"]');
                    if (chk) chk.checked = true;
                });
            }
        }
    }

    // ── Exposition ───────────────────────────────────────────────────────────
    admin.fetchUsers = fetchUsers;
    admin.getUsersCache = getUsersCache;
    admin.resolveUserNames = resolveUserNames;
    admin.renderTargetPicker = renderTargetPicker;
    admin.getSelectedTargetIds = getSelectedTargetIds;
    admin.resetTargetPicker = resetTargetPicker;
    admin.setTargetPickerIds = setTargetPickerIds;

}(window.__IP = window.__IP || {}));
