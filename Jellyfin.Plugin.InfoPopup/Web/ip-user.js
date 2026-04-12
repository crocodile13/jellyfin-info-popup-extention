/**
 * jellyfin-info-popup-extention — ip-user.js
 * ------------------------------------------
 * Page utilisateur : boîte de réception + envoi (si CanSendMessages).
 * Injection automatique d'une entrée dans la barre latérale Jellyfin
 * pour tous les utilisateurs authentifiés.
 *
 * Dépendances : ip-i18n.js, ip-utils.js, ip-styles.js
 * Exposition   : window.__IP.checkUserPage()
 *                window.__IP.injectSidebarEntry()
 */
(function (ns) {
    'use strict';

    var t          = function () { return ns.t.apply(ns, arguments); };
    var apiFetch   = function (p, o) { return ns.apiFetch(p, o); };
    var escHtml    = function (s) { return ns.escHtml(s); };
    var renderBody = function (r) { return ns.renderBody(r); };
    var formatDate = function (d) { return ns.formatDate(d); };
    var getToken   = function () { return ns.getToken(); };

    var PREVIEW_LEN = 90;
    var TITLE_MAX   = 200;
    var BODY_MAX    = 10000;

    // ── Cache utilisateurs (même pattern que ip-admin.js) ────────────────────
    var usersCache   = null;
    var usersCacheAt = 0;

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
                    return { id: u.Id || u.id || '', name: u.Name || u.name || '' };
                }).filter(function (u) { return u.id; });
                usersCacheAt = Date.now();
                return usersCache;
            })
            .catch(function () {
                usersCache   = [];
                usersCacheAt = Date.now();
                return usersCache;
            });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Sidebar injection
    // ══════════════════════════════════════════════════════════════════════════

    function injectSidebarEntry() {
        if (!getToken()) return;

        // Trouver le conteneur de la sidebar Jellyfin
        var container = document.querySelector('.mainDrawer-scrollContainer');
        if (!container) return;

        // Vérifier si déjà injecté dans ce conteneur
        if (container.querySelector('#ip-nav-messages')) return;

        ns.injectStyles();

        var link = document.createElement('a');
        link.id = 'ip-nav-messages';
        link.className = 'navMenuOption';
        link.href = '#!/configurationpage?name=InfoPopupUserPage';
        link.style.cssText = 'display:flex;align-items:center;padding:8px 20px;cursor:pointer;' +
            'color:inherit;text-decoration:none;transition:background .15s;';

        var icon = document.createElement('span');
        icon.className = 'material-icons navMenuOptionIcon';
        icon.textContent = 'message';

        var label = document.createElement('span');
        label.className = 'navMenuOptionText';
        label.textContent = t('user_page_title');

        link.appendChild(icon);
        link.appendChild(label);

        // Insérer avant les liens de déconnexion ou à la fin de la sidebar.
        // Chercher un séparateur ou le dernier lien pour positionner l'entrée.
        var logoutLink = container.querySelector('a[href*="logout"]') ||
                         container.querySelector('a[href*="mypreferencesmenu"]') ||
                         container.querySelector('.adminMenuOptions');
        if (logoutLink) {
            logoutLink.parentNode.insertBefore(link, logoutLink);
        } else {
            container.appendChild(link);
        }

        link.addEventListener('mouseenter', function () {
            link.style.background = 'rgba(255,255,255,.06)';
        });
        link.addEventListener('mouseleave', function () {
            link.style.background = '';
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Tabs
    // ══════════════════════════════════════════════════════════════════════════

    function initUserTabs(page) {
        var tabs = [
            { btnId: 'ip-user-tab-inbox', panelId: 'ip-user-panel-inbox' },
            { btnId: 'ip-user-tab-send',  panelId: 'ip-user-panel-send'  }
        ];
        tabs.forEach(function (tab) {
            var btn = page.querySelector('#' + tab.btnId);
            if (!btn) return;
            btn.addEventListener('click', function () {
                tabs.forEach(function (t2) {
                    var b = page.querySelector('#' + t2.btnId);
                    var p = page.querySelector('#' + t2.panelId);
                    if (b) b.classList.remove('ip-tab-active');
                    if (p) p.style.display = 'none';
                });
                btn.classList.add('ip-tab-active');
                var panel = page.querySelector('#' + tab.panelId);
                if (panel) panel.style.display = '';
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Inbox — messages repliables
    // ══════════════════════════════════════════════════════════════════════════

    function loadInbox(page) {
        var list = page.querySelector('#ip-user-inbox-list');
        if (!list) return;
        apiFetch('/InfoPopup/popup-data')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var unseen  = data.unseen  || data.Unseen  || [];
                var history = data.history || data.History || [];
                list.innerHTML = '';
                if (!unseen.length && !history.length) {
                    var empty = document.createElement('p');
                    empty.style.opacity = '.55';
                    empty.textContent = t('user_inbox_empty');
                    list.appendChild(empty);
                    return;
                }
                unseen.forEach(function (msg) {
                    list.appendChild(buildCollapsibleCard(msg, true));
                });
                history.forEach(function (msg) {
                    list.appendChild(buildCollapsibleCard(msg, false));
                });
            })
            .catch(function () {
                list.innerHTML = '<p style="opacity:.55;">' + escHtml(t('user_inbox_empty')) + '</p>';
            });
    }

    /**
     * Construit une carte de message repliable.
     * Par défaut, seuls le titre, l'auteur, la date et un aperçu sont visibles.
     * Le clic sur l'en-tête déplie/replie le corps complet.
     */
    function buildCollapsibleCard(msg, isUnseen) {
        var title      = msg.title       || msg.Title       || '';
        var body       = msg.body        || msg.Body        || '';
        var date       = msg.publishedAt || msg.PublishedAt  || '';
        var authorName = msg.sentByUserName || msg.SentByUserName || '';
        var id         = msg.id          || msg.Id          || '';

        var card = document.createElement('div');
        card.className = 'ip-user-msg-card ip-collapsed';

        // ── En-tête cliquable ────────────────────────────────────────────
        var header = document.createElement('div');
        header.className = 'ip-user-msg-header';
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');

        // Ligne titre + chevron
        var titleRow = document.createElement('div');
        titleRow.className = 'ip-user-msg-title-row';

        if (isUnseen) {
            var dot = document.createElement('span');
            dot.className = 'ip-user-unseen-dot';
            titleRow.appendChild(dot);
        }

        var titleText = document.createElement('span');
        titleText.className = 'ip-user-msg-title-text';
        titleText.textContent = title;
        titleRow.appendChild(titleText);

        var chev = document.createElement('span');
        chev.className = 'ip-user-msg-chev';
        chev.textContent = '\u25B6';
        titleRow.appendChild(chev);

        header.appendChild(titleRow);

        // Ligne métadonnées : auteur + date
        var metaRow = document.createElement('div');
        metaRow.className = 'ip-user-msg-meta';
        var authorLabel = authorName || t('user_msg_system');
        metaRow.textContent = authorLabel + '  \u00B7  ' + formatDate(date);
        header.appendChild(metaRow);

        // Aperçu du corps (premiers N caractères)
        if (body) {
            var previewText = body.length > PREVIEW_LEN
                ? body.substring(0, PREVIEW_LEN) + '\u2026'
                : body;
            var preview = document.createElement('div');
            preview.className = 'ip-user-msg-preview';
            preview.textContent = previewText;
            header.appendChild(preview);
        }

        card.appendChild(header);

        // ── Corps complet (caché par défaut) ─────────────────────────────
        var bodyEl = document.createElement('div');
        bodyEl.className = 'ip-user-msg-body';
        bodyEl.style.display = 'none';

        var bodyLoaded = !!body;
        if (body) {
            bodyEl.innerHTML = renderBody(body);
        }

        card.appendChild(bodyEl);

        // ── Toggle collapse ──────────────────────────────────────────────
        var toggle = function () {
            var collapsed = card.classList.contains('ip-collapsed');
            if (collapsed) {
                card.classList.remove('ip-collapsed');
                card.classList.add('ip-expanded');
                bodyEl.style.display = '';
                // Chargement paresseux du corps si absent (messages historiques)
                if (!bodyLoaded && id) {
                    bodyLoaded = true;
                    bodyEl.textContent = '...';
                    apiFetch('/InfoPopup/messages/' + encodeURIComponent(id))
                        .then(function (res) { return res.json(); })
                        .then(function (d) {
                            var b = d.body || d.Body || '';
                            bodyEl.innerHTML = b ? renderBody(b) : '';
                        })
                        .catch(function () { bodyEl.textContent = ''; });
                }
            } else {
                card.classList.remove('ip-expanded');
                card.classList.add('ip-collapsed');
                bodyEl.style.display = 'none';
            }
        };
        header.addEventListener('click', toggle);
        header.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });

        return card;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Sent messages
    // ══════════════════════════════════════════════════════════════════════════

    function loadSentMessages(page) {
        var list = page.querySelector('#ip-user-sent-list');
        if (!list) return;
        apiFetch('/InfoPopup/messages/sent')
            .then(function (res) { return res.json(); })
            .then(function (msgs) {
                list.innerHTML = '';
                if (!msgs || !msgs.length) {
                    var empty = document.createElement('p');
                    empty.style.opacity = '.55';
                    empty.textContent = t('user_sent_empty');
                    list.appendChild(empty);
                    return;
                }
                msgs.forEach(function (msg) {
                    list.appendChild(buildCollapsibleCard(msg, false));
                });
            })
            .catch(function () {});
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Formatting helpers (raw textarea mode — same logic as ip-admin.js)
    // ══════════════════════════════════════════════════════════════════════════

    function getFormatBoundsAroundCursor(val, pos, marker) {
        var mLen = marker.length;
        var before = val.lastIndexOf(marker, pos - 1);
        if (before === -1) return null;
        var after = val.indexOf(marker, pos);
        if (after === -1 || after === before) return null;
        if (before + mLen > pos) return null;
        return { from: before, to: after + mLen, innerFrom: before + mLen, innerTo: after };
    }

    function applyFormat(ta, prefix, suffix) {
        var start = ta.selectionStart, end = ta.selectionEnd;
        var val   = ta.value;
        if (start < end) {
            var selected = val.slice(start, end);
            if (selected.startsWith(prefix) && selected.endsWith(suffix) &&
                    selected.length > prefix.length + suffix.length) {
                var inner = selected.slice(prefix.length, selected.length - suffix.length);
                ta.value = val.slice(0, start) + inner + val.slice(end);
                ta.setSelectionRange(start, start + inner.length);
            } else {
                ta.value = val.slice(0, start) + prefix + selected + suffix + val.slice(end);
                ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
            }
        } else {
            var bounds = getFormatBoundsAroundCursor(val, start, prefix);
            if (bounds) {
                var inner2 = val.slice(bounds.innerFrom, bounds.innerTo);
                ta.value   = val.slice(0, bounds.from) + inner2 + val.slice(bounds.to);
                var newPos = Math.max(bounds.from, start - prefix.length);
                ta.setSelectionRange(newPos, newPos);
            } else {
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

    // ══════════════════════════════════════════════════════════════════════════
    // Compose — toolbar de formatage
    // ══════════════════════════════════════════════════════════════════════════

    function initFormatToolbar(page) {
        var toolbar = page.querySelector('#ip-user-format-toolbar');
        var bodyEl  = page.querySelector('#ip-user-body');
        if (!toolbar || !bodyEl) return;

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
            var action = btn.dataset.action;
            if (action === 'list') {
                toggleListLines(bodyEl);
            } else if (fmtMap[action]) {
                applyFormat(bodyEl, fmtMap[action][0], fmtMap[action][1]);
            }
            bodyEl.focus();
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Compose — target picker
    // ══════════════════════════════════════════════════════════════════════════

    function renderTargetPicker(page, users) {
        var container = page.querySelector('#ip-user-target-picker');
        if (!container) return;

        var box = document.createElement('div');
        box.className = 'ip-target-box';

        var allRow   = document.createElement('div');
        allRow.className = 'ip-target-all-row';
        var allLabel = document.createElement('label');
        var allChk   = document.createElement('input');
        allChk.type    = 'checkbox';
        allChk.id      = 'ip-user-target-all';
        allChk.checked = true;
        allChk.style.cssText = 'width:15px;height:15px;cursor:pointer;accent-color:var(--theme-accent-color,#00a4dc);flex-shrink:0;';
        var allSpan  = document.createElement('span');
        allSpan.textContent = t('target_all');
        allLabel.appendChild(allChk);
        allLabel.appendChild(allSpan);
        allRow.appendChild(allLabel);
        box.appendChild(allRow);

        var selectControls = document.createElement('div');
        selectControls.className = 'ip-target-select-controls';
        var selectAllBtn = document.createElement('button');
        selectAllBtn.type = 'button';
        selectAllBtn.textContent = t('target_select_all');
        var sep = document.createElement('span');
        sep.className = 'ip-sel-sep';
        sep.textContent = '\u00B7';
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
                userList.style.display = '';
                selectControls.style.display = 'flex';
                userCheckboxes.forEach(function (c) { c.checked = false; });
            }
        });
    }

    function getSelectedTargetIds(page) {
        var allChk = page.querySelector('#ip-user-target-all');
        if (!allChk || allChk.checked) return [];
        var ids = [];
        var picker = page.querySelector('#ip-user-target-picker');
        if (picker) {
            picker.querySelectorAll('input[type="checkbox"][data-user-id]').forEach(function (c) {
                if (c.checked) ids.push(c.dataset.userId);
            });
        }
        return ids;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Compose — publication
    // ══════════════════════════════════════════════════════════════════════════

    function initCompose(page) {
        var publishBtn = page.querySelector('#ip-user-publish-btn');
        if (!publishBtn) return;

        // Charger le target picker
        fetchUsers().then(function (users) {
            if (users.length > 1) {
                renderTargetPicker(page, users);
                var pickerSection = page.querySelector('#ip-user-target-section');
                if (pickerSection) pickerSection.style.display = '';
            }
        });

        publishBtn.addEventListener('click', function () {
            var titleEl  = page.querySelector('#ip-user-title');
            var bodyEl   = page.querySelector('#ip-user-body');
            var titleErr = page.querySelector('#ip-user-title-err');
            var bodyErr  = page.querySelector('#ip-user-body-err');
            var toast    = page.querySelector('#ip-user-toast');
            var title = titleEl ? titleEl.value.trim() : '';
            var body  = bodyEl  ? bodyEl.value.trim()  : '';
            var ok = true;
            if (titleErr) titleErr.style.display = 'none';
            if (bodyErr)  bodyErr.style.display  = 'none';
            if (!title) {
                if (titleErr) { titleErr.textContent = t('err_title_required'); titleErr.style.display = ''; }
                ok = false;
            }
            if (title.length > TITLE_MAX) {
                if (titleErr) { titleErr.textContent = t('val_title_too_long', TITLE_MAX); titleErr.style.display = ''; }
                ok = false;
            }
            if (!body) {
                if (bodyErr) { bodyErr.textContent = t('err_body_required'); bodyErr.style.display = ''; }
                ok = false;
            }
            if (body.length > BODY_MAX) {
                if (bodyErr) { bodyErr.textContent = t('val_body_too_long', BODY_MAX); bodyErr.style.display = ''; }
                ok = false;
            }
            if (!ok) return;

            var targetUserIds = getSelectedTargetIds(page);

            publishBtn.disabled = true;
            apiFetch('/InfoPopup/messages', {
                method: 'POST',
                body: JSON.stringify({ title: title, body: body, targetUserIds: targetUserIds })
            }).then(function (res) {
                if (res.status === 429) throw new Error(t('rate_limit_msg'));
                if (!res.ok) throw new Error(String(res.status));
                if (titleEl) titleEl.value = '';
                if (bodyEl)  bodyEl.value  = '';
                loadSentMessages(page);
                if (toast) {
                    toast.textContent = t('toast_published');
                    toast.style.background = 'rgba(76,175,80,.2)';
                    toast.style.color = '#4caf50';
                    toast.style.display = '';
                    setTimeout(function () { toast.style.display = 'none'; }, 3000);
                }
                publishBtn.disabled = false;
            }).catch(function (err) {
                if (toast) {
                    toast.textContent = err && err.message ? err.message : t('toast_err_publish', '');
                    toast.style.background = 'rgba(207,102,121,.2)';
                    toast.style.color = '#cf6679';
                    toast.style.display = '';
                    setTimeout(function () { toast.style.display = 'none'; }, 4000);
                }
                publishBtn.disabled = false;
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Static translations
    // ══════════════════════════════════════════════════════════════════════════

    function applyUserPageTranslations(page) {
        var map = {
            '#ip-user-page-title':    'user_page_title',
            '#ip-user-tab-inbox-lbl': 'user_tab_inbox',
            '#ip-user-tab-send-lbl':  'user_tab_send',
            '#ip-user-compose-title': 'user_compose_title',
            '#ip-user-sent-title':    'user_sent_title',
            '#ip-user-publish-lbl':   'user_publish_btn',
            '#ip-user-recipients-label': 'cfg_recipients'
        };
        Object.keys(map).forEach(function (sel) {
            var el = page.querySelector(sel);
            if (el) el.textContent = t(map[sel]);
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Init
    // ══════════════════════════════════════════════════════════════════════════

    function initUserPage(page) {
        if (page._ipUserInitDone) return;
        page._ipUserInitDone = true;
        ns.injectStyles();
        applyUserPageTranslations(page);
        initUserTabs(page);
        initFormatToolbar(page);

        // Bloquer les raccourcis globaux Jellyfin lors de la frappe dans la page.
        page.addEventListener('keydown', function (e) {
            var tg = e.target.tagName;
            if ((tg === 'INPUT' || tg === 'TEXTAREA' || e.target.isContentEditable)
                    && e.key !== 'Escape' && e.key !== 'Tab') {
                e.stopPropagation();
            }
        });

        // Charger les permissions pour afficher/masquer l'onglet Envoyer
        apiFetch('/InfoPopup/permissions/me')
            .then(function (res) { return res.json(); })
            .then(function (perms) {
                var canSend = perms.canSendMessages || perms.CanSendMessages || false;
                var sendTab = page.querySelector('#ip-user-tab-send');
                if (sendTab && canSend) {
                    sendTab.style.display = '';
                    initCompose(page);
                    loadSentMessages(page);
                }
            })
            .catch(function () {});

        loadInbox(page);
    }

    // ── checkUserPage (appelé par MutationObserver dans ip-popup.js) ─────────
    function checkUserPage() {
        if (!getToken()) return;
        var page = document.querySelector('#infoPopupUserPage');
        if (!page) return;
        initUserPage(page);
    }

    // ── Exposition ───────────────────────────────────────────────────────────
    ns.checkUserPage       = checkUserPage;
    ns.injectSidebarEntry  = injectSidebarEntry;

}(window.__IP = window.__IP || {}));
