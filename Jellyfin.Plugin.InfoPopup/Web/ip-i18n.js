/**
 * jellyfin-info-popup-extention — ip-i18n.js
 * -------------------------------------------
 * Module i18n : détection de la langue Jellyfin + dictionnaires FR/EN.
 *
 * Langue détectée depuis (par ordre de priorité) :
 *   1. document.documentElement.lang   → attribut positionné par Jellyfin Web
 *   2. navigator.language              → langue du navigateur (fallback)
 *   Normalisé en 'fr' ou 'en' (défaut).
 *
 * Problème connu Jellyfin 10.11 (React Router) :
 *   L'événement localusersignedin est émis AVANT que les listeners soient
 *   enregistrés → document.documentElement.lang est vide au chargement du
 *   module. Ce module utilise deux mécanismes pour contourner ce problème :
 *   1. MutationObserver sur <html> : dès que Jellyfin positionne l'attribut
 *      lang (même en retard), _lang et _dict sont mis à jour.
 *   2. Détection lazy dans t() : si _lang a été résolu depuis navigator.language
 *      et que html.lang est maintenant disponible, t() se re-synchronise au
 *      premier appel qui suit.
 *
 * Exposition : window.__IP.t(key, ...args) — args remplacent {0}, {1}…
 *              window.__IP.lang()          — langue active ('fr' ou 'en')
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
            target_select_all:   'Tout sélectionner',
            target_deselect_all: 'Tout désélectionner',

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
            toast_rate_limit:    'Veuillez patienter quelques secondes avant de republier.',

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
            preview_hint:        'Cliquez ici ou sur \u00ab\u00a0Brut\u00a0\u00bb pour commencer \u00e0 saisir\u2026',
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
            fmt_raw_tip:         'Activer pour saisir le texte brut (markup)',

            // ── Onglets ──────────────────────────────────────────────────────
            tab_messages:        'Messages',
            tab_settings:        'Param\u00e8tres',
            tab_replies:         'R\u00e9ponses',

            // ── Param\u00e8tres ───────────────────────────────────────────────────
            set_title:              'Param\u00e8tres',
            set_popup_enabled:      'Activer la popup',
            set_popup_delay:        'Dur\u00e9e d\u2019affichage avant fermeture automatique (ms, 0\u00a0=\u00a0infini)',
            set_max_messages:       'Maximum de messages simultan\u00e9s',
            set_history_enabled:    'Afficher l\u2019historique dans la popup',
            set_allow_replies:      'Autoriser les r\u00e9ponses utilisateurs',
            set_reply_max_len:      'Longueur max. d\u2019une r\u00e9ponse (caract\u00e8res)',
            set_rate_limit:         'D\u00e9lai minimum entre publications (ms)',
            set_save:               'Enregistrer les param\u00e8tres',
            toast_settings_saved:   '\u2713 Param\u00e8tres enregistr\u00e9s.',
            toast_err_settings:     'Erreur lors de la sauvegarde\u00a0: {0}',

            // ── R\u00e9ponses utilisateur (popup) ───────────────────────────────
            reply_placeholder:   'Votre r\u00e9ponse\u2026',
            reply_send:          'Envoyer',
            reply_sent:          '\u2713 R\u00e9ponse envoy\u00e9e',
            reply_err:           'Erreur\u00a0: {0}',

            // ── R\u00e9ponses admin ────────────────────────────────────────────────
            replies_empty:           'Aucune r\u00e9ponse pour le moment.',
            replies_delete_all:      'Tout supprimer',
            replies_delete_one:      'Supprimer',
            replies_loading:         'Chargement des r\u00e9ponses\u2026',
            replies_disabled_hint:   'Activez les r\u00e9ponses dans Param\u00e8tres.',
            tbl_col_reply_user:      'Utilisateur',
            tbl_col_reply_date:      'Date',
            tbl_col_reply_body:      'R\u00e9ponse',
            toast_reply_deleted:     '\u2713 R\u00e9ponse supprim\u00e9e.',
            toast_err_reply_delete:  'Erreur de suppression\u00a0: {0}',

            // ── Onglet Droits ────────────────────────────────────────────────
            tab_permissions:        'Droits',
            perm_section_title:     'Gestion des droits',
            perm_col_user:          'Utilisateur',
            perm_col_send:          'Envoyer',
            perm_col_reply:         'R\u00e9pondre',
            perm_col_edit_own:      'Modifier ses msg',
            perm_col_delete_own:    'Suppr. ses msg',
            perm_col_edit_others:   'Modifier les autres',
            perm_col_delete_others: 'Suppr. les autres',
            perm_col_max_msgs:      'Max msgs/j',
            perm_col_max_replies:   'Max r\u00e9p./j',
            perm_col_actions:       'Actions',
            perm_save_row:          'Enregistrer',
            perm_saved_row:         'Enregistr\u00e9 \u2713',
            perm_save_err:          'Erreur',
            perm_loading:           'Chargement...',
            perm_no_users:          'Aucun utilisateur.',
            perm_hint_0:            '0 = illimit\u00e9',

            // ── Page utilisateur ─────────────────────────────────────────────
            user_page_title:        'Mes messages',
            user_tab_inbox:         'Re\u00e7us',
            user_tab_send:          'Envoyer',
            user_inbox_empty:       'Aucun message re\u00e7u.',
            user_inbox_loading:     'Chargement...',
            user_sent_title:        'Mes messages envoy\u00e9s',
            user_sent_empty:        'Aucun message envoy\u00e9.',
            user_compose_title:     'Nouveau message',
            user_publish_btn:       'Envoyer le message',

            // ── Badges message ───────────────────────────────────────────────
            msg_deleted_label:      '(supprim\u00e9)',
            msg_edited_label:       '(modifi\u00e9 {0}\u00d7)',

            // ── Popup r\u00e9ponse ─────────────────────────────────────────────────
            reply_auto_close:       'R\u00e9ponse envoy\u00e9e.',
            reply_already_sent:     'Vous avez d\u00e9j\u00e0 r\u00e9pondu.',
            rate_limit_msg:         'Limite journali\u00e8re atteinte.',

            // ── R\u00e9tention ──────────────────────────────────────────────────────
            ret_admin_days_lbl:     'Conservation messages admin (jours, 0=infini)',
            ret_user_days_lbl:      'Conservation messages utilisateurs (jours, 0=infini)',

            // ── Filtre r\u00e9ponses ────────────────────────────────────────────────
            replies_filter_lbl:     'Filtrer\u00a0:',

            // ── Validation utilisateur ───────────────────────────────────────
            err_title_required:     'Le titre est obligatoire.',
            err_body_required:      'Le message est obligatoire.',

            // ── Validation longueurs (3.6.0.0) ───────────────────────────────
            val_title_too_long:     'Le titre dépasse la limite de {0} caractères.',
            val_body_too_long:      'Le message dépasse la limite de {0} caractères.',
            val_reply_empty:        'La réponse ne peut pas être vide.',
            val_reply_too_long:     'La réponse dépasse la limite de {0} caractères.',
            val_settings_invalid:   'Paramètres invalides — vérifiez les valeurs saisies.',

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
            target_select_all:   'Select all',
            target_deselect_all: 'Deselect all',

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
            toast_rate_limit:    'Please wait a few seconds before republishing.',

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
            preview_hint:        'Click here or on \u201cRaw\u201d to start typing\u2026',
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
            fmt_raw_tip:         'Switch to raw markup input mode',

            // ── Tabs ─────────────────────────────────────────────────────────
            tab_messages:        'Messages',
            tab_settings:        'Settings',
            tab_replies:         'Replies',

            // ── Settings ─────────────────────────────────────────────────────
            set_title:              'Settings',
            set_popup_enabled:      'Enable popup',
            set_popup_delay:        'Auto-close delay (ms, 0\u00a0=\u00a0infinite)',
            set_max_messages:       'Maximum simultaneous messages',
            set_history_enabled:    'Show history in popup',
            set_allow_replies:      'Allow user replies',
            set_reply_max_len:      'Max reply length (characters)',
            set_rate_limit:         'Minimum delay between posts (ms)',
            set_save:               'Save settings',
            toast_settings_saved:   '\u2713 Settings saved.',
            toast_err_settings:     'Error saving settings: {0}',

            // ── User replies (popup) ──────────────────────────────────────────
            reply_placeholder:   'Your reply\u2026',
            reply_send:          'Send',
            reply_sent:          '\u2713 Reply sent',
            reply_err:           'Error: {0}',

            // ── Admin replies ────────────────────────────────────────────────
            replies_empty:           'No replies yet.',
            replies_delete_all:      'Delete all',
            replies_delete_one:      'Delete',
            replies_loading:         'Loading replies\u2026',
            replies_disabled_hint:   'Enable replies in Settings tab.',
            tbl_col_reply_user:      'User',
            tbl_col_reply_date:      'Date',
            tbl_col_reply_body:      'Reply',
            toast_reply_deleted:     '\u2713 Reply deleted.',
            toast_err_reply_delete:  'Delete error: {0}',

            // ── Permissions tab ──────────────────────────────────────────────
            tab_permissions:        'Permissions',
            perm_section_title:     'User Permissions',
            perm_col_user:          'User',
            perm_col_send:          'Send',
            perm_col_reply:         'Reply',
            perm_col_edit_own:      'Edit own',
            perm_col_delete_own:    'Delete own',
            perm_col_edit_others:   'Edit others',
            perm_col_delete_others: 'Delete others',
            perm_col_max_msgs:      'Max msgs/day',
            perm_col_max_replies:   'Max replies/day',
            perm_col_actions:       'Actions',
            perm_save_row:          'Save',
            perm_saved_row:         'Saved \u2713',
            perm_save_err:          'Error',
            perm_loading:           'Loading...',
            perm_no_users:          'No users.',
            perm_hint_0:            '0 = unlimited',

            // ── User page ────────────────────────────────────────────────────
            user_page_title:        'My Messages',
            user_tab_inbox:         'Inbox',
            user_tab_send:          'Send',
            user_inbox_empty:       'No messages received.',
            user_inbox_loading:     'Loading...',
            user_sent_title:        'My Sent Messages',
            user_sent_empty:        'No messages sent.',
            user_compose_title:     'New message',
            user_publish_btn:       'Send message',

            // ── Message badges ───────────────────────────────────────────────
            msg_deleted_label:      '(deleted)',
            msg_edited_label:       '(edited {0}\u00d7)',

            // ── Popup reply ──────────────────────────────────────────────────
            reply_auto_close:       'Reply sent.',
            reply_already_sent:     'You already replied.',
            rate_limit_msg:         'Daily limit reached.',

            // ── Retention ────────────────────────────────────────────────────
            ret_admin_days_lbl:     'Admin message retention (days, 0=\u221e)',
            ret_user_days_lbl:      'User message retention (days, 0=\u221e)',

            // ── Replies filter ───────────────────────────────────────────────
            replies_filter_lbl:     'Filter:',

            // ── User validation ──────────────────────────────────────────────
            err_title_required:     'Title is required.',
            err_body_required:      'Message body is required.',

            // ── Validation lengths (3.6.0.0) ─────────────────────────────────
            val_title_too_long:     'Title exceeds the {0}-character limit.',
            val_body_too_long:      'Message body exceeds the {0}-character limit.',
            val_reply_empty:        'Reply cannot be empty.',
            val_reply_too_long:     'Reply exceeds the {0}-character limit.',
            val_settings_invalid:   'Invalid settings — please check the values entered.',

            // ── Dates ────────────────────────────────────────────────────────
            date_suffix:         'UTC'
        },

        es: {
            // ── Página de configuración ──────────────────────────────────────
            cfg_subtitle:        'Envía mensajes a todos los usuarios. El mensaje aparece como ventana emergente en su próximo inicio de sesión.',
            cfg_new_message:     'Nuevo mensaje',
            cfg_edit_message:    'Editar mensaje',
            cfg_title_label:     'Título *',
            cfg_title_ph:        'Introduce el título del mensaje...',
            cfg_body_label:      'Mensaje *',
            cfg_body_ph:         'Introduce el contenido\u2026 (**negrita**, _cursiva_, ~~tachado~~, __subrayado__, - lista)',
            cfg_recipients:      'Destinatarios',
            cfg_publish:         'Publicar mensaje',
            cfg_update:          '\u2713 Actualizar',
            cfg_cancel_edit:     'Cancelar edición',
            cfg_history:         'Historial de mensajes',
            cfg_select_all:      'Seleccionar todo',
            cfg_delete_sel:      'Eliminar selección',
            cfg_no_messages:     'No hay mensajes publicados.',
            cfg_loading_users:   'Cargando usuarios...',

            // ── Tabla de mensajes ────────────────────────────────────────────
            tbl_col_title:       'Título',
            tbl_col_title_hint:  '(clic para expandir)',
            tbl_col_recipients:  'Destinatarios',
            tbl_col_date:        'Publicado el',
            tbl_edit_btn:        '\u270e Editar',
            tbl_edit_title:      'Editar este mensaje',
            tbl_loading:         'Cargando\u2026',
            tbl_load_err:        '(Error al cargar)',
            tbl_badge_all:       'Todos',
            tbl_user_singular:   'usuario',
            tbl_user_plural:     'usuarios',

            // ── Destinatarios ────────────────────────────────────────────────
            target_all:          'Todos los usuarios',
            target_no_users:     '(no se encontraron usuarios \u2014 comprueba los permisos de administrador)',
            target_unknown:      '...',
            target_select_all:   'Seleccionar todo',
            target_deselect_all: 'Deseleccionar todo',

            // ── Selección ────────────────────────────────────────────────────
            sel_count_singular:  '{0} mensaje seleccionado',
            sel_count_plural:    '{0} mensajes seleccionados',

            // ── Toasts ───────────────────────────────────────────────────────
            toast_published:     '\u2713 ¡Mensaje publicado con éxito!',
            toast_updated:       '\u2713 ¡Mensaje actualizado!',
            toast_deleted_s:     '\u2713 {0} mensaje eliminado.',
            toast_deleted_p:     '\u2713 {0} mensajes eliminados.',
            toast_err_load:      'Error de carga: {0}',
            toast_err_update:    'Error al actualizar: {0}',
            toast_err_publish:   'Error al publicar: {0}',
            toast_err_delete:    'Error al eliminar: {0}',
            toast_rate_limit:    'Por favor, espera unos segundos antes de volver a publicar.',

            // ── Validación ───────────────────────────────────────────────────
            val_title_required:  'El título es obligatorio.',
            val_body_required:   'El mensaje es obligatorio.',

            // ── Diálogo de confirmación ──────────────────────────────────────
            confirm_title:       'Confirmación',
            confirm_delete_s:    '¿Eliminar {0} mensaje?\n\nEsta acción es irreversible.',
            confirm_delete_p:    '¿Eliminar {0} mensajes?\n\nEsta acción es irreversible.',
            confirm_ok:          'Eliminar',
            confirm_cancel:      'Cancelar',

            // ── Vista previa ─────────────────────────────────────────────────
            preview_hint:        'Haz clic aquí o en \u201cRaw\u201d para empezar a escribir\u2026',
            preview_toggle_raw:  'Raw',

            // ── Popup de usuario ─────────────────────────────────────────────
            popup_n_messages:    '{0} nuevos mensajes',
            popup_close_aria:    'Cerrar',
            popup_close_btn:     'Cerrar',
            popup_history_label: 'Mensajes anteriores ({0})',
            popup_hist_loading:  'Cargando\u2026',
            popup_hist_err:      '(Error al cargar)',
            popup_empty_body:    '(mensaje vacío)',

            // ── Barra de herramientas ────────────────────────────────────────
            fmt_bold:            'Negrita',
            fmt_italic:          'Cursiva',
            fmt_underline:       'Subrayado',
            fmt_strike:          'Tachado',
            fmt_list:            'Lista de viñetas',
            fmt_raw_tip:         'Cambiar al modo de entrada de texto sin formato',

            // ── Pesta\u00f1as ────────────────────────────────────────────────────
            tab_messages:        'Mensajes',
            tab_settings:        'Configuraci\u00f3n',
            tab_replies:         'Respuestas',

            // ── Configuraci\u00f3n ──────────────────────────────────────────────
            set_title:              'Configuraci\u00f3n',
            set_popup_enabled:      'Activar popup',
            set_popup_delay:        'Retraso de cierre autom\u00e1tico (ms, 0\u00a0=\u00a0infinito)',
            set_max_messages:       'M\u00e1ximo de mensajes simult\u00e1neos',
            set_history_enabled:    'Mostrar historial en popup',
            set_allow_replies:      'Permitir respuestas',
            set_reply_max_len:      'Longitud m\u00e1xima de respuesta (caracteres)',
            set_rate_limit:         'Retraso m\u00ednimo entre publicaciones (ms)',
            set_save:               'Guardar configuraci\u00f3n',
            toast_settings_saved:   '\u2713 Configuraci\u00f3n guardada.',
            toast_err_settings:     'Error al guardar: {0}',

            // ── Respuestas de usuario (popup) ─────────────────────────────────
            reply_placeholder:   'Su respuesta\u2026',
            reply_send:          'Enviar',
            reply_sent:          '\u2713 Respuesta enviada',
            reply_err:           'Error: {0}',

            // ── Respuestas admin ──────────────────────────────────────────────
            replies_empty:           'Sin respuestas todav\u00eda.',
            replies_delete_all:      'Eliminar todo',
            replies_delete_one:      'Eliminar',
            replies_loading:         'Cargando respuestas\u2026',
            replies_disabled_hint:   'Activa las respuestas en Configuraci\u00f3n.',
            tbl_col_reply_user:      'Usuario',
            tbl_col_reply_date:      'Fecha',
            tbl_col_reply_body:      'Respuesta',
            toast_reply_deleted:     '\u2713 Respuesta eliminada.',
            toast_err_reply_delete:  'Error al eliminar: {0}',

            // ── Pesta\u00f1a Permisos ─────────────────────────────────────────────
            tab_permissions:        'Permisos',
            perm_section_title:     'Gesti\u00f3n de permisos',
            perm_col_user:          'Usuario',
            perm_col_send:          'Enviar',
            perm_col_reply:         'Responder',
            perm_col_edit_own:      'Editar propios',
            perm_col_delete_own:    'Eliminar propios',
            perm_col_edit_others:   'Editar otros',
            perm_col_delete_others: 'Eliminar otros',
            perm_col_max_msgs:      'M\u00e1x msgs/d\u00eda',
            perm_col_max_replies:   'M\u00e1x resp./d\u00eda',
            perm_col_actions:       'Acciones',
            perm_save_row:          'Guardar',
            perm_saved_row:         'Guardado \u2713',
            perm_save_err:          'Error',
            perm_loading:           'Cargando...',
            perm_no_users:          'Sin usuarios.',
            perm_hint_0:            '0 = ilimitado',

            // ── P\u00e1gina de usuario ────────────────────────────────────────────
            user_page_title:        'Mis mensajes',
            user_tab_inbox:         'Recibidos',
            user_tab_send:          'Enviar',
            user_inbox_empty:       'No hay mensajes recibidos.',
            user_inbox_loading:     'Cargando...',
            user_sent_title:        'Mis mensajes enviados',
            user_sent_empty:        'No hay mensajes enviados.',
            user_compose_title:     'Nuevo mensaje',
            user_publish_btn:       'Enviar mensaje',

            // ── Insignias de mensaje ─────────────────────────────────────────
            msg_deleted_label:      '(eliminado)',
            msg_edited_label:       '(editado {0}\u00d7)',

            // ── Respuesta en popup ───────────────────────────────────────────
            reply_auto_close:       'Respuesta enviada.',
            reply_already_sent:     'Ya has respondido.',
            rate_limit_msg:         'L\u00edmite diario alcanzado.',

            // ── Retenci\u00f3n ──────────────────────────────────────────────────────
            ret_admin_days_lbl:     'Retenci\u00f3n mensajes admin (d\u00edas, 0=ilimitado)',
            ret_user_days_lbl:      'Retenci\u00f3n mensajes usuarios (d\u00edas, 0=ilimitado)',

            // ── Filtro respuestas ────────────────────────────────────────────
            replies_filter_lbl:     'Filtrar:',

            // ── Validaci\u00f3n usuario ────────────────────────────────────────────
            err_title_required:     'El t\u00edtulo es obligatorio.',
            err_body_required:      'El mensaje es obligatorio.',

            // ── Validaci\u00f3n de longitud (3.6.0.0) ─────────────────────────────
            val_title_too_long:     'El t\u00edtulo supera el l\u00edmite de {0} caracteres.',
            val_body_too_long:      'El mensaje supera el l\u00edmite de {0} caracteres.',
            val_reply_empty:        'La respuesta no puede estar vac\u00eda.',
            val_reply_too_long:     'La respuesta supera el l\u00edmite de {0} caracteres.',
            val_settings_invalid:   'Par\u00e1metros inv\u00e1lidos \u2014 verifique los valores introducidos.',

            // ── Fechas ───────────────────────────────────────────────────────
            date_suffix:         'UTC'
        },

        de: {
            // ── Konfigurationsseite ──────────────────────────────────────────
            cfg_subtitle:        'Sende Nachrichten an alle Benutzer. Die Nachricht erscheint beim nächsten Login als Popup.',
            cfg_new_message:     'Neue Nachricht',
            cfg_edit_message:    'Nachricht bearbeiten',
            cfg_title_label:     'Titel *',
            cfg_title_ph:        'Nachrichtentitel eingeben...',
            cfg_body_label:      'Nachricht *',
            cfg_body_ph:         'Inhalt eingeben\u2026 (**fett**, _kursiv_, ~~durchgestrichen~~, __unterstrichen__, - Liste)',
            cfg_recipients:      'Empfänger',
            cfg_publish:         'Nachricht veröffentlichen',
            cfg_update:          '\u2713 Aktualisieren',
            cfg_cancel_edit:     'Bearbeitung abbrechen',
            cfg_history:         'Nachrichtenverlauf',
            cfg_select_all:      'Alle auswählen',
            cfg_delete_sel:      'Auswahl löschen',
            cfg_no_messages:     'Noch keine Nachrichten veröffentlicht.',
            cfg_loading_users:   'Benutzer werden geladen...',

            // ── Nachrichtentabelle ───────────────────────────────────────────
            tbl_col_title:       'Titel',
            tbl_col_title_hint:  '(klicken zum Erweitern)',
            tbl_col_recipients:  'Empfänger',
            tbl_col_date:        'Veröffentlicht am',
            tbl_edit_btn:        '\u270e Bearbeiten',
            tbl_edit_title:      'Diese Nachricht bearbeiten',
            tbl_loading:         'Wird geladen\u2026',
            tbl_load_err:        '(Fehler beim Laden)',
            tbl_badge_all:       'Alle',
            tbl_user_singular:   'Benutzer',
            tbl_user_plural:     'Benutzer',

            // ── Empfänger ────────────────────────────────────────────────────
            target_all:          'Alle Benutzer',
            target_no_users:     '(keine Benutzer gefunden \u2014 Admin-Rechte prüfen)',
            target_unknown:      '...',
            target_select_all:   'Alle auswählen',
            target_deselect_all: 'Alle abwählen',

            // ── Auswahl ──────────────────────────────────────────────────────
            sel_count_singular:  '{0} Nachricht ausgewählt',
            sel_count_plural:    '{0} Nachrichten ausgewählt',

            // ── Toasts ───────────────────────────────────────────────────────
            toast_published:     '\u2713 Nachricht erfolgreich veröffentlicht!',
            toast_updated:       '\u2713 Nachricht aktualisiert!',
            toast_deleted_s:     '\u2713 {0} Nachricht gelöscht.',
            toast_deleted_p:     '\u2713 {0} Nachrichten gelöscht.',
            toast_err_load:      'Ladefehler: {0}',
            toast_err_update:    'Aktualisierungsfehler: {0}',
            toast_err_publish:   'Veröffentlichungsfehler: {0}',
            toast_err_delete:    'Löschfehler: {0}',
            toast_rate_limit:    'Bitte warte einige Sekunden, bevor du erneut veröffentlichst.',

            // ── Validierung ──────────────────────────────────────────────────
            val_title_required:  'Titel ist erforderlich.',
            val_body_required:   'Nachrichtentext ist erforderlich.',

            // ── Bestätigungsdialog ───────────────────────────────────────────
            confirm_title:       'Bestätigung',
            confirm_delete_s:    '{0} Nachricht löschen?\n\nDiese Aktion ist unwiderruflich.',
            confirm_delete_p:    '{0} Nachrichten löschen?\n\nDiese Aktion ist unwiderruflich.',
            confirm_ok:          'Löschen',
            confirm_cancel:      'Abbrechen',

            // ── Vorschau ─────────────────────────────────────────────────────
            preview_hint:        'Hier oder auf \u201eRaw\u201c klicken, um zu schreiben\u2026',
            preview_toggle_raw:  'Raw',

            // ── Benutzer-Popup ───────────────────────────────────────────────
            popup_n_messages:    '{0} neue Nachrichten',
            popup_close_aria:    'Schließen',
            popup_close_btn:     'Schließen',
            popup_history_label: 'Frühere Nachrichten ({0})',
            popup_hist_loading:  'Wird geladen\u2026',
            popup_hist_err:      '(Fehler beim Laden)',
            popup_empty_body:    '(leere Nachricht)',

            // ── Formatierungsleiste ──────────────────────────────────────────
            fmt_bold:            'Fett',
            fmt_italic:          'Kursiv',
            fmt_underline:       'Unterstrichen',
            fmt_strike:          'Durchgestrichen',
            fmt_list:            'Aufzählungsliste',
            fmt_raw_tip:         'In den Rohtext-Eingabemodus wechseln',

            // ── Tabs ─────────────────────────────────────────────────────────
            tab_messages:        'Nachrichten',
            tab_settings:        'Einstellungen',
            tab_replies:         'Antworten',

            // ── Einstellungen ─────────────────────────────────────────────────
            set_title:              'Einstellungen',
            set_popup_enabled:      'Popup aktivieren',
            set_popup_delay:        'Automatisches Schlie\u00dfen (ms, 0\u00a0=\u00a0unendlich)',
            set_max_messages:       'Maximale gleichzeitige Nachrichten',
            set_history_enabled:    'Verlauf im Popup anzeigen',
            set_allow_replies:      'Antworten erlauben',
            set_reply_max_len:      'Maximale Antwortlänge (Zeichen)',
            set_rate_limit:         'Mindestabstand zwischen Posts (ms)',
            set_save:               'Einstellungen speichern',
            toast_settings_saved:   '\u2713 Einstellungen gespeichert.',
            toast_err_settings:     'Fehler beim Speichern: {0}',

            // ── Benutzerantworten (Popup) ─────────────────────────────────────
            reply_placeholder:   'Ihre Antwort\u2026',
            reply_send:          'Senden',
            reply_sent:          '\u2713 Antwort gesendet',
            reply_err:           'Fehler: {0}',

            // ── Admin-Antworten ───────────────────────────────────────────────
            replies_empty:           'Noch keine Antworten.',
            replies_delete_all:      'Alle löschen',
            replies_delete_one:      'Löschen',
            replies_loading:         'Antworten werden geladen\u2026',
            replies_disabled_hint:   'Antworten in Einstellungen aktivieren.',
            tbl_col_reply_user:      'Benutzer',
            tbl_col_reply_date:      'Datum',
            tbl_col_reply_body:      'Antwort',
            toast_reply_deleted:     '\u2713 Antwort gelöscht.',
            toast_err_reply_delete:  'Löschfehler: {0}',

            // ── Tab Berechtigungen ───────────────────────────────────────────
            tab_permissions:        'Berechtigungen',
            perm_section_title:     'Benutzerverwaltung',
            perm_col_user:          'Benutzer',
            perm_col_send:          'Senden',
            perm_col_reply:         'Antworten',
            perm_col_edit_own:      'Eigene bearbeiten',
            perm_col_delete_own:    'Eigene l\u00f6schen',
            perm_col_edit_others:   'Andere bearbeiten',
            perm_col_delete_others: 'Andere l\u00f6schen',
            perm_col_max_msgs:      'Max Nachr./Tag',
            perm_col_max_replies:   'Max Antw./Tag',
            perm_col_actions:       'Aktionen',
            perm_save_row:          'Speichern',
            perm_saved_row:         'Gespeichert \u2713',
            perm_save_err:          'Fehler',
            perm_loading:           'Wird geladen...',
            perm_no_users:          'Keine Benutzer.',
            perm_hint_0:            '0 = unbegrenzt',

            // ── Benutzerseite ────────────────────────────────────────────────
            user_page_title:        'Meine Nachrichten',
            user_tab_inbox:         'Posteingang',
            user_tab_send:          'Senden',
            user_inbox_empty:       'Keine Nachrichten empfangen.',
            user_inbox_loading:     'Wird geladen...',
            user_sent_title:        'Meine gesendeten Nachrichten',
            user_sent_empty:        'Keine Nachrichten gesendet.',
            user_compose_title:     'Neue Nachricht',
            user_publish_btn:       'Nachricht senden',

            // ── Nachrichten-Badges ───────────────────────────────────────────
            msg_deleted_label:      '(gel\u00f6scht)',
            msg_edited_label:       '({0}\u00d7 bearbeitet)',

            // ── Popup-Antwort ────────────────────────────────────────────────
            reply_auto_close:       'Antwort gesendet.',
            reply_already_sent:     'Du hast bereits geantwortet.',
            rate_limit_msg:         'Tageslimit erreicht.',

            // ── Aufbewahrung ─────────────────────────────────────────────────
            ret_admin_days_lbl:     'Admin-Nachrichtenaufbewahrung (Tage, 0=unbegrenzt)',
            ret_user_days_lbl:      'Benutzer-Nachrichtenaufbewahrung (Tage, 0=unbegrenzt)',

            // ── Antworten-Filter ─────────────────────────────────────────────
            replies_filter_lbl:     'Filtern:',

            // ── Benutzervalidierung ──────────────────────────────────────────
            err_title_required:     'Titel ist erforderlich.',
            err_body_required:      'Nachrichtentext ist erforderlich.',

            // ── L\u00e4ngenvalidierung (3.6.0.0) ──────────────────────────────────
            val_title_too_long:     'Der Titel \u00fcberschreitet das Limit von {0} Zeichen.',
            val_body_too_long:      'Die Nachricht \u00fcberschreitet das Limit von {0} Zeichen.',
            val_reply_empty:        'Die Antwort darf nicht leer sein.',
            val_reply_too_long:     'Die Antwort \u00fcberschreitet das Limit von {0} Zeichen.',
            val_settings_invalid:   'Ung\u00fcltige Einstellungen \u2014 bitte \u00fcberpr\u00fcfen Sie die eingegebenen Werte.',

            // ── Datum ────────────────────────────────────────────────────────
            date_suffix:         'UTC'
        },

        pt: {
            // ── Página de configuração ───────────────────────────────────────
            cfg_subtitle:        'Envie mensagens para todos os usuários. A mensagem aparece como popup no próximo login.',
            cfg_new_message:     'Nova mensagem',
            cfg_edit_message:    'Editar mensagem',
            cfg_title_label:     'Título *',
            cfg_title_ph:        'Inserir título da mensagem...',
            cfg_body_label:      'Mensagem *',
            cfg_body_ph:         'Inserir conteúdo\u2026 (**negrito**, _itálico_, ~~tachado~~, __sublinhado__, - lista)',
            cfg_recipients:      'Destinatários',
            cfg_publish:         'Publicar mensagem',
            cfg_update:          '\u2713 Atualizar',
            cfg_cancel_edit:     'Cancelar edição',
            cfg_history:         'Histórico de mensagens',
            cfg_select_all:      'Selecionar tudo',
            cfg_delete_sel:      'Excluir seleção',
            cfg_no_messages:     'Nenhuma mensagem publicada ainda.',
            cfg_loading_users:   'Carregando usuários...',

            // ── Tabela de mensagens ──────────────────────────────────────────
            tbl_col_title:       'Título',
            tbl_col_title_hint:  '(clique para expandir)',
            tbl_col_recipients:  'Destinatários',
            tbl_col_date:        'Publicado em',
            tbl_edit_btn:        '\u270e Editar',
            tbl_edit_title:      'Editar esta mensagem',
            tbl_loading:         'Carregando\u2026',
            tbl_load_err:        '(Erro ao carregar)',
            tbl_badge_all:       'Todos',
            tbl_user_singular:   'usuário',
            tbl_user_plural:     'usuários',

            // ── Destinatários ────────────────────────────────────────────────
            target_all:          'Todos os usuários',
            target_no_users:     '(nenhum usuário encontrado \u2014 verifique permissões de admin)',
            target_unknown:      '...',
            target_select_all:   'Selecionar tudo',
            target_deselect_all: 'Desmarcar tudo',

            // ── Seleção ──────────────────────────────────────────────────────
            sel_count_singular:  '{0} mensagem selecionada',
            sel_count_plural:    '{0} mensagens selecionadas',

            // ── Toasts ───────────────────────────────────────────────────────
            toast_published:     '\u2713 Mensagem publicada com sucesso!',
            toast_updated:       '\u2713 Mensagem atualizada!',
            toast_deleted_s:     '\u2713 {0} mensagem excluída.',
            toast_deleted_p:     '\u2713 {0} mensagens excluídas.',
            toast_err_load:      'Erro de carregamento: {0}',
            toast_err_update:    'Erro ao atualizar: {0}',
            toast_err_publish:   'Erro ao publicar: {0}',
            toast_err_delete:    'Erro ao excluir: {0}',
            toast_rate_limit:    'Por favor, aguarde alguns segundos antes de publicar novamente.',

            // ── Validação ────────────────────────────────────────────────────
            val_title_required:  'O título é obrigatório.',
            val_body_required:   'O corpo da mensagem é obrigatório.',

            // ── Caixa de confirmação ─────────────────────────────────────────
            confirm_title:       'Confirmação',
            confirm_delete_s:    'Excluir {0} mensagem?\n\nEsta ação é irreversível.',
            confirm_delete_p:    'Excluir {0} mensagens?\n\nEsta ação é irreversível.',
            confirm_ok:          'Excluir',
            confirm_cancel:      'Cancelar',

            // ── Pré-visualização ─────────────────────────────────────────────
            preview_hint:        'Clique aqui ou em \u201cRaw\u201d para começar a escrever\u2026',
            preview_toggle_raw:  'Raw',

            // ── Popup de usuário ─────────────────────────────────────────────
            popup_n_messages:    '{0} novas mensagens',
            popup_close_aria:    'Fechar',
            popup_close_btn:     'Fechar',
            popup_history_label: 'Mensagens anteriores ({0})',
            popup_hist_loading:  'Carregando\u2026',
            popup_hist_err:      '(Erro ao carregar)',
            popup_empty_body:    '(mensagem vazia)',

            // ── Barra de formatação ──────────────────────────────────────────
            fmt_bold:            'Negrito',
            fmt_italic:          'Itálico',
            fmt_underline:       'Sublinhado',
            fmt_strike:          'Tachado',
            fmt_list:            'Lista de pontos',
            fmt_raw_tip:         'Alternar para o modo de entrada de texto bruto',

            // ── Abas ─────────────────────────────────────────────────────────
            tab_messages:        'Mensagens',
            tab_settings:        'Configura\u00e7\u00f5es',
            tab_replies:         'Respostas',

            // ── Configura\u00e7\u00f5es ─────────────────────────────────────────────
            set_title:              'Configura\u00e7\u00f5es',
            set_popup_enabled:      'Ativar popup',
            set_popup_delay:        'Fechamento autom\u00e1tico (ms, 0\u00a0=\u00a0infinito)',
            set_max_messages:       'M\u00e1ximo de mensagens simult\u00e2neas',
            set_history_enabled:    'Mostrar hist\u00f3rico no popup',
            set_allow_replies:      'Permitir respostas',
            set_reply_max_len:      'Comprimento m\u00e1x. de resposta (caracteres)',
            set_rate_limit:         'Atraso m\u00ednimo entre publica\u00e7\u00f5es (ms)',
            set_save:               'Guardar configura\u00e7\u00f5es',
            toast_settings_saved:   '\u2713 Configura\u00e7\u00f5es salvas.',
            toast_err_settings:     'Erro ao salvar: {0}',

            // ── Respostas de usu\u00e1rio (popup) ───────────────────────────────
            reply_placeholder:   'Sua resposta\u2026',
            reply_send:          'Enviar',
            reply_sent:          '\u2713 Resposta enviada',
            reply_err:           'Erro: {0}',

            // ── Respostas admin ───────────────────────────────────────────────
            replies_empty:           'Sem respostas ainda.',
            replies_delete_all:      'Apagar tudo',
            replies_delete_one:      'Apagar',
            replies_loading:         'Carregando respostas\u2026',
            replies_disabled_hint:   'Ative as respostas nas Configura\u00e7\u00f5es.',
            tbl_col_reply_user:      'Usu\u00e1rio',
            tbl_col_reply_date:      'Data',
            tbl_col_reply_body:      'Resposta',
            toast_reply_deleted:     '\u2713 Resposta apagada.',
            toast_err_reply_delete:  'Erro ao apagar: {0}',

            // ── Aba Permiss\u00f5es ─────────────────────────────────────────────
            tab_permissions:        'Permiss\u00f5es',
            perm_section_title:     'Gest\u00e3o de permiss\u00f5es',
            perm_col_user:          'Usu\u00e1rio',
            perm_col_send:          'Enviar',
            perm_col_reply:         'Responder',
            perm_col_edit_own:      'Editar pr\u00f3prios',
            perm_col_delete_own:    'Excluir pr\u00f3prios',
            perm_col_edit_others:   'Editar outros',
            perm_col_delete_others: 'Excluir outros',
            perm_col_max_msgs:      'M\u00e1x msgs/dia',
            perm_col_max_replies:   'M\u00e1x resp./dia',
            perm_col_actions:       'A\u00e7\u00f5es',
            perm_save_row:          'Salvar',
            perm_saved_row:         'Salvo \u2713',
            perm_save_err:          'Erro',
            perm_loading:           'Carregando...',
            perm_no_users:          'Nenhum usu\u00e1rio.',
            perm_hint_0:            '0 = ilimitado',

            // ── P\u00e1gina do usu\u00e1rio ─────────────────────────────────────────────
            user_page_title:        'Minhas mensagens',
            user_tab_inbox:         'Recebidos',
            user_tab_send:          'Enviar',
            user_inbox_empty:       'Nenhuma mensagem recebida.',
            user_inbox_loading:     'Carregando...',
            user_sent_title:        'Minhas mensagens enviadas',
            user_sent_empty:        'Nenhuma mensagem enviada.',
            user_compose_title:     'Nova mensagem',
            user_publish_btn:       'Enviar mensagem',

            // ── Badges de mensagem ───────────────────────────────────────────
            msg_deleted_label:      '(exclu\u00eddo)',
            msg_edited_label:       '(editado {0}\u00d7)',

            // ── Resposta no popup ────────────────────────────────────────────
            reply_auto_close:       'Resposta enviada.',
            reply_already_sent:     'Voc\u00ea j\u00e1 respondeu.',
            rate_limit_msg:         'Limite di\u00e1rio atingido.',

            // ── Reten\u00e7\u00e3o ──────────────────────────────────────────────────────
            ret_admin_days_lbl:     'Reten\u00e7\u00e3o de mensagens admin (dias, 0=infinito)',
            ret_user_days_lbl:      'Reten\u00e7\u00e3o de mensagens de usu\u00e1rios (dias, 0=infinito)',

            // ── Filtro de respostas ──────────────────────────────────────────
            replies_filter_lbl:     'Filtrar:',

            // ── Valida\u00e7\u00e3o do usu\u00e1rio ─────────────────────────────────────────
            err_title_required:     'O t\u00edtulo \u00e9 obrigat\u00f3rio.',
            err_body_required:      'O corpo da mensagem \u00e9 obrigat\u00f3rio.',

            // ── Valida\u00e7\u00e3o de comprimento (3.6.0.0) ───────────────────────────
            val_title_too_long:     'O t\u00edtulo ultrapassa o limite de {0} caracteres.',
            val_body_too_long:      'A mensagem ultrapassa o limite de {0} caracteres.',
            val_reply_empty:        'A resposta n\u00e3o pode estar vazia.',
            val_reply_too_long:     'A resposta ultrapassa o limite de {0} caracteres.',
            val_settings_invalid:   'Configura\u00e7\u00f5es inv\u00e1lidas \u2014 verifique os valores inseridos.',

            // ── Datas ────────────────────────────────────────────────────────
            date_suffix:         'UTC'
        },

        it: {
            // ── Pagina di configurazione ─────────────────────────────────────
            cfg_subtitle:        'Invia messaggi a tutti gli utenti. Il messaggio appare come popup al prossimo accesso.',
            cfg_new_message:     'Nuovo messaggio',
            cfg_edit_message:    'Modifica messaggio',
            cfg_title_label:     'Titolo *',
            cfg_title_ph:        'Inserisci il titolo del messaggio...',
            cfg_body_label:      'Messaggio *',
            cfg_body_ph:         'Inserisci il contenuto\u2026 (**grassetto**, _corsivo_, ~~barrato~~, __sottolineato__, - lista)',
            cfg_recipients:      'Destinatari',
            cfg_publish:         'Pubblica messaggio',
            cfg_update:          '\u2713 Aggiorna',
            cfg_cancel_edit:     'Annulla modifica',
            cfg_history:         'Cronologia messaggi',
            cfg_select_all:      'Seleziona tutto',
            cfg_delete_sel:      'Elimina selezione',
            cfg_no_messages:     'Nessun messaggio pubblicato.',
            cfg_loading_users:   'Caricamento utenti...',

            // ── Tabella messaggi ─────────────────────────────────────────────
            tbl_col_title:       'Titolo',
            tbl_col_title_hint:  '(clicca per espandere)',
            tbl_col_recipients:  'Destinatari',
            tbl_col_date:        'Pubblicato il',
            tbl_edit_btn:        '\u270e Modifica',
            tbl_edit_title:      'Modifica questo messaggio',
            tbl_loading:         'Caricamento\u2026',
            tbl_load_err:        '(Errore durante il caricamento)',
            tbl_badge_all:       'Tutti',
            tbl_user_singular:   'utente',
            tbl_user_plural:     'utenti',

            // ── Destinatari ──────────────────────────────────────────────────
            target_all:          'Tutti gli utenti',
            target_no_users:     '(nessun utente trovato \u2014 verifica i permessi admin)',
            target_unknown:      '...',
            target_select_all:   'Seleziona tutto',
            target_deselect_all: 'Deseleziona tutto',

            // ── Selezione ────────────────────────────────────────────────────
            sel_count_singular:  '{0} messaggio selezionato',
            sel_count_plural:    '{0} messaggi selezionati',

            // ── Toasts ───────────────────────────────────────────────────────
            toast_published:     '\u2713 Messaggio pubblicato con successo!',
            toast_updated:       '\u2713 Messaggio aggiornato!',
            toast_deleted_s:     '\u2713 {0} messaggio eliminato.',
            toast_deleted_p:     '\u2713 {0} messaggi eliminati.',
            toast_err_load:      'Errore di caricamento: {0}',
            toast_err_update:    'Errore di aggiornamento: {0}',
            toast_err_publish:   'Errore di pubblicazione: {0}',
            toast_err_delete:    'Errore di eliminazione: {0}',
            toast_rate_limit:    'Si prega di attendere qualche secondo prima di pubblicare nuovamente.',

            // ── Validazione ──────────────────────────────────────────────────
            val_title_required:  'Il titolo è obbligatorio.',
            val_body_required:   'Il corpo del messaggio è obbligatorio.',

            // ── Finestra di conferma ─────────────────────────────────────────
            confirm_title:       'Conferma',
            confirm_delete_s:    'Eliminare {0} messaggio?\n\nQuesta azione è irreversibile.',
            confirm_delete_p:    'Eliminare {0} messaggi?\n\nQuesta azione è irreversibile.',
            confirm_ok:          'Elimina',
            confirm_cancel:      'Annulla',

            // ── Anteprima ────────────────────────────────────────────────────
            preview_hint:        'Clicca qui o su \u201cRaw\u201d per iniziare a scrivere\u2026',
            preview_toggle_raw:  'Raw',

            // ── Popup utente ─────────────────────────────────────────────────
            popup_n_messages:    '{0} nuovi messaggi',
            popup_close_aria:    'Chiudi',
            popup_close_btn:     'Chiudi',
            popup_history_label: 'Messaggi precedenti ({0})',
            popup_hist_loading:  'Caricamento\u2026',
            popup_hist_err:      '(Errore durante il caricamento)',
            popup_empty_body:    '(messaggio vuoto)',

            // ── Barra degli strumenti ────────────────────────────────────────
            fmt_bold:            'Grassetto',
            fmt_italic:          'Corsivo',
            fmt_underline:       'Sottolineato',
            fmt_strike:          'Barrato',
            fmt_list:            'Elenco puntato',
            fmt_raw_tip:         'Passa alla modalità di inserimento testo grezzo',

            // ── Schede ───────────────────────────────────────────────────────
            tab_messages:        'Messaggi',
            tab_settings:        'Impostazioni',
            tab_replies:         'Risposte',

            // ── Impostazioni ──────────────────────────────────────────────────
            set_title:              'Impostazioni',
            set_popup_enabled:      'Abilita popup',
            set_popup_delay:        'Chiusura automatica (ms, 0\u00a0=\u00a0infinito)',
            set_max_messages:       'Massimo messaggi simultanei',
            set_history_enabled:    'Mostra cronologia nel popup',
            set_allow_replies:      'Consenti risposte',
            set_reply_max_len:      'Lunghezza max risposta (caratteri)',
            set_rate_limit:         'Ritardo minimo tra post (ms)',
            set_save:               'Salva impostazioni',
            toast_settings_saved:   '\u2713 Impostazioni salvate.',
            toast_err_settings:     'Errore salvataggio: {0}',

            // ── Risposte utente (popup) ───────────────────────────────────────
            reply_placeholder:   'La tua risposta\u2026',
            reply_send:          'Invia',
            reply_sent:          '\u2713 Risposta inviata',
            reply_err:           'Errore: {0}',

            // ── Risposte admin ────────────────────────────────────────────────
            replies_empty:           'Nessuna risposta ancora.',
            replies_delete_all:      'Elimina tutto',
            replies_delete_one:      'Elimina',
            replies_loading:         'Caricamento risposte\u2026',
            replies_disabled_hint:   'Abilita le risposte nelle Impostazioni.',
            tbl_col_reply_user:      'Utente',
            tbl_col_reply_date:      'Data',
            tbl_col_reply_body:      'Risposta',
            toast_reply_deleted:     '\u2713 Risposta eliminata.',
            toast_err_reply_delete:  'Errore eliminazione: {0}',

            // ── Scheda Permessi ──────────────────────────────────────────────
            tab_permissions:        'Permessi',
            perm_section_title:     'Gestione permessi',
            perm_col_user:          'Utente',
            perm_col_send:          'Invia',
            perm_col_reply:         'Rispondi',
            perm_col_edit_own:      'Modifica propri',
            perm_col_delete_own:    'Elimina propri',
            perm_col_edit_others:   'Modifica altri',
            perm_col_delete_others: 'Elimina altri',
            perm_col_max_msgs:      'Max msg/giorno',
            perm_col_max_replies:   'Max risp./giorno',
            perm_col_actions:       'Azioni',
            perm_save_row:          'Salva',
            perm_saved_row:         'Salvato \u2713',
            perm_save_err:          'Errore',
            perm_loading:           'Caricamento...',
            perm_no_users:          'Nessun utente.',
            perm_hint_0:            '0 = illimitato',

            // ── Pagina utente ────────────────────────────────────────────────
            user_page_title:        'I miei messaggi',
            user_tab_inbox:         'Ricevuti',
            user_tab_send:          'Invia',
            user_inbox_empty:       'Nessun messaggio ricevuto.',
            user_inbox_loading:     'Caricamento...',
            user_sent_title:        'I miei messaggi inviati',
            user_sent_empty:        'Nessun messaggio inviato.',
            user_compose_title:     'Nuovo messaggio',
            user_publish_btn:       'Invia messaggio',

            // ── Badge messaggio ──────────────────────────────────────────────
            msg_deleted_label:      '(eliminato)',
            msg_edited_label:       '(modificato {0}\u00d7)',

            // ── Risposta popup ───────────────────────────────────────────────
            reply_auto_close:       'Risposta inviata.',
            reply_already_sent:     'Hai gi\u00e0 risposto.',
            rate_limit_msg:         'Limite giornaliero raggiunto.',

            // ── Conservazione ────────────────────────────────────────────────
            ret_admin_days_lbl:     'Conservazione messaggi admin (giorni, 0=infinito)',
            ret_user_days_lbl:      'Conservazione messaggi utenti (giorni, 0=infinito)',

            // ── Filtro risposte ──────────────────────────────────────────────
            replies_filter_lbl:     'Filtra:',

            // ── Validazione utente ───────────────────────────────────────────
            err_title_required:     'Il titolo \u00e8 obbligatorio.',
            err_body_required:      'Il corpo del messaggio \u00e8 obbligatorio.',

            // ── Validazione lunghezza (3.6.0.0) ─────────────────────────────
            val_title_too_long:     'Il titolo supera il limite di {0} caratteri.',
            val_body_too_long:      'Il messaggio supera il limite di {0} caratteri.',
            val_reply_empty:        'La risposta non pu\u00f2 essere vuota.',
            val_reply_too_long:     'La risposta supera il limite di {0} caratteri.',
            val_settings_invalid:   'Impostazioni non valide \u2014 controllare i valori inseriti.',

            // ── Date ─────────────────────────────────────────────────────────
            date_suffix:         'UTC'
        },

        ja: {
            // ── 設定ページ ───────────────────────────────────────────────────
            cfg_subtitle:        '全ユーザーにメッセージを配信します。次回ログイン時にポップアップとして表示されます。',
            cfg_new_message:     '新しいメッセージ',
            cfg_edit_message:    'メッセージを編集',
            cfg_title_label:     'タイトル *',
            cfg_title_ph:        'メッセージのタイトルを入力...',
            cfg_body_label:      'メッセージ *',
            cfg_body_ph:         '内容を入力\u2026 (**太字**, _斜体_, ~~取り消し~~, __下線__, - リスト)',
            cfg_recipients:      '受信者',
            cfg_publish:         'メッセージを公開',
            cfg_update:          '\u2713 更新',
            cfg_cancel_edit:     '編集をキャンセル',
            cfg_history:         'メッセージ履歴',
            cfg_select_all:      'すべて選択',
            cfg_delete_sel:      '選択を削除',
            cfg_no_messages:     'まだメッセージはありません。',
            cfg_loading_users:   'ユーザーを読み込み中...',

            // ── メッセージテーブル ────────────────────────────────────────────
            tbl_col_title:       'タイトル',
            tbl_col_title_hint:  '(クリックして展開)',
            tbl_col_recipients:  '受信者',
            tbl_col_date:        '公開日',
            tbl_edit_btn:        '\u270e 編集',
            tbl_edit_title:      'このメッセージを編集',
            tbl_loading:         '読み込み中\u2026',
            tbl_load_err:        '(読み込みエラー)',
            tbl_badge_all:       'すべて',
            tbl_user_singular:   'ユーザー',
            tbl_user_plural:     'ユーザー',

            // ── 受信者 ────────────────────────────────────────────────────────
            target_all:          'すべてのユーザー',
            target_no_users:     '(ユーザーが見つかりません \u2014 管理者権限を確認)',
            target_unknown:      '...',
            target_select_all:   'すべて選択',
            target_deselect_all: 'すべて解除',

            // ── 選択 ──────────────────────────────────────────────────────────
            sel_count_singular:  '{0} 件選択中',
            sel_count_plural:    '{0} 件選択中',

            // ── トースト ──────────────────────────────────────────────────────
            toast_published:     '\u2713 メッセージを公開しました！',
            toast_updated:       '\u2713 メッセージを更新しました！',
            toast_deleted_s:     '\u2713 {0} 件のメッセージを削除しました。',
            toast_deleted_p:     '\u2713 {0} 件のメッセージを削除しました。',
            toast_err_load:      '読み込みエラー: {0}',
            toast_err_update:    '更新エラー: {0}',
            toast_err_publish:   '公開エラー: {0}',
            toast_err_delete:    '削除エラー: {0}',
            toast_rate_limit:    '再公開する前に数秒お待ちください。',

            // ── バリデーション ────────────────────────────────────────────────
            val_title_required:  'タイトルは必須です。',
            val_body_required:   'メッセージ本文は必須です。',

            // ── 確認ダイアログ ────────────────────────────────────────────────
            confirm_title:       '確認',
            confirm_delete_s:    '{0} 件のメッセージを削除しますか？\n\nこの操作は取り消せません。',
            confirm_delete_p:    '{0} 件のメッセージを削除しますか？\n\nこの操作は取り消せません。',
            confirm_ok:          '削除',
            confirm_cancel:      'キャンセル',

            // ── プレビュー ────────────────────────────────────────────────────
            preview_hint:        'ここまたは \u201cRaw\u201d をクリックして入力を開始\u2026',
            preview_toggle_raw:  'Raw',

            // ── ユーザーポップアップ ──────────────────────────────────────────
            popup_n_messages:    '{0} 件の新しいメッセージ',
            popup_close_aria:    '閉じる',
            popup_close_btn:     '閉じる',
            popup_history_label: '過去のメッセージ ({0})',
            popup_hist_loading:  '読み込み中\u2026',
            popup_hist_err:      '(読み込みエラー)',
            popup_empty_body:    '(空のメッセージ)',

            // ── ツールバー ────────────────────────────────────────────────────
            fmt_bold:            '太字',
            fmt_italic:          '斜体',
            fmt_underline:       '下線',
            fmt_strike:          '取り消し線',
            fmt_list:            '箇条書き',
            fmt_raw_tip:         'テキスト入力モードに切り替え',

            // ── タブ ─────────────────────────────────────────────────────────
            tab_messages:        '\u30e1\u30c3\u30bb\u30fc\u30b8',
            tab_settings:        '\u8a2d\u5b9a',
            tab_replies:         '\u8fd4\u4fe1',

            // ── 設定 ──────────────────────────────────────────────────────────
            set_title:              '\u8a2d\u5b9a',
            set_popup_enabled:      '\u30dd\u30c3\u30d7\u30a2\u30c3\u30d7\u3092\u6709\u52b9\u306b\u3059\u308b',
            set_popup_delay:        '\u81ea\u52d5\u9589\u3058\u308b\u307e\u3067\u306e\u6642\u9593\uff08ms\u30010=\u7121\u9650\uff09',
            set_max_messages:       '\u540c\u6642\u6700\u5927\u30e1\u30c3\u30bb\u30fc\u30b8\u6570',
            set_history_enabled:    '\u30dd\u30c3\u30d7\u30a2\u30c3\u30d7\u3067\u5c65\u6b74\u3092\u8868\u793a',
            set_allow_replies:      '\u8fd4\u4fe1\u3092\u8a31\u53ef',
            set_reply_max_len:      '\u8fd4\u4fe1\u306e\u6700\u5927\u6587\u5b57\u6570',
            set_rate_limit:         '\u6295\u7a3f\u9593\u306e\u6700\u5c0f\u9045\u5ef6\uff08ms\uff09',
            set_save:               '\u8a2d\u5b9a\u3092\u4fdd\u5b58',
            toast_settings_saved:   '\u2713 \u8a2d\u5b9a\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002',
            toast_err_settings:     '\u4fdd\u5b58\u30a8\u30e9\u30fc: {0}',

            // ── ユーザー返信（ポップアップ）──────────────────────────────────────
            reply_placeholder:   '\u8fd4\u4fe1\u3092\u5165\u529b\u2026',
            reply_send:          '\u9001\u4fe1',
            reply_sent:          '\u2713 \u8fd4\u4fe1\u9001\u4fe1\u6e08\u307f',
            reply_err:           '\u30a8\u30e9\u30fc: {0}',

            // ── 管理者返信 ────────────────────────────────────────────────────
            replies_empty:           '\u307e\u3060\u8fd4\u4fe1\u306f\u3042\u308a\u307e\u305b\u3093\u3002',
            replies_delete_all:      '\u3059\u3079\u3066\u524a\u9664',
            replies_delete_one:      '\u524a\u9664',
            replies_loading:         '\u8fd4\u4fe1\u3092\u8aad\u307f\u8fbc\u3093\u3067\u3044\u307e\u3059\u2026',
            replies_disabled_hint:   '\u8a2d\u5b9a\u3067\u8fd4\u4fe1\u3092\u6709\u52b9\u306b\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
            tbl_col_reply_user:      '\u30e6\u30fc\u30b6\u30fc',
            tbl_col_reply_date:      '\u65e5\u4ed8',
            tbl_col_reply_body:      '\u8fd4\u4fe1',
            toast_reply_deleted:     '\u2713 \u8fd4\u4fe1\u3092\u524a\u9664\u3057\u307e\u3057\u305f\u3002',
            toast_err_reply_delete:  '\u524a\u9664\u30a8\u30e9\u30fc: {0}',

            // ── 権限タブ ──────────────────────────────────────────────────────
            tab_permissions:        '\u6a29\u9650',
            perm_section_title:     '\u30e6\u30fc\u30b6\u30fc\u6a29\u9650\u7ba1\u7406',
            perm_col_user:          '\u30e6\u30fc\u30b6\u30fc',
            perm_col_send:          '\u9001\u4fe1',
            perm_col_reply:         '\u8fd4\u4fe1',
            perm_col_edit_own:      '\u81ea\u5206\u306e\u7de8\u96c6',
            perm_col_delete_own:    '\u81ea\u5206\u306e\u524a\u9664',
            perm_col_edit_others:   '\u4ed6\u8005\u306e\u7de8\u96c6',
            perm_col_delete_others: '\u4ed6\u8005\u306e\u524a\u9664',
            perm_col_max_msgs:      '\u6700\u5927\u4ef6\u6570/\u65e5',
            perm_col_max_replies:   '\u6700\u5927\u8fd4\u4fe1/\u65e5',
            perm_col_actions:       '\u64cd\u4f5c',
            perm_save_row:          '\u4fdd\u5b58',
            perm_saved_row:         '\u4fdd\u5b58\u6e08\u307f \u2713',
            perm_save_err:          '\u30a8\u30e9\u30fc',
            perm_loading:           '\u8aad\u307f\u8fbc\u307f\u4e2d...',
            perm_no_users:          '\u30e6\u30fc\u30b6\u30fc\u304c\u3044\u307e\u305b\u3093\u3002',
            perm_hint_0:            '0 = \u7121\u5236\u9650',

            // ── ユーザーページ ────────────────────────────────────────────────
            user_page_title:        '\u30de\u30a4\u30e1\u30c3\u30bb\u30fc\u30b8',
            user_tab_inbox:         '\u53d7\u4fe1\u30c8\u30ec\u30a4',
            user_tab_send:          '\u9001\u4fe1',
            user_inbox_empty:       '\u30e1\u30c3\u30bb\u30fc\u30b8\u306f\u3042\u308a\u307e\u305b\u3093\u3002',
            user_inbox_loading:     '\u8aad\u307f\u8fbc\u307f\u4e2d...',
            user_sent_title:        '\u9001\u4fe1\u6e08\u307f\u30e1\u30c3\u30bb\u30fc\u30b8',
            user_sent_empty:        '\u9001\u4fe1\u6e08\u307f\u30e1\u30c3\u30bb\u30fc\u30b8\u306f\u3042\u308a\u307e\u305b\u3093\u3002',
            user_compose_title:     '\u65b0\u898f\u30e1\u30c3\u30bb\u30fc\u30b8',
            user_publish_btn:       '\u30e1\u30c3\u30bb\u30fc\u30b8\u3092\u9001\u308b',

            // ── メッセージバッジ ──────────────────────────────────────────────
            msg_deleted_label:      '(\u524a\u9664\u6e08\u307f)',
            msg_edited_label:       '({0}\u56de\u7de8\u96c6)',

            // ── ポップアップ返信 ──────────────────────────────────────────────
            reply_auto_close:       '\u8fd4\u4fe1\u3057\u307e\u3057\u305f\u3002',
            reply_already_sent:     '\u3059\u3067\u306b\u8fd4\u4fe1\u3057\u307e\u3057\u305f\u3002',
            rate_limit_msg:         '\u65e5\u6b21\u5236\u9650\u306b\u9054\u3057\u307e\u3057\u305f\u3002',

            // ── 保持期間 ──────────────────────────────────────────────────────
            ret_admin_days_lbl:     '\u7ba1\u7406\u8005\u30e1\u30c3\u30bb\u30fc\u30b8\u4fdd\u6301\u671f\u9593\uff08\u65e5\u30010=\u7121\u5236\u9650\uff09',
            ret_user_days_lbl:      '\u30e6\u30fc\u30b6\u30fc\u30e1\u30c3\u30bb\u30fc\u30b8\u4fdd\u6301\u671f\u9593\uff08\u65e5\u30010=\u7121\u5236\u9650\uff09',

            // ── 返信フィルター ────────────────────────────────────────────────
            replies_filter_lbl:     '\u30d5\u30a3\u30eb\u30bf\u30fc:',

            // ── ユーザー検証 ──────────────────────────────────────────────────
            err_title_required:     '\u30bf\u30a4\u30c8\u30eb\u306f\u5fc5\u9808\u3067\u3059\u3002',
            err_body_required:      '\u30e1\u30c3\u30bb\u30fc\u30b8\u672c\u6587\u306f\u5fc5\u9808\u3067\u3059\u3002',

            // ── 長さバリデーション (3.6.0.0) ───────────────────────────────────
            val_title_too_long:     '\u30bf\u30a4\u30c8\u30eb\u304c{0}\u6587\u5b57\u306e\u5236\u9650\u3092\u8d85\u3048\u3066\u3044\u307e\u3059\u3002',
            val_body_too_long:      '\u30e1\u30c3\u30bb\u30fc\u30b8\u304c{0}\u6587\u5b57\u306e\u5236\u9650\u3092\u8d85\u3048\u3066\u3044\u307e\u3059\u3002',
            val_reply_empty:        '\u8fd4\u4fe1\u306f\u7a7a\u306b\u3067\u304d\u307e\u305b\u3093\u3002',
            val_reply_too_long:     '\u8fd4\u4fe1\u304c{0}\u6587\u5b57\u306e\u5236\u9650\u3092\u8d85\u3048\u3066\u3044\u307e\u3059\u3002',
            val_settings_invalid:   '\u8a2d\u5b9a\u304c\u7121\u52b9\u3067\u3059\u2014\u5165\u529b\u5024\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002',

            // ── 日付 ─────────────────────────────────────────────────────────
            date_suffix:         'UTC'
        },

        zh: {
            // ── 配置页面 ──────────────────────────────────────────────────────
            cfg_subtitle:        '向所有用户广播消息。消息将在用户下次登录时以弹出框形式显示。',
            cfg_new_message:     '新建消息',
            cfg_edit_message:    '编辑消息',
            cfg_title_label:     '标题 *',
            cfg_title_ph:        '输入消息标题...',
            cfg_body_label:      '消息 *',
            cfg_body_ph:         '输入内容\u2026 (**粗体**, _斜体_, ~~删除线~~, __下划线__, - 列表)',
            cfg_recipients:      '收件人',
            cfg_publish:         '发布消息',
            cfg_update:          '\u2713 更新',
            cfg_cancel_edit:     '取消编辑',
            cfg_history:         '消息历史',
            cfg_select_all:      '全选',
            cfg_delete_sel:      '删除所选',
            cfg_no_messages:     '暂无已发布的消息。',
            cfg_loading_users:   '正在加载用户...',

            // ── 消息表格 ──────────────────────────────────────────────────────
            tbl_col_title:       '标题',
            tbl_col_title_hint:  '(点击展开)',
            tbl_col_recipients:  '收件人',
            tbl_col_date:        '发布时间',
            tbl_edit_btn:        '\u270e 编辑',
            tbl_edit_title:      '编辑此消息',
            tbl_loading:         '加载中\u2026',
            tbl_load_err:        '(加载失败)',
            tbl_badge_all:       '所有人',
            tbl_user_singular:   '用户',
            tbl_user_plural:     '用户',

            // ── 收件人 ────────────────────────────────────────────────────────
            target_all:          '所有用户',
            target_no_users:     '(未找到用户 \u2014 请检查管理员权限)',
            target_unknown:      '...',
            target_select_all:   '全选',
            target_deselect_all: '取消全选',

            // ── 选择 ──────────────────────────────────────────────────────────
            sel_count_singular:  '已选 {0} 条消息',
            sel_count_plural:    '已选 {0} 条消息',

            // ── 提示 ──────────────────────────────────────────────────────────
            toast_published:     '\u2713 消息发布成功！',
            toast_updated:       '\u2713 消息已更新！',
            toast_deleted_s:     '\u2713 已删除 {0} 条消息。',
            toast_deleted_p:     '\u2713 已删除 {0} 条消息。',
            toast_err_load:      '加载错误：{0}',
            toast_err_update:    '更新错误：{0}',
            toast_err_publish:   '发布错误：{0}',
            toast_err_delete:    '删除错误：{0}',
            toast_rate_limit:    '请等待几秒钟后再重新发布。',

            // ── 验证 ──────────────────────────────────────────────────────────
            val_title_required:  '标题为必填项。',
            val_body_required:   '消息正文为必填项。',

            // ── 确认对话框 ────────────────────────────────────────────────────
            confirm_title:       '确认',
            confirm_delete_s:    '确定删除 {0} 条消息？\n\n此操作不可逆。',
            confirm_delete_p:    '确定删除 {0} 条消息？\n\n此操作不可逆。',
            confirm_ok:          '删除',
            confirm_cancel:      '取消',

            // ── 预览 ──────────────────────────────────────────────────────────
            preview_hint:        '点击此处或 \u201cRaw\u201d 开始输入\u2026',
            preview_toggle_raw:  'Raw',

            // ── 用户弹窗 ──────────────────────────────────────────────────────
            popup_n_messages:    '{0} 条新消息',
            popup_close_aria:    '关闭',
            popup_close_btn:     '关闭',
            popup_history_label: '历史消息 ({0})',
            popup_hist_loading:  '加载中\u2026',
            popup_hist_err:      '(加载失败)',
            popup_empty_body:    '(空消息)',

            // ── 格式工具栏 ────────────────────────────────────────────────────
            fmt_bold:            '粗体',
            fmt_italic:          '斜体',
            fmt_underline:       '下划线',
            fmt_strike:          '删除线',
            fmt_list:            '项目符号列表',
            fmt_raw_tip:         '切换到原始文本输入模式',

            // ── 标签页 ────────────────────────────────────────────────────────
            tab_messages:        '\u6d88\u606f',
            tab_settings:        '\u8bbe\u7f6e',
            tab_replies:         '\u56de\u590d',

            // ── 设置 ──────────────────────────────────────────────────────────
            set_title:              '\u8bbe\u7f6e',
            set_popup_enabled:      '\u542f\u7528\u5f39\u7a97',
            set_popup_delay:        '\u81ea\u52a8\u5173\u95ed\u5ef6\u8fdf\uff08ms\uff0c0=\u65e0\u9650\uff09',
            set_max_messages:       '\u6700\u5927\u540c\u65f6\u6d88\u606f\u6570',
            set_history_enabled:    '\u5728\u5f39\u7a97\u4e2d\u663e\u793a\u5386\u53f2',
            set_allow_replies:      '\u5141\u8bb8\u7528\u6237\u56de\u590d',
            set_reply_max_len:      '\u6700\u5927\u56de\u590d\u957f\u5ea6\uff08\u5b57\u7b26\uff09',
            set_rate_limit:         '\u53d1\u5e03\u95f4\u6700\u5c0f\u5ef6\u8fdf\uff08ms\uff09',
            set_save:               '\u4fdd\u5b58\u8bbe\u7f6e',
            toast_settings_saved:   '\u2713 \u8bbe\u7f6e\u5df2\u4fdd\u5b58\u3002',
            toast_err_settings:     '\u4fdd\u5b58\u9519\u8bef\uff1a{0}',

            // ── 用户回复（弹窗）──────────────────────────────────────────────
            reply_placeholder:   '\u60a8\u7684\u56de\u590d\u2026',
            reply_send:          '\u53d1\u9001',
            reply_sent:          '\u2713 \u56de\u590d\u5df2\u53d1\u9001',
            reply_err:           '\u9519\u8bef\uff1a{0}',

            // ── 管理员回复 ────────────────────────────────────────────────────
            replies_empty:           '\u6682\u65e0\u56de\u590d\u3002',
            replies_delete_all:      '\u5168\u90e8\u5220\u9664',
            replies_delete_one:      '\u5220\u9664',
            replies_loading:         '\u6b63\u5728\u52a0\u8f7d\u56de\u590d\u2026',
            replies_disabled_hint:   '\u5728\u8bbe\u7f6e\u4e2d\u542f\u7528\u56de\u590d\u3002',
            tbl_col_reply_user:      '\u7528\u6237',
            tbl_col_reply_date:      '\u65e5\u671f',
            tbl_col_reply_body:      '\u56de\u590d',
            toast_reply_deleted:     '\u2713 \u56de\u590d\u5df2\u5220\u9664\u3002',
            toast_err_reply_delete:  '\u5220\u9664\u9519\u8bef\uff1a{0}',

            // ── 权限标签页 ────────────────────────────────────────────────────
            tab_permissions:        '\u6743\u9650',
            perm_section_title:     '\u7528\u6237\u6743\u9650\u7ba1\u7406',
            perm_col_user:          '\u7528\u6237',
            perm_col_send:          '\u53d1\u9001',
            perm_col_reply:         '\u56de\u590d',
            perm_col_edit_own:      '\u7f16\u8f91\u81ea\u5df1\u7684',
            perm_col_delete_own:    '\u5220\u9664\u81ea\u5df1\u7684',
            perm_col_edit_others:   '\u7f16\u8f91\u4ed6\u4eba\u7684',
            perm_col_delete_others: '\u5220\u9664\u4ed6\u4eba\u7684',
            perm_col_max_msgs:      '\u6700\u591a\u6d88\u606f/\u5929',
            perm_col_max_replies:   '\u6700\u591a\u56de\u590d/\u5929',
            perm_col_actions:       '\u64cd\u4f5c',
            perm_save_row:          '\u4fdd\u5b58',
            perm_saved_row:         '\u5df2\u4fdd\u5b58 \u2713',
            perm_save_err:          '\u9519\u8bef',
            perm_loading:           '\u52a0\u8f7d\u4e2d...',
            perm_no_users:          '\u6ca1\u6709\u7528\u6237\u3002',
            perm_hint_0:            '0 = \u4e0d\u9650\u5236',

            // ── 用户页面 ──────────────────────────────────────────────────────
            user_page_title:        '\u6211\u7684\u6d88\u606f',
            user_tab_inbox:         '\u6536\u4ef6\u7b71',
            user_tab_send:          '\u53d1\u9001',
            user_inbox_empty:       '\u6ca1\u6709\u6536\u5230\u6d88\u606f\u3002',
            user_inbox_loading:     '\u52a0\u8f7d\u4e2d...',
            user_sent_title:        '\u6211\u5df2\u53d1\u9001\u7684\u6d88\u606f',
            user_sent_empty:        '\u6ca1\u6709\u5df2\u53d1\u9001\u7684\u6d88\u606f\u3002',
            user_compose_title:     '\u65b0\u6d88\u606f',
            user_publish_btn:       '\u53d1\u9001\u6d88\u606f',

            // ── 消息标签 ──────────────────────────────────────────────────────
            msg_deleted_label:      '(\u5df2\u5220\u9664)',
            msg_edited_label:       '(\u5df2\u7f16\u8f91 {0}\u6b21)',

            // ── 弹窗回复 ──────────────────────────────────────────────────────
            reply_auto_close:       '\u56de\u590d\u5df2\u53d1\u9001\u3002',
            reply_already_sent:     '\u60a8\u5df2\u7ecf\u56de\u590d\u8fc7\u3002',
            rate_limit_msg:         '\u5df2\u8fbe\u5230\u6bcf\u65e5\u9650\u5236\u3002',

            // ── 保留期限 ──────────────────────────────────────────────────────
            ret_admin_days_lbl:     '\u7ba1\u7406\u5458\u6d88\u606f\u4fdd\u7559\uff08\u5929\uff0c0=\u65e0\u9650\uff09',
            ret_user_days_lbl:      '\u7528\u6237\u6d88\u606f\u4fdd\u7559\uff08\u5929\uff0c0=\u65e0\u9650\uff09',

            // ── 回复过滤 ──────────────────────────────────────────────────────
            replies_filter_lbl:     '\u8fc7\u6ee4\uff1a',

            // ── 用户验证 ──────────────────────────────────────────────────────
            err_title_required:     '\u6807\u9898\u4e3a\u5fc5\u586b\u9879\u3002',
            err_body_required:      '\u6d88\u606f\u5185\u5bb9\u4e3a\u5fc5\u586b\u9879\u3002',

            // ── 长度验证 (3.6.0.0) ────────────────────────────────────────────
            val_title_too_long:     '\u6807\u9898\u8d85\u8fc7{0}\u5b57\u7b26\u9650\u5236\u3002',
            val_body_too_long:      '\u6d88\u606f\u8d85\u8fc7{0}\u5b57\u7b26\u9650\u5236\u3002',
            val_reply_empty:        '\u56de\u590d\u4e0d\u80fd\u4e3a\u7a7a\u3002',
            val_reply_too_long:     '\u56de\u590d\u8d85\u8fc7{0}\u5b57\u7b26\u9650\u5236\u3002',
            val_settings_invalid:   '\u8bbe\u7f6e\u65e0\u6548\u2014\u8bf7\u68c0\u67e5\u8f93\u5165\u7684\u5024\u3002',

            // ── 日期 ──────────────────────────────────────────────────────────
            date_suffix:         'UTC'
        }
    };

    // ── Détection de la langue ───────────────────────────────────────────────

    /**
     * Normalise une chaîne brute BCP-47 (ex: 'fr', 'fr-FR', 'en-US', 'en')
     * en 'fr' ou 'en' (défaut).
     * @param {string} raw
     * @returns {'fr'|'en'}
     */
    function normalizeLang(raw) {
        if (!raw) return 'en';
        var l = raw.toLowerCase();
        if (l.startsWith('fr')) return 'fr';
        if (l.startsWith('es')) return 'es';
        if (l.startsWith('de')) return 'de';
        if (l.startsWith('pt')) return 'pt';
        if (l.startsWith('it')) return 'it';
        if (l.startsWith('ja')) return 'ja';
        if (l.startsWith('zh')) return 'zh';
        return 'en';
    }

    /**
     * Lit la langue depuis document.documentElement.lang.
     * Retourne null si l'attribut est absent ou vide (cas Jellyfin 10.11
     * React Router avant que localusersignedin ait mis à jour l'attribut).
     * @returns {'fr'|'en'|null}
     */
    function readHtmlLang() {
        var v = document.documentElement.lang;
        return v ? normalizeLang(v) : null;
    }

    /**
     * Résolution complète de la langue avec fallbacks.
     * Utilisé uniquement au chargement du module.
     * @returns {'fr'|'en'}
     */
    function detectLang() {
        return readHtmlLang() || normalizeLang(navigator.language) || 'en';
    }

    // _resolvedFromHtml : true si _lang a été lu depuis html.lang (fiable),
    // false si résolu depuis navigator.language (peut être erroné en 10.11).
    var _lang           = detectLang();
    var _resolvedFromHtml = !!document.documentElement.lang;
    var _dict           = _dicts[_lang] || _dicts.en;

    /**
     * Met à jour _lang et _dict si la nouvelle langue diffère de l'actuelle.
     * @param {'fr'|'en'} newLang
     */
    function applyLang(newLang) {
        if (newLang && newLang !== _lang) {
            _lang = newLang;
            _dict = _dicts[_lang] || _dicts.en;
            console.log('InfoPopup i18n: langue mise à jour → ' + _lang);
        }
    }

    // ── MutationObserver : réactivité au changement tardif de html.lang ──────
    // Jellyfin 10.11 (React Router) peut poser html.lang APRÈS que ce module
    // s'est chargé. L'observer garantit que _lang se synchronise dès que
    // Jellyfin positionne l'attribut, sans nécessiter de rechargement de page.

    if (typeof MutationObserver !== 'undefined') {
        (new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].attributeName === 'lang') {
                    var detected = readHtmlLang();
                    if (detected) {
                        _resolvedFromHtml = true;
                        applyLang(detected);
                    }
                    break;
                }
            }
        })).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }

    // ── Fonction de traduction ───────────────────────────────────────────────

    /**
     * Traduit une clé. Les occurrences de {0}, {1}… sont remplacées
     * par les arguments supplémentaires.
     * Retourne la clé entourée de '?' si absente du dictionnaire.
     *
     * Détection lazy : si la langue n'a pas encore été résolue depuis html.lang
     * (cas React Router), chaque appel à t() tente de lire html.lang. Dès
     * qu'il est disponible, la langue est mise à jour et ne sera plus re-vérifiée.
     */
    function t(key) {
        // Lazy re-sync : si on avait dû tomber sur navigator.language faute
        // d'un html.lang disponible, on re-vérifie à chaque appel jusqu'à
        // ce qu'on obtienne une valeur fiable depuis html.lang.
        if (!_resolvedFromHtml) {
            var htmlLang = readHtmlLang();
            if (htmlLang) {
                _resolvedFromHtml = true;
                applyLang(htmlLang);
            }
        }

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
