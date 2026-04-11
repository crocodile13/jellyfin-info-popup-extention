/**
 * jellyfin-info-popup-extention — ip-user.js
 * ------------------------------------------
 * Page utilisateur sidebar (boîte de réception + envoi si CanSendMessages).
 * S'initialise quand #infoPopupUserPage est dans le DOM.
 *
 * Dépendances : ip-i18n.js, ip-utils.js, ip-styles.js
 * Exposition   : window.__IP.checkUserPage()
 */
(function (ns) {
    'use strict';

    var t          = function () { return ns.t.apply(ns, arguments); };
    var apiFetch   = function (p, o) { return ns.apiFetch(p, o); };
    var escHtml    = function (s) { return ns.escHtml(s); };
    var renderBody = function (r) { return ns.renderBody(r); };
    var formatDate = function (d) { return ns.formatDate(d); };
    var getToken   = function () { return ns.getToken(); };

    // ── Tabs ──────────────────────────────────────────────────────────────────
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

    // ── Inbox ─────────────────────────────────────────────────────────────────
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
                // Messages non vus en premier (avec pastille)
                unseen.forEach(function (msg) {
                    list.appendChild(buildUserMsgCard(msg, true));
                });
                // Historique ensuite
                history.forEach(function (msg) {
                    list.appendChild(buildUserMsgCard(msg, false));
                });
            })
            .catch(function () {
                list.innerHTML = '<p style="opacity:.55;">' + escHtml(t('user_inbox_empty')) + '</p>';
            });
    }

    function buildUserMsgCard(msg, isUnseen) {
        var card = document.createElement('div');
        card.className = 'ip-user-msg-card';
        var title = msg.title       || msg.Title       || '';
        var body  = msg.body        || msg.Body        || '';
        var date  = msg.publishedAt || msg.PublishedAt || '';

        var titleEl = document.createElement('div');
        titleEl.className = 'ip-user-msg-title';
        if (isUnseen) {
            var dot = document.createElement('span');
            dot.className = 'ip-user-unseen-dot';
            titleEl.appendChild(dot);
        }
        titleEl.appendChild(document.createTextNode(title));

        var metaEl = document.createElement('div');
        metaEl.className = 'ip-user-msg-meta';
        metaEl.textContent = formatDate(date);

        card.appendChild(titleEl);
        card.appendChild(metaEl);

        // Corps (chargement paresseux si absent)
        var bodyEl = document.createElement('div');
        bodyEl.className = 'ip-user-msg-body';
        if (body) {
            bodyEl.innerHTML = renderBody(body);
        } else {
            var id = msg.id || msg.Id || '';
            bodyEl.textContent = '...';
            if (id) {
                apiFetch('/InfoPopup/messages/' + encodeURIComponent(id))
                    .then(function (res) { return res.json(); })
                    .then(function (d) {
                        var b = d.body || d.Body || '';
                        bodyEl.innerHTML = b ? renderBody(b) : '';
                    })
                    .catch(function () { bodyEl.textContent = ''; });
            }
        }
        card.appendChild(bodyEl);
        return card;
    }

    // ── Sent messages ─────────────────────────────────────────────────────────
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
                    var card = document.createElement('div');
                    card.className = 'ip-user-msg-card';
                    if (msg.isDeleted || msg.IsDeleted) card.classList.add('ip-msg-deleted');
                    var title = document.createElement('div');
                    title.className = 'ip-user-msg-title';
                    title.textContent = msg.title || msg.Title || '';
                    var meta = document.createElement('div');
                    meta.className = 'ip-user-msg-meta';
                    meta.textContent = formatDate(msg.publishedAt || msg.PublishedAt || '');
                    card.appendChild(title);
                    card.appendChild(meta);
                    list.appendChild(card);
                });
            })
            .catch(function () {});
    }

    // ── Compose ───────────────────────────────────────────────────────────────
    function initCompose(page) {
        var publishBtn = page.querySelector('#ip-user-publish-btn');
        if (!publishBtn) return;
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
            if (!body) {
                if (bodyErr) { bodyErr.textContent = t('err_body_required'); bodyErr.style.display = ''; }
                ok = false;
            }
            if (!ok) return;
            publishBtn.disabled = true;
            apiFetch('/InfoPopup/messages', {
                method: 'POST',
                body: JSON.stringify({ title: title, body: body, targetUserIds: [] })
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

    // ── Static translations ───────────────────────────────────────────────────
    function applyUserPageTranslations(page) {
        var map = {
            '#ip-user-page-title':    'user_page_title',
            '#ip-user-tab-inbox-lbl': 'user_tab_inbox',
            '#ip-user-tab-send-lbl':  'user_tab_send',
            '#ip-user-compose-title': 'user_compose_title',
            '#ip-user-sent-title':    'user_sent_title',
            '#ip-user-publish-lbl':   'user_publish_btn'
        };
        Object.keys(map).forEach(function (sel) {
            var el = page.querySelector(sel);
            if (el) el.textContent = t(map[sel]);
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function initUserPage(page) {
        if (page._ipUserInitDone) return;
        page._ipUserInitDone = true;
        ns.injectStyles();
        applyUserPageTranslations(page);
        initUserTabs(page);

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

    // ── checkUserPage (appelé par MutationObserver dans ip-popup.js) ──────────
    function checkUserPage() {
        if (!getToken()) return;
        var page = document.querySelector('#infoPopupUserPage');
        if (!page) return;
        initUserPage(page);
    }

    // ── Exposition ───────────────────────────────────────────────────────────
    ns.checkUserPage = checkUserPage;

}(window.__IP = window.__IP || {}));
