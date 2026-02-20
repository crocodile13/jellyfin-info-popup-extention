/**
 * jellyfin-info-popup-extention — client.js
 * ------------------------------------------
 * Injecté dans index.html via : <script src="/InfoPopup/client.js"></script>
 *
 * Fonctionnement :
 *   1. MutationObserver détecte l'arrivée sur la page home post-connexion
 *   2. GET /InfoPopup/unseen → récupère les messages non vus
 *   3. Affiche une popup (plus récent en principal, autres dans l'accordéon)
 *   4. POST /InfoPopup/seen (batch) à la fermeture
 */
(function () {
    'use strict';

    if (window.__infoPopupLoaded) return;
    window.__infoPopupLoaded = true;

    // ── État global ──────────────────────────────────────────────────────────
    let popupActive   = false;
    let lastCheckedPath = null;
    let checkScheduled  = false;

    // ── Utilitaires ──────────────────────────────────────────────────────────

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function formatDate(iso) {
        const d = new Date(iso);
        return [
            d.getUTCFullYear(),
            String(d.getUTCMonth() + 1).padStart(2, '0'),
            String(d.getUTCDate()).padStart(2, '0')
        ].join('-') + ' ' +
        [
            String(d.getUTCHours()).padStart(2, '0'),
            String(d.getUTCMinutes()).padStart(2, '0')
        ].join(':') + ' UTC';
    }

    function getToken() {
        try { return window.ApiClient?.accessToken?.(); } catch (_) { return null; }
    }

    async function apiFetch(path, opts = {}) {
        const token = getToken();
        if (!token) throw new Error('no-token');
        const res = await fetch(path, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `MediaBrowser Token="${token}"`,
                ...opts.headers
            }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    }

    // ── Styles CSS (variables thème Jellyfin) ────────────────────────────────

    function injectStyles() {
        if (document.getElementById('infopopup-styles')) return;
        const s = document.createElement('style');
        s.id = 'infopopup-styles';
        s.textContent = `
        #infopopup-backdrop {
            position:fixed; inset:0; background:rgba(0,0,0,.65);
            z-index:99998; display:flex; align-items:center; justify-content:center;
            animation:ip-fade .2s ease;
        }
        @keyframes ip-fade { from{opacity:0} to{opacity:1} }

        #infopopup-dialog {
            background:var(--theme-body-background-color,#202020);
            color:var(--theme-text-color,#e5e5e5);
            border:1px solid rgba(255,255,255,.12); border-radius:8px;
            box-shadow:0 8px 32px rgba(0,0,0,.6);
            max-width:560px; width:calc(100% - 32px); max-height:80vh;
            overflow-y:auto; display:flex; flex-direction:column;
            animation:ip-slide .25s cubic-bezier(.4,0,.2,1); font-family:inherit;
        }
        @keyframes ip-slide { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }

        #infopopup-header {
            display:flex; align-items:center; gap:10px;
            padding:18px 20px 14px; border-bottom:1px solid rgba(255,255,255,.1);
        }
        .ip-icon  { font-size:1.4rem; flex-shrink:0; }
        .ip-title { flex:1; font-size:1.1rem; font-weight:600; overflow-wrap:break-word; word-break:break-word; }
        .ip-close-btn {
            background:none; border:none; cursor:pointer; flex-shrink:0;
            color:var(--theme-text-color,#e5e5e5); font-size:1.3rem;
            opacity:.7; padding:4px 6px; border-radius:4px; transition:opacity .15s; line-height:1;
        }
        .ip-close-btn:hover { opacity:1; }

        #infopopup-body {
            padding:18px 20px; white-space:pre-wrap;
            overflow-wrap:break-word; word-break:break-word; line-height:1.6; flex:1;
        }

        /* Accordéon historique */
        .ip-history { margin:0 20px 12px; border:1px solid rgba(255,255,255,.1); border-radius:6px; overflow:hidden; }
        .ip-history-toggle {
            display:flex; align-items:center; justify-content:space-between;
            padding:10px 14px; cursor:pointer; background:rgba(255,255,255,.04);
            user-select:none; font-size:.9rem; gap:8px;
        }
        .ip-history-toggle:hover { background:rgba(255,255,255,.08); }
        .ip-chevron { transition:transform .2s; font-size:.75rem; opacity:.7; }
        .ip-history.expanded .ip-chevron { transform:rotate(180deg); }
        .ip-history-list { display:none; border-top:1px solid rgba(255,255,255,.1); }
        .ip-history.expanded .ip-history-list { display:block; }

        .ip-history-item { border-bottom:1px solid rgba(255,255,255,.07); }
        .ip-history-item:last-child { border-bottom:none; }
        .ip-item-hdr {
            display:flex; align-items:center; justify-content:space-between;
            padding:9px 14px; cursor:pointer; font-size:.88rem; gap:10px;
        }
        .ip-item-hdr:hover { background:rgba(255,255,255,.05); }
        .ip-item-title { font-weight:500; flex:1; }
        .ip-item-date  { opacity:.55; font-size:.82rem; flex-shrink:0; }
        .ip-item-chev  { opacity:.55; font-size:.7rem; transition:transform .2s; flex-shrink:0; }
        .ip-history-item.open .ip-item-chev { transform:rotate(180deg); }
        .ip-item-body {
            display:none; padding:10px 14px 12px; font-size:.9rem;
            white-space:pre-wrap; overflow-wrap:break-word; word-break:break-word;
            background:rgba(0,0,0,.15); line-height:1.55; opacity:.9;
        }
        .ip-history-item.open .ip-item-body { display:block; }

        /* Footer */
        #infopopup-footer {
            display:flex; justify-content:flex-end;
            padding:12px 20px 18px; border-top:1px solid rgba(255,255,255,.08);
        }
        .ip-btn-close {
            background:var(--theme-accent-color,#00a4dc); color:#fff;
            border:none; border-radius:4px; padding:9px 22px;
            font-size:.95rem; font-weight:500; cursor:pointer; transition:filter .15s;
        }
        .ip-btn-close:hover { filter:brightness(1.15); }
        `;
        document.head.appendChild(s);
    }

    // ── Construction de la popup ─────────────────────────────────────────────

    function showPopup(newestMsg, olderMessages, allUnseenIds) {
        if (popupActive) return;
        popupActive = true;
        injectStyles();

        const backdrop = document.createElement('div');
        backdrop.id = 'infopopup-backdrop';

        const dialog = document.createElement('div');
        dialog.id = 'infopopup-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', newestMsg.title);

        // Header
        const header = document.createElement('div');
        header.id = 'infopopup-header';
        header.innerHTML = `
            <span class="ip-icon" aria-hidden="true">🔔</span>
            <span class="ip-title">${escHtml(newestMsg.title)}</span>
            <button class="ip-close-btn" aria-label="Fermer" title="Fermer">✕</button>`;

        // Body — textContent uniquement, jamais innerHTML
        const body = document.createElement('div');
        body.id = 'infopopup-body';
        body.textContent = newestMsg.body;

        dialog.appendChild(header);
        dialog.appendChild(body);

        if (olderMessages.length > 0)
            dialog.appendChild(buildHistoryBlock(olderMessages));

        // Footer
        const footer = document.createElement('div');
        footer.id = 'infopopup-footer';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ip-btn-close';
        closeBtn.textContent = 'Fermer';
        footer.appendChild(closeBtn);
        dialog.appendChild(footer);

        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
        closeBtn.focus();

        const close = () => {
            backdrop.remove();
            popupActive = false;
            markAllSeen(allUnseenIds);
        };

        closeBtn.addEventListener('click', close);
        header.querySelector('.ip-close-btn').addEventListener('click', close);
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

        const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
    }

    function buildHistoryBlock(messages) {
        const block = document.createElement('div');
        block.className = 'ip-history';

        const toggle = document.createElement('div');
        toggle.className = 'ip-history-toggle';
        toggle.setAttribute('role', 'button');
        toggle.setAttribute('tabindex', '0');
        toggle.innerHTML = `<span>Messages précédents (${messages.length})</span><span class="ip-chevron">▼</span>`;
        toggle.addEventListener('click', () => block.classList.toggle('expanded'));
        toggle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') block.classList.toggle('expanded'); });

        const list = document.createElement('div');
        list.className = 'ip-history-list';

        messages.forEach(msg => {
            const item = document.createElement('div');
            item.className = 'ip-history-item';

            const hdr = document.createElement('div');
            hdr.className = 'ip-item-hdr';
            hdr.setAttribute('role', 'button');
            hdr.setAttribute('tabindex', '0');
            hdr.innerHTML = `
                <span class="ip-item-title">${escHtml(msg.title)}</span>
                <span class="ip-item-date">${formatDate(msg.publishedAt)}</span>
                <span class="ip-item-chev">▼</span>`;

            const itemBody = document.createElement('div');
            itemBody.className = 'ip-item-body';

            let loaded = false;
            const load = async () => {
                if (loaded) return;
                loaded = true;
                try {
                    const data = await (await apiFetch(`/InfoPopup/messages/${encodeURIComponent(msg.id)}`)).json();
                    itemBody.textContent = data.body; // textContent — jamais innerHTML
                } catch (_) {
                    itemBody.textContent = '(Erreur lors du chargement)';
                }
            };

            const toggle = () => { item.classList.toggle('open'); if (item.classList.contains('open')) load(); };
            hdr.addEventListener('click', toggle);
            hdr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggle(); });

            item.appendChild(hdr);
            item.appendChild(itemBody);
            list.appendChild(item);
        });

        block.appendChild(toggle);
        block.appendChild(list);
        return block;
    }

    // ── API calls ────────────────────────────────────────────────────────────

    async function markAllSeen(ids) {
        if (!ids?.length) return;
        try {
            await apiFetch('/InfoPopup/seen', { method: 'POST', body: JSON.stringify({ ids }) });
        } catch (err) {
            console.warn('[jellyfin-info-popup-extention] markAllSeen failed:', err);
        }
    }

    async function checkForUnseenMessages() {
        try {
            const unseenList = await (await apiFetch('/InfoPopup/unseen')).json();
            if (!unseenList?.length) return;

            const allMessages  = await (await apiFetch('/InfoPopup/messages')).json();
            const newest       = unseenList[0];
            const newestFull   = await (await apiFetch(`/InfoPopup/messages/${encodeURIComponent(newest.id)}`)).json();
            const older        = allMessages.filter(m => m.id !== newest.id);
            const allUnseenIds = unseenList.map(m => m.id);

            showPopup(newestFull, older, allUnseenIds);
        } catch (_) {
            // Silencieux : session expirée, réseau KO, aucun message → pas de popup
        }
    }

    // ── Détection page home (SPA Jellyfin) ──────────────────────────────────

    function scheduleCheck() {
        if (checkScheduled) return;
        checkScheduled = true;
        setTimeout(async () => {
            checkScheduled = false;
            if (!getToken()) return;
            const path = window.location.hash || window.location.pathname;
            if (path === lastCheckedPath) return;
            lastCheckedPath = path;
            await checkForUnseenMessages();
        }, 800);
    }

    function initObserver() {
        new MutationObserver(() => {
            if (document.querySelector('#indexPage, .homePage, [data-page="home"]'))
                scheduleCheck();
        }).observe(document.body, { childList: true, subtree: true });

        window.addEventListener('hashchange', scheduleCheck);
        scheduleCheck();
    }

    // ── Démarrage ────────────────────────────────────────────────────────────

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', initObserver);
    else
        initObserver();

})();
