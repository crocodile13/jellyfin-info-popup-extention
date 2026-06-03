/**
 * jellyfin-info-popup-extention — ip-admin.js (entry point)
 * ----------------------------------------------------------
 * Orchestrateur de la page de configuration admin. Init des onglets, des
 * traductions statiques, du filtre de recherche, des handlers globaux ;
 * délègue le reste à 5 sous-modules (v4.2.0.0) :
 *   - ip-admin-editor.js      : markdown ↔ HTML, WYSIWYG, toolbar
 *   - ip-admin-targets.js     : cache users + picker de ciblage
 *   - ip-admin-permissions.js : onglet Droits + enhanceSelect
 *   - ip-admin-settings.js    : onglets Paramètres + Réponses + Maintenance
 *   - ip-admin-messages.js    : onglet Messages, CRUD, modal Lectures, edit mode
 *
 * Dépendances : ip-i18n.js, ip-utils.js, ip-styles.js + tous les sous-modules ci-dessus.
 * Exposition  : window.__IP.initConfigPage(page), window.__IP.checkConfigPage()
 *               (helpers admin internes vivent dans window.__IP.__admin)
 */
(function (ns) {
    'use strict';
    var admin = ns.__admin = ns.__admin || {};

    var t        = function () { return ns.t.apply(ns, arguments); };
    var escHtml  = function (s) { return ns.escHtml(s); };

    // ── État rate-limit ─────────────────────────────────────────────────────
    // Modifié par admin-settings via admin.setRateLimitMs() quand les settings
    // sont chargés/sauvés. canPublish() le lit pour gater les publications.
    var _rateLimitMs = 2000;
    var lastPublishTime = 0;
    var toastTimer = null;

    function canPublish() {
        var now = Date.now();
        if (now - lastPublishTime < _rateLimitMs) {
            return false;
        }
        lastPublishTime = now;
        return true;
    }

    function setRateLimitMs(ms) {
        _rateLimitMs = parseInt(ms, 10) || 2000;
    }

    // ════════════════════════════════════════════════════════════════════════
    // Helpers UI partagés (toast + confirm) — utilisés par tous les sous-modules
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

    // ════════════════════════════════════════════════════════════════════════
    // Onglets — switch + lazy-load des panneaux Réponses / Droits
    // ════════════════════════════════════════════════════════════════════════

    function initTabs(page) {
        var tabs = [
            { btnId: 'ip-tab-messages',    panelId: 'ip-panel-messages'    },
            { btnId: 'ip-tab-settings',    panelId: 'ip-panel-settings'    },
            { btnId: 'ip-tab-replies',     panelId: 'ip-panel-replies'     },
            { btnId: 'ip-tab-permissions', panelId: 'ip-panel-permissions' }
        ];
        tabs.forEach(function (tab) {
            var btn = page.querySelector('#' + tab.btnId);
            if (!btn) return;
            btn.addEventListener('click', function () {
                tabs.forEach(function (t2) {
                    var b = page.querySelector('#' + t2.btnId);
                    var p = page.querySelector('#' + t2.panelId);
                    if (b) { b.classList.remove('ip-tab-active'); }
                    if (p) { p.style.display = 'none'; }
                });
                btn.classList.add('ip-tab-active');
                var panel = page.querySelector('#' + tab.panelId);
                if (panel) { panel.style.display = ''; }
                if (tab.btnId === 'ip-tab-replies')     { admin.loadReplies(page); }
                if (tab.btnId === 'ip-tab-permissions') { admin.loadPermissions(page); }
            });
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Traductions statiques + filtre de recherche
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
     * Filtre client-side de la table « Historique des messages » (v3.8.6.0).
     * Recherche dans `tr.dataset.search` (= titre + expéditeur, lowercased au render).
     * select-all et delete-bulk sont scopés aux rows visibles pour éviter d'agir
     * sur des messages cachés.
     */
    function initSearchFilter(page, selectedIds) {
        var input = page.querySelector('#ip-search');
        var counter = page.querySelector('#ip-search-count');
        if (!input) return;
        input.placeholder = t('search_placeholder');

        var apply = function () {
            var q = (input.value || '').trim().toLowerCase();
            var container = page.querySelector('#ip-msg-container');
            if (!container) return;
            var rows = container.querySelectorAll('tr[data-id]');
            var visible = 0;
            rows.forEach(function (tr) {
                var key = tr.dataset.search || '';
                var expandTr = tr.nextElementSibling;
                var match = !q || key.indexOf(q) !== -1;
                if (match) {
                    tr.style.display = '';
                    if (expandTr && expandTr.classList.contains('ip-row-expand')) {
                        expandTr.style.display = '';
                    }
                    visible++;
                } else {
                    tr.style.display = 'none';
                    if (expandTr && expandTr.classList.contains('ip-row-expand')) {
                        expandTr.style.display = 'none';
                    }
                    // Désélectionner les messages cachés pour éviter qu'un delete-bulk les emporte.
                    var cb = tr.querySelector('.ip-row-check');
                    if (cb && cb.checked) {
                        cb.checked = false;
                        if (selectedIds) selectedIds.delete(tr.dataset.id);
                    }
                }
            });
            if (counter) {
                counter.textContent = q
                    ? t('search_count', visible, rows.length)
                    : '';
            }
            admin.updateSelectionUI(page, selectedIds || new Set());
        };
        input.addEventListener('input', apply);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && input.value) {
                input.value = '';
                apply();
                e.stopPropagation();
            }
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Initialisation principale
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Initialise la page de configuration admin. Idempotent via page._ipInitDone.
     */
    function initConfigPage(page) {
        if (page._ipInitDone) return;
        page._ipInitDone = true;
        ns.injectStyles();
        applyStaticTranslations(page);
        initTabs(page);
        admin.initSettingsTab(page);

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

        console.log('InfoPopup: config page init OK (v4.2.0.0)');

        var selectedIds = new Set();
        var editState   = { id: null, onEdit: null };
        var onEdit      = function (msg) { admin.enterEditMode(page, msg, editState); };
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
        admin.setEditorMode(page, false);

        // Toggle Raw : coché = mode textarea, décoché = mode WYSIWYG
        if (previewToggle) {
            previewToggle.addEventListener('change', function () {
                admin.setEditorMode(page, previewToggle.checked);
            });
        }

        // ── WYSIWYG : raccourcis clavier et synchronisation ───────────────────
        if (wysiwygEl) {
            wysiwygEl.addEventListener('keydown', function (e) {
                if (e.ctrlKey || e.metaKey) {
                    var handled = true;
                    switch (e.key.toLowerCase()) {
                        case 'b': admin.applyWysiwygFormat('bold'); break;
                        case 'i': admin.applyWysiwygFormat('italic'); break;
                        case 'u': admin.applyWysiwygFormat('underline'); break;
                        case 's':
                            if (e.shiftKey) { admin.applyWysiwygFormat('strikeThrough'); }
                            else { handled = false; }
                            break;
                        default: handled = false;
                    }
                    if (handled) {
                        e.preventDefault();
                        admin.syncWysiwygToTextarea(page);
                        admin.updateToolbarActiveStateWysiwyg(page);
                    }
                }
            });

            wysiwygEl.addEventListener('input', function () {
                admin.syncWysiwygToTextarea(page);
                admin.updateToolbarActiveStateWysiwyg(page);
            });
            wysiwygEl.addEventListener('mouseup', function () {
                admin.updateToolbarActiveStateWysiwyg(page);
            });
            wysiwygEl.addEventListener('keyup', function () {
                admin.updateToolbarActiveStateWysiwyg(page);
            });
        }

        // ── Textarea (mode Raw) : mise à jour des états ───────────────────────
        if (bodyEl) {
            bodyEl.addEventListener('input', function () {
                admin.updateCharCount(page);
            });

            var refreshToolbarState = function () { admin.updateToolbarActiveState(page, bodyEl); };
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
                if (!admin.isRawMode(page)) {
                    admin.syncWysiwygToTextarea(page);
                }
                admin.publishMessage(page, selectedIds, editState);
            });
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function () {
                editState.id = null;
                admin.exitEditMode(page);
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function () {
                admin.deleteSelected(page, selectedIds, editState);
            });
        }
        if (selectAll) {
            selectAll.addEventListener('change', function (e) {
                // v3.8.6.0 : scoper aux rows VISIBLES (filtre de recherche actif).
                page.querySelectorAll('.ip-row-check').forEach(function (cb) {
                    var tr = cb.closest('tr');
                    if (tr && tr.style.display === 'none') return;
                    cb.checked = e.target.checked;
                    if (e.target.checked) selectedIds.add(cb.dataset.id);
                    else selectedIds.delete(cb.dataset.id);
                });
                admin.updateSelectionUI(page, selectedIds);
            });
        }

        // ── Toolbar de formatage ─────────────────────────────────────────────
        if (toolbar) {
            // mousedown + preventDefault en mode WYSIWYG : empêche le clic sur un bouton
            // de retirer le focus du contenteditable et d'effacer la sélection courante.
            toolbar.addEventListener('mousedown', function (e) {
                var btn = e.target.closest('.ip-fmt-btn');
                if (!btn || admin.isRawMode(page)) return;
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

                if (admin.isRawMode(page)) {
                    // Mode Raw : formatage markdown
                    if (action === 'list') {
                        admin.toggleListLines(bodyEl);
                    } else if (fmtMap[action]) {
                        admin.applyFormat(bodyEl, fmtMap[action][0], fmtMap[action][1]);
                    }
                    if (bodyEl) bodyEl.focus();
                    admin.updateToolbarActiveState(page, bodyEl);
                } else if (wysiwygEl) {
                    // Mode WYSIWYG : execCommand
                    if (action === 'list') {
                        admin.applyWysiwygFormat('insertUnorderedList');
                    } else if (wysiwygCmdMap[action]) {
                        admin.applyWysiwygFormat(wysiwygCmdMap[action]);
                    }
                    wysiwygEl.focus();
                    admin.syncWysiwygToTextarea(page);
                    admin.updateToolbarActiveStateWysiwyg(page);
                }
            });
        }

        // Chargement initial — optim v3.8.4.0 : fetchUsers et loadMessages en PARALLÈLE.
        // loadMessages ne dépend pas des users (les noms d'auteur sont résolus côté
        // serveur). Gain : 1 RTT au lieu de 2 séquentiels sur l'ouverture du dashboard.
        admin.fetchUsers().then(function (users) { admin.renderTargetPicker(page, users); });
        admin.loadMessages(page, selectedIds, onEdit);

        // v3.8.6.0 : filtre client-side de la table messages.
        initSearchFilter(page, selectedIds);
    }

    // ── Détection et initialisation depuis l'observer ────────────────────────

    function checkConfigPage() {
        var page = document.querySelector('#infoPopupConfigPage');
        if (page) initConfigPage(page);
    }

    // ── Exposition ───────────────────────────────────────────────────────────
    // Public API (compat ip-popup.js + ip-user.js)
    ns.initConfigPage = initConfigPage;
    ns.checkConfigPage = checkConfigPage;

    // Helpers admin internes pour les sous-modules ip-admin-*
    admin.showToast = showToast;
    admin.showConfirm = showConfirm;
    admin.canPublish = canPublish;
    admin.setRateLimitMs = setRateLimitMs;

}(window.__IP = window.__IP || {}));
