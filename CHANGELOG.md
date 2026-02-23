# Changelog

All notable changes to this project are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [0.6.0.0] — 2026-02-23

### Added

- **Multilanguage support (FR / EN)** — the plugin now detects the active Jellyfin language via `document.documentElement.lang` (set by Jellyfin Web according to user preferences) with a fallback to `navigator.language`. French and English are fully supported. All user-facing strings — admin page labels, toasts, validation errors, confirm dialog, toolbar tooltips, user popup, history accordion — are translated. Adding a new language requires only a new dictionary entry in `ip-i18n.js`.
- **`ip-i18n.js` module** — language detection (`detectLang()`) + `window.__IP.t(key, ...args)` translation function with `{0}`, `{1}` placeholder substitution.

### Changed

- **`client.js` split into 5 focused modules** — the 1 217-line monolith is replaced by a lightweight loader (`client.js`, ~50 lines) that injects modules sequentially via dynamic `<script>` tags:
  - `ip-i18n.js` — language detection + FR/EN dictionaries
  - `ip-utils.js` — shared utilities (`apiFetch`, `escHtml`, `renderBody`, `formatDate`)
  - `ip-styles.js` — idempotent CSS injection (`injectStyles`)
  - `ip-admin.js` — admin configuration page (form, table, toolbar, targeting, CRUD)
  - `ip-popup.js` — user popup + MutationObserver (auto-starts)
- **`window.__IP` namespace** — all inter-module functions are exposed via `window.__IP` instead of closed-over variables. Each module is an IIFE that reads and extends `window.__IP`.
- **Controller — generic JS module endpoint** — `GET /InfoPopup/client.js` is replaced by `GET /InfoPopup/{module}.js` with a whitelist (`client.js`, `ip-*.js`). The old dedicated action is removed; a single action now serves all modules.
- **`configurationpage.html`** — static text remains in French as default (overridden by `applyStaticTranslations()` at runtime). Added `id` attributes to all translatable elements (`#ip-subtitle`, `#ip-title-label`, `#ip-body-label`, `#ip-recipients-label`, `#ip-history-title`, `#ip-select-all-label`, `#ip-delete-btn-label`). The `<span>` inside `#ip-delete-btn` is now a separate element to allow text-only translation without touching the icon.
- **`Jellyfin.Plugin.InfoPopup.csproj`** — `ip-i18n.js`, `ip-utils.js`, `ip-styles.js`, `ip-admin.js`, `ip-popup.js` added as `<EmbeddedResource>`.
- **`CLAUDE.md`** — architecture, naming, pitfalls and REST API reference updated for v0.6.

### Fixed

- **Singular/plural in selection counter and deletion toasts** — previously hardcoded French pluralisation rules (`'s'` suffix). Now uses dedicated i18n keys (`sel_count_singular`, `sel_count_plural`, `toast_deleted_s`, `toast_deleted_p`, `confirm_delete_s`, `confirm_delete_p`) per language.
- **`(sans nom)` hardcoded in `fetchUsers()`** — replaced by `t('target_unknown')`.

---

## [0.5.1.0] — 2026-02-23

### Added

- **Real-time formatted preview in the input area** — the "Message" field now displays formatted rendering by default (`**bold**`, `_italic_`, `__underline__`, `~~strikethrough~~`, lists). A `Raw` toggle switch in the formatting toolbar allows switching to raw markup input. Clicking the preview directly switches to raw mode. Formatting buttons (B, I, U, S, List) automatically switch to raw mode before applying formatting. After publishing or cancelling, the form returns to preview mode.
- **Context detection in the toolbar** — B/I/U/S buttons are now "pressed" (visual active state) when the cursor is inside a pair of markers, whether there is a selection or not. Compatible with Jellyfin 10.10–10.11.
- **Smart format removal** — clicking an active button removes the markers surrounding the cursor, even without a prior selection. The old behaviour used to add duplicate markers.

### Fixed

- **TOCTOU in `UpdateMessage`** — after `_store.Update()`, the controller was calling `_store.GetById(id)!` (null-forgiveness operator) to retrieve the updated message. Between the two calls, a concurrent deletion could have produced a `NullReferenceException`. `MessageStore.Update()` now returns a `PopupMessage?` snapshot captured inside the lock, eliminating the race condition. The return type changes from `bool` to `PopupMessage?`.
- **`usersCache` never invalidated** — the user list was loaded once and kept indefinitely. Users created in Jellyfin during the session were not visible in the targeting selector. A 5-minute TTL is now applied (`usersCacheAt`).
- **Admin styles lost on SPA navigation** — the table, badges, toast, recipient selector and formatting toolbar styles were defined in the `<style>` block of `configurationpage.html`. This block disappears during SPA transitions (HTML is reloaded via `innerHTML`). All these styles are now in `injectStyles()` and persist in `<head>` for the entire session.
- **`emby-checkbox` on the "Select all" checkbox** — replaced by a native `<input type="checkbox">` with inline `accent-color`, consistent with the other checkboxes in the admin table.

### Changed

- `MessageStore.Update()` — returns `PopupMessage?` (snapshot captured in the lock) instead of `bool`.
- `InfoPopupController.UpdateMessage()` — uses the snapshot returned by `Update()`, removes the second `GetById()` call.
- `applyFormat()` — refactored via `getFormatBoundsAroundCursor()`: clean removal of markers around the cursor, end of `****` accumulation.
- `initConfigPage()` — `selectionchange` / `keyup` / `mouseup` / `touchend` listeners on the textarea to keep the toolbar state continuously up to date.
- `client.js` — added `updatePreview(page)` and `setPreviewMode(page, on)`; `enterEditMode` switches to raw, `exitEditMode` returns to preview, `publishMessage` (POST) returns to preview after success. `input` dispatch after each formatting action to immediately sync the preview.
- `configurationpage.html` — removed the `<style>` block (migrated to `injectStyles()`), added toggle switch and preview div, "Select all" checkbox as native checkbox.

---

## [0.5.0.0] — 2026-02-23

### Security

- **Access control on `GET /messages` and `GET /messages/{id}`** — these endpoints were accessible to any authenticated user, exposing the full list of messages including their `TargetUserIds` and bodies, regardless of targeting. Now: admins see everything; users only see messages intended for them. `GET /messages/{id}` returns `404` (not `403`) if the user is not targeted, to avoid revealing the existence of a non-intended message.
- **Empty UserId → explicit 401** — when the `Jellyfin-UserId` claim was absent from the token, the code was silently returning an empty ID that created a ghost record in `infopopup_seen.json`. All user endpoints now explicitly return `401 Unauthorized` if the ID is absent.

### Added

- **`GET /InfoPopup/popup-data` endpoint** — returns in a single call everything the popup needs: unread messages with full body + history as summaries. Replaces the old N+1 pattern that generated up to `2 + N + M` HTTP requests to display a popup.
- **`POST /InfoPopup/messages/delete` endpoint** (admin) — replaces `DELETE /messages` with body. Some proxies and firewalls silently reject `DELETE` requests with a body. The old `DELETE` endpoint is removed.
- **`DTOs/` folder** — `MessageDtos.cs` groups all DTOs (`CreateMessageRequest`, `DeleteMessagesRequest`, `UpdateMessageRequest`, `MarkSeenRequest`, `MessageSummary`, `MessageDetail`, `PopupDataResponse`). They were previously defined at the top of the controller file.

### Fixed

- **Popup/marking race condition** — `popupActive` was reset to `false` immediately on popup close, before the `POST /seen` had been confirmed by the server. `popupActive` now stays `true` until the `.finally()` of `markAllSeen()`.
- **`popupActive` guard in `schedulePopupCheck`** — without this guard, fast navigation after closing could re-trigger a network check while the marking was still in transit.
- **Config reference captured in the lock** (`MessageStore`) — `Plugin.Instance?.Configuration` was accessed via a property without local assignment inside the locked block. The reference is now captured with `var cfg = GetConfig()` inside each block.
- **Memory cache in `SeenTrackerService`** — `ReadStore()` was reading the JSON file from disk on every call, including under `ReadLock`. A `_cache` is now maintained in memory and invalidated only on write.
- **Admin toast accessibility** — `aria-live="polite"` and `role="status"` added to the toast during config page init and on each display.

### Changed

- `checkForUnseenMessages` now uses `GET /InfoPopup/popup-data` (1 request).
- `deleteSelected` in `client.js` calls `POST /InfoPopup/messages/delete` instead of `DELETE`.
- `markAllSeen` returns a `Promise` to allow the `.finally()` in `close()`.
- Global JS state variables grouped at the top of the IIFE.

---

## [0.4.0.0] — 2026-02-23

### Added

- **Message body formatting** — lightweight syntax rendered client-side as secure HTML (escHtml() always applied before any replacement, XSS impossible):
  - `**text**` → bold
  - `_text_` → italic
  - `__text__` → underline
  - `~~text~~` → strikethrough
  - Lines prefixed with `- ` → bulleted list with indentation (`<ul><li>`)
  - Rendering active in the user popup, in the history and in the admin table expand rows.
- **Formatting toolbar** above the admin textarea — five buttons (B, I, U, S, • List) that wrap the current selection. Each button is a toggle: pressing it a second time removes the formatting.
- **Edit existing messages** — "✎ Edit" button on each row of the admin table. Loads the message into the form, switches to edit mode (section title + button label change, "Cancel" button appears). Uses `PUT /InfoPopup/messages/{id}`: the ID is preserved, view tracking is not affected.
- **`PUT /InfoPopup/messages/{id}` endpoint** (admin only) — updates title and body without touching the ID or `infopopup_seen.json`.

### Fixed

- **Empty body in popup history** — already-seen messages passed to `buildHistoryBlock` were `MessageSummary` objects without a `body`. `checkForUnseenMessages` now pre-loads the full detail of each seen message before opening the popup.
- **Broken admin table formatting** — CSS for `.ip-row-expand`, `.ip-row-chev`, `.ip-edit-btn` was absent when navigating directly to the config page. `initConfigPage()` now calls `injectStyles()` first.

### Changed

- `MessageStore` — new `Update(id, title, body)` method.
- `renderMessages` — Actions column + expand rows colSpan increased from 4 to 5.
- `publishMessage` — branches to PUT or POST based on `editState.id`.
- `buildHistoryBlock` — immediate display if body is pre-loaded, lazy load as fallback.

---

## [0.3.0.0] — 2026-02-23

### Added

- **All unread messages in the main area** — each unread message appears in its own card (title + body). The history now only contains already-seen messages.
- **Message title in popup header** — single message: its title in the header. Multiple: "N new messages".
- **Inline row expand in admin table** — click on the Title column → expansion row with body on lazy load, animated chevron.

### Changed

- `checkForUnseenMessages` — bodies of all unread messages fetched in parallel (`Promise.all`).
- `showPopup` — two arguments (`unseenMessages`, `seenMessages`), adaptive rendering.
- `renderMessages` — generates a `<tr class="ip-row-expand">` for each row.

---

## [0.2.1.0] — 2026-02-20

### Added

- Login popup via MutationObserver (SPA-compatible, Jellyfin 10.10–10.11)
- Show once per user — server-side tracking, no localStorage
- Collapsible history of past messages
- Admin page: publishing, multiple selection, confirmed deletion
- Full deletion: disappears immediately for all users
- Automatic injection of `client.js` via `ScriptInjectionMiddleware`
- Targeting by specific users or broadcast to everyone
- XSS security: `textContent` exclusively, never `innerHTML`
- Jellyfin theme integration
