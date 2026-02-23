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
