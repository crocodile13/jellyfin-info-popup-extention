/**
 * jellyfin-info-popup-extention — ip-styles.js
 * ---------------------------------------------
 * Injection idempotente de tous les styles CSS dans <head>.
 * Couvre : popup utilisateur, historique, dialogue de confirmation,
 *          page admin (tableau, badges, toast, ciblage, toolbar, aperçu).
 *
 * La fonction est idempotente grâce au guard sur #infopopup-styles.
 * Tout composant générant des éléments stylés par les classes ip-* doit
 * appeler injectStyles() en premier.
 *
 * Dépendances : aucune
 * Exposition   : window.__IP.injectStyles()
 */
(function (ns) {
    'use strict';

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
            // ── Barre de progression (countdown auto-close) ─────────────────
            '#infopopup-progress-wrap{position:sticky;top:0;z-index:2;height:3px;background:rgba(255,255,255,.08);border-radius:8px 8px 0 0;flex-shrink:0;overflow:hidden}',
            '#infopopup-progress-bar{height:100%;background:var(--theme-accent-color,#00a4dc);border-radius:8px 8px 0 0;width:100%;transition-property:width;transition-timing-function:linear;will-change:width}',
            '#infopopup-header{display:flex;align-items:center;gap:10px;padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,.1)}',
            '.ip-icon{font-size:1.4rem;flex-shrink:0}',
            '.ip-title{flex:1;font-size:1.1rem;font-weight:600;overflow-wrap:break-word;word-break:break-word}',
            '.ip-close-btn{background:none;border:none;cursor:pointer;flex-shrink:0;color:var(--theme-text-color,#e5e5e5);font-size:1.3rem;opacity:.7;padding:4px 6px;border-radius:4px;transition:opacity .15s;line-height:1}',
            '.ip-close-btn:hover{opacity:1}',
            '#infopopup-body{padding:18px 20px;overflow-wrap:break-word;word-break:break-word;line-height:1.6;flex:1}',
            // ── Historique dans la popup ────────────────────────────────────
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
            // ── Pied de popup ───────────────────────────────────────────────
            '#infopopup-footer{display:flex;justify-content:flex-end;padding:12px 20px 18px;border-top:1px solid rgba(255,255,255,.08)}',
            '.ip-btn-close{background:var(--theme-accent-color,#00a4dc);color:#fff;border:none;border-radius:4px;padding:9px 22px;font-size:.95rem;font-weight:500;cursor:pointer;transition:filter .15s}',
            '.ip-btn-close:hover{filter:brightness(1.15)}',
            '.ip-list{margin:6px 0 4px 0;padding-left:22px;list-style:disc}',
            '.ip-list li{margin:3px 0;line-height:1.55}',
            // ── Dialogue de confirmation ────────────────────────────────────
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
            // ── Tableau admin — colonnes déroulantes ────────────────────────
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
            // ── Tableau admin — structure ───────────────────────────────────
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
            '.ip-target-select-controls{display:none;align-items:center;gap:6px;padding:5px 14px;border-top:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.015)}',
            '.ip-target-select-controls button{background:none;border:1px solid rgba(255,255,255,.15);border-radius:3px;color:var(--theme-text-color,#e5e5e5);font-size:.78rem;cursor:pointer;padding:2px 8px;opacity:.55;line-height:1.5;transition:opacity .15s,background .15s,border-color .15s;white-space:nowrap}',
            '.ip-target-select-controls button:hover{opacity:1;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.3)}',
            '.ip-target-select-controls .ip-sel-sep{opacity:.2;font-size:.8rem;user-select:none}',
            '.ip-target-user-list{border-top:1px solid rgba(255,255,255,.1);max-height:200px;overflow-y:auto;padding:8px 0}',
            '.ip-target-user-list label{display:flex;align-items:center;gap:8px;padding:5px 14px;cursor:pointer;font-size:.88rem;transition:background .1s;user-select:none}',
            '.ip-target-user-list label:hover{background:rgba(255,255,255,.04)}',
            // ── Toolbar de formatage ────────────────────────────────────────
            '.ip-fmt-btn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:var(--theme-text-color,#e5e5e5);cursor:pointer;font-size:.88rem;min-width:32px;padding:4px 10px;transition:background .15s,border-color .15s;line-height:1.4}',
            '.ip-fmt-btn:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3)}',
            '.ip-fmt-btn:active{background:rgba(255,255,255,.2)}',
            '.ip-fmt-btn-sep{margin-left:6px;border-left:1px solid rgba(255,255,255,.2)}',
            '.ip-fmt-btn.active{background:rgba(0,164,220,.22);border-color:rgba(0,164,220,.55);color:var(--theme-accent-color,#00a4dc);box-shadow:inset 0 0 0 1px rgba(0,164,220,.25)}',
            // ── Compteur de caractères ──────────────────────────────────────
            '.ip-char-count{font-size:.75rem;opacity:.45;margin-left:8px;font-variant-numeric:tabular-nums}',
            '.ip-char-count.warning{color:#f5a623;opacity:.85}',
            '.ip-char-count.danger{color:#cf6679;opacity:1}',
            // ── Éditeur WYSIWYG ─────────────────────────────────────────────
            '.ip-editor-wrap{display:block;position:relative}',
            '.ip-body-wysiwyg{min-height:160px;max-height:400px;border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:12px 14px;line-height:1.6;font-size:.93rem;background:rgba(0,0,0,.15);color:var(--theme-text-color,#e5e5e5);overflow-y:auto;outline:none;transition:border-color .15s,box-shadow .15s;word-break:break-word;overflow-wrap:break-word;white-space:pre-wrap;width:100%;box-sizing:border-box}',
            '.ip-body-wysiwyg:hover{border-color:rgba(255,255,255,.25)}',
            '.ip-body-wysiwyg:focus{border-color:var(--theme-accent-color,#00a4dc);box-shadow:0 0 0 2px rgba(0,164,220,.2)}',
            '.ip-body-wysiwyg:empty::before{content:attr(data-placeholder);color:rgba(255,255,255,.35);font-style:italic;pointer-events:none}',
            // ── Formatage inline dans WYSIWYG ───────────────────────────────
            '.ip-body-wysiwyg b,.ip-body-wysiwyg strong{font-weight:700}',
            '.ip-body-wysiwyg i,.ip-body-wysiwyg em{font-style:italic}',
            '.ip-body-wysiwyg u{text-decoration:underline}',
            '.ip-body-wysiwyg s,.ip-body-wysiwyg strike{text-decoration:line-through}',
            '.ip-body-wysiwyg ul{margin:6px 0;padding-left:22px;list-style:disc}',
            '.ip-body-wysiwyg li{margin:3px 0}',
            '.ip-body-wysiwyg a{color:var(--theme-accent-color,#00a4dc);text-decoration:underline}',
            // ── Toggle switch Raw ───────────────────────────────────────────
            '.ip-preview-toggle-wrap{display:flex;align-items:center;gap:7px;font-size:.83rem;opacity:.75;cursor:pointer;user-select:none;margin-left:auto;padding:2px 6px;border-radius:4px;transition:opacity .15s}',
            '.ip-preview-toggle-wrap:hover{opacity:1}',
            '.ip-toggle-switch{position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0}',
            '.ip-toggle-switch input{opacity:0;width:0;height:0;position:absolute}',
            '.ip-toggle-slider{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,.2);border-radius:9px;transition:background .2s}',
            '.ip-toggle-slider::before{content:\'\';position:absolute;height:12px;width:12px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.4)}',
            '.ip-toggle-switch input:checked+.ip-toggle-slider{background:var(--theme-accent-color,#00a4dc)}',
            '.ip-toggle-switch input:checked+.ip-toggle-slider::before{transform:translateX(14px)}',
            // ── Onglets ─────────────────────────────────────────────────────
            '.ip-tab-bar{display:flex;gap:0;border-bottom:2px solid rgba(255,255,255,.12);margin-bottom:24px}',
            '.ip-tab-btn{background:none;border:none;border-bottom:3px solid transparent;padding:10px 18px;cursor:pointer;color:var(--theme-text-color,#e5e5e5);opacity:.55;font-size:.93rem;display:flex;align-items:center;gap:6px;transition:opacity .15s,border-color .15s;margin-bottom:-2px}',
            '.ip-tab-btn:hover{opacity:.85}',
            '.ip-tab-active{opacity:1;border-bottom-color:var(--theme-accent-color,#00a4dc)}',
            // ── Paramètres ──────────────────────────────────────────────────
            '.ip-settings-section{max-width:560px}',
            '.ip-settings-section .inputContainer{margin-bottom:18px}',
            '.ip-check-row{display:flex;align-items:center;gap:10px;cursor:pointer;padding:4px 0}',
            '.ip-check-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--theme-accent-color,#00a4dc);flex-shrink:0}',
            // ── Zone de réponse (popup utilisateur) ─────────────────────────
            '.ip-reply-area{margin:12px 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:12px}',
            '.ip-reply-textarea{width:100%;box-sizing:border-box;min-height:70px;border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:8px 10px;background:rgba(0,0,0,.22);color:var(--theme-text-color,#e5e5e5);font-size:.88rem;resize:vertical;line-height:1.5;font-family:inherit}',
            '.ip-reply-textarea:focus{border-color:var(--theme-accent-color,#00a4dc);outline:none}',
            '.ip-reply-footer{display:flex;align-items:center;gap:10px;margin-top:6px}',
            '.ip-reply-send{background:rgba(0,164,220,.15);border:1px solid rgba(0,164,220,.35);border-radius:4px;color:var(--theme-accent-color,#00a4dc);padding:6px 16px;font-size:.88rem;cursor:pointer;transition:background .15s}',
            '.ip-reply-send:hover{background:rgba(0,164,220,.28)}',
            '.ip-reply-send:disabled{opacity:.4;cursor:default}',
            '.ip-reply-ok{font-size:.82rem;opacity:.65}',
            // ── Onglet Réponses (page admin) ─────────────────────────────────
            '.ip-replies-group{margin-bottom:22px;border:1px solid rgba(255,255,255,.08);border-radius:6px;overflow:hidden}',
            '.ip-replies-group-header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:rgba(255,255,255,.04);font-weight:600;font-size:.95rem}',
            '.ip-reply-row{display:grid;grid-template-columns:1fr auto;padding:10px 16px;border-top:1px solid rgba(255,255,255,.06);gap:12px}',
            '.ip-reply-row-meta{font-size:.78rem;opacity:.55;margin-bottom:3px}',
            '.ip-reply-row-body{font-size:.9rem;word-break:break-word}',
            '.ip-reply-del-btn{align-self:start;margin-top:2px;background:none;border:1px solid rgba(220,50,50,.4);border-radius:4px;color:#f66;padding:3px 10px;font-size:.8rem;cursor:pointer;white-space:nowrap;transition:background .15s}',
            '.ip-reply-del-btn:hover{background:rgba(220,50,50,.18)}',
            '.ip-replies-del-all{background:none;border:1px solid rgba(220,50,50,.4);border-radius:4px;color:#f66;padding:4px 12px;font-size:.82rem;cursor:pointer;transition:background .15s}',
            '.ip-replies-del-all:hover{background:rgba(220,50,50,.18)}',
            // ── Permissions tab ───────────────────────────────────────────────
            '.ip-perm-table{width:100%;border-collapse:collapse;font-size:.85rem}',
            '.ip-perm-table th,.ip-perm-table td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:center;vertical-align:middle}',
            '.ip-perm-table th:first-child,.ip-perm-table td:first-child{text-align:left;min-width:120px}',
            '.ip-perm-table tr:hover td{background:rgba(255,255,255,.04)}',
            '.ip-perm-table input[type="number"]{width:56px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:4px;color:inherit;padding:2px 4px;text-align:center}',
            '.ip-perm-save-btn{font-size:.78rem;padding:3px 10px}',
            '.ip-perm-save-ok{font-size:.78rem;color:#4caf50;margin-left:6px}',
            '.ip-perm-save-err{font-size:.78rem;color:#cf6679;margin-left:6px}',
            // ── Deleted message indicator ─────────────────────────────────────
            '.ip-msg-deleted{opacity:.45;text-decoration:line-through}',
            '.ip-msg-deleted-badge{display:inline-block;font-size:.72rem;color:#cf6679;border:1px solid rgba(207,102,121,.4);border-radius:3px;padding:0 4px;margin-left:6px;vertical-align:middle}',
            '.ip-msg-edited-badge{display:inline-block;font-size:.72rem;color:rgba(255,200,80,.8);border:1px solid rgba(255,200,80,.3);border-radius:3px;padding:0 4px;margin-left:4px;vertical-align:middle}',
            // ── User page — collapsible cards ─────────────────────────────────
            '#infoPopupUserPage .ip-user-msg-card{border:1px solid rgba(255,255,255,.1);border-radius:6px;margin-bottom:10px;background:rgba(255,255,255,.03);overflow:hidden}',
            '#infoPopupUserPage .ip-user-msg-header{padding:14px 16px;cursor:pointer;user-select:none;transition:background .12s}',
            '#infoPopupUserPage .ip-user-msg-header:hover{background:rgba(255,255,255,.04)}',
            '#infoPopupUserPage .ip-user-msg-title-row{display:flex;align-items:center;gap:6px}',
            '#infoPopupUserPage .ip-user-msg-title-text{font-weight:600;font-size:1rem;flex:1;overflow-wrap:break-word;word-break:break-word}',
            '#infoPopupUserPage .ip-user-msg-chev{font-size:.65rem;opacity:.45;transition:transform .2s;flex-shrink:0}',
            '#infoPopupUserPage .ip-expanded .ip-user-msg-chev{transform:rotate(90deg)}',
            '#infoPopupUserPage .ip-user-msg-meta{font-size:.78rem;opacity:.55;margin-top:4px}',
            '#infoPopupUserPage .ip-user-msg-preview{font-size:.85rem;opacity:.5;margin-top:6px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '#infoPopupUserPage .ip-expanded .ip-user-msg-preview{display:none}',
            '#infoPopupUserPage .ip-user-msg-body{padding:0 16px 14px;font-size:.9rem;line-height:1.55;overflow-wrap:break-word;word-break:break-word;border-top:1px solid rgba(255,255,255,.06)}',
            '#infoPopupUserPage .ip-user-unseen-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--theme-accent-color,#00a4dc);flex-shrink:0}',
            // ── Reply already-sent state ──────────────────────────────────────
            '.ip-reply-done{font-size:.82rem;opacity:.6;font-style:italic;padding:6px 0}'
        ].join('\n');
        document.head.appendChild(s);
    }

    // ── Exposition ───────────────────────────────────────────────────────────
    ns.injectStyles = injectStyles;

}(window.__IP = window.__IP || {}));
