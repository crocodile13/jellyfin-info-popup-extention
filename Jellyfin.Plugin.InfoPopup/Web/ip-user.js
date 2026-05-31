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

    // ── Overlay page utilisateur ────────────────────────────────────────────
    var _overlayOpen = false;
    // Listeners attachés à document/window quand l'overlay est ouvert. Stockés au scope
    // module pour que closeUserOverlay puisse les détacher (fix fuite mémoire v3.8.4.0).
    // Sans ça, une fermeture autre que par Escape (back button, hash change, etc.)
    // laissait keydown/hashchange/popstate attachés à document → fuite cumulative à chaque
    // cycle ouverture/fermeture de « Mes messages ».
    var _overlayListeners = null;

    function closeUserOverlay() {
        var overlay = document.getElementById('ip-user-overlay');
        if (overlay) overlay.remove();
        _overlayOpen = false;
        // Détacher tous les listeners enregistrés à l'ouverture (fix fuite mémoire v3.8.4.0).
        if (_overlayListeners) {
            if (_overlayListeners.onKey) document.removeEventListener('keydown', _overlayListeners.onKey);
            if (_overlayListeners.onNav) {
                window.removeEventListener('hashchange', _overlayListeners.onNav);
                window.removeEventListener('popstate', _overlayListeners.onNav);
            }
            _overlayListeners = null;
        }
        // Restaure la barre latérale classique : showUserPage la fermait, il ne faut pas
        // la laisser dans un état cassé (la classe `hide` la masquerait définitivement).
        var drawer = document.querySelector('.mainDrawer');
        if (drawer) drawer.classList.remove('hide');
    }

    function showUserPage() {
        console.log('[InfoPopup] showUserPage() called, _overlayOpen=' + _overlayOpen);
        if (_overlayOpen) return;
        _overlayOpen = true;
        try {
            _showUserPageInner();
        } catch (err) {
            // _overlayOpen DOIT être réinitialisé si la construction de l'overlay
            // échoue, sinon TOUS les clics suivants sur « Messages » sont bloqués
            // par le garde `if (_overlayOpen) return;` (bug 3.7.9.0).
            _overlayOpen = false;
            console.error('[InfoPopup] showUserPage threw — name=' + (err && err.name)
                + ' message=' + (err && err.message)
                + ' stack=' + (err && err.stack));
            throw err;
        }
    }

    function _showUserPageInner() {
        ns.injectStyles();

        // Fermer le drawer sidebar comme le ferait Jellyfin (retrait de la classe d'ouverture).
        // NE PAS ajouter `hide` au .mainDrawer : l'overlay (position:fixed, z-index 9998) le couvre
        // déjà, et `hide` laissé en place casserait la barre latérale après fermeture.
        document.body.classList.remove('mainDrawerOpen', 'bodyWithPopupOpen');
        var drawer = document.querySelector('.mainDrawer');
        if (drawer) drawer.classList.remove('mainDrawerOpen');
        // MUI layout : cliquer le backdrop ferme le drawer nativement
        var muiBackdrop = document.querySelector('.MuiDrawer-root .MuiBackdrop-root');
        if (muiBackdrop) muiBackdrop.click();

        var overlay = document.createElement('div');
        overlay.id = 'ip-user-overlay';
        overlay.className = 'ip-user-overlay';

        // ── Header ──────────────────────────────────────────────────────
        var header = document.createElement('div');
        header.className = 'ip-user-overlay-header';

        // Bouton retour : on réutilise les CLASSES Jellyfin natives (`paper-icon-button-light`
        // pour le ripple et le style circulaire) MAIS sans passer par le mécanisme « customized
        // built-in element » : `createElement('button', { is: '…' })` plante côté Jellyfin 10.11
        // parce que son polyfill `webcomponents.js` attend l'ancienne API string et appelle
        // `.toLowerCase()` sur le 2e argument → `TypeError: t.toLowerCase is not a function`
        // (corrigé en v3.7.11.0). Un `<button>` plain avec la classe suffit pour le rendu.
        var backBtn = document.createElement('button');
        backBtn.classList.add('paper-icon-button-light', 'ip-user-overlay-back');
        backBtn.type = 'button';
        backBtn.title = t('user_page_back');
        backBtn.setAttribute('aria-label', t('user_page_back'));
        backBtn.innerHTML = '<span class="material-icons" aria-hidden="true">arrow_back</span>';
        backBtn.addEventListener('click', closeUserOverlay);
        header.appendChild(backBtn);

        var titleEl = document.createElement('span');
        titleEl.className = 'ip-user-overlay-title';
        titleEl.textContent = t('user_page_title');
        header.appendChild(titleEl);

        overlay.appendChild(header);

        // ── Content ─────────────────────────────────────────────────────
        var content = document.createElement('div');
        content.className = 'ip-user-overlay-content';
        content.id = 'infoPopupUserPage';

        // Tabs
        var tabBar = document.createElement('div');
        tabBar.className = 'ip-tab-bar';
        tabBar.id = 'ip-user-tabs';
        tabBar.innerHTML =
            '<button class="ip-tab-btn ip-tab-active" id="ip-user-tab-inbox" type="button">' +
                '<span class="material-icons" style="font-size:1rem;vertical-align:middle;">inbox</span> ' +
                '<span id="ip-user-tab-inbox-lbl">' + escHtml(t('user_tab_inbox')) + '</span>' +
            '</button>' +
            '<button class="ip-tab-btn" id="ip-user-tab-send" type="button" style="display:none;">' +
                '<span class="material-icons" style="font-size:1rem;vertical-align:middle;">send</span> ' +
                '<span id="ip-user-tab-send-lbl">' + escHtml(t('user_tab_send')) + '</span>' +
            '</button>';
        content.appendChild(tabBar);

        // Panel Inbox
        var panelInbox = document.createElement('div');
        panelInbox.id = 'ip-user-panel-inbox';
        panelInbox.innerHTML = '<div id="ip-user-inbox-list"><p style="opacity:.55;">' + escHtml(t('user_inbox_loading')) + '</p></div>';
        content.appendChild(panelInbox);

        // Panel Send (hidden by default)
        var panelSend = document.createElement('div');
        panelSend.id = 'ip-user-panel-send';
        panelSend.style.display = 'none';

        // Compose form
        panelSend.innerHTML =
            '<div class="detailSection">' +
                '<h3 id="ip-user-compose-title" class="sectionTitle">' + escHtml(t('user_compose_title')) + '</h3>' +
                '<div class="inputContainer">' +
                    '<label id="ip-user-title-label" class="inputLabel" for="ip-user-title" style="display:block;margin-bottom:8px;">' + escHtml(t('cfg_title_label')) + '</label>' +
                    '<input id="ip-user-title" type="text" class="emby-input" maxlength="200" autocomplete="off"/>' +
                    '<div id="ip-user-title-err" class="fieldDescription" style="color:#cf6679;display:none;"></div>' +
                '</div>' +
                '<div class="inputContainer" style="margin-top:16px;">' +
                    '<label id="ip-user-body-label" class="inputLabel" for="ip-user-body" style="display:block;margin-bottom:8px;">' + escHtml(t('cfg_body_label')) + '</label>' +
                    '<div id="ip-user-format-toolbar" style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;align-items:center;">' +
                        '<button type="button" class="ip-fmt-btn" data-action="bold" title="' + escHtml(t('fmt_bold')) + ' (Ctrl+B)"><strong>B</strong></button>' +
                        '<button type="button" class="ip-fmt-btn" data-action="italic" title="' + escHtml(t('fmt_italic')) + ' (Ctrl+I)"><em>I</em></button>' +
                        '<button type="button" class="ip-fmt-btn" data-action="underline" title="' + escHtml(t('fmt_underline')) + ' (Ctrl+U)"><u>U</u></button>' +
                        '<button type="button" class="ip-fmt-btn" data-action="strike" title="' + escHtml(t('fmt_strike')) + ' (Ctrl+Shift+S)"><s>S</s></button>' +
                        '<button type="button" class="ip-fmt-btn ip-fmt-btn-sep" data-action="list" title="' + escHtml(t('fmt_list')) + '">• Liste</button>' +
                        '<span class="ip-char-count" id="ip-user-char-count"></span>' +
                        '<label class="ip-preview-toggle-wrap" for="ip-user-preview-toggle" title="' + escHtml(t('fmt_raw_tip')) + '">' +
                            '<div class="ip-toggle-switch">' +
                                '<input type="checkbox" id="ip-user-preview-toggle">' +
                                '<span class="ip-toggle-slider"></span>' +
                            '</div>' +
                            '<span>Raw</span>' +
                        '</label>' +
                    '</div>' +
                    '<div class="ip-editor-wrap">' +
                        '<div id="ip-user-body-wysiwyg" class="ip-body-wysiwyg" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="' + escHtml(t('cfg_body_ph')) + '"></div>' +
                        '<textarea id="ip-user-body" class="emby-textarea" maxlength="10000" rows="7" placeholder="' + escHtml(t('cfg_body_ph')) + '" style="width:100%;box-sizing:border-box;resize:vertical;display:none;"></textarea>' +
                    '</div>' +
                    '<div id="ip-user-body-err" class="fieldDescription" style="color:#cf6679;display:none;"></div>' +
                '</div>' +
                '<div id="ip-user-target-section" class="inputContainer" style="margin-top:16px;display:none;">' +
                    '<label id="ip-user-recipients-label" class="inputLabel" style="display:block;margin-bottom:8px;">' + escHtml(t('cfg_recipients')) + '</label>' +
                    '<div id="ip-user-target-picker" style="margin-top:8px;"><span style="opacity:.5;font-size:.88rem;">' + escHtml(t('cfg_loading_users')) + '</span></div>' +
                '</div>' +
                '<div style="margin-top:20px;display:flex;align-items:center;gap:12px;">' +
                    '<button id="ip-user-publish-btn" class="raised button-submit emby-button" type="button">' + escHtml(t('user_publish_btn')) + '</button>' +
                    '<div id="ip-user-toast" style="display:none;padding:8px 14px;border-radius:4px;font-size:.9rem;"></div>' +
                '</div>' +
            '</div>' +
            '<div class="detailSection" style="margin-top:32px;">' +
                '<h3 id="ip-user-sent-title" class="sectionTitle">' + escHtml(t('user_sent_title')) + '</h3>' +
                '<div id="ip-user-sent-list"><p style="opacity:.55;">' + escHtml(t('user_sent_empty')) + '</p></div>' +
            '</div>';
        content.appendChild(panelSend);

        overlay.appendChild(content);
        document.body.appendChild(overlay);

        // ── Init ────────────────────────────────────────────────────────
        initUserPage(content);

        // Escape ferme l'overlay. Listener enregistré dans `_overlayListeners` au scope
        // module pour que `closeUserOverlay` puisse le détacher quelle que soit la voie
        // de fermeture (back button, hash change, etc.) — voir fuite mémoire v3.8.4.0.
        var onKey = function (e) {
            if (e.key === 'Escape') closeUserOverlay();
        };
        document.addEventListener('keydown', onKey);

        // Fermer si on navigue ailleurs. Enregistrement déféré au prochain tick : sinon un
        // hashchange synchrone provoqué par la fermeture du drawer MUI (backdrop.click) ou par
        // un routeur Jellyfin déclenché pendant le clic d'ouverture refermerait l'overlay
        // immédiatement → symptôme « clic sans effet ».
        var onNav = function () {
            if (_overlayOpen) closeUserOverlay();
        };
        setTimeout(function () {
            window.addEventListener('hashchange', onNav);
            window.addEventListener('popstate', onNav);
        }, 0);
        _overlayListeners = { onKey: onKey, onNav: onNav };
    }

    function createSidebarLink() {
        // <a> SANS href : un href="#" déclenche le routeur Jellyfin (capté avant nos handlers
        // par leur navigation interne) et un hashchange synchrone qui referme l'overlay juste
        // après son ouverture — symptôme : clic sans aucun effet visible (3.7.6.0 / 3.7.7.0).
        // role="button" et tabindex="0" préservent l'accessibilité clavier.
        var link = document.createElement('a');
        link.id = 'ip-nav-messages';
        link.setAttribute('role', 'button');
        link.setAttribute('tabindex', '0');
        // L'écouteur direct est doublé d'une délégation document (voir bindSidebarClick) :
        // dans la sidebar MUI Jellyfin 10.11, le clic peut être consommé par un handler React
        // parent avant d'atteindre le nôtre, ou le DOM peut être recréé sans préserver l'écouteur.
        var handleActivate = function (e) {
            e.preventDefault();
            e.stopPropagation();
            try { showUserPage(); }
            catch (err) { console.error('[InfoPopup] showUserPage failed:', err); }
        };
        link.addEventListener('click', handleActivate);
        link.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') handleActivate(e);
        });
        var icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.textContent = 'message';
        var label = document.createElement('span');
        label.textContent = t('user_page_title');
        link.appendChild(icon);
        link.appendChild(label);
        return { link: link, icon: icon, label: label };
    }

    // Délégation document : robuste si la sidebar est recréée par React/MUI sans préserver
    // les listeners attachés aux <a>, ou si un handler parent consomme le clic.
    // Posée une seule fois, en capture pour passer avant les handlers MUI parents.
    var _sidebarClickBound = false;
    function bindSidebarClick() {
        if (_sidebarClickBound) return;
        _sidebarClickBound = true;
        var handler = function (e) {
            var link = e.target && e.target.closest && e.target.closest('#ip-nav-messages');
            if (!link) return;
            console.log('[InfoPopup] sidebar click captured', e.eventPhase, e.target);
            e.preventDefault();
            e.stopPropagation();
            try { showUserPage(); }
            catch (err) { console.error('[InfoPopup] showUserPage failed:', err); }
        };
        // Capture sur document ET window : certains routeurs Jellyfin captent au niveau document
        // avant qu'on soit chargé ; window est l'enveloppe la plus externe.
        document.addEventListener('click', handler, true);
        window.addEventListener('click', handler, true);
    }

    function injectIntoClassicSidebar() {
        // Scope d'insertion = `.mainDrawer-scrollContainer` (le conteneur scrollable du main
        // drawer, jamais la sidebar dashboard admin qui a sa propre structure). Toujours
        // utiliser ce conteneur pour l'insertion — `appendChild` direct sur `.mainDrawer` qui
        // est un flex-column faisait s'étirer l'entrée sur toute la hauteur (bug 3.8.1.0).
        var container = document.querySelector('.mainDrawer-scrollContainer');
        if (!container || container.closest('.hide')) return false;
        if (container.querySelector('#ip-nav-messages')) return true;

        // Cherche un anchor de la zone utilisateur DANS le scroll container du main drawer.
        var anchor = container.querySelector('a[href*="#!/logout.html"]')
                  || container.querySelector('a[href*="logout"]')
                  || container.querySelector('a[href*="quickconnect"]')
                  || container.querySelector('a[href*="mypreferencesmenu"]')
                  || container.querySelector('a[href*="myprofile"]');

        var parts = createSidebarLink();
        parts.link.className = 'navMenuOption';
        // `flex:0 0 auto` + `min/max-height` explicites : protège contre les conteneurs
        // flex-column où un enfant peut s'étirer sur toute la hauteur (bug 3.8.1.0 quand
        // le link était inséré comme dernier enfant d'un parent flex sans frères).
        parts.link.style.cssText = 'display:flex;align-items:center;padding:8px 20px;cursor:pointer;' +
            'color:inherit;text-decoration:none;transition:background .15s;' +
            'flex:0 0 auto;min-height:40px;max-height:48px;box-sizing:border-box;';
        parts.icon.classList.add('navMenuOptionIcon');
        parts.label.classList.add('navMenuOptionText');

        if (anchor) {
            // Insertion juste avant l'anchor user (au-dessus de logout/preferences).
            anchor.parentNode.insertBefore(parts.link, anchor);
        } else {
            // Pas d'anchor user identifié : append au scrollContainer (comportement 3.7.x).
            // Sur les skins KefinTweaks/JellyfinEnhanced ça peut atterrir en fin de section
            // bibliothèques — placement imparfait mais fonctionnel et sans bug de hauteur.
            container.appendChild(parts.link);
        }

        parts.link.addEventListener('mouseenter', function () { parts.link.style.background = 'rgba(255,255,255,.06)'; });
        parts.link.addEventListener('mouseleave', function () { parts.link.style.background = ''; });
        return true;
    }

    function injectIntoMuiSidebar() {
        // Jellyfin 10.11+ experimental layout uses MUI Drawer
        var muiDrawer = document.querySelector('.MuiDrawer-paper') ||
                        document.querySelector('[class*="ResponsiveDrawer"]');
        if (!muiDrawer) return false;
        if (muiDrawer.querySelector('#ip-nav-messages')) return true;

        // Cible la liste utilisateur (préférences/déconnexion), JAMAIS la première liste qui
        // contient les bibliothèques médias — sinon le bouton « Messages » se retrouve dans
        // la section Média. On remonte depuis le lien le plus représentatif de la zone user
        // jusqu'à la liste qui le contient.
        var userAnchor = muiDrawer.querySelector('a[href*="logout"]')
                      || muiDrawer.querySelector('a[href*="quickconnect"]')
                      || muiDrawer.querySelector('a[href*="mypreferencesmenu"]')
                      || muiDrawer.querySelector('a[href*="preferences"]')
                      || muiDrawer.querySelector('a[href*="settings"]');

        var list = null;
        if (userAnchor) {
            var cursor = userAnchor;
            while (cursor && cursor !== muiDrawer) {
                if (cursor.matches && cursor.matches('ul, [role="list"], .MuiList-root')) {
                    list = cursor;
                    break;
                }
                cursor = cursor.parentElement;
            }
        }
        if (!list) {
            // Fallback : dernière liste du drawer (PAS la première qui est Média).
            var lists = muiDrawer.querySelectorAll('ul, [role="list"], .MuiList-root');
            if (lists.length) list = lists[lists.length - 1];
        }
        if (!list) return false;

        var parts = createSidebarLink();
        // Match MUI ListItemButton styling
        parts.link.style.cssText = 'display:flex;align-items:center;gap:16px;padding:8px 16px 8px 24px;' +
            'cursor:pointer;color:inherit;text-decoration:none;transition:background .15s;' +
            'min-height:48px;font-size:.9rem;width:100%;box-sizing:border-box;';
        parts.icon.style.cssText = 'font-size:1.5rem;opacity:.7;flex-shrink:0;min-width:40px;';

        // Insertion préférentielle juste avant l'item qui contient l'anchor user trouvé plus haut.
        var inserted = false;
        if (userAnchor) {
            var item = userAnchor;
            while (item && item.parentElement !== list) item = item.parentElement;
            if (item && item.parentElement === list) {
                list.insertBefore(parts.link, item);
                inserted = true;
            }
        }
        if (!inserted) list.appendChild(parts.link);

        parts.link.addEventListener('mouseenter', function () { parts.link.style.background = 'rgba(255,255,255,.06)'; });
        parts.link.addEventListener('mouseleave', function () { parts.link.style.background = ''; });
        return true;
    }

    function injectSidebarEntry() {
        if (!getToken()) return;
        ns.injectStyles();
        bindSidebarClick();
        // Try classic layout first (10.10, 10.11 stable), then MUI (10.11 experimental)
        if (!injectIntoClassicSidebar()) {
            injectIntoMuiSidebar();
        }
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

    function loadInbox(page, onPermsLoaded) {
        var list = page.querySelector('#ip-user-inbox-list');
        if (!list) return;
        apiFetch('/InfoPopup/popup-data')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var unseen  = data.unseen  || data.Unseen  || [];
                var history = data.history || data.History || [];

                // Optim v3.8.4.0 : popup-data RETOURNE DÉJÀ les permissions effectives de
                // l'utilisateur (champ Permissions). On les propage à initUserPage via le
                // callback `onPermsLoaded` pour éviter un GET /permissions/me redondant —
                // gain : 1 round-trip de moins à l'ouverture de l'overlay.
                if (typeof onPermsLoaded === 'function') {
                    var perms = data.permissions || data.Permissions;
                    if (perms) onPermsLoaded(normalizePerms(perms));
                }

                list.innerHTML = '';
                if (!unseen.length && !history.length) {
                    var empty = document.createElement('p');
                    empty.style.opacity = '.55';
                    empty.textContent = t('user_inbox_empty');
                    list.appendChild(empty);
                    return;
                }
                var reload = function () { loadInbox(page); };
                unseen.forEach(function (msg) {
                    list.appendChild(buildCollapsibleCard(msg, true,  'inbox', reload));
                });
                history.forEach(function (msg) {
                    list.appendChild(buildCollapsibleCard(msg, false, 'inbox', reload));
                });

                // Marquer les unseen comme vus côté serveur — sinon le popup les
                // re-afficherait à la prochaine connexion, alors que l'utilisateur
                // vient justement de les consulter via la page « Messages ».
                // Les pastilles « non lu » restent visibles dans la vue actuelle
                // pour information, mais l'état est persisté.
                var unseenIds = unseen.map(function (m) { return m.id || m.Id || ''; }).filter(Boolean);
                if (unseenIds.length) {
                    apiFetch('/InfoPopup/seen', {
                        method: 'POST',
                        body: JSON.stringify({ ids: unseenIds })
                    }).catch(function () { /* silencieux : l'UX n'en dépend pas */ });
                }
            })
            .catch(function () {
                list.innerHTML = '<p style="opacity:.55;">' + escHtml(t('user_inbox_empty')) + '</p>';
            });
    }

    /**
     * Affiche les réponses dans le container donné selon le mode.
     * - mode 'sent' : liste des réponses reçues (ou message « aucune »).
     * - mode 'inbox' : la propre réponse de l'utilisateur (s'il a répondu).
     */
    function renderRepliesSection(container, msg, isSent) {
        container.innerHTML = '';
        if (isSent) {
            var replies = msg.replies || msg.Replies || [];
            var header = document.createElement('div');
            header.className = 'ip-user-msg-replies-header';
            header.textContent = t(replies.length > 1 ? 'user_msg_replies_count_p' : 'user_msg_replies_count_s', replies.length);
            container.appendChild(header);
            if (!replies.length) {
                var empty = document.createElement('div');
                empty.className = 'ip-user-msg-replies-empty';
                empty.textContent = t('user_msg_no_replies');
                container.appendChild(empty);
                return;
            }
            replies.forEach(function (r) {
                var item = document.createElement('div');
                item.className = 'ip-user-msg-reply';
                var who = (r.userName || r.UserName || '') + '  ·  ' + formatDate(r.repliedAt || r.RepliedAt || '');
                var meta = document.createElement('div');
                meta.className = 'ip-user-msg-reply-meta';
                meta.textContent = who;
                var bodyDiv = document.createElement('div');
                bodyDiv.className = 'ip-user-msg-reply-body';
                bodyDiv.textContent = r.body || r.Body || '';
                item.appendChild(meta);
                item.appendChild(bodyDiv);
                container.appendChild(item);
            });
        } else {
            var my = msg.myReply || msg.MyReply || null;
            if (!my) return;
            var hdr = document.createElement('div');
            hdr.className = 'ip-user-msg-replies-header';
            hdr.textContent = t('user_msg_your_reply') + '  ·  ' + formatDate(my.repliedAt || my.RepliedAt || '');
            var bodyDiv2 = document.createElement('div');
            bodyDiv2.className = 'ip-user-msg-reply-body';
            bodyDiv2.textContent = my.body || my.Body || '';
            container.appendChild(hdr);
            container.appendChild(bodyDiv2);
        }
    }

    /**
     * Bascule la carte en mode édition inline : remplace le body (rendu) par un textarea
     * pré-rempli avec le markdown source, et propose Enregistrer / Annuler.
     * PUT /InfoPopup/messages/{id} préserve l'ID et `infopopup_seen.json` (R8).
     */
    function enterMessageEditMode(card, bodyEl, msg, refreshFn) {
        if (card.classList.contains('ip-editing')) return;
        card.classList.add('ip-editing');
        var id      = msg.id      || msg.Id      || '';
        var title   = msg.title   || msg.Title   || '';
        var body    = msg.body    || msg.Body    || '';
        var targets = msg.targetUserIds || msg.TargetUserIds || [];

        var prevHtml = bodyEl.innerHTML;
        bodyEl.innerHTML = '';

        var titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'emby-input ip-user-msg-edit-title';
        titleInput.value = title;
        titleInput.maxLength = 200;

        var ta = document.createElement('textarea');
        ta.className = 'emby-textarea ip-user-msg-edit-body';
        ta.rows = 6;
        ta.maxLength = 10000;
        ta.value = body;
        ta.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical;';

        var actions = document.createElement('div');
        actions.className = 'ip-user-msg-edit-actions';

        var save = document.createElement('button');
        save.type = 'button';
        save.className = 'raised button-submit emby-button';
        save.textContent = t('user_msg_save');

        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'raised emby-button';
        cancel.textContent = t('user_msg_cancel');

        var status = document.createElement('span');
        status.className = 'ip-user-msg-edit-status';

        actions.appendChild(save);
        actions.appendChild(cancel);
        actions.appendChild(status);

        bodyEl.appendChild(titleInput);
        bodyEl.appendChild(ta);
        bodyEl.appendChild(actions);

        function exit() {
            card.classList.remove('ip-editing');
            bodyEl.innerHTML = prevHtml;
        }
        cancel.addEventListener('click', exit);

        save.addEventListener('click', function () {
            var newTitle = titleInput.value.trim();
            var newBody  = ta.value.trim();
            if (!newTitle) { status.textContent = t('val_title_required'); status.className = 'ip-user-msg-edit-status err'; return; }
            if (!newBody)  { status.textContent = t('val_body_required');  status.className = 'ip-user-msg-edit-status err'; return; }
            save.disabled = true;
            apiFetch('/InfoPopup/messages/' + encodeURIComponent(id), {
                method: 'PUT',
                body: JSON.stringify({ title: newTitle, body: newBody, targetUserIds: targets })
            }).then(function (res) {
                if (!res.ok) throw new Error(String(res.status));
                exit();
                if (typeof refreshFn === 'function') refreshFn();
            }).catch(function (err) {
                save.disabled = false;
                status.textContent = t('user_msg_edit_err') + (err && err.message ? ' (' + err.message + ')' : '');
                status.className = 'ip-user-msg-edit-status err';
            });
        });
    }

    /**
     * Soft-delete d'un message (confirmation native pour rester léger côté UX).
     * Utilise POST /messages/{id}/soft-delete pour respecter `CanDeleteOwn/Others`.
     */
    function softDeleteMessage(id, refreshFn) {
        if (!id) return;
        if (!window.confirm(t('user_msg_confirm_delete'))) return;
        apiFetch('/InfoPopup/messages/' + encodeURIComponent(id) + '/soft-delete', {
            method: 'POST'
        }).then(function (res) {
            if (!res.ok) throw new Error(String(res.status));
            if (typeof refreshFn === 'function') refreshFn();
        }).catch(function () { /* silencieux — l'utilisateur réessaiera */ });
    }

    /**
     * Construit une carte de message repliable.
     * Par défaut, seuls le titre, l'auteur, la date et un aperçu sont visibles.
     * Le clic sur l'en-tête déplie/replie le corps complet.
     *
     * @param {object} msg - le message
     * @param {boolean} isUnseen - si true, pastille « non lu » affichée
     * @param {string} mode - 'inbox' (destinataire) ou 'sent' (expéditeur). Conditionne
     *                       l'affichage de MyReply vs Replies et les droits edit/delete.
     * @param {function} refreshFn - appelée après une action (delete, edit) pour rafraîchir la liste
     */
    function buildCollapsibleCard(msg, isUnseen, mode, refreshFn) {
        var isSent     = mode === 'sent';
        var title      = msg.title       || msg.Title       || '';
        var body       = msg.body        || msg.Body        || '';
        var date       = msg.publishedAt || msg.PublishedAt  || '';
        var authorName = msg.sentByUserName || msg.SentByUserName || '';
        var id         = msg.id          || msg.Id          || '';
        var myReply    = msg.myReply     || msg.MyReply     || null;
        var replies    = msg.replies     || msg.Replies     || [];

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
        // v3.8.3.0 : badge de r\u00F4le (admin/moderator/user/system) \u00E0 c\u00F4t\u00E9 du nom.
        var authorLabel = authorName || t('user_msg_system');
        var senderRole  = msg.senderRole || msg.SenderRole || (authorName ? 'user' : 'system');
        var roleKey = (senderRole === 'admin' || senderRole === 'moderator' || senderRole === 'system') ? senderRole : 'user';
        var metaSpan = document.createElement('span');
        metaSpan.textContent = authorLabel;
        metaRow.appendChild(metaSpan);
        var roleBadge = document.createElement('span');
        roleBadge.className = 'ip-role-badge ip-role-badge-' + roleKey;
        roleBadge.textContent = t('role_' + roleKey);
        metaRow.appendChild(roleBadge);
        var dateSpan = document.createElement('span');
        dateSpan.textContent = '  \u00B7  ' + formatDate(date);
        metaRow.appendChild(dateSpan);
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

        // ── Section « Votre réponse » (inbox uniquement, si l'utilisateur a répondu) ─────
        // ── Section « Réponses reçues » (sent uniquement, si au moins 1 réponse)     ─────
        var repliesContainer = document.createElement('div');
        repliesContainer.className = 'ip-user-msg-replies';
        repliesContainer.style.display = 'none';
        renderRepliesSection(repliesContainer, msg, isSent);
        card.appendChild(repliesContainer);

        // ── Barre d'actions (Modifier / Supprimer) gated par permissions ─────────────────
        // Inbox : actions destinataires (canEdit/DeleteOthersMessages — typiquement admin).
        // Sent  : actions propriétaires (canEdit/DeleteOwnMessages).
        var canEdit   = isSent ? _userPerms.canEditOwnMessages    : _userPerms.canEditOthersMessages;
        var canDelete = isSent ? _userPerms.canDeleteOwnMessages  : _userPerms.canDeleteOthersMessages;
        var actionsBar = null;
        if ((canEdit || canDelete) && id && !(msg.isDeleted || msg.IsDeleted)) {
            actionsBar = document.createElement('div');
            actionsBar.className = 'ip-user-msg-actions';
            actionsBar.style.display = 'none';
            if (canEdit) {
                var editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'ip-user-msg-action';
                editBtn.textContent = t('user_msg_edit');
                editBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    enterMessageEditMode(card, bodyEl, msg, refreshFn);
                });
                actionsBar.appendChild(editBtn);
            }
            if (canDelete) {
                var delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'ip-user-msg-action ip-user-msg-action-danger';
                delBtn.textContent = t('user_msg_delete');
                delBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    softDeleteMessage(id, refreshFn);
                });
                actionsBar.appendChild(delBtn);
            }
            card.appendChild(actionsBar);
        }

        // ── Toggle collapse ──────────────────────────────────────────────
        var toggle = function () {
            var collapsed = card.classList.contains('ip-collapsed');
            if (collapsed) {
                card.classList.remove('ip-collapsed');
                card.classList.add('ip-expanded');
                bodyEl.style.display = '';
                if (repliesContainer.children.length) repliesContainer.style.display = '';
                if (actionsBar) actionsBar.style.display = '';
                // Chargement paresseux du corps si absent (messages historiques)
                if (!bodyLoaded && id) {
                    bodyLoaded = true;
                    bodyEl.textContent = '...';
                    apiFetch('/InfoPopup/messages/' + encodeURIComponent(id))
                        .then(function (res) { return res.json(); })
                        .then(function (d) {
                            var b = d.body || d.Body || '';
                            bodyEl.innerHTML = b ? renderBody(b) : '';
                            // Le détail récupéré peut contenir MyReply / Replies à jour.
                            var freshMsg = Object.assign({}, msg, d);
                            renderRepliesSection(repliesContainer, freshMsg, isSent);
                            if (repliesContainer.children.length) repliesContainer.style.display = '';
                        })
                        .catch(function () { bodyEl.textContent = ''; });
                }
            } else {
                card.classList.remove('ip-expanded');
                card.classList.add('ip-collapsed');
                bodyEl.style.display = 'none';
                repliesContainer.style.display = 'none';
                if (actionsBar) actionsBar.style.display = 'none';
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
                var reloadSent = function () { loadSentMessages(page); };
                msgs.forEach(function (msg) {
                    list.appendChild(buildCollapsibleCard(msg, false, 'sent', reloadSent));
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

    // ──────────────────────────────────────────────────────────────────────────
    // Compose — toolbar de formatage avec WYSIWYG ↔ Raw (v3.8.8.0)
    // Mirror de l'éditeur admin : double mode contenteditable / textarea, toggle,
    // raccourcis clavier Ctrl+B/I/U/Shift+S, surlignage dynamique des boutons selon
    // ce qui entoure le curseur. Les helpers sont mutualisés via ns.markdownToHtml /
    // ns.htmlToMarkdown / ns.applyWysiwygFormat (exposés par ip-admin.js).
    // ──────────────────────────────────────────────────────────────────────────

    function userSyncWysiwygToTextarea(page) {
        var wysiwyg  = page.querySelector('#ip-user-body-wysiwyg');
        var textarea = page.querySelector('#ip-user-body');
        if (!wysiwyg || !textarea) return;
        textarea.value = ns.htmlToMarkdown ? ns.htmlToMarkdown(wysiwyg.innerHTML) : wysiwyg.textContent;
        userUpdateCharCount(page);
    }

    function userSyncTextareaToWysiwyg(page) {
        var wysiwyg  = page.querySelector('#ip-user-body-wysiwyg');
        var textarea = page.querySelector('#ip-user-body');
        if (!wysiwyg || !textarea) return;
        wysiwyg.innerHTML = ns.markdownToHtml ? ns.markdownToHtml(textarea.value) : escHtml(textarea.value);
    }

    function userUpdateCharCount(page) {
        var textarea = page.querySelector('#ip-user-body');
        var counter  = page.querySelector('#ip-user-char-count');
        if (!textarea || !counter) return;
        var len = textarea.value.length;
        var max = parseInt(textarea.maxLength, 10) || 10000;
        counter.textContent = len + '/' + max;
        counter.classList.remove('warning', 'danger');
        if (len > max * 0.9) counter.classList.add('danger');
        else if (len > max * 0.75) counter.classList.add('warning');
    }

    function userSetEditorMode(page, rawMode) {
        var wysiwyg  = page.querySelector('#ip-user-body-wysiwyg');
        var textarea = page.querySelector('#ip-user-body');
        var toggle   = page.querySelector('#ip-user-preview-toggle');
        if (!wysiwyg || !textarea) return;
        if (rawMode) {
            userSyncWysiwygToTextarea(page);
            wysiwyg.style.display  = 'none';
            textarea.style.display = 'block';
            textarea.focus();
            if (toggle) toggle.checked = true;
        } else {
            userSyncTextareaToWysiwyg(page);
            textarea.style.display = 'none';
            wysiwyg.style.display  = 'block';
            wysiwyg.focus();
            if (toggle) toggle.checked = false;
        }
        userUpdateCharCount(page);
    }

    function userIsRawMode(page) {
        var textarea = page.querySelector('#ip-user-body');
        return textarea && textarea.style.display !== 'none';
    }

    /**
     * Met à jour l'état actif des boutons toolbar en mode WYSIWYG (via queryCommandState).
     */
    function userUpdateToolbarActiveStateWysiwyg(page) {
        var toolbar = page.querySelector('#ip-user-format-toolbar');
        if (!toolbar) return;
        var cmdMap = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' };
        toolbar.querySelectorAll('.ip-fmt-btn[data-action]').forEach(function (btn) {
            var action = btn.dataset.action;
            if (action && action !== 'list' && cmdMap[action]) {
                try {
                    if (document.queryCommandState(cmdMap[action])) btn.classList.add('active');
                    else btn.classList.remove('active');
                } catch (e) { /* IE legacy */ }
            }
        });
    }

    /**
     * Met à jour l'état actif des boutons toolbar en mode Raw (analyse markdown autour
     * du curseur dans la textarea). Pattern identique à ip-admin.js.
     */
    function userUpdateToolbarActiveStateRaw(page, ta) {
        var toolbar = page.querySelector('#ip-user-format-toolbar');
        if (!toolbar || !ta) return;
        var val = ta.value, pos = ta.selectionStart;
        var sel = ta.selectionStart < ta.selectionEnd ? val.slice(ta.selectionStart, ta.selectionEnd) : '';
        // Détecte les délimiteurs entourant la sélection / le curseur.
        function isActive(prefix, suffix) {
            if (sel) return sel.startsWith(prefix) && sel.endsWith(suffix);
            // Curseur : on regarde si on est entre prefix...suffix sur la même ligne.
            var before = val.slice(0, pos), after = val.slice(pos);
            var p = before.lastIndexOf(prefix);
            if (p < 0) return false;
            var s = after.indexOf(suffix);
            if (s < 0) return false;
            // Pas de séparateur prefix/suffix entre p et notre pos
            return before.indexOf(suffix, p + prefix.length) < 0;
        }
        var map = { bold: ['**','**'], italic: ['_','_'], underline: ['__','__'], strike: ['~~','~~'] };
        toolbar.querySelectorAll('.ip-fmt-btn[data-action]').forEach(function (btn) {
            var action = btn.dataset.action;
            if (map[action]) {
                if (isActive(map[action][0], map[action][1])) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
    }

    function initFormatToolbar(page) {
        var toolbar  = page.querySelector('#ip-user-format-toolbar');
        var wysiwyg  = page.querySelector('#ip-user-body-wysiwyg');
        var textarea = page.querySelector('#ip-user-body');
        var toggle   = page.querySelector('#ip-user-preview-toggle');
        if (!toolbar || !textarea) return;

        // État initial : WYSIWYG visible.
        userSetEditorMode(page, false);

        // Toggle Raw / WYSIWYG.
        if (toggle) {
            toggle.addEventListener('change', function () {
                userSetEditorMode(page, toggle.checked);
            });
        }

        var fmtMap     = { bold: ['**','**'], italic: ['_','_'], strike: ['~~','~~'], underline: ['__','__'] };
        var wysiwygCmd = { bold: 'bold',     italic: 'italic',   underline: 'underline', strike: 'strikeThrough' };

        // Empêche le clic-toolbar de retirer le focus du contenteditable (sinon perte de
        // sélection avant execCommand). En mode WYSIWYG seulement.
        toolbar.addEventListener('mousedown', function (e) {
            var btn = e.target.closest('.ip-fmt-btn');
            if (!btn || userIsRawMode(page)) return;
            e.preventDefault();
        });

        toolbar.addEventListener('click', function (e) {
            var btn = e.target.closest('.ip-fmt-btn');
            if (!btn) return;
            e.preventDefault();
            var action = btn.dataset.action;
            if (userIsRawMode(page)) {
                if (action === 'list') {
                    toggleListLines(textarea);
                } else if (fmtMap[action]) {
                    applyFormat(textarea, fmtMap[action][0], fmtMap[action][1]);
                }
                textarea.focus();
                userUpdateCharCount(page);
                userUpdateToolbarActiveStateRaw(page, textarea);
            } else if (wysiwyg) {
                if (action === 'list') {
                    if (ns.applyWysiwygFormat) ns.applyWysiwygFormat('insertUnorderedList');
                    else document.execCommand('insertUnorderedList', false, null);
                } else if (wysiwygCmd[action]) {
                    if (ns.applyWysiwygFormat) ns.applyWysiwygFormat(wysiwygCmd[action]);
                    else document.execCommand(wysiwygCmd[action], false, null);
                }
                wysiwyg.focus();
                userSyncWysiwygToTextarea(page);
                userUpdateToolbarActiveStateWysiwyg(page);
            }
        });

        if (wysiwyg) {
            // Raccourcis clavier dans le WYSIWYG.
            wysiwyg.addEventListener('keydown', function (e) {
                if (!(e.ctrlKey || e.metaKey)) return;
                var handled = true;
                switch (e.key.toLowerCase()) {
                    case 'b': if (ns.applyWysiwygFormat) ns.applyWysiwygFormat('bold');      else document.execCommand('bold'); break;
                    case 'i': if (ns.applyWysiwygFormat) ns.applyWysiwygFormat('italic');    else document.execCommand('italic'); break;
                    case 'u': if (ns.applyWysiwygFormat) ns.applyWysiwygFormat('underline'); else document.execCommand('underline'); break;
                    case 's':
                        if (e.shiftKey) {
                            if (ns.applyWysiwygFormat) ns.applyWysiwygFormat('strikeThrough'); else document.execCommand('strikeThrough');
                        } else handled = false;
                        break;
                    default: handled = false;
                }
                if (handled) {
                    e.preventDefault();
                    userSyncWysiwygToTextarea(page);
                    userUpdateToolbarActiveStateWysiwyg(page);
                }
            });
            wysiwyg.addEventListener('input',  function () { userSyncWysiwygToTextarea(page); userUpdateToolbarActiveStateWysiwyg(page); });
            wysiwyg.addEventListener('mouseup', function () { userUpdateToolbarActiveStateWysiwyg(page); });
            wysiwyg.addEventListener('keyup',   function () { userUpdateToolbarActiveStateWysiwyg(page); });
        }

        // Mode Raw : raccourcis clavier + active state.
        textarea.addEventListener('keydown', function (e) {
            if (!(e.ctrlKey || e.metaKey)) return;
            var key = e.key.toLowerCase();
            var pair = null;
            if (key === 'b') pair = fmtMap.bold;
            else if (key === 'i') pair = fmtMap.italic;
            else if (key === 'u') pair = fmtMap.underline;
            else if (key === 's' && e.shiftKey) pair = fmtMap.strike;
            if (pair) {
                e.preventDefault();
                applyFormat(textarea, pair[0], pair[1]);
                userUpdateCharCount(page);
                userUpdateToolbarActiveStateRaw(page, textarea);
            }
        });
        textarea.addEventListener('input',    function () { userUpdateCharCount(page); userUpdateToolbarActiveStateRaw(page, textarea); });
        textarea.addEventListener('keyup',    function () { userUpdateToolbarActiveStateRaw(page, textarea); });
        textarea.addEventListener('mouseup',  function () { userUpdateToolbarActiveStateRaw(page, textarea); });

        userUpdateCharCount(page);
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
            var wysiwyg  = page.querySelector('#ip-user-body-wysiwyg');
            var titleErr = page.querySelector('#ip-user-title-err');
            var bodyErr  = page.querySelector('#ip-user-body-err');
            var toast    = page.querySelector('#ip-user-toast');
            // v3.8.8.0 : sync défensif WYSIWYG → textarea avant lecture, au cas où la
            // dernière frappe n'aurait pas encore déclenché input. Si on est en mode Raw,
            // pas besoin (textarea déjà à jour).
            if (!userIsRawMode(page)) userSyncWysiwygToTextarea(page);
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
                if (wysiwyg) wysiwyg.innerHTML = '';
                userUpdateCharCount(page);
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
        // Note : `#ip-user-page-title` et `#ip-user-publish-lbl` ne sont pas dans le DOM
        // de l'overlay (le titre et le bouton publish sont rendus directement avec t() lors
        // de la construction). Ne pas réintroduire ces clés ici sans ajouter d'élément correspondant.
        var map = {
            '#ip-user-tab-inbox-lbl': 'user_tab_inbox',
            '#ip-user-tab-send-lbl':  'user_tab_send',
            '#ip-user-compose-title': 'user_compose_title',
            '#ip-user-sent-title':    'user_sent_title',
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

        // Optim v3.8.4.0 : on supprime le `GET /permissions/me` redondant — popup-data
        // retourne déjà les permissions effectives. Le callback `onPermsLoaded` est invoqué
        // par loadInbox dès que la réponse arrive, et conditionne l'onglet « Envoyer ».
        // En parallèle, loadSentMessages est lancé immédiatement : si l'utilisateur n'a pas
        // CanSendMessages, le serveur retourne une liste vide (pas un 403) — coût négligeable
        // et on évite la latence séquentielle perms → sent.
        var sentLoadedEarly = false;
        loadInbox(page, function (perms) {
            _userPerms = perms;
            var sendTab = page.querySelector('#ip-user-tab-send');
            if (sendTab && _userPerms.canSendMessages) {
                sendTab.style.display = '';
                initCompose(page);
                if (!sentLoadedEarly) {
                    sentLoadedEarly = true;
                    loadSentMessages(page);
                }
            }
        });
    }

    // Permissions effectives de l'utilisateur courant, partagées au niveau module pour
    // que buildCollapsibleCard les consulte sans dépendre d'un Promise.
    var _userPerms = {
        canSendMessages: false, canReply: false,
        canEditOwnMessages: false, canDeleteOwnMessages: false,
        canEditOthersMessages: false, canDeleteOthersMessages: false,
        isAdmin: false
    };
    function normalizePerms(p) {
        if (!p) return _userPerms;
        return {
            canSendMessages:         p.canSendMessages         || p.CanSendMessages         || false,
            canReply:                p.canReply                || p.CanReply                || false,
            canEditOwnMessages:      p.canEditOwnMessages      || p.CanEditOwnMessages      || false,
            canDeleteOwnMessages:    p.canDeleteOwnMessages    || p.CanDeleteOwnMessages    || false,
            canEditOthersMessages:   p.canEditOthersMessages   || p.CanEditOthersMessages   || false,
            canDeleteOthersMessages: p.canDeleteOthersMessages || p.CanDeleteOthersMessages || false,
            isAdmin:                 p.isAdmin                 || p.IsAdmin                 || false
        };
    }

    // ── checkUserPage (appelé par MutationObserver dans ip-popup.js) ─────────
    // Gère 2 cas : overlay JS (non-admin) et configurationpage (admin fallback)
    function checkUserPage() {
        if (!getToken()) return;
        // Si l'overlay est ouvert, pas besoin de chercher dans le DOM
        if (_overlayOpen) return;
        // Fallback admin : configurationpage peut encore fonctionner pour les admins
        var page = document.querySelector('#infoPopupUserPage');
        if (!page) return;
        initUserPage(page);
    }

    // ── Exposition ───────────────────────────────────────────────────────────
    ns.checkUserPage       = checkUserPage;
    ns.injectSidebarEntry  = injectSidebarEntry;
    ns.showUserPage        = showUserPage;
    ns.closeUserOverlay    = closeUserOverlay;

}(window.__IP = window.__IP || {}));
