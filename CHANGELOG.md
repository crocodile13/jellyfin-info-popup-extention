# Changelog

All notable changes to this project are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [3.8.9.0] — 2026-05-31

### Changed
- **Two-channel release workflow (dev / stable)** — `make` targets are now channel-aware. By default every `release-*` operates on the `dev` branch, tags with `-dev` suffix, ZIPs as `infopopup_X.Y.Z.W-dev.zip`, creates GitHub pre-releases, updates `manifest-dev.json`. To ship stable: `make promote VERSION_ARG=X.Y.Z.W` (fast-forwards `main` to the dev tag's commit, rebuilds clean, tags `vX.Y.Z.W`, updates `manifest.json`). New targets: `init-dev` (one-shot setup), `promote`. Override flag: `STABLE=1` on any release target.

### Fixed
- **First-load styling glitch after a fresh install** — when the plugin was installed while a browser tab on Jellyfin was already open (very common scenario: admin installs the plugin from the dashboard and switches back to the regular UI), the browser kept serving its cached `index.html` from **before** the plugin's `<script src="/InfoPopup/client.js">` was added by `ScriptInjectionMiddleware`. Result: no plugin script loaded → no styles injected → toolbar buttons rendered with default browser white background. Required a hard refresh (`Ctrl+Shift+R`) to recover. The middleware now sets `Cache-Control: no-cache, must-revalidate` + `Pragma: no-cache` on its modified responses, so a normal browser reload (`F5`) is enough; the hard refresh is no longer needed (issue #2).

---

## [3.8.8.0] — 2026-05-31

### Changed
- **Self-sent messages are no longer shown in "Received" views** — a user (admin or not) who sends a message to "All users" no longer sees their own message appear in their popup, Inbox, or `/messages` listing. The filter is applied server-side in `GetMessages` (non-admin path), `GetPopupData`, and `GetUnseen` via `IsOwner` (GUID-normalized comparison). The admin view of `/messages` still shows all messages.
- **Admin row in the Rights tab now has a dedicated "Administrator" role** — instead of showing "Reader" or "Custom" for admin Jellyfin users (which was misleading since they have all rights server-side), a non-selectable "Administrateur / Administrator" option is pre-selected. The card stays greyed out and excluded from save/bulk-apply as before. Eight new translations: `perm_role_admin`.

### Fixed
- **Reply toast notifications were silenced on first connection** — the v3.8.0.0 "anti-spam bootstrap" logic marked every reply in the first poll as already-seen if `localStorage` was empty. Result: a fresh user (or anyone who cleared site data) never saw their very first reply notification. Now the bootstrap silencing only kicks in if there are more than 3 pending replies on the first poll (the actual upgrade-spam case). Below the threshold, normal notifications fire.
- **First reply poll deferred up to 10 seconds after page load** — the poll loop only fired on the first 10 s tick. Now `pollRepliesReceived()` runs immediately at observer init, so a user who opens Jellyfin right after someone replied gets the toast within ~1 s instead of up to 55 s (10 s tick + 45 s interval).

### Added
- **Full rich-text editor in the "My Messages" → Send tab** — parity with the admin editor: WYSIWYG contenteditable mode by default with a Raw toggle for direct markdown, keyboard shortcuts (Ctrl+B/I/U, Ctrl+Shift+S), live char counter (warning/danger states), active-state highlighting on toolbar buttons (the B button lights up when your cursor is inside `**bold**`, etc.), tooltips with shortcut hints. Markdown ↔ HTML conversion reuses the admin helpers via the `window.__IP` namespace (`markdownToHtml`, `htmlToMarkdown`, `applyWysiwygFormat`).

---

## [3.8.7.0] — 2026-05-30

### Added
- **New "Maintenance" section in the admin Settings tab** — 4 action buttons, each gated by a confirmation dialog:
  - **Clear read receipts** (`POST /admin/clear-seen`): wipes `infopopup_seen.json`. Users see every existing message again on next sign-in.
  - **Clear all replies** (`POST /admin/clear-replies`): wipes `infopopup_replies.json`. Messages themselves are preserved.
  - **Purge soft-deleted messages** (`POST /admin/purge-deleted`): hard-delete + cascade reply removal for messages already soft-deleted.
  - **Reset settings to defaults** (`POST /admin/reset-settings`): restores `PluginConfiguration` to its field-initializer defaults. Messages, permissions, and user data are untouched.
- **Service-level Clear/Purge methods** — `SeenTrackerService.ClearAll()`, `ReplyStoreService.ClearAll()`, `MessageStore.PurgeSoftDeleted()`. Each takes the relevant write-lock once, replaces the in-memory store with a fresh instance, persists.
- **23 new i18n keys × 8 languages** for the maintenance section (titles, descriptions, button labels, confirmation prompts, OK/error messages).

### Changed
- **`initSettingsTab` is idempotent** — split into `reloadSettingsValues` (pure data refresh) + `initSettingsTab` (one-time handler binding). The reset action calls only `reloadSettingsValues` so re-binding the save button or change listeners is impossible.

---

## [3.8.6.0] — 2026-05-30

### Added
- **Client-side search filter in admin Messages and Rights tabs** — a search field above each list filters in real time. Messages: matches against title + sender name. Rights: matches against username. `Escape` clears the filter, `select all` / bulk apply respect filter scope (hidden rows are never selected). Pure client-side, zero new server calls.
- **Read receipts in the admin Messages tab** — a new "Views" column shows a `seen/targeted` badge per message (color-coded: grey < 50%, blue ≥ 50%, green = 100%). Click the badge to open a modal listing exactly **who has seen** and **who hasn't seen** the message. For "all users" targeted messages the audience is every Jellyfin user; for explicitly targeted messages, only the listed users.
- **New endpoint `GET /InfoPopup/messages/{id}/views`** — admin-only (`RequiresElevation`), returns `MessageViewsDto` with separate `SeenUsers` and `UnseenUsers` arrays plus a `TargetsAllUsers` flag.
- **`MessageSummary.TargetedCount` / `SeenCount`** — nullable fields, populated only on the admin path of `GET /messages`. Computed in batch via the new `SeenTrackerService.GetSeenUsersByMessage(...)` bulk lookup (one read-lock + one pass over all records, instead of one per message).
- **13 new i18n keys × 8 languages** for the views feature (column header, modal title, seen/unseen counts, all-targets badge, empty/loading/error states, close button).

---

## [3.8.5.0] — 2026-05-30

### Changed
- **More background work optimizations, no behavioral change.**

### Added
- **`MessageStore.GetAllIds()`** — lightweight ID-only enumeration (no sort, no PopupMessage copies). Used by `POST /seen` cleanup path instead of `GetAll().Select(m => m.Id)`.
- **HashSet-backed unseen/seen lookups in `SeenTrackerService`** — `GetUnseenIds` and `MarkAsSeen` now convert the persisted `SeenMessageIds` list to a HashSet before the union/diff loop, dropping from O(M·N) to O(M+N) on the `Contains` checks. Becomes visible once a user accumulates a few hundred read messages.
- **No-op write skip in `SeenTrackerService.MarkAsSeen`** — when the call adds no new seen IDs and removes no orphans, the JSON file is no longer rewritten. Previously a re-poll on an already-seen popup wrote the file every time for nothing.
- **rAF-throttled central MutationObserver** — the `<body>` observer in `ip-popup.js` fires dozens of times per second on the Jellyfin homepage (carousels, image lazy-loading). The 4 downstream checks (`schedulePopupCheck`, `checkConfigPage`, `checkUserPage`, `injectSidebarEntry`) are now coalesced into one `requestAnimationFrame` callback per frame. No reactivity loss (≤ 16 ms), large CPU savings on dense pages.

---

## [3.8.4.0] — 2026-05-30

### Changed
- **Faster page loads, especially admin tabs and "My Messages"** — bundle of latency optimizations with no behavioral change.

### Added
- **Long-lived HTTP cache on versioned JS modules** — `Cache-Control: public, max-age=31536000, immutable` on `/InfoPopup/*.js?v=X.Y.Z.W`. Each release changes the query string and naturally invalidates the cache. SPA navigations no longer re-fetch the 6 modules; the browser/service-worker serves them locally. Falls back to 5-minute cache when the version query is absent.
- **Parallel JS module loader** — `client.js` now inserts all 6 `<script async=false>` tags into `<head>` in one batch instead of chaining `load` events. The browser fetches them in parallel while preserving execution order — 1 RTT instead of 6 on cold cache.
- **Per-request server-side caches** — `InfoPopupController` now memoizes user-name lookups (`_userNameCache`), permission reads (`_permCache`), and pre-builds a `MessageId → List<Reply>` map (`PreloadRepliesByMessage`) once per request. `GetPopupData`, `GetSentMessages`, and `GetAllPermissions` go from O(N·R) or O(N·U) lookups under repeated locks to O(N+R) or O(N+U). Visible mostly on installs with many messages or users.
- **Parallel admin init** — admin config page now fires `fetchUsers()` and `loadMessages()` in parallel instead of chaining them. `loadMessages` doesn't depend on the user list (sender names are pre-resolved server-side).
- **`popup-data` reused for "My Messages" permissions** — the user overlay no longer issues a separate `GET /permissions/me`; permissions are extracted from the `popup-data` response that the inbox already needs. Saves one round-trip per overlay open.

### Fixed
- **Memory leak: popup `keydown` listener** — closing the popup via the X button or backdrop click left a `document.addEventListener('keydown', …)` permanently attached. Each open/close cycle accumulated one listener. `close()` now removes it on every path (previously only the Escape path cleaned up).
- **Memory leak: "My Messages" overlay listeners** — `keydown`, `hashchange`, and `popstate` listeners were registered on `document`/`window` when the overlay opened but only removed on the Escape close path. Back-button close, sidebar reuse, and route-driven close all leaked them. Listeners are now tracked at module scope and detached in `closeUserOverlay()` regardless of close cause.

---

## [3.8.3.0] — 2026-05-30

### Added
- **Sender role badges (admin / moderator / user / system) on every message** — small colored pills (gold for admin, purple for moderator, grey for user/system) next to the sender's name in the popup AND in the "My Messages" inbox. New `MessageDetail.SenderRole` field computed server-side (`IsSentByAdmin` → admin, stored `Role == "moderator"` or `CanEditOthers && CanDeleteOthers` → moderator, else user).
- **Admin users greyed out in the Rights tab** — Jellyfin admin cards are visually dimmed (`opacity:.55` with gold accent), all controls disabled, "ADMIN" badge shown, automatically excluded from multi-select, "Apply to selection" and global "Save permissions". An admin always has full rights server-side; persisting any UI state for them would be ineffective and misleading. New `UserPermissionDto.IsAdmin` resolved via reflection on `User.Policy.IsAdministrator` (10.10/10.11) with fallback to `User.HasPermission(PermissionKind.IsAdministrator)` (10.11.9+).
- **New i18n keys** (× 8 languages): `role_admin/moderator/user/system`, `perm_admin_badge`, `perm_admin_hint`.

### Changed
- **Reply notification simplified** — the corner toast now just says "Reply from X" (no message title, no body preview), auto-dismiss reduced from 6s to 4s. Users open "My Messages" for the detail.
- **Real-time popup poll faster** — intervals reduced from 60s/60s to 30s for new popup messages and 45s for reply notifications. Still lightweight: zero cost when popup is active, tab hidden, or admin page open.

---

## [3.8.2.0] — 2026-05-30

### Security
- **Capacity limits on DTO `List<string>` fields** — `TargetUserIds` (Create/Update: max 2000), `Ids` (Delete/MarkSeen: max 1000), `UserIds` (BulkPermissions: max 2000). Without these limits, the default Kestrel body size (28 MB) allowed ~700 K GUIDs to be loaded into memory/disk — potential amplification.
- **`MaxMessagesPerDay` quota enforced atomically inside `MessageStore.Create`** — previously the controller called `GetUserMessageCountToday` then `Create` separately; two parallel requests could both see N < limit and create N+1 messages. The check is now INSIDE the write-lock.
- **`isOwner` comparisons normalized** via new `IsOwner(sentByUserId, userId)` helper that routes through `PermissionService.NormalizeUserId` — defensive hardening against GUID format mismatches ("D" vs "N"), same trap fixed in v3.7.4.0 for permissions. Applied to `UpdateMessage`, `SoftDeleteMessage`, `GetMessage` (owner bypass), `GetMessageReplies`, and `ToDetailForUser`.
- **Hardened headers on the JS endpoint** — `X-Content-Type-Options: nosniff` added and explicit `Content-Type: application/javascript; charset=utf-8` on `GET /InfoPopup/{module}.js`. Defense in depth against MIME sniffing.

### Fixed
- **"My Messages" entry took full sidebar height** (3.8.1.0 regression) — `appendChild` directly on `.mainDrawer` (flex column) stretched the link. Scope restored to `.mainDrawer-scrollContainer` (3.7.x behavior) plus `flex:0 0 auto; min-height:40px; max-height:48px; box-sizing:border-box` on the link to resist any flex parent.

---

## [3.8.1.0] — 2026-05-30

### Fixed
- **"My Messages" entry missing for users and placed under "Dashboard" for admins** (3.8.0.0 regression) — the document-wide anchor search with `closest('… [class*="navMenuOption"] …')` also matched the admin dashboard sidebar (which uses `a.navMenuOption`), placing the entry under "Dashboard". For users without a dashboard, the absence of a matching anchor caused `return false` → no entry at all. Search restricted to `.mainDrawer` only (with `.mainDrawer-scrollContainer` fallback), insertion AFTER the last `.navMenuOption` of the drawer if no user anchor is identified.

---

## [3.8.0.0] — 2026-05-30

### Added
- **Edit and delete messages from "My Messages"** — each card (Inbox for admin, Sent for the owner) now offers "Edit" and "Delete" gated by `CanEditOwnMessages` / `CanDeleteOwnMessages` (or the `Others` variants for admin). PUT preserves the ID and `infopopup_seen.json`. Soft-delete via the existing `POST /messages/{id}/soft-delete` endpoint.
- **Replies visible in "My Messages"** — the Inbox shows the user's own reply below each message when present; the Sent tab lists received replies under each of the user's messages. Data included inline in `popup-data` (`MyReply` field) and `/messages/sent` (`Replies` field) — zero extra round-trips.
- **Real-time popup (lightweight poll)** — checks for unread messages every 60s + on tab visibility change. No more page refresh needed to see a new popup. Skipped when popup is active, on the admin page, or tab hidden.
- **Toast notification for received replies** — a small discrete toast in the bottom-right corner (auto-dismiss 6s, click to dismiss) appears when a user replies to one of your messages. Format: "X replied to 'Y'" + preview. New `GET /InfoPopup/replies/received` endpoint. Notified IDs persisted in `localStorage`.
- **New i18n keys** (× 8 languages): `user_msg_edit/delete/save/cancel/confirm_delete/your_reply/replies_count_s/p/no_replies/edit_err` + `toast_reply_received`.

### Fixed
- **"My Messages" button misplaced in the sidebar** — the injection looked for the logout anchor only inside `.mainDrawer-scrollContainer`, which on installations with KefinTweaks/JellyfinEnhanced only contains libraries. The search is now extended to the whole document with a verification that the anchor is inside a drawer/menu. No more `appendChild` fallback that could land in the Media section.

### Changed
- **`EffectivePermissionsDto`** extended with `CanEditOthersMessages`, `CanDeleteOthersMessages`, `IsAdmin` — used by the UI to enable admin actions.
- **`MessageDetail`** carries two new fields: `MyReply` (current user's reply if they replied) and `Replies` (list when the user is the sender). Populated contextually via `ToDetailForUser`.
- **`PopupDataResponse.History`** changes from `List<MessageSummary>` to `List<MessageDetail>` to carry `MyReply`; the body is now included from the start (slightly more bandwidth, far fewer round-trips).
- **`GET /messages/{id}/replies`** — allowed for the message sender (not just admin).

---

## [3.7.11.0] — 2026-05-30

### Fixed
- **"Messages" overlay back button crashed at mount on Jellyfin 10.11** — `document.createElement('button', { is: 'paper-icon-button-light' })` (standard "customized built-in elements" API) threw `TypeError: t.toLowerCase is not a function` in Jellyfin 10.11's `webcomponents.js` polyfill, which expects the OLD API where the 2nd argument is a string. Consequence (with the accumulated trap pile v3.7.7→9): no overlay ever opened. Replaced with a plain `<button>` carrying the `paper-icon-button-light` CSS classes (sufficient for visual rendering and ripple). Diagnosed precisely thanks to the diagnostic logs added in 3.7.9.0 and 3.7.10.0.

---

## [3.7.10.0] — 2026-05-30

### Fixed
- **Click on "Messages" blocked after a silent exception in `showUserPage`** — `showUserPage` set `_overlayOpen = true` BEFORE building the overlay; if an exception was thrown during construction (case revealed by the diagnostic logs: `showUserPage failed:` with empty err on admin), the flag stayed `true` and **ALL subsequent clicks were consumed by the `if (_overlayOpen) return;` guard**. The overlay body is now isolated in `_showUserPageInner` wrapped in a try/catch that resets `_overlayOpen = false` on failure, and logs the full error (name + message + stack).

---

## [3.7.9.0] — 2026-05-30

### Added
- **Diagnostic logs for click / `showUserPage`** — temporarily added to identify the cause if the problem persists on other configurations (to be removed later).

### Fixed
- **"Messages" overlay invisible on admin side** — `.ip-user-overlay` was at `z-index:9998`, below the `~10000+` dialogs of some Jellyfin admin pages → click captured, `showUserPage()` executed, but overlay hidden by the admin page. Aligned with other plugin overlays at `99998`.

---

## [3.7.8.0] — 2026-05-30

### Fixed
- **Click on "Messages" had no effect (3.7.7.0 incomplete)** — the `<a href="#">` triggered the Jellyfin router and a synchronous `hashchange` that closed the overlay right after opening. The `<a>` no longer has an href (`role="button"` + `tabindex="0"`); registration of the overlay's `hashchange`/`popstate` listeners is deferred via `setTimeout(0)` to ignore any synchronous navigation caused by the click. Click delegation doubled on `window` in addition to `document` to resist Jellyfin routers that capture at the document level.

---

## [3.7.7.0] — 2026-05-29

### Fixed
- **"Messages" inbox never marked as seen** — messages viewed via the sidebar stayed "unseen" server-side and the popup re-displayed them on every connection. The inbox now POSTs `/seen` with all unseen ids on load.
- **"Messages" button misplaced / dead click in the 10.11 MUI sidebar** — the injection took the first `ul` of the drawer (which is the Media/Libraries list) and a React MUI parent handler consumed the click before ours. The injection now targets the user list (around logout/preferences) and the click is doubled with a `document` capture-phase delegation, robust against React re-renders.

---

## [3.7.6.0] — 2026-05-29

### Added
- **Sender displayed in the popup** — "From: ..." line above the body of each message (single or multi), new `popup_from` i18n key in 8 languages.
- **JS module cache-bust (`?v=X.Y.Z.W`)** — the injected URL and each module loaded by `client.js` now carry the plugin version. No need to purge nginx/Cloudflare/service worker on every release: URL changes → all caches automatically refetch.

### Fixed
- **Sent messages had no body (user Messages page)** — the `/messages/sent` endpoint returned summaries without body, and the `/messages/{id}` fallback rejected the author when not in `TargetUserIds` themselves (404). Now the author can always read their own message, and `/messages/sent` returns the body directly.
- **"Custom" role reverting to a preset after save** — `detectRole` reclassified bools into a preset on every reload, losing the explicit admin choice. The role is now persisted server-side (new `Role` field in `UserPermission`) and honored as-is.
- **Rights tab dropdown cut off / overlapping** — `.ip-perm-card{overflow:hidden}` clipped the open list; replaced with `overflow:visible` plus `z-index` promotion of the active card.

---

## [3.7.5.0] — 2026-05-29

### Added
- **Rights tab: global save** — a single "Save permissions" button replaces the individual per-user save buttons.
- **Rights tab: multi-select** — per-user checkboxes + select all / deselect all / invert, with bulk application of a role and limits to the selection.
- **Custom dropdown** — `<select>` elements on the configuration page use a fully themed list (open list too, unlike native `<option>`).
- **"Messages" page back button** — reuses Jellyfin's native component (`paper-icon-button-light`) instead of a custom button.

### Fixed
- **"Messages" page broke the sidebar** — opening the page hid the side menu (`hide`) without ever restoring it on close. The sidebar is now correctly restored.
- **"Custom" role not saved** — same cause as the rights bug (ID format); now persisted correctly via the global save.

---

## [3.7.4.0] — 2026-05-29

### Changed
- **Restyled dropdowns** — all `<select>` elements on the configuration page adopt a consistent dark style (custom arrow, hover, focus) instead of the browser's native rendering.

### Fixed
- **Granted rights had no effect** — rights were stored with the user ID in "D" format (with hyphens, via `User.Id.ToString()`) but read back in "N" format (without hyphens, via the `Jellyfin-UserId` claim). The user never found their rights: no message sending, no reply, despite a visible attribution on the admin side. All user IDs are now normalized to canonical GUID format before storage and comparison.

---

## [3.7.3.0] — 2026-05-29

### Fixed
- **"Rights" tab empty ("No users")** — on Jellyfin 10.11.9+, the `IUserManager.Users` property was replaced by the `GetUsers()` method. The reflection helper only tested the property and returned an empty list (without error). It now also tries `GetUsers()`.
- **"Invalid settings" on save** — the auto-close delay was capped at 30,000 ms, rejecting legitimate values (e.g., 60,000). Cap raised to 600,000 ms (10 min) on the client, server, and form.

---

## [3.7.2.0] — 2026-05-29

### Changed
- **Plugin GUID changed** — consequence: Info Popup is seen as a new plugin. If an older version is installed, uninstall it then reinstall from the catalog.

### Fixed
- **Plugin missing from the Jellyfin catalog (GUID collision)** — the default template GUID (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`) was shared with other public plugins (e.g., "QualityGate"). Because Jellyfin merges plugins by GUID across all repositories, Info Popup was hidden under the other plugin. New unique GUID: `ceeb3040-9fe5-451f-ac05-8587ea3c3718`.

---

## [3.7.1.0] — 2026-05-29

### Changed
- **Lightened icon** — `assets/icon.png` reduced from 1024×1024 (1.4 MB) to 256×256 (~20 KB), reducing the DLL and release ZIP size accordingly.

### Fixed
- **"Rights" tab error (HTTP 500)** — `GET /InfoPopup/permissions` threw a `MissingMethodException` on `IUserManager.Users`, whose signature changed during the Jellyfin 10.11 cycle (the `User` entity was moved to `Jellyfin.Database.Implementations.Entities`). User enumeration now goes through reflection, runtime-bound and robust to ABI variations across 10.11.x versions.

---

## [3.7.0.0] — 2026-05-28

### Added
- **Role-based permission system** — each user is configured via a dropdown (Reader, Contributor, Moderator, Custom) instead of ticking six boxes. Detailed checkboxes remain accessible via the "Details" button.
- **Bulk permission application** — "Apply to all" bar to assign a role and daily limits to all users in one action. New `POST /InfoPopup/permissions/bulk` endpoint.
- **Messages page as overlay** — the user page opens as a fullscreen overlay accessible to all users, without going through the admin-only `configurationpage` route.
- **i18n** — 9 new keys (roles, bulk apply, overlay navigation) in 8 languages.

### Changed
- **Rights tab redesign** — display as per-user cards (name, role, daily limits) replacing the hard-to-manipulate checkbox grid.

### Fixed
- **Messages page inaccessible to non-admins (issue #1)** — the old link pointed to an admin-only route (`configurationpage`), causing redirection to the home page. Replaced with a JS overlay accessible to all.
- **10.11 experimental layout (MUI) compatibility** — sidebar entry injection in both layouts: classic (`.mainDrawer-scrollContainer`) and experimental React/MUI (`.MuiDrawer-paper`).
- **Rights tab showed "Error"** — the actual error message is now displayed (detailed cause + console log) instead of a generic label.

---

## [3.6.2.0] — 2026-04-12

### Added
- **Messages sidebar for all users** — JavaScript injection of a "Messages" entry in the Jellyfin sidebar, visible to all authenticated users (not just admins).
- **Collapsible messages in the inbox** — received messages are collapsed by default (title + author + date + preview). Click to expand the full body. Lazy loading of body for historical messages.
- **Sender name in messages** — the backend resolves and returns `SentByUserName` in the `MessageSummary` and `MessageDetail` DTOs.
- **Formatting toolbar in the user form** — bold, italic, underline, strikethrough, and bulleted list buttons in the Send tab.
- **Recipient selector in the user form** — allows targeting specific users (if the `/Users` API is accessible).

### Fixed
- **Messages page invisible to non-admins** — `EnableInMainMenu = false` + sidebar injection via JS replaces Jellyfin's `MenuSection` mechanism (admin-only).
- **`checkUserPage` race condition** — `typeof ns.checkUserPage === 'function'` guard in `ip-popup.js`.

---

## [3.6.1.0] — 2026-04-11

### Fixed
- **Jellyfin shortcuts blocked while typing** — Jellyfin-Web's global shortcuts (e.g., "q" → Quick Connect, "f" → fullscreen) no longer fire while typing in plugin fields. `stopPropagation` applied on `keydown` in the admin page, popup, and user page. Escape and Tab remain functional.

---

## [3.6.0.0] — 2026-04-11

### Added
- **Countdown progress bar** — the popup display duration (ms) triggers an elegant progress bar that depletes before auto-close. 0 = infinite (manual close only).
- **Embedded plugin icon** — `GetThumbImage()` implemented in `Plugin.cs`: the icon is embedded in the DLL and visible in the Jellyfin dashboard without network dependency.

### Changed
- **Semantics of `PopupDelayMs`** — this setting now controls the display duration before auto-close (0 = infinite). The delay before appearance remains a fixed 800 ms. Default value: 0 (infinite).
- **Setting label** — renamed "Display duration before auto-close (ms, 0 = infinite)" in 8 languages.

### Fixed
- **Systematic client-side validation** — title > 200 chars, message > 10,000 chars, empty or > 2,000 chars reply: clear errors before any network call. Settings parameters: range check before POST.
- **Hardened server-side validation** — `IsValidId()` + `AreValidUserIds()` on all endpoints with route parameter or ID list. `[Required][MaxLength]` on `SubmitReplyRequest.Body`.

---

## [3.5.0.0] — 2026-04-11

### Added
- **Per-user permission system** — 4th admin tab "Rights" to configure per user: sending, replying, edit/delete own or others' messages, daily limits.
- **User sidebar page** — "Messages" entry in the sidebar for all users: inbox and send tab (if rights granted). Same design as the admin page.
- **Message soft-delete** — deletions via user permissions mark the message as deleted (visible on admin side with indicator) without permanently removing it.
- **Edit history** — each modification of a message records the old version (author, date, content). Indicator visible on admin side.
- **One reply per user per message** — the server returns 409 if the user has already replied. The popup auto-closes after sending.
- **Daily rate limiting** — configurable limit per user: max messages/day and max replies/day (0 = unlimited).
- **Message retention** — configurable retention period separately for admin messages and user messages (days, 0 = infinite).
- **Routed replies** — replies are addressed to the message sender. Admin sees everything; users see their received replies via `/replies/mine`.
- **Extended i18n** — 35 new keys in 8 languages.

---

## [3.3.0.0] — 2026-04-11

### Added
- **Jellyfin sidebar entry** — the plugin appears directly in the side navigation bar ("server" section, `notifications` icon). `Plugin.cs` exposes `EnableInMainMenu = true` via `IHasWebPages`.
- **Settings tab** — new tab in the admin page to configure: popup activation, display delay, max simultaneous messages, history, user replies, max reply length, anti-spam delay.
- **User reply system** — users can reply to popup messages (toggleable in Settings). Replies are stored in `infopopup_replies.json` and consultable in a "Replies" tab on the admin page.
- **Dynamic client-side settings** — `ip-popup.js` loads `GET /InfoPopup/client-settings` at startup to apply `PopupDelayMs`, `MaxMessagesInPopup`, `HistoryEnabled`, `AllowReplies` in real time.
- **New REST endpoints** — `GET/POST /InfoPopup/settings`, `GET /InfoPopup/client-settings`, `POST /InfoPopup/messages/{id}/reply`, `GET /InfoPopup/replies`, `DELETE /InfoPopup/replies/{id}`, `POST /InfoPopup/messages/{id}/replies/delete`.
- **Extended i18n** — 25 new keys in 8 languages (tabs, settings, replies).

---

## [3.2.2.0] — 2026-04-11

### Fixed
- **Unreadable changelog in Jellyfin** — `update_manifest.sh` injected raw markdown (`###`, `**`, backticks, literal `\n` sequences) into manifest.json. Since Jellyfin displays this field as plain text, the result was unreadable. The script now automatically converts the content to clean text before injection.
- **Multi-version extraction in manifest.json** — the awk expression in `update_manifest.sh` used a range pattern that started and stopped on the same version line (because `## [X.Y.Z.0]` also matches `^## `), which immediately disabled the filter and printed the rest of the file. Logic aligned with `extract_changelog.sh`.

---

## [3.2.1.0] — 2026-04-11

### Fixed
- **WYSIWYG toolbar: B/I/U/S buttons had no effect** — `execCommand` ran after the click had removed focus from the `contenteditable`, clearing the selection. Fixed via `mousedown + preventDefault()` on the toolbar to keep the selection intact.
- **Crash on browsers without lookbehind regex** — Android WebView < 8, Tizen TV, some Fire TV don't support ES2018 lookbehinds (`(?<!...)`). The italic regex threw a silent `SyntaxError` breaking the entire editor. Replaced with an equivalent ES5 regex.
- **`htmlToMarkdown`: Chrome `<span style="...">` ignored** — `execCommand` sometimes generates `<span style="font-weight:bold">` instead of `<strong>`. These spans were traversed without conversion. Added detection of inline styles `fontWeight`, `fontStyle`, `textDecoration`.
- **Missing focus in WYSIWYG mode** — switching Raw → WYSIWYG did not focus the editor div.
- **i18n `toast_rate_limit` missing in 6 languages** — ES, DE, PT, IT, JA, ZH missing.

---

## [3.2.0.0] — 2026-04-10

### Added
- **WYSIWYG editor by default** — text displays formatted directly (bold, italic, etc.) without needing to open a separate preview.
- **Keyboard shortcuts**: `Ctrl+B` bold · `Ctrl+I` italic · `Ctrl+U` underline · `Ctrl+Shift+S` strikethrough.
- **Character counter** with visual indicators (warning at 75%, danger at 90%).
- **Rate limiting** — 2 seconds minimum between two publications (double-click protection).

### Changed
- **"Raw" toggle** — checked = raw markdown, unchecked = WYSIWYG (logic inverted compared to the old Preview toggle).
- **Bidirectional synchronization** — content is converted in real time between WYSIWYG and Raw textarea.
- **Toolbar buttons** — reflect the formatting state at the cursor position in WYSIWYG mode.

---

## [3.0.0.0] — 2026-04-10

### Changed
- **Jellyfin 10.11 migration** — `targetAbi` updated to `10.11.0.0`.
- **.NET 9 migration** — `<TargetFramework>net9.0</TargetFramework>`.
- **NuGet packages** — Jellyfin.Controller and Jellyfin.Model updated to 10.11.0.

---

## [1.8.0.0] — Unreleased

### Added
- **Internationalization — 6 new languages**: Spanish (`es`), German (`de`), Portuguese (`pt`), Italian (`it`), Japanese (`ja`), Simplified Chinese (`zh`). Language is automatically detected from `document.documentElement.lang` (attribute set by Jellyfin based on user preferences). The 65 translation keys present in FR and EN are covered in each new language: admin page (labels, placeholders, buttons, toasts, validation, confirmation dialog, toolbar, preview) and user popup.
- **`normalizeLang()` extended** — now normalizes `es*`, `de*`, `pt*`, `it*`, `ja*`, `zh*` in addition to `fr*`. Any unrecognized BCP-47 code falls back to `en` (unchanged behavior).

---

## [1.4.0.0] — Unreleased

### Added
- **Recipient selector: no user pre-selected by default** — before this version, unchecking "All users" displayed the list with all users ticked. Now no user is ticked when the list appears: the administrator composes their selection explicitly.
- **"Select all / Deselect all" bar** — when the individual user list is visible, a bar appears just above it with two buttons: "Select all" and "Deselect all". The bar automatically hides when "All users" is rechecked.
- **New i18n keys**: `target_select_all` (FR: « Tout sélectionner », EN: "Select all") and `target_deselect_all` (FR: « Tout désélectionner », EN: "Deselect all").

---

## [0.8.3.0] — 2026-02-23

### Fixed
- **Editor UX regression (0.7.0)** — since v0.7.0, the editor behavior had been modified: the textarea was always shown and the preview had become an optional panel below. This version restores the v0.5 behavior:
  - **Formatted preview shown by default** (textarea hidden) — the form starts in preview mode showing a placeholder text inviting to click.
  - **Click on the preview** switches to raw mode (textarea visible) for typing.
  - **Toolbar buttons (B/I/U/S/List)** automatically switch to raw mode before applying formatting.
  - **After publishing** (POST) → return to preview (form reset).
  - **Edit mode** (✎ Edit button) → switches to raw mode to allow direct editing.
  - **Cancel edit** → return to preview.
  - **Toggle renamed "Raw"** (was "Preview" since v0.7.0): checked = raw mode, unchecked = preview.
  - **Placeholder text** updated: "Click here or on 'Raw' to start typing…" (EN) / « Cliquez ici ou sur « Brut » pour commencer à saisir… » (FR).
  - **Styles**: `cursor:text` and `hover` (border) restored on `.ip-body-preview`.

---

## [0.7.1.0] — 2026-02-23

### Fixed
- **"Message *" label floating over the toolbar** — the Jellyfin `inputLabelUnfocused` class applies `position:absolute` to simulate Material Design behavior (label floats up on focus). In v0.7.0.0, since the textarea was now always visible, Jellyfin considered it focusable and repositioned the label to "unfocused", causing it to overlap with the formatting toolbar (B / I / U / S / List buttons). Fixed by replacing `inputLabelUnfocused` with `position:static;display:block` on `#ip-body-label` only. Title and Recipients labels keep their native floating-label behavior, since they have no element between themselves and their input field.
- **`document.addEventListener('selectionchange', …)` never removed** — this global listener was added on `document` on every config page init (`initConfigPage`). In an SPA, `initConfigPage` can be called again on every navigation, so listeners accumulated over the session. Since `selectionchange` can fire dozens of times per second, the progressive overhead could be perceived as a general slowdown. Removed: `keyup`, `mouseup`, and `touchend` on the textarea cover all useful scenarios for updating the toolbar active state.
- **Double `var targetIds` declaration in `publishMessage()`** — `var targetIds` was declared twice in the same function scope (once in the `if` branch, once in the `else` branch). Functional thanks to `var` hoisting, but flagged as an error by linters and potentially a source of confusion. The declaration is hoisted before the `if/else`.

---

## [0.7.0.0] — 2026-02-23

### Changed
- **Message editor — textarea always visible** — the previous behavior showed a formatted preview panel by default and required clicking on it (or on a toolbar button) to switch to "raw" mode (textarea). This automatic mode switching is removed. The textarea is now always shown and directly accessible for typing without any prior interaction. The formatted preview becomes an **optional panel** below the textarea, toggled by the "Preview" switch. It updates in real time on every keystroke, only when visible.
- **"Raw" toggle renamed "Preview"** — semantics inverted: toggle checked = preview panel visible; unchecked = panel hidden (default state). The string is updated in both languages (`'Aperçu'` in FR, `'Preview'` in EN). The tooltip changes from "Enable to show raw text" to "Show formatted preview of the message".
- **`PUT /InfoPopup/messages/{id}` accepts `TargetUserIds`** — user targeting can now be modified when editing an existing message. Before this version, only the title and body could be changed; recipients stayed frozen at the value defined at initial publication. `UpdateMessageRequest` gains the `List<string> TargetUserIds` field. `MessageStore.Update()` accepts the new `List<string>? targetUserIds` parameter and applies it inside the lock.
- **Edit mode — targeting restoration** — the edit form (Edit button in the table) now initializes the recipient selector with the current targeting of the message. The new `setTargetPickerIds(page, ids)` function in `ip-admin.js` handles this case: empty list → "All users" checked; partial list → "All" unchecked, targeted users individually checked.

### Fixed
- **Toolbar buttons no longer change the display mode** — previously, clicking B / I / U / S / List from preview mode forced switching to the textarea (raw mode). This disruptive behavior is removed. The buttons apply formatting directly to the textarea, which is now always visible.

---

## [0.6.2.0] — 2026-02-23

### Added
- **Multilanguage support (FR / EN)** — the plugin now detects the active Jellyfin language via `document.documentElement.lang` (set by Jellyfin Web according to user preferences) with a fallback to `navigator.language`. French and English are fully supported. All user-facing strings — admin page labels, toasts, validation errors, confirm dialog, toolbar tooltips, user popup, history accordion — are translated. Adding a new language requires only a new dictionary entry in `ip-i18n.js`.
- **`ip-i18n.js` module** — language detection (`detectLang()`) + `window.__IP.t(key, ...args)` translation function with `{0}`, `{1}` placeholder substitution.

### Changed
- **`client.js` split into 5 focused modules** — the 1,217-line monolith is replaced by a lightweight loader (`client.js`, ~50 lines) that injects modules sequentially via dynamic `<script>` tags: `ip-i18n.js` (language detection + FR/EN dictionaries), `ip-utils.js` (shared utilities `apiFetch`, `escHtml`, `renderBody`, `formatDate`), `ip-styles.js` (idempotent CSS injection `injectStyles`), `ip-admin.js` (admin configuration page: form, table, toolbar, targeting, CRUD), `ip-popup.js` (user popup + MutationObserver, auto-starts).
- **`window.__IP` namespace** — all inter-module functions are exposed via `window.__IP` instead of closed-over variables. Each module is an IIFE that reads and extends `window.__IP`.
- **Controller — generic JS module endpoint** — `GET /InfoPopup/client.js` is replaced by `GET /InfoPopup/{module}.js` with a whitelist (`client.js`, `ip-*.js`). The old dedicated action is removed; a single action now serves all modules.
- **`configurationpage.html`** — static text remains in French as default (overridden by `applyStaticTranslations()` at runtime). Added `id` attributes to all translatable elements (`#ip-subtitle`, `#ip-title-label`, `#ip-body-label`, `#ip-recipients-label`, `#ip-history-title`, `#ip-select-all-label`, `#ip-delete-btn-label`).
- **`Jellyfin.Plugin.InfoPopup.csproj`** — `ip-i18n.js`, `ip-utils.js`, `ip-styles.js`, `ip-admin.js`, `ip-popup.js` added as `<EmbeddedResource>`.

### Fixed
- **Singular/plural in selection counter and deletion toasts** — previously hardcoded French pluralization rules (`'s'` suffix). Now uses dedicated i18n keys (`sel_count_singular`, `sel_count_plural`, `toast_deleted_s`, `toast_deleted_p`, `confirm_delete_s`, `confirm_delete_p`) per language.
- **`(sans nom)` hardcoded in `fetchUsers()`** — replaced by `t('target_unknown')`.

---

## [0.5.1.0] — 2026-02-23

### Added
- **Real-time formatted preview in the input area** — the "Message" field now displays formatted rendering by default (`**bold**`, `_italic_`, `__underline__`, `~~strikethrough~~`, lists). A `Raw` toggle switch in the formatting toolbar allows switching to raw markup input. Clicking the preview directly switches to raw mode. Formatting buttons (B, I, U, S, List) automatically switch to raw mode before applying formatting. After publishing or cancelling, the form returns to preview mode.
- **Context detection in the toolbar** — B/I/U/S buttons are now "pressed" (visual active state) when the cursor is inside a pair of markers, whether there is a selection or not. Compatible with Jellyfin 10.10–10.11.
- **Smart format removal** — clicking an active button removes the markers surrounding the cursor, even without a prior selection. The old behavior used to add duplicate markers.

### Changed
- `MessageStore.Update()` — returns `PopupMessage?` (snapshot captured in the lock) instead of `bool`.
- `InfoPopupController.UpdateMessage()` — uses the snapshot returned by `Update()`, removes the second `GetById()` call.
- `applyFormat()` — refactored via `getFormatBoundsAroundCursor()`: clean removal of markers around the cursor, end of `****` accumulation.
- `initConfigPage()` — `selectionchange` / `keyup` / `mouseup` / `touchend` listeners on the textarea to keep the toolbar state continuously up to date.
- `client.js` — added `updatePreview(page)` and `setPreviewMode(page, on)`; `enterEditMode` switches to raw, `exitEditMode` returns to preview, `publishMessage` (POST) returns to preview after success. `input` dispatch after each formatting action to immediately sync the preview.
- `configurationpage.html` — removed the `<style>` block (migrated to `injectStyles()`), added toggle switch and preview div, "Select all" checkbox as native checkbox.

### Fixed
- **TOCTOU in `UpdateMessage`** — after `_store.Update()`, the controller was calling `_store.GetById(id)!` (null-forgiveness operator) to retrieve the updated message. Between the two calls, a concurrent deletion could have produced a `NullReferenceException`. `MessageStore.Update()` now returns a `PopupMessage?` snapshot captured inside the lock, eliminating the race condition. The return type changes from `bool` to `PopupMessage?`.
- **`usersCache` never invalidated** — the user list was loaded once and kept indefinitely. Users created in Jellyfin during the session were not visible in the targeting selector. A 5-minute TTL is now applied (`usersCacheAt`).
- **Admin styles lost on SPA navigation** — the table, badges, toast, recipient selector and formatting toolbar styles were defined in the `<style>` block of `configurationpage.html`. This block disappears during SPA transitions (HTML is reloaded via `innerHTML`). All these styles are now in `injectStyles()` and persist in `<head>` for the entire session.
- **`emby-checkbox` on the "Select all" checkbox** — replaced by a native `<input type="checkbox">` with inline `accent-color`, consistent with the other checkboxes in the admin table.

---

## [0.5.0.0] — 2026-02-23

### Added
- **`GET /InfoPopup/popup-data` endpoint** — returns in a single call everything the popup needs: unread messages with full body + history as summaries. Replaces the old N+1 pattern that generated up to `2 + N + M` HTTP requests to display a popup.
- **`POST /InfoPopup/messages/delete` endpoint** (admin) — replaces `DELETE /messages` with body. Some proxies and firewalls silently reject `DELETE` requests with a body. The old `DELETE` endpoint is removed.
- **`DTOs/` folder** — `MessageDtos.cs` groups all DTOs (`CreateMessageRequest`, `DeleteMessagesRequest`, `UpdateMessageRequest`, `MarkSeenRequest`, `MessageSummary`, `MessageDetail`, `PopupDataResponse`). They were previously defined at the top of the controller file.

### Changed
- `checkForUnseenMessages` now uses `GET /InfoPopup/popup-data` (1 request).
- `deleteSelected` in `client.js` calls `POST /InfoPopup/messages/delete` instead of `DELETE`.
- `markAllSeen` returns a `Promise` to allow `.finally()` in `close()`.
- Global JS state variables grouped at the top of the IIFE.

### Security
- **Access control on `GET /messages` and `GET /messages/{id}`** — these endpoints were accessible to any authenticated user, exposing the full list of messages including their `TargetUserIds` and bodies, regardless of targeting. Now: admins see everything; users only see messages intended for them. `GET /messages/{id}` returns `404` (not `403`) if the user is not targeted, to avoid revealing the existence of a non-intended message.
- **Empty UserId → explicit 401** — when the `Jellyfin-UserId` claim was absent from the token, the code was silently returning an empty ID that created a ghost record in `infopopup_seen.json`. All user endpoints now explicitly return `401 Unauthorized` if the ID is absent.

### Fixed
- **Popup/marking race condition** — `popupActive` was reset to `false` immediately on popup close, before the `POST /seen` had been confirmed by the server. `popupActive` now stays `true` until the `.finally()` of `markAllSeen()`.
- **`popupActive` guard in `schedulePopupCheck`** — without this guard, fast navigation after closing could re-trigger a network check while the marking was still in transit.
- **Config reference captured in the lock** (`MessageStore`) — `Plugin.Instance?.Configuration` was accessed via a property without local assignment inside the locked block. The reference is now captured with `var cfg = GetConfig()` inside each block.
- **Memory cache in `SeenTrackerService`** — `ReadStore()` was reading the JSON file from disk on every call, including under `ReadLock`. A `_cache` is now maintained in memory and invalidated only on write.
- **Admin toast accessibility** — `aria-live="polite"` and `role="status"` added to the toast during config page init and on each display.

---

## [0.4.0.0] — 2026-02-23

### Added
- **Message body formatting** — lightweight syntax rendered client-side as secure HTML (escHtml() always applied before any replacement, XSS impossible): `**text**` → bold, `_text_` → italic, `__text__` → underline, `~~text~~` → strikethrough, lines prefixed with `- ` → bulleted list with indentation (`<ul><li>`). Rendering active in the user popup, in the history, and in the admin table expand rows.
- **Formatting toolbar** above the admin textarea — five buttons (B, I, U, S, • List) that wrap the current selection. Each button is a toggle: pressing it a second time removes the formatting.
- **Edit existing messages** — "✎ Edit" button on each row of the admin table. Loads the message into the form, switches to edit mode (section title + button label change, "Cancel" button appears). Uses `PUT /InfoPopup/messages/{id}`: the ID is preserved, view tracking is not affected.
- **`PUT /InfoPopup/messages/{id}` endpoint** (admin only) — updates title and body without touching the ID or `infopopup_seen.json`.

### Changed
- `MessageStore` — new `Update(id, title, body)` method.
- `renderMessages` — Actions column + expand rows colSpan increased from 4 to 5.
- `publishMessage` — branches to PUT or POST based on `editState.id`.
- `buildHistoryBlock` — immediate display if body is pre-loaded, lazy load as fallback.

### Fixed
- **Empty body in popup history** — already-seen messages passed to `buildHistoryBlock` were `MessageSummary` objects without a `body`. `checkForUnseenMessages` now pre-loads the full detail of each seen message before opening the popup.
- **Broken admin table formatting** — CSS for `.ip-row-expand`, `.ip-row-chev`, `.ip-edit-btn` was absent when navigating directly to the config page. `initConfigPage()` now calls `injectStyles()` first.

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
- Login popup via MutationObserver (SPA-compatible, Jellyfin 10.10–10.11).
- Show once per user — server-side tracking, no localStorage.
- Collapsible history of past messages.
- Admin page: publishing, multiple selection, confirmed deletion.
- Full deletion: disappears immediately for all users.
- Automatic injection of `client.js` via `ScriptInjectionMiddleware`.
- Targeting by specific users or broadcast to everyone.
- XSS security: `textContent` exclusively, never `innerHTML`.
- Jellyfin theme integration.
