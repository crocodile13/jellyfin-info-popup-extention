/**
 * jellyfin-info-popup-extention — ip-admin-permissions.js
 * -------------------------------------------------------
 * Sous-module onglet « Droits » : système de rôles, custom dropdowns,
 * cartes utilisateur, sauvegarde globale, sélection bulk, filtre.
 * v4.2.0.0 — extrait de ip-admin.js.
 *
 * Dépendances : ip-i18n.js, ip-utils.js (apiFetch, escHtml)
 * Exposition  : ns.__admin.{loadPermissions, enhanceSelect, buildRoleOptions, detectRole}
 *
 * enhanceSelect est exposé car réutilisé par ip-admin-settings.js (filtre Réponses).
 * Cf. CLAUDE.md pitfall « enhanceSelect » : un <select> natif ouvert ne se thème
 * pas — toujours passer par enhanceSelect pour un rendu cohérent.
 */
(function (ns) {
    'use strict';
    var admin = ns.__admin = ns.__admin || {};

    var t = function () { return ns.t.apply(ns, arguments); };
    var apiFetch = function (p, o) { return ns.apiFetch(p, o); };
    var escHtml = function (s) { return ns.escHtml(s); };

    // ════════════════════════════════════════════════════════════════════════
    // Système de rôles
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

    function buildRoleOptions() {
        return [
            { value: 'reader',      label: t('perm_role_reader') },
            { value: 'contributor', label: t('perm_role_contributor') },
            { value: 'moderator',   label: t('perm_role_moderator') },
            { value: 'custom',      label: t('perm_role_custom') }
        ];
    }

    // ════════════════════════════════════════════════════════════════════════
    // enhanceSelect — dropdown stylable
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Remplace un <select> natif par une liste déroulante stylée. Le natif reste
     * dans le DOM (caché) et garde sa valeur/son état — toute la logique existante
     * lit sel.value et écoute 'change', tous deux préservés. Le rendu de la liste
     * ouverte est ainsi entièrement contrôlable par le thème (les <option> natifs
     * ne sont pas stylables).
     */
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

    // ════════════════════════════════════════════════════════════════════════
    // Carte utilisateur (rôle + checkboxes détails + limites)
    // ════════════════════════════════════════════════════════════════════════

    function buildPermCard(page, u, allCards) {
        var userId = u.userId || u.UserId || '';
        var userName = u.userName || u.UserName || userId;
        var role = detectRole(u);
        var isAdmin = u.isAdmin || u.IsAdmin || false;

        var card = document.createElement('div');
        card.className = 'ip-perm-card' + (isAdmin ? ' ip-perm-card-admin' : '');
        card.dataset.userId = userId;
        card.dataset.search = (userName || '').toLowerCase();
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

        if (isAdmin) {
            var adminBadge = document.createElement('span');
            adminBadge.className = 'ip-role-badge ip-role-badge-admin';
            adminBadge.textContent = t('perm_admin_badge');
            header.appendChild(adminBadge);
        }

        var roleWrap = document.createElement('span');
        roleWrap.className = 'ip-perm-card-role';
        var roleSel = document.createElement('select');
        // v3.8.8.0 : option « Administrateur » exclusive aux cartes admin (pas dans
        // buildRoleOptions pour ne pas contaminer le bulk-apply et les autres cartes).
        var cardRoles = buildRoleOptions();
        if (isAdmin) {
            cardRoles = [{ value: 'admin', label: t('perm_role_admin') }].concat(cardRoles);
            role = 'admin';
        }
        cardRoles.forEach(function (o) {
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

        // Admin (v3.8.3.0) : tous les contrôles grisés. Reste visible pour transparence,
        // mais rien n'est modifiable ni inclus dans la sauvegarde globale.
        if (isAdmin) {
            roleSel.disabled = true;
            inpMsgs.disabled = true;
            inpRep.disabled = true;
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

    // ════════════════════════════════════════════════════════════════════════
    // Orchestrateur : toolbar + cartes + filtre + save global
    // ════════════════════════════════════════════════════════════════════════

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
                var btnSelAll = mkToolBtn(t('perm_sel_all'));
                var btnSelNone = mkToolBtn(t('perm_sel_none'));
                var btnSelInvert = mkToolBtn(t('perm_sel_invert'));
                var selCount = document.createElement('span');
                selCount.className = 'ip-perm-sel-count';
                selRow.appendChild(btnSelAll);
                selRow.appendChild(btnSelNone);
                selRow.appendChild(btnSelInvert);
                selRow.appendChild(selCount);

                // Barre de recherche utilisateur (v3.8.6.0) — filtre client-side.
                var searchInput = document.createElement('input');
                searchInput.type = 'search';
                searchInput.autocomplete = 'off';
                searchInput.placeholder = t('search_user_placeholder');
                searchInput.style.cssText = 'margin-left:auto;min-width:160px;max-width:240px;padding:6px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:inherit;font-size:.88rem;';
                selRow.appendChild(searchInput);
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

                // « visible » = filtre actif + non-masqué (v3.8.6.0).
                var isCardVisible = function (c) {
                    return c.card.style.display !== 'none';
                };

                btnSelAll.addEventListener('click', function () {
                    allCards.forEach(function (c) {
                        if (!c.isAdmin && isCardVisible(c)) c.selChk.checked = true;
                    });
                    updateSelCount();
                });
                btnSelNone.addEventListener('click', function () {
                    allCards.forEach(function (c) { if (isCardVisible(c)) c.selChk.checked = false; });
                    updateSelCount();
                });
                btnSelInvert.addEventListener('click', function () {
                    allCards.forEach(function (c) {
                        if (!c.isAdmin && isCardVisible(c)) c.selChk.checked = !c.selChk.checked;
                    });
                    updateSelCount();
                });

                // ── Filtre recherche (v3.8.6.0) ──────────────────────────────
                var applyFilter = function () {
                    var q = (searchInput.value || '').trim().toLowerCase();
                    allCards.forEach(function (c) {
                        var key = c.card.dataset.search || '';
                        var match = !q || key.indexOf(q) !== -1;
                        c.card.style.display = match ? '' : 'none';
                        if (!match && c.selChk.checked) c.selChk.checked = false;
                    });
                    updateSelCount();
                };
                searchInput.addEventListener('input', applyFilter);
                searchInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Escape' && searchInput.value) {
                        searchInput.value = '';
                        applyFilter();
                        e.stopPropagation();
                    }
                });

                // Applique le rôle + limites choisis aux cartes SÉLECTIONNÉES (en mémoire,
                // persisté ensuite par le bouton « Enregistrer » global).
                bulkBtn.addEventListener('click', function () {
                    var role = bulkSel.value;
                    if (!ROLES[role]) return;
                    var selected = allCards.filter(function (c) { return c.selChk.checked && !c.isAdmin; });
                    if (!selected.length) { flashSaveStatus(t('perm_bulk_none_selected'), false); return; }
                    var mMsgs = bulkMsgs.value;
                    var mRep = bulkRep.value;
                    selected.forEach(function (c) {
                        c.roleSel.value = role;
                        if (c.roleSel.__ipSync) c.roleSel.__ipSync();
                        c.applyRole(role);
                        c.details.classList.remove('open');
                        c.inpMsgs.value = mMsgs;
                        c.inpRep.value = mRep;
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

    // ── Exposition ───────────────────────────────────────────────────────────
    admin.detectRole = detectRole;
    admin.buildRoleOptions = buildRoleOptions;
    admin.enhanceSelect = enhanceSelect;
    admin.buildPermCard = buildPermCard;
    admin.loadPermissions = loadPermissions;

}(window.__IP = window.__IP || {}));
