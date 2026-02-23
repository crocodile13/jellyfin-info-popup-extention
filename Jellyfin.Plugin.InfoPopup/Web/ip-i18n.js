/**
 * jellyfin-info-popup-extention — ip-i18n.js
 * -------------------------------------------
 * Module i18n : détection de la langue Jellyfin + dictionnaires FR/EN.
 *
 * Langue détectée depuis (par ordre de priorité) :
 *   1. document.documentElement.lang   → attribut positionné par Jellyfin Web
 *   2. navigator.language              → langue du navigateur
 *   Normalisé en 'fr' ou 'en' (défaut).
 *
 * Exposition : window.__IP.t(key, ...args) — args remplacent {0}, {1}…
 */
(function (ns) {
    'use strict';

    // ── Dictionnaires ────────────────────────────────────────────────────────

    var _dicts = {
        fr: {
            // ── Page de configuration ────────────────────────────────────────
            cfg_subtitle:        'Diffusez des messages à tous les utilisateurs. Le message s\'affiche en popup à leur prochaine connexion.',
            cfg_new_message:     'Nouveau message',
            cfg_edit_message:    'Modifier le message',
            cfg_title_label:     'Titre *',
            cfg_title_ph:        'Saisir le titre du message...',
            cfg_body_label:      'Message *',
            cfg_body_ph:         'Saisir le contenu\u2026 (**gras**, _italique_, ~~barré~~, __souligné__, - liste)',
            cfg_recipients:      'Destinataires',
            cfg_publish:         'Publier le message',
            cfg_update:          '\u2713 Mettre à jour',
            cfg_cancel_edit:     'Annuler la modification',
            cfg_history:         'Historique des messages',
            cfg_select_all:      'Tout sélectionner',
            cfg_delete_sel:      'Supprimer la sélection',
            cfg_no_messages:     'Aucun message publié pour le moment.',
            cfg_loading_users:   'Chargement des utilisateurs...',

            // ── Table des messages ───────────────────────────────────────────
            tbl_col_title:       'Titre',
            tbl_col_title_hint:  '(cliquer pour développer)',
            tbl_col_recipients:  'Destinataires',
            tbl_col_date:        'Publié le',
            tbl_edit_btn:        '\u270e Modifier',
            tbl_edit_title:      'Modifier ce message',
            tbl_loading:         'Chargement\u2026',
            tbl_load_err:        '(Erreur lors du chargement)',
            tbl_badge_all:       'Tous',
            tbl_user_singular:   'utilisateur',
            tbl_user_plural:     'utilisateurs',

            // ── Ciblage ──────────────────────────────────────────────────────
            target_all:          'Tous les utilisateurs',
            target_no_users:     '(aucun utilisateur trouvé \u2014 vérifiez les droits admin)',
            target_unknown:      '...',

            // ── Sélection ────────────────────────────────────────────────────
            sel_count_singular:  '{0} message sélectionné',
            sel_count_plural:    '{0} messages sélectionnés',

            // ── Toasts ───────────────────────────────────────────────────────
            toast_published:     '\u2713 Message publié avec succès\u00a0!',
            toast_updated:       '\u2713 Message mis à jour\u00a0!',
            toast_deleted_s:     '\u2713 {0} message supprimé.',
            toast_deleted_p:     '\u2713 {0} messages supprimés.',
            toast_err_load:      'Erreur de chargement\u00a0: {0}',
            toast_err_update:    'Erreur de mise à jour\u00a0: {0}',
            toast_err_publish:   'Erreur de publication\u00a0: {0}',
            toast_err_delete:    'Erreur de suppression\u00a0: {0}',

            // ── Validation ───────────────────────────────────────────────────
            val_title_required:  'Le titre est obligatoire.',
            val_body_required:   'Le message est obligatoire.',

            // ── Boîte de confirmation ────────────────────────────────────────
            confirm_title:       'Confirmation',
            confirm_delete_s:    'Supprimer {0} message\u00a0?\n\nCette action est irréversible.',
            confirm_delete_p:    'Supprimer {0} messages\u00a0?\n\nCette action est irréversible.',
            confirm_ok:          'Supprimer',
            confirm_cancel:      'Annuler',

            // ── Aperçu ───────────────────────────────────────────────────────
            preview_hint:        'Cliquez ici ou sur \u00ab\u00a0Brut\u00a0\u00bb pour commencer à saisir\u2026',
            preview_toggle_raw:  'Raw',

            // ── Popup utilisateur ────────────────────────────────────────────
            popup_n_messages:    '{0} nouveaux messages',
            popup_close_aria:    'Fermer',
            popup_close_btn:     'Fermer',
            popup_history_label: 'Messages précédents ({0})',
            popup_hist_loading:  'Chargement\u2026',
            popup_hist_err:      '(Erreur lors du chargement)',
            popup_empty_body:    '(message vide)',

            // ── Toolbar ──────────────────────────────────────────────────────
            fmt_bold:            'Gras',
            fmt_italic:          'Italique',
            fmt_underline:       'Souligné',
            fmt_strike:          'Barré',
            fmt_list:            'Liste à puces',
            fmt_raw_tip:         'Activer pour afficher le texte brut (désactive l\'aperçu formaté)',

            // ── Dates ────────────────────────────────────────────────────────
            date_suffix:         'UTC'
        },

        en: {
            // ── Config page ──────────────────────────────────────────────────
            cfg_subtitle:        'Broadcast messages to all users. The message appears as a popup at their next login.',
            cfg_new_message:     'New message',
            cfg_edit_message:    'Edit message',
            cfg_title_label:     'Title *',
            cfg_title_ph:        'Enter message title...',
            cfg_body_label:      'Message *',
            cfg_body_ph:         'Enter content\u2026 (**bold**, _italic_, ~~strikethrough~~, __underline__, - list)',
            cfg_recipients:      'Recipients',
            cfg_publish:         'Publish message',
            cfg_update:          '\u2713 Update',
            cfg_cancel_edit:     'Cancel edit',
            cfg_history:         'Message history',
            cfg_select_all:      'Select all',
            cfg_delete_sel:      'Delete selection',
            cfg_no_messages:     'No messages published yet.',
            cfg_loading_users:   'Loading users...',

            // ── Message table ────────────────────────────────────────────────
            tbl_col_title:       'Title',
            tbl_col_title_hint:  '(click to expand)',
            tbl_col_recipients:  'Recipients',
            tbl_col_date:        'Published on',
            tbl_edit_btn:        '\u270e Edit',
            tbl_edit_title:      'Edit this message',
            tbl_loading:         'Loading\u2026',
            tbl_load_err:        '(Error loading content)',
            tbl_badge_all:       'All',
            tbl_user_singular:   'user',
            tbl_user_plural:     'users',

            // ── Targeting ────────────────────────────────────────────────────
            target_all:          'All users',
            target_no_users:     '(no users found \u2014 check admin rights)',
            target_unknown:      '...',

            // ── Selection ────────────────────────────────────────────────────
            sel_count_singular:  '{0} message selected',
            sel_count_plural:    '{0} messages selected',

            // ── Toasts ───────────────────────────────────────────────────────
            toast_published:     '\u2713 Message published successfully!',
            toast_updated:       '\u2713 Message updated!',
            toast_deleted_s:     '\u2713 {0} message deleted.',
            toast_deleted_p:     '\u2713 {0} messages deleted.',
            toast_err_load:      'Load error: {0}',
            toast_err_update:    'Update error: {0}',
            toast_err_publish:   'Publish error: {0}',
            toast_err_delete:    'Delete error: {0}',

            // ── Validation ───────────────────────────────────────────────────
            val_title_required:  'Title is required.',
            val_body_required:   'Message body is required.',

            // ── Confirm dialog ───────────────────────────────────────────────
            confirm_title:       'Confirmation',
            confirm_delete_s:    'Delete {0} message?\n\nThis action is irreversible.',
            confirm_delete_p:    'Delete {0} messages?\n\nThis action is irreversible.',
            confirm_ok:          'Delete',
            confirm_cancel:      'Cancel',

            // ── Preview ──────────────────────────────────────────────────────
            preview_hint:        'Click here or on \u00abRaw\u00bb to start typing\u2026',
            preview_toggle_raw:  'Raw',

            // ── User popup ───────────────────────────────────────────────────
            popup_n_messages:    '{0} new messages',
            popup_close_aria:    'Close',
            popup_close_btn:     'Close',
            popup_history_label: 'Previous messages ({0})',
            popup_hist_loading:  'Loading\u2026',
            popup_hist_err:      '(Error loading content)',
            popup_empty_body:    '(empty message)',

            // ── Toolbar ──────────────────────────────────────────────────────
            fmt_bold:            'Bold',
            fmt_italic:          'Italic',
            fmt_underline:       'Underline',
            fmt_strike:          'Strikethrough',
            fmt_list:            'Bullet list',
            fmt_raw_tip:         'Enable to show raw markup (disables formatted preview)',

            // ── Dates ────────────────────────────────────────────────────────
            date_suffix:         'UTC'
        }
    };

    // ── Détection de la langue ───────────────────────────────────────────────

    /**
     * Retourne 'fr' ou 'en' selon la langue active dans Jellyfin.
     * Source prioritaire : document.documentElement.lang (mis à jour par Jellyfin Web).
     * Fallback : navigator.language.
     */
    function detectLang() {
        var raw = (document.documentElement.lang || navigator.language || 'en').toLowerCase();
        return raw.startsWith('fr') ? 'fr' : 'en';
    }

    var _lang = detectLang();
    var _dict = _dicts[_lang] || _dicts.en;

    /**
     * Traduit une clé. Les occurrences de {0}, {1}… sont remplacées
     * par les arguments supplémentaires.
     * Retourne la clé entourée de '?' si absente du dictionnaire.
     */
    function t(key) {
        var str = _dict[key];
        if (str === undefined) return '?' + key + '?';
        for (var i = 1; i < arguments.length; i++) {
            str = str.replace('{' + (i - 1) + '}', arguments[i]);
        }
        return str;
    }

    /** Retourne la langue active ('fr' ou 'en'). */
    function lang() { return _lang; }

    // ── Exposition ───────────────────────────────────────────────────────────
    ns.t    = t;
    ns.lang = lang;

}(window.__IP = window.__IP || {}));
