# CLAUDE.md — Working directives for Claude

> This file defines **how Claude must behave** when working on **jellyfin-info-popup-extention**.
> It is read with priority before any intervention on the code.

---

## 1. Project context

**jellyfin-info-popup-extention** is a Jellyfin plugin that allows administrators to broadcast popup messages to users when they log in.

### Naming — absolute rule

| Context | Value |
|---------|-------|
| GitHub repo / root folder | `jellyfin-info-popup-extention` |
| .NET assembly / C# namespace | `Jellyfin.Plugin.InfoPopup` |
| Display name in Jellyfin dashboard | `Info Popup` |
| REST API route prefix | `/InfoPopup` |
| View persistence file | `infopopup_seen.json` |
| Reply persistence file | `infopopup_replies.json` |
| Client-side CSS prefix and DOM IDs | `.ip-` / `#infopopup-` |
| JS double-execution guard | `window.__infoPopupLoaded` |
| .NET log message prefix | `InfoPopup:` |
| Plugin GUID (stable depuis v3.7.2.0 — voir pitfalls) | `ceeb3040-9fe5-451f-ac05-8587ea3c3718` |

### Stack
- Backend: C# / .NET 9, `IBasePlugin`, `ControllerBase`, ASP.NET Core DI
- Frontend: Vanilla JavaScript ES2020, zero framework, zero external dependency
- Persistence: XML for messages/settings (`BasePluginConfiguration`) + JSON for views (`infopopup_seen.json`) + JSON for replies (`infopopup_replies.json`)
- Build / release: **GNU Make** + Bash scripts + GitHub CLI (`gh`)

---

## 2. Repository structure

```
jellyfin-info-popup-extention/
├── Makefile
├── version.json                      ← SINGLE SOURCE OF TRUTH for version
├── manifest.json
├── CHANGELOG.md
├── CLAUDE.md                         ← this file
├── README.md
├── .gitignore
├── .env.make.example
├── scripts/
│   ├── bump_version.sh
│   ├── update_manifest.sh
│   └── extract_changelog.sh
├── assets/
│   └── icon.png
├── dist/
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
└── Jellyfin.Plugin.InfoPopup/
    ├── Jellyfin.Plugin.InfoPopup.csproj
    ├── Plugin.cs
    ├── PluginServiceRegistrator.cs
    ├── Configuration/PluginConfiguration.cs
    ├── Models/{PopupMessage,SeenRecord,MessageReply}.cs
    ├── DTOs/MessageDtos.cs            ← request/response DTOs (separated from controller)
    ├── Services/{MessageStore,SeenTrackerService,ReplyStoreService}.cs
    ├── Controllers/InfoPopupController.cs
    ├── Middleware/{ScriptInjectionMiddleware,ScriptInjectionStartupFilter}.cs
    └── Web/
        ├── client.js                  ← loader séquentiel (~50 lignes)
        ├── ip-i18n.js                 ← détection langue + dictionnaires FR/EN
        ├── ip-utils.js                ← utilitaires partagés
        ├── ip-styles.js               ← CSS idempotent dans <head>
        ├── ip-admin.js                ← page de configuration admin
        ├── ip-popup.js                ← popup utilisateur + MutationObserver
        ├── ip-user.js                 ← page Messages utilisateur (overlay plein écran, tous users)
        ├── configurationpage.html
        └── usermessagespage.html
```

---

## 3. Files managed exclusively by the Makefile — NEVER touch manually

> **These files must NEVER be edited by hand or by Claude.**
> They are fully managed by the Makefile and its scripts. Any manual edit
> will desynchronize the version, the checksum, or the git history and
> will break the Jellyfin plugin installation.

| File | Managed by | What it does |
|------|-----------|--------------|
| `version.json` | `make bump-*` via `scripts/bump_version.sh` | Increments major/minor/patch |
| `<Version>` in `.csproj` | `make bump-*` via `scripts/bump_version.sh` | Kept in sync with `version.json` |
| `manifest.json` | `make manifest-update` via `scripts/update_manifest.sh` | Prepends a new version entry with the **real MD5 downloaded from GitHub** |
| `dist/infopopup_*.zip` | `make pack` | Release ZIP built from the compiled DLL |

### Why the MD5 in manifest.json must come from GitHub, not locally

`manifest.json` contains the MD5 that Jellyfin will verify against the ZIP it downloads from GitHub Releases. The local ZIP and the GitHub-served ZIP could differ (CDN processing, re-upload, CI interference). `make manifest-update` downloads the ZIP from GitHub and computes the checksum from what Jellyfin will actually receive. **Never compute or paste an MD5 manually.**

### What `make bump-*` modifies (and only that)

`scripts/bump_version.sh` touches exactly two things:
1. `version.json` — increments the appropriate number, resets lower components
2. `<Version>X.Y.Z.0</Version>` in `Jellyfin.Plugin.InfoPopup.csproj` — sed replace

It does **not** touch `manifest.json`, `CHANGELOG.md`, or any source file.

### What `make manifest-update` modifies (and only that)

`scripts/update_manifest.sh` touches exactly one thing:
- `manifest.json` — prepends a new entry to `versions[]` (or replaces it if the version already exists), with the checksum fetched from GitHub

It does **not** touch `version.json`, `.csproj`, or any source file.

---

## 4. Makefile workflow — Complete reference

```bash
make                   # Help + Jellyfin repository URL
make check             # Verify dotnet, git, jq, gh CLI, gh auth
make version           # Display current version and associated URLs
make verify            # Check that the GitHub ZIP matches the manifest checksum

make build             # Compile in Debug
make build-release     # Compile in Release (no ZIP)
make pack              # Compile Release + create ZIP in dist/
make clean             # Delete bin/, obj/, dist/*.zip

make bump-patch        # 0.6.0 → 0.6.1  (version.json + .csproj only)
make bump-minor        # 0.6.0 → 0.7.0  (version.json + .csproj only)
make bump-major        # 0.6.0 → 1.0.0  (version.json + .csproj only)

make release-patch     # Full release: bump-patch → pack → push → tag → gh-release → manifest-update → push
make release-minor     # Full release: bump-minor → …
make release-major     # Full release: bump-major → …
make release-hotfix    # Recompile + re-upload ZIP on existing release, no version bump
```

**Guaranteed sequence inside `release-*`:**
1. `bump-*` → `version.json` + `<Version>` in `.csproj`
2. `pack` → `dist/infopopup_X.Y.Z.0.zip`
3. `push` → commit + push code (without manifest yet)
4. `tag` → create and push git tag `vX.Y.Z.0`
5. `gh-release` → create GitHub Release + upload ZIP
6. `manifest-update` → download ZIP from GitHub, compute real MD5, prepend to `manifest.json`
7. `push` → commit + push manifest

**`release-hotfix` sequence** (same version, ZIP replacement only):
1. `pack` → recompile
2. `gh-release-upload` → delete old asset (invalidates CDN cache) + upload new ZIP
3. `manifest-update` → recompute MD5 from the new GitHub ZIP
4. `push` → commit + push manifest

---

## 5. Architecture — Critical points

### Mandatory dual-layer SPA
Jellyfin-Web is a SPA. All client UI goes through the JS modules injected into `index.html`. No server-side HTML rendering.

### Automatic injection via middleware
`ScriptInjectionMiddleware` intercepts `/`, `/web`, `/web/`, `/web/index.html` and injects `<script src="/InfoPopup/client.js"></script>` before `</body>`.

### Modular JS architecture (v0.6+)
`client.js` is a lightweight loader (~50 lines) that sequentially injects `ip-i18n.js`, `ip-utils.js`, `ip-styles.js`, `ip-admin.js`, `ip-popup.js`, `ip-user.js` via dynamic `<script>` tags with `load` event chaining. All inter-module communication goes through the `window.__IP` namespace (IIFE pattern: `(function(ns){ ... }(window.__IP = window.__IP || {}))`).

### i18n — language detection
`ip-i18n.js` detects the language from `document.documentElement.lang` (set by Jellyfin Web based on user settings), with `navigator.language` as fallback. Normalized via `normalizeLang()` to one of `'fr'`, `'es'`, `'de'`, `'pt'`, `'it'`, `'ja'`, `'zh'` — falls back to `'en'` for any unrecognized code. `window.__IP.t(key, ...args)` is the single translation entry point. `applyStaticTranslations(page)` in `ip-admin.js` updates all static elements of `configurationpage.html` at init time.

**Supported languages (8 total):** English (`en`, default), French (`fr`), Spanish (`es`), German (`de`), Portuguese (`pt`), Italian (`it`), Japanese (`ja`), Chinese Simplified (`zh`). Every translation key present in `en` must exist in all 8 dicts (≈146 keys as of v3.7.0.0, including the role/bulk-permission keys added that release). **Verify parity programmatically** — do not trust a hard-coded total, it has repeatedly drifted from the actual code.

**Jellyfin 10.11 React Router timing issue** — in 10.11, `document.documentElement.lang` is not set when the module first loads because the `localusersignedin` event fires before the subscriber is registered (confirmed by jellyfin-web PR #4306). Two complementary mechanisms handle this:
1. **`MutationObserver`** on `document.documentElement`: whenever Jellyfin sets or changes the `lang` attribute (even with a delay), `_lang` and `_dict` are updated immediately.
2. **Lazy re-detection in `t()`**: if `_lang` was resolved from `navigator.language` (unreliable fallback), every call to `t()` re-checks `document.documentElement.lang` until it gets a value. After the first successful read from `html.lang`, the flag `_resolvedFromHtml` is set to `true` and re-checks stop.

Both mechanisms are idempotent and stop once a reliable source (`html.lang`) is available. Dynamic elements (popup, toasts, table) always use the correct language because they call `t()` after the user is signed in. Static elements from `applyStaticTranslations(page)` are refreshed on each SPA navigation to the config page (`initConfigPage` re-runs).

### Sidebar entries (v3.3+ / v3.6.2+)
**Admin config page**: `Plugin.cs` implements `IHasWebPages` and returns a `PluginPageInfo` with `EnableInMainMenu = true`, `MenuSection = "server"`, `MenuIcon = "notifications"`. Jellyfin reads `GET /System/Configuration/Pages` and automatically adds the entry to the sidebar for admin users.

**User messages page (v3.6.2+, overhauled v3.7.0.0)**: `EnableInMainMenu = false` — Jellyfin's `IHasWebPages` sidebar mechanism is admin-only, so the user page entry is injected via JavaScript (`ip-user.js:injectSidebarEntry()`).

The `configurationpage` route is nested under `ConnectionRequired level='admin'`, so it **cannot** serve a page to non-admins (a normal user clicking a link to it is redirected to the home page — this was issue #1). Therefore, since v3.7.0.0, the user page is **not** a real route: the sidebar link calls `ip-user.js:showUserPage()`, which builds a full-screen overlay (`.ip-user-overlay`, `z-index:99998`) directly in the DOM with the Inbox / Send / Sent tabs. `closeUserOverlay()` tears it down; it is also closed on `Escape`, `hashchange` and `popstate`. The `_overlayOpen` flag gates `checkUserPage()`. The overlay works for every authenticated user regardless of admin status.

**Back button & sidebar restoration (v3.7.5.0)** — the overlay's back button reuses Jellyfin's native `paper-icon-button-light` component (icon-only `arrow_back`), **not** a custom button. `showUserPage()` closes the open drawer (removes `mainDrawerOpen` from body and `.mainDrawer`, clicks the MUI backdrop) but **must NOT add `hide`** to `.mainDrawer` — the overlay covers it anyway, and a dangling `hide` left the sidebar broken after closing. `closeUserOverlay()` defensively removes `hide` from `.mainDrawer` on teardown. General rule (user directive): **reuse native Jellyfin components/classes as much as possible** instead of custom ones.

**Dual sidebar injection** — `injectSidebarEntry()` tries `injectIntoClassicSidebar()` (classic layout: `.mainDrawer-scrollContainer`, `navMenuOption` classes) first, then falls back to `injectIntoMuiSidebar()` (Jellyfin 10.11 experimental React/MUI layout: `.MuiDrawer-paper` / `[class*="ResponsiveDrawer"]`, MUI list item markup). Idempotent via a `#ip-nav-messages` existence check; re-injected automatically by the MutationObserver if Jellyfin rebuilds the sidebar on SPA navigation. The `usermessagespage.html` embedded resource is kept for the admin-side fallback only.

### Client settings (v3.3+)
`ip-popup.js` calls `GET /InfoPopup/client-settings` at startup (before starting the MutationObserver). This endpoint is `[AllowAnonymous]` and returns `PopupEnabled`, `PopupDelayMs`, `MaxMessagesInPopup`, `AllowReplies`, `HistoryEnabled`. These values replace hard-coded constants. Default values are used if the call fails.

**`PopupDelayMs` semantics (v3.6+)**: this setting is the **auto-close countdown duration** in ms, displayed as an animated progress bar in the popup. `0` = no auto-close (user must click Close manually). The delay before the popup *appears* after navigation is hardcoded at `800ms` in `schedulePopupCheck` — it is **no longer driven by `PopupDelayMs`**. Default: `0` (infinite display).

### Admin page tab system (v3.3+)
`configurationpage.html` has four tabs: **Messages** (existing content), **Paramètres** (settings form), **Réponses** (reply viewer), **Droits** (permissions manager). `initTabs(page)` in `ip-admin.js` handles tab switching (show/hide panels). `initSettingsTab(page)` loads `GET /InfoPopup/settings` and binds the save button. `loadReplies(page)` is called when the Réponses tab is opened; `loadPermissions(page)` when the Droits tab is opened.

### « Mes messages » utilisateur — Edit/Delete/Réponses inline (v3.8.0.0)
L'overlay `#infoPopupUserPage` permet désormais à l'utilisateur (selon ses droits) de **modifier** et **supprimer** ses messages depuis l'onglet Sent, et à l'admin de modifier/supprimer depuis l'Inbox. Les boutons sont conditionnés par `_userPerms` (chargé via `/permissions/me`) : `canEditOwn`/`canDeleteOwn` pour Sent, `canEditOthers`/`canDeleteOthers` pour Inbox. L'édition est inline (textarea + Enregistrer / Annuler) ; la suppression utilise `confirm()` natif + `POST /messages/{id}/soft-delete`. Les **réponses** s'affichent inline : la réponse de l'utilisateur sous chaque message de l'Inbox (`msg.myReply`), la liste des réponses reçues sous chaque message Sent (`msg.replies`) — populés serveur via `ToDetailForUser(message, currentUserId)` dans GetPopupData, GetSentMessages et GetMessage.

### Poll léger temps réel + notifications (v3.8.0.0)
`ip-popup.js` lance un `setInterval(15s)` qui déclenche au plus 1 fois par minute : (1) un `pollPopup()` qui appelle `checkForUnseenMessages()` si la popup n'est pas active, la page admin pas ouverte et l'onglet visible — `lastCheckedPath = null` avant pour court-circuiter le garde de path ; (2) un `pollRepliesReceived()` qui appelle `GET /InfoPopup/replies/received`, compare aux IDs persistés dans `localStorage` (`__ip_seen_reply_ids`, capé à 500 entrées), et affiche un **corner toast** (`#ip-toast-area`, position fixed bottom-right) pour chaque réponse non encore notifiée. Au premier chargement (set vide), on marque les réponses comme « déjà vues » sans notifier (sinon flot d'anciens messages). Un `visibilitychange` déclenche les deux polls immédiatement quand l'onglet redevient visible.

### Permissions (Droits) tab UI (v3.7.0+, reworked v3.7.5.0)
`loadPermissions(page)` renders a toolbar + one card per user (`buildPermCard`) + a single global save bar. **Save is global** (v3.7.5.0): one **« Enregistrer les droits »** button at the bottom issues a parallel `PUT /permissions/{userId}` per card via `Promise.all` — there are **no** per-card save buttons anymore. The toolbar has a per-card selection checkbox plus **tout sélectionner / désélectionner / inverser** and an **« Appliquer à la sélection »** action that stages a role + daily limits onto the selected cards *in memory* (persisted only by the global save). `/permissions/bulk` is no longer called by the client (kept server-side). Each card's role `<select>` and the bulk role `<select>` go through `enhanceSelect()` (see pitfalls). Programmatic `roleSel.value = …` must be followed by `roleSel.__ipSync()` so the custom dropdown label updates.

### Custom dropdowns: `enhanceSelect()` (v3.7.5.0)
Native `<select>` open lists can't be themed (`<option>` ignores most CSS). `enhanceSelect(sel)` in `ip-admin.js` hides the native `<select>` (`.ip-sel-native`, kept for value/state) and renders a themed button + listbox (`.ip-sel*` classes in `ip-styles.js`). It dispatches a native bubbling `change` so all existing `sel.value` reads and `change` listeners keep working. Exposes `sel.__ipSync()` (refresh label after a programmatic `.value=`) and `sel.__ipRefresh()` (rebuild options). The outside-click listener is added on open and removed on close (no SPA leak).

### Reply system (v3.3+)
`ReplyStoreService` persists replies in `infopopup_replies.json` (same architecture as `SeenTrackerService`: memory cache, `ReaderWriterLockSlim`, `ReadStore()`/`WriteStore()`). Cascade delete: when a message is deleted via `POST /InfoPopup/messages/delete`, `ReplyStoreService.DeleteByMessageIds()` is called in the controller — NOT in `MessageStore` (to avoid circular dependency). Reply zone is added to the popup if `_settings.allowReplies === true`. Users can reply multiple times to the same message. `POST /InfoPopup/messages/{id}/reply` returns 403 if `AllowReplies = false`.

### Login detection: MutationObserver only
`document.body` observed with `{ childList: true, subtree: true }` + `hashchange` and `popstate` listeners. `lastCheckedPath`, `checkScheduled` and `setTimeout(800)` (fixed 800ms) deduplicate calls.
**Mandatory guards**: `schedulePopupCheck` returns immediately if `#infoPopupConfigPage` is in the DOM, if `popupActive === true`, or if `_settings.popupEnabled === false`.

### View tracking: 100% server-side
`infopopup_seen.json` via `SeenTrackerService`. Never `localStorage` / `sessionStorage` / cookie.

### Message edit: stable ID, editable targeting
`PUT /InfoPopup/messages/{id}` updates title, body and `TargetUserIds` without changing the ID. `infopopup_seen.json` is not touched. A user who had already seen the message will not see it again after editing, even if the targeting changes.

`MessageStore.Update()` returns `PopupMessage?` (snapshot captured inside the lock) and not `bool`. The controller uses this snapshot directly — never add a `GetById()` call after `Update()` (TOCTOU).

### Formatted preview (v0.7)
The textarea (`#ip-body`) is **always visible**. The formatted preview is an optional panel (`#ip-body-preview`) displayed **below** the textarea, toggled by the "Aperçu / Preview" switch.

`setPreviewMode(page, on)` controls only the panel visibility, never the textarea:
- **`on = true`**: `#ip-body-preview` visible, `updatePreview(page)` called to sync content.
- **`on = false`**: `#ip-body-preview` hidden. Textarea untouched.

Mandatory rules:
- The textarea is **never hidden** — do not set `bodyEl.style.display = 'none'` anywhere.
- `updatePreview(page)` is called on `input` events **only when the panel is visible** (guard: `preview.style.display !== 'none'`).
- `updatePreview(page)` must be called after any programmatic write to `bodyEl.value` (`enterEditMode`, `exitEditMode`, post-publish reset), **regardless** of panel visibility, so that the panel is up to date if the user opens it afterwards.
- Format toolbar buttons apply their action directly to the textarea without calling `setPreviewMode`. They call `updatePreview(page)` afterwards to sync the panel content.
- Initial state on page load: `setPreviewMode(page, false)` — panel hidden, textarea ready.

### Edit mode and targeting (v0.7)
`enterEditMode(page, msg, editState)` receives the full message object including `targetUserIds`.
It calls `setTargetPickerIds(page, msg.targetUserIds)` to restore the targeting selector:
- Empty list → "All users" checkbox checked, individual user list hidden.
- Non-empty list → "All users" unchecked, individual list shown with the relevant users checked.

`exitEditMode(page)` calls `resetTargetPicker(page)` to restore the "All users" default.
`publishMessage` in edit mode (`PUT`) reads `getSelectedTargetIds(page)` and includes the result in `targetUserIds` of the request body.

`setTargetPickerIds(page, ids)` is the **only** function that may set individual checkboxes programmatically. Never duplicate this logic elsewhere.

### Access control on messages
- **Admins** (`RequiresElevation`): see all messages on all endpoints.
- **Users**: `GET /messages` and `GET /messages/{id}` filter by `TargetUserIds`. A non-targeted message returns `404` (not `403`) to avoid revealing its existence.
- **Missing UserId**: all user endpoints return `401 Unauthorized` if the `Jellyfin-UserId` claim is absent from the token.

### Single popup call via /popup-data
`GET /InfoPopup/popup-data` returns in a single call:
- `unseen`: unread messages with full body
- `history`: summaries of already-seen messages (body loaded lazily on click)

Never revert to the old pattern that chained `/unseen` + N×`/messages/{id}` + `/messages` + M×`/messages/{id}`.

### Popup/marking race condition
`popupActive` must remain `true` for the entire duration between clicking "Close" and the resolution of the `POST /seen` on the server side. Setting it back to `false` happens exclusively in the `.finally()` of `markAllSeen()`. Never set `popupActive = false` before that.

### Deletion: POST /messages/delete
Use `POST /InfoPopup/messages/delete` and not `DELETE /messages` with a body. Some proxies and firewalls silently reject the body on DELETE.

### SeenTrackerService cache
`SeenTrackerService` maintains an in-memory cache `_cache` of the JSON file. It is invalidated only on write (`WriteStore`). Do not call `File.ReadAllText` inside a lock without going through `ReadStore()`.

### Config reference in MessageStore
In `MessageStore`, always capture `var cfg = GetConfig()` inside the locked block. Never call `GetConfig()` multiple times in the same operation: if Jellyfin reloads the config between two calls, the reference changes and modifications could be lost.

### Body formatting: IP markup
Supported syntax: `**bold**`, `_italic_`, `__underline__`, `~~strikethrough~~`, `- list` lines.
Rendering pipeline in `renderBody()`:
1. `escHtml()` on each line or token — **raw text is always escaped first**
2. Regex replacement on the escaped text → whitelisted HTML tags (`<strong>`, `<em>`, `<u>`, `<s>`, `<ul>`, `<li>`)
3. Result injected via `innerHTML` — XSS impossible because no user data passes through unescaped

**Never reverse the `escHtml` / replacement order.**

### injectStyles() — scope and idempotence
`injectStyles()` injects all global CSS into `<head>` (popup, history, confirm dialog, admin table). It is idempotent (guard on `#infopopup-styles`).
**Rule**: any JS component that creates elements styled by these classes must ensure that `injectStyles()` has been called before. `initConfigPage()` calls it first.

### SPA-persistent styles
All CSS for elements dynamically added to `<body>` must be in `injectStyles()`. The `<style>` blocks in `configurationpage.html` do not persist across SPA transitions.

### Jellyfin JSON serialization
Jellyfin may serialize in camelCase or PascalCase. Always `msg.field || msg.Field || ''` for all fields read from the API.

### Checkboxes in the admin table
Use native `<input type="checkbox">` with inline `accent-color`. Never use `emby-checkbox` in dynamically generated HTML (hides the native input, zero click area if `<span>` is empty).

---

## 6. REST API — Complete reference

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/InfoPopup/messages` | user/admin | Summaries filtered by targeting (admin: all) |
| GET | `/InfoPopup/messages/{id}` | user/admin | Full detail (404 if not targeted and non-admin) |
| POST | `/InfoPopup/messages` | **admin** | Create a message |
| PUT | `/InfoPopup/messages/{id}` | **admin** | Edit title, body and targeting (stable ID, views preserved) |
| POST | `/InfoPopup/messages/delete` | **admin** | Delete (body `{ ids: [...] }`) — cascades to replies |
| GET | `/InfoPopup/popup-data` | user | Unseen + history in a single call |
| GET | `/InfoPopup/unseen` | user | Unread messages (compatibility, prefer popup-data) |
| POST | `/InfoPopup/seen` | user | Mark as seen (body `{ ids: [...] }`) |
| GET | `/InfoPopup/settings` | **admin** | Read plugin settings (`PluginSettingsDto`) |
| POST | `/InfoPopup/settings` | **admin** | Save plugin settings (body: `PluginSettingsDto`) |
| GET | `/InfoPopup/client-settings` | anonymous | Client-safe subset of settings (`ClientSettingsDto`) — called by `ip-popup.js` at startup |
| POST | `/InfoPopup/messages/{id}/reply` | user | Submit a reply — 403 if `AllowReplies=false`, 404 if message not targeted |
| GET | `/InfoPopup/messages/{id}/replies` | sender/admin | All replies for a message (autorisé pour l'expéditeur depuis v3.8.0.0 — pas seulement admin) |
| GET | `/InfoPopup/replies/received` | user | Réponses récentes reçues par l'utilisateur (= réponses à ses messages envoyés). Optionnel `?since=ISO`. Utilisé par le poll des notifications toast (v3.8.0.0) |
| GET | `/InfoPopup/replies` | **admin** | All replies grouped by message (`List<MessageRepliesDto>`) |
| DELETE | `/InfoPopup/replies/{replyId}` | **admin** | Delete one reply |
| POST | `/InfoPopup/messages/{id}/replies/delete` | **admin** | Delete all replies for a message |
| GET | `/InfoPopup/permissions` | **admin** | All per-user permissions (`List<UserPermissionDto>`) |
| GET | `/InfoPopup/permissions/me` | user | Current user's own permissions |
| PUT | `/InfoPopup/permissions/{userId}` | **admin** | Update one user's permissions (role flags + daily limits) |
| POST | `/InfoPopup/permissions/bulk` | **admin** | Apply the same permissions to many users at once (body: `BulkUpdatePermissionsRequest` with `UserIds[]`) |
| GET | `/InfoPopup/{module}.js` | anonymous | JS modules — whitelist: `client.js`, `ip-i18n.js`, `ip-utils.js`, `ip-styles.js`, `ip-admin.js`, `ip-popup.js`, `ip-user.js` |

---

## 7. Business rules — Non-negotiable

| # | Rule |
|---|------|
| R1 | A **deleted message disappears permanently and everywhere** — popup AND history, for all users. |
| R2 | A message is displayed **only once** per user (server-side tracking). |
| R3 | The popup displays **all** unread messages simultaneously — the most recent as the main one or as the first card. |
| R4 | On close, **all** unread messages are marked as seen in batch. `popupActive` stays `true` until server confirmation. |
| R5 | POST/PUT/POST(delete) `/InfoPopup/messages` → **admin only** (`RequiresElevation`). |
| R6 | Cleanup of orphans in `infopopup_seen.json` → **lazy**, on next access. |
| R7 | `escHtml()` **always before** formatting replacements. Never raw user data in `innerHTML`. |
| R8 | `PUT /InfoPopup/messages/{id}` **never** modifies the ID or `infopopup_seen.json` — an edited message (including its targeting) is not re-displayed to users who had already seen it. Title, body and `TargetUserIds` can all be changed in a single `PUT`. |
| R9 | `GET /messages` and `GET /messages/{id}` filter by `TargetUserIds` for non-admins. Return `404` (not `403`) if not targeted. |
| R10 | All user endpoints return `401` if the `Jellyfin-UserId` claim is absent. Never fall back to `string.Empty`. |

---

## 8. Code modification procedure

### Before
1. Read the file in its entirety
2. Identify all impacted files (API change → `client.js` + `configurationpage.html` + `README.md`)
3. Verify consistency with rules R1–R10

### During
- Preserve XML C# comments on public members
- **Never** change the GUID (it must stay `ceeb3040-9fe5-451f-ac05-8587ea3c3718`). The *only* time it was ever changed was v3.7.2.0, to escape a collision with the default template GUID — see the ⛔ pitfall below. Changing it orphans every existing install, so never do it casually.
- **Never** manually edit `version.json` or `<Version>` in the `.csproj` → use `make bump-*`
- **Never** manually edit `manifest.json` → use `make manifest-update` (or a full `make release-*`)
- **Never** manually edit `dist/infopopup_*.zip` or compute/paste an MD5 checksum → the Makefile downloads the ZIP from GitHub and computes the real checksum

### After
- Verify rules R1–R10
- **Write the `CHANGELOG.md` entry for the new version before any release** — see section 10 for the mandatory format. The entry must exist in `CHANGELOG.md` *before* the human runs `make release-*`, because `make gh-release` and `make manifest-update` extract it at release time. A missing or malformed entry means GitHub Release notes and the Jellyfin plugin description will be empty or wrong.
- Update `README.md` and `CLAUDE.md` if the architecture or a rule changes
- **Do not** run `make bump-*` or `make release-*` — that is the human's responsibility

---

## 10. Changelog — mandatory rules

### Format

Every release entry **must** follow this exact format:

```markdown
## [X.Y.Z.0] — YYYY-MM-DD

### Added / Changed / Fixed / Security / Removed
- **Short title** — one-sentence explanation.
```

**Critical constraints:**

| Rule | Why |
|------|-----|
| Version in **4 digits** (`X.Y.Z.0`) | `extract_changelog.sh` and `update_manifest.sh` search for `## [X.Y.Z.0]` — 3-digit versions are never found |
| Entry written **before** `make release-*` | `make gh-release` calls `extract_changelog.sh` at that moment to set GitHub release notes; `make manifest-update` calls `update_manifest.sh` which embeds the entry in `manifest.json` as the Jellyfin description |
| **≤ 20 lines** of content per entry | `update_manifest.sh` truncates at `head -20` — anything beyond is silently dropped from the Jellyfin description |
| No trailing blank lines inside the entry | The awk extractor stops at the next `## ` heading; extra blank lines inside the block are harmless but reduce the effective budget |
| **Write full markdown in `CHANGELOG.md`** | The file is used as-is for GitHub (renders markdown). `update_manifest.sh` strips markdown automatically for Jellyfin (plain-text display) |

### Where the changelog appears

1. **GitHub Release notes** — extracted by `scripts/extract_changelog.sh`, injected as `--notes` in `gh release create`. Markdown is **rendered** by GitHub.
2. **Jellyfin plugin description** — extracted by `scripts/update_manifest.sh`, stripped of markdown (→ plain text), embedded in `manifest.json` as `"changelog"`. Jellyfin displays this field as **plain text** — markdown is NOT rendered.
3. **Repository history** — `CHANGELOG.md` serves as the human-readable release history.

### What `update_manifest.sh` does to the changelog text

The script applies these transformations before embedding in `manifest.json`:
- `### Fixed` / `### Added` / … → `Fixed` / `Added` / … (removes `### ` prefix)
- `**bold**` → `bold` (removes `**` markers)
- `` `code` `` → `code` (removes backtick markers)
- `---` separator lines → removed
- Blank lines → removed (saves budget for the 20-line limit)
- Real newlines are preserved as proper JSON `\n` sequences (not literal `\n` characters)

### Procedure before any release

1. Write (or verify) the `## [X.Y.Z.0]` entry in `CHANGELOG.md` for the version being released.
2. Keep the entry ≤ 20 content lines.
3. Tell the human the CHANGELOG is ready — they run `make release-*`.

> **Never** write a changelog entry after `make release-*` has run: the GitHub notes and manifest description will already have been set with whatever was in the file at release time.

---

## 11. Recurring pitfalls

- ⛔ **`version.json` — NEVER edit manually.** Use `make bump-patch / bump-minor / bump-major`. The script also updates `<Version>` in the `.csproj`. Any manual edit desynchronizes the two files and will produce a mismatch between the compiled DLL version and the manifest entry.
- ⛔ **`make bump-*` — NEVER appeler séparément avant `make release-*`.** `make release-*` appelle déjà `bump-*` en interne (c'est la première étape de la séquence). Si `bump-*` est appelé avant, la version est incrémentée deux fois et la release saute un numéro. Ne jamais appeler `make bump-*` puis `make release-*` : utiliser **uniquement** `make release-*` pour tout faire d'un coup.
- ⛔ **`manifest.json` — NEVER edit manually.** Use `make manifest-update` (included in all `release-*` targets). The MD5 checksum must be computed from the ZIP actually served by GitHub, not the local file. A wrong checksum causes Jellyfin to refuse the installation.
- ⛔ **`<Version>` in `.csproj` — NEVER edit manually.** It is kept in sync with `version.json` by `scripts/bump_version.sh`. Editing it alone breaks `make pack` (ZIP name derived from `version.json`) and the manifest entry.
- ⛔ **`dist/*.zip` — NEVER commit or modify manually.** It is a build artifact, regenerated by `make pack`. It is excluded from git via `.gitignore`.

- ⛔ **Markdown in Jellyfin changelog** — The `changelog` field in `manifest.json` is displayed as plain text by Jellyfin (no markdown rendering). `update_manifest.sh` strips `### `, `**`, backticks, `---`, and blank lines automatically. Write full markdown in `CHANGELOG.md` (GitHub renders it); the script converts for Jellyfin. Never try to pre-strip markdown in `CHANGELOG.md` itself — it would break the GitHub Release notes.

- ⛔ **`build.yml` — NEVER add `release: [created]` trigger.** This was the root cause of the checksum mismatch bug. When `make gh-release` creates a GitHub Release, `release: [created]` would re-trigger `build.yml`, which recompiles in a different environment and uploads a competing ZIP. Even with a different filename (e.g. with `v` prefix), it creates a CDN race condition that corrupts the MD5 in manifest.json. `build.yml` must only trigger on `push` and `pull_request`. `release.yml` was already fixed for this; `build.yml` must stay fixed too.

- All JS modules (`client.js`, `ip-*.js`) must be `<EmbeddedResource>` in the `.csproj` — otherwise 404 on `/InfoPopup/{module}.js`
- Assembly resource names: when files are declared **explicitly** via `<EmbeddedResource Include="...">` in the `.csproj`, the .NET SDK **preserves** hyphens in the embedded resource manifest name. `ip-admin.js` becomes `Jellyfin.Plugin.InfoPopup.Web.ip-admin.js` (hyphen kept). The controller uses `fileName` directly — **never add a `Replace('-', '_')` call**, it would produce names like `ip_admin.js` that don't match the actual resource stream names and cause 404s.
- **Module loading order is critical**: `ip-popup.js` depends on `ip-admin.js` (calls `ns.checkConfigPage`), which depends on `ip-utils.js` and `ip-styles.js`, which depend on `ip-i18n.js`. The loader in `client.js` enforces sequential loading via `load` events.
- **`window.__IP` namespace**: every module extends `window.__IP = window.__IP || {}`. Never access another module's functions directly — always go through `ns.functionName`.
- **`GET /InfoPopup/{module}.js` whitelist**: only filenames in `_allowedModules` are served. Adding a new module requires updating both the whitelist in the controller AND the `<EmbeddedResource>` list in the `.csproj`.
- **`_lang` frozen at load time (Jellyfin 10.11)**: in 10.11 with React Router, `document.documentElement.lang` is empty when `ip-i18n.js` loads, so `detectLang()` falls back to `navigator.language`. If the browser and Jellyfin are in different languages, all strings are wrong. The fix is the MutationObserver + lazy `t()` re-detection pattern already in place — **never remove these mechanisms** or replace them with a single `var _lang = detectLang()` call.
- **Adding a new language**: add a new dictionary in `_dicts` with all 65 keys (parity with `en`), add a case in `normalizeLang()`. All keys present in `en` must be present in the new dictionary — verify with the Python key-parity check used during v1.5.0.0 development.
- **i18n — `t()` with plurals**: use separate keys (`key_singular` / `key_plural`) and select the key before calling `t()`. Never try to add pluralization logic inside `t()`.
- **i18n — `applyStaticTranslations()`**: called once at config page init. If a new translatable element is added to `configurationpage.html`, add its `id` to the `map` in `applyStaticTranslations()` in `ip-admin.js`.
- `HttpContext.User.FindFirst("Jellyfin-UserId")` — not `User.Identity.Name`
- Admin policy: `"RequiresElevation"` in Jellyfin 10.10+
- ⛔ **`IUserManager.Users` — NEVER access it directly (statically typed).** Its signature changed *within* the Jellyfin 10.11 patch cycle (the `User` entity moved to `Jellyfin.Database.Implementations.Entities`), so a statically-typed call compiled against `Jellyfin.Controller` 10.11.0 throws `MissingMethodException: …IUserManager.get_Users()` at runtime on a slightly different 10.11.x server → **HTTP 500 on `GET /InfoPopup/permissions`** (the "Droits → Erreur" bug, fixed in v3.7.1.0). Enumerate users via the reflection helper `InfoPopupController.EnumerateUsers()` (binds at runtime, wrapped in try/catch + log). **The helper must try BOTH the `Users` property AND the `GetUsers()` method** — in 10.11.9+ the `Users` property was *removed and replaced by a `GetUsers()` method* (same change Trakt v30 / DLNA v11 made). With only the property, `GetProperty("Users")` returns `null` → empty list → the Droits tab shows **"Aucun utilisateur" with no crash** (silent, distinct from the earlier HTTP 500). Fixed in v3.7.3.0 by adding the `GetMethod("GetUsers", Type.EmptyTypes).Invoke(...)` fallback. `IUserManager.GetUserById(Guid)` is ABI-stable and fine to use directly. Do **not** "fix" this by pinning the `Jellyfin.Controller` package to one exact patch — the plugin is distributed to users on various 10.11.x builds, so runtime binding is the only robust option. General rule: for any Jellyfin API that has churned across 10.11.x, prefer runtime-bound access (reflection) over a statically-typed call.
- ⛔ **Format d'ID utilisateur Jellyfin — JAMAIS comparer/stocker un userId brut (corrigé en v3.7.4.0).** Jellyfin n'est pas cohérent : `User.Id.ToString()` (obtenu par réflexion via `IUserManager`, utilisé côté admin dans `EnumerateUsers()`) renvoie le format **"D" avec tirets** (`xxxxxxxx-xxxx-…`), tandis que le claim `Jellyfin-UserId` (lu par `GetUserId()`) **et** l'API REST `/Users` renvoient le format **"N" sans tirets** (32 hex). Conséquence du bug « gestion des droits marche pas » : les droits étaient enregistrés sous la clé "D" (l'admin envoyait l'ID issu de `EnumerateUsers`) mais relus sous la clé "N" (le claim de l'utilisateur) → `PermissionService.GetOrDefault` ne trouvait jamais l'entrée et renvoyait le défaut **tout-`false`** : l'utilisateur n'avait ni envoi ni réponse alors que l'admin voyait bien ses droits cochés. (La réception/inbox marchait car le ciblage utilisait déjà le format "N" partout.) **Fix : `PermissionService.NormalizeUserId(string?)`** (`Guid.TryParse(id, out g) ? g.ToString("N") : id`) applique le canonique "N" à **toute clé et toute comparaison** d'ID : `GetOrDefault`, `Upsert` (canonicalise la clé avant écriture), `DeleteByUserId`, et la fusion admin `GetAllPermissions` (ligne ~761). **Ne JAMAIS** réintroduire un `p.UserId == userId` brut dans le chemin des droits — toujours passer par `NormalizeUserId` des deux côtés. Note : `SeenTrackerService`/`ReplyStoreService`/compteurs quotidiens clé sur le claim brut en lecture **et** écriture (cohérents en interne, intacts) ; ne pas les "normaliser" sans raison. Rappel UX : `CanReply` effectif = **global `AllowReplies` ET `p.CanReply`** (ligne 840) — un user avec `CanReply=true` ne peut toujours pas répondre si le réglage global « Autoriser les réponses » est OFF ; `CanSendMessages` n'a pas ce double gate.
- ⛔ **GUID modèle = collision dans le catalogue (corrigé en v3.7.2.0).** Le GUID par défaut du template de plugin Jellyfin (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`) est réutilisé tel quel par d'autres plugins publics — notamment **QualityGate** (GeiserX), présent dans l'« Universal Plugin Repository » (0belous). **Jellyfin fusionne les plugins par GUID à travers TOUS les dépôts ajoutés** : deux plugins au même GUID ne forment qu'**une seule carte** au catalogue, le nom du dépôt vu en premier l'emporte, et les versions de l'autre sont empilées sous ce nom. Symptôme réel : « Info Popup » **introuvable** au catalogue car fusionné sous « QualityGate » (sa version 3.7.1.0 s'affichait comme une version de QualityGate). Piège diagnostique : `/Packages` interrogé en **direct** (127.0.0.1, via `--network container:jellyfin`) montrait quand même le plugin — la fusion se fait à l'**agrégation** du catalogue, pas dans un dépôt isolé ; il faut récupérer `/Packages` **depuis le navigateur** (IP autorisée par l'admin-allowlist) et chercher le GUID : s'il est rattaché à un *autre* nom, c'est une collision. **Fix : GUID aléatoire unique** (`uuidgen`) changé à 3 endroits — `Plugin.cs` (propriété `Id`), `manifest.json` (champ `guid`), et `scripts/update_manifest.sh` (le `--arg guid` ligne ~113, sinon `make manifest-update` réécrit l'ancien lors d'un build « from scratch » ; en update normal le script réutilise `.[0].guid` du manifest existant). **Ne PAS** toucher au GUID du `.sln` (`{A1B2C3D4-…}`) : c'est un identifiant de projet **Visual Studio interne**, sans rapport avec le GUID plugin Jellyfin, et le modifier risque de casser la solution sans rien apporter.
- **`popupActive` reset too early**: never set `popupActive = false` before the `.finally()` of `markAllSeen()`. Symptom: the popup reappears immediately after closing if navigation is fast.
- **DELETE with body**: use `POST /InfoPopup/messages/delete`. Never revert to `DELETE` with a body — it may be silently ignored by proxies.
- **`GetConfig()` outside lock**: always capture `var cfg = GetConfig()` inside the locked block in `MessageStore`. Never access it via the static property directly in a multi-step operation.
- **SeenTrackerService cache**: do not read the JSON file directly — always go through `ReadStore()` which handles the cache.
- **`injectStyles()` not called**: any component that generates DOM elements styled by IP classes must ensure `injectStyles()` has been called. Symptom: styles missing when navigating directly to the config page.
- **`renderBody()` vs `textContent`**: use `renderBody()` + `innerHTML` for message body rendering. Never use `textContent` for final rendering.
- **Dynamic `emby-checkbox`**: `<span></span>` empty = 0px = zero click area. Always use native `<input type="checkbox">` with inline `accent-color`.
- **SPA styles**: the `<style>` blocks in `configurationpage.html` disappear during transitions. All CSS for overlays/elements added to `<body>` must be in `injectStyles()` (in `ip-styles.js`).
- **PascalCase fallback**: always `msg.body || msg.Body || ''` — never a single casing.
- **Jellyfin 10.11**: React Router + MUI. Legacy selectors (`#indexPage`, `.homePage`) no longer exist. MutationObserver on `document.body` without selector restriction is the only reliable approach.
- **`PUT` without changing the ID**: never recreate a message to simulate an edit. Always go through `MessageStore.Update()` which preserves the ID and doesn't touch `infopopup_seen.json`.
- **`Update()` returns `PopupMessage?`**: never call `GetById()` after `Update()` in the controller — the snapshot returned by `Update()` is the source of truth (eliminates TOCTOU).
- **Forgotten `updatePreview(page)` after programmatic write**: any code that writes to `bodyEl.value` directly (`enterEditMode`, `exitEditMode`, post-publish reset) must call `updatePreview(page)` so the panel stays in sync even if it was not visible at that moment and the user opens it afterwards.
- **`setPreviewMode` does not touch the textarea**: never set `bodyEl.style.display = 'none'`. The textarea is always visible. `setPreviewMode(page, on)` controls only `#ip-body-preview`.
- **`updatePreview` inside input listener gated on panel visibility**: the `input` listener on the textarea calls `updatePreview` only when `preview.style.display !== 'none'`. Do not remove this guard — it avoids a useless `renderBody()` call on every keystroke when the panel is hidden.
- **`setTargetPickerIds` must be called from `enterEditMode`**: if this call is missing, the targeting selector shows the default "All users" state during editing, regardless of the actual targeting of the message. The bug is silent but causes `PUT` to always send an empty `targetUserIds`.
- **`usersCache` TTL**: `fetchUsers()` applies a 5-minute TTL via `usersCacheAt`. Do not remove this mechanism — without it, users created during the session are invisible in the targeting selector.
- **Admin styles in `injectStyles()`**: table, badges, toast, target picker, toolbar, editor-wrap and toggle switch are in `injectStyles()` (in `ip-styles.js`). Never put them back in a `<style>` in `configurationpage.html` — they would disappear on SPA navigation.
- **`inputLabelUnfocused` incompatible with a toolbar between label and input**: Jellyfin's `inputLabelUnfocused` class uses `position:absolute` to overlay the label on top of the input field (Material Design floating-label pattern). If any element (toolbar, help text, etc.) is placed between the `<label>` and the `<textarea>` inside an `inputContainer`, the label will float over that element instead of the input. Fix: use `position:static;display:block` on the label so it flows normally. **Do not re-add `inputLabelUnfocused` to `#ip-body-label`** — the toolbar between label and textarea makes it incompatible.
- **`document.addEventListener` in `initConfigPage` leaks on SPA navigation**: never add listeners to `document` (or `window`) inside `initConfigPage()` without removing them. `initConfigPage` is guarded by `page._ipInitDone`, but any global listener added before the guard (or in a code path that bypasses it) accumulates across navigations. `selectionchange` in particular fires dozens of times per second and was removed for this reason. If you need a document-level listener in the admin page, either gate it on `page._ipInitDone` or explicitly track and remove it on page teardown.
- **`apiFetch` returns a raw `Response`, not parsed JSON**: always chain `.then(function(res){ return res.json(); })` before consuming data. Missing this call causes `then(function(data){...})` to receive the Response object, not the parsed payload.
- **`GET /InfoPopup/client-settings` is `[AllowAnonymous]`**: only expose non-sensitive boolean/int settings. Never add user data or admin-only config to this endpoint. Called by `ip-popup.js` before the observer starts.
- **Cascade delete for replies**: when a message is deleted via `POST /InfoPopup/messages/delete`, `_replyStore.DeleteByMessageIds(request.Ids)` must be called in `InfoPopupController.DeleteMessages` — NOT inside `MessageStore` (avoids circular service dependency).
- **`PopupDelayMs` is the auto-close countdown (v3.6+)**: `_settings.popupDelayMs` controls the countdown progress bar duration and auto-close timer in the popup. `schedulePopupCheck` uses a hardcoded `800ms` delay (not `popupDelayMs`). If you see `setTimeout(xxx, _settings.popupDelayMs)` in `schedulePopupCheck`, it's a regression — it must be hardcoded `800`.
- **Progress bar countdown**: `#infopopup-progress-wrap` + `#infopopup-progress-bar` are inserted as first child of `#infopopup-dialog` when `popupDelayMs > 0`. CSS uses `transition-property:width; transition-timing-function:linear` with `transition-duration` set inline. Timer and transition are synchronized via double `requestAnimationFrame`. `clearTimeout(autoCloseTimer)` is called on manual close to cancel.
- **`_rateLimitMs` is no longer hardcoded in ip-admin.js**: `canPublish()` reads `_rateLimitMs` (updated from settings). Never re-introduce `var RATE_LIMIT_MS = 2000`.
- **Tab system**: `initTabs(page)` and `initSettingsTab(page)` must be called at the top of `initConfigPage`, after `injectStyles()` and `applyStaticTranslations()`. Missing these calls means tabs don't function and settings aren't loaded.
- **`ReplyStoreService` cache**: same pattern as `SeenTrackerService` — invalidate `_cache` only on write. Do not read the JSON file directly; always go through `ReadStore()`.
- **i18n key parity**: every key present in `en` must exist in all 8 language dicts (≈146 keys as of v3.7.0.0). Verify parity programmatically when adding a key or language — do not rely on a hard-coded total, it has repeatedly drifted from the actual code.
- **Sidebar injection (`injectSidebarEntry`)**: no boolean flag — idempotent via `container.querySelector('#ip-nav-messages')` check. If Jellyfin recreates the sidebar DOM (SPA transition), the entry is re-injected automatically by the MutationObserver. Tries the classic layout first (`injectIntoClassicSidebar()` → `.mainDrawer-scrollContainer`, `navMenuOption`), then the 10.11 experimental layout (`injectIntoMuiSidebar()` → `.MuiDrawer-paper` / `[class*="ResponsiveDrawer"]`). The link calls `ip-user.js:showUserPage()` (full-screen overlay) — **never** point it at `#!/configurationpage?...`, that route is admin-only and redirects non-admins to the home page (issue #1).
- ⛔ **Sidebar classique : scope d'insertion = `.mainDrawer-scrollContainer` (consolidé en v3.8.2.0).** Trois écueils historiques accumulés : (1) 3.7.5/6 le `container.appendChild(parts.link)` sur scrollContainer atterrissait au milieu des bibliothèques sur les skins KefinTweaks ; (2) 3.8.0.0 élargir la recherche au document faisait matcher la **sidebar du dashboard admin** (`a.navMenuOption` aussi) → placement sous « Tableau de bord » ; (3) 3.8.1.0 utiliser `.mainDrawer` (flex-column) comme parent d'insertion faisait s'étirer l'entrée sur toute la hauteur. **Solution stable** : scope = `.mainDrawer-scrollContainer`, recherche d'anchor user INSIDE (logout/quickconnect/mypreferencesmenu/myprofile), insertion `insertBefore(parts.link, anchor)`. Fallback = `container.appendChild` (3.7.x-compatible). Le link porte explicitement `flex:0 0 auto; min-height:40px; max-height:48px; box-sizing:border-box` pour résister aux parents flex.
- ⛔ **Comparaisons `isOwner` : TOUJOURS passer par `IsOwner(sentByUserId, userId)` (sécurité v3.8.2.0)** — helper qui normalise via `PermissionService.NormalizeUserId` les deux côtés avant comparaison. Ne JAMAIS écrire un `msg.SentByUserId == userId` brut dans un chemin de sécurité (UpdateMessage, SoftDelete, GetMessage bypass owner, GetMessageReplies, ToDetailForUser). C'est le même piège que [[guid-format-userid]] côté droits : un format hétérogène ("D" vs "N") ferait passer un owner pour un non-owner, contournant CanEditOwn/CanDeleteOwn ou bloquant un owner légitime.
- ⛔ **Plafonds sur les `List<string>` des DTOs : NE JAMAIS oublier `[MaxLength]` (sécurité v3.8.2.0).** Kestrel limite le body global (28 Mo par défaut) mais une liste de GUIDs peut en contenir ~700 K — amplification mémoire/disque. Pratique actuelle : `TargetUserIds` max 2000, `Ids` (Delete/MarkSeen) max 1000, `UserIds` (Bulk) max 2000. Toujours rejeter via `ModelState.IsValid`.
- ⛔ **Quotas journaliers : check-then-create = RACE CONDITION (corrigé en v3.8.2.0).** Le contrôleur ne doit JAMAIS faire `GetUserMessageCountToday` puis `Create` séparément — deux requêtes parallèles peuvent toutes deux voir N < limit et créer N+1 messages. Le quota se vérifie ATOMIQUEMENT DANS `MessageStore.Create` (paramètre `maxPerDayPerUser`) à l'intérieur du `WriteLock`. Idem pour les réponses : la vérif est déjà dans `ReplyStoreService.AddReply` sous lock.
- ⛔ **Sidebar MUI 10.11 : NE JAMAIS injecter dans `muiDrawer.querySelector('ul')` (première `ul`) — c'est la liste Média/Bibliothèques (corrigé en v3.7.7.0).** Le bouton « Messages » se retrouvait sous les libraries au lieu de la zone utilisateur, et un handler React MUI parent **consommait le clic** avant l'écouteur du `<a>` → bouton mort. Fix dans `injectIntoMuiSidebar()` : remonter depuis un anchor user (`a[href*="logout"]` → `quickconnect` → `mypreferencesmenu` → `preferences` → `settings`) jusqu'à la liste qui le contient ; fallback = **dernière** liste du drawer, jamais la première. Et le clic est **systématiquement** doublé d'une délégation `document`+`window` capture-phase (idempotente via `_sidebarClickBound`) qui matche `e.target.closest('#ip-nav-messages')` — résiste aux re-renders React et passe avant les handlers parents.
- ⛔ **`createElement('button', { is: '…' })` jette dans Jellyfin 10.11 (corrigé en v3.7.11.0).** Le polyfill `webcomponents.js` embarqué utilise l'ANCIENNE API où le 2e argument de `createElement` est une string (le nom du custom element), pas un objet. Passer `{ is: '…' }` déclenche `TypeError: t.toLowerCase is not a function` au niveau du polyfill. **Ne JAMAIS** utiliser le mécanisme « customized built-in element » pour ré-utiliser un composant Jellyfin — préférer un élément standard (`<button>`, `<a>`) qui porte simplement les CLASSES natives (`paper-icon-button-light`, `emby-button`, etc.). Le rendu visuel + ripple sont dans le CSS de ces classes ; l'upgrade en custom element n'est pas nécessaire. Voir le piège lié [[feedback-reuse-jellyfin-components]] : « réutiliser les composants Jellyfin » = réutiliser les CLASSES, pas le mécanisme `is=`.
- ⛔ **`showUserPage` : `_overlayOpen = true` AVANT la construction = piège mortel si exception (corrigé en v3.7.10.0).** Si quoi que ce soit dans `showUserPage` jette (custom element non enregistré, MUI absent, DOM dans un état inattendu…), le flag `_overlayOpen` reste à `true` et **TOUS les clics suivants sur le bouton « Messages » sont consommés silencieusement par le garde `if (_overlayOpen) return;`** — symptôme « le clic n'a aucun effet », jamais le moindre log même si le handler de délégation tourne. Fix : tout le corps de construction est dans `_showUserPageInner` enveloppé d'un try/catch dans `showUserPage` qui **réinitialise `_overlayOpen = false` en cas d'échec** ET re-jette pour que le catch du handler logue l'erreur complète (`err.name`, `err.message`, `err.stack`). **Ne JAMAIS** positionner un flag d'état avant la portion fragile sans un try/catch qui le restaure.
- ⛔ **Bouton « Messages » : NE JAMAIS lui mettre un `href="#"` ni un href réel (corrigé en v3.7.8.0).** Le routeur Jellyfin capte les clics sur les anchors avec href, et un `href="#"` déclenche un hashchange synchrone qui **referme l'overlay immédiatement après son ouverture** via le listener `hashchange` posé par `showUserPage()` — symptôme : « clic sans aucun effet visible ». Garder `<a>` sans href + `role="button"` + `tabindex="0"`. ET : enregistrer les listeners `hashchange`/`popstate` de close dans un `setTimeout(…, 0)`, sinon un hashchange synchrone provoqué par la fermeture du drawer MUI (`muiBackdrop.click()` dans `showUserPage`) referme aussi tout de suite.
- **User page collapsible cards**: `buildCollapsibleCard()` in `ip-user.js` creates cards with `.ip-collapsed` / `.ip-expanded` toggle classes. Body lazy-loading uses the same pattern as popup history items. The preview text is plain text (not rendered markdown) to avoid HTML in the collapsed view.
- **`SentByUserName` in DTOs**: `ToSummary()` and `ToDetail()` in the controller are now instance methods (not static) because they call `ResolveUserName()` which uses `_userManager`. Method group syntax `.Select(ToSummary)` still works with instance methods.
- **Reuse native Jellyfin components (general directive)**: prefer Jellyfin's own classes/components (`paper-icon-button-light`, `emby-button`/`raised`, `material-icons`, the native back button) over custom ones. Custom UI that duplicates native behavior detonates visually AND can break Jellyfin's own state — a custom overlay back button broke the sidebar (v3.7.5.0). See [[feedback-reuse-jellyfin-components]] in memory.
- **Never re-add `hide` to `.mainDrawer` in `showUserPage()`**: the user overlay covers the sidebar (z-index 99998 — bumpé de 9998 en v3.7.9.0 car certains dialogues admin Jellyfin sont à ~10000+ et masquaient l'overlay), so closing the drawer is enough (remove `mainDrawerOpen` / click the MUI backdrop). Adding `hide` to `.mainDrawer` and not removing it on close leaves the sidebar permanently hidden (the v3.7.5.0 sidebar bug). `closeUserOverlay()` defensively removes `hide`.
- **Styling a native `<select>` open list is impossible**: `<option>` ignores padding/border/hover across browsers. Any themed `<select>` on the config page must go through `enhanceSelect()` (hides the native select, renders a `.ip-sel*` listbox, dispatches a native bubbling `change`). After a programmatic `sel.value = …`, call `sel.__ipSync()` or the custom button label won't refresh. Don't rely on `#infoPopupConfigPage select option{...}` CSS — it's only a fallback for unenhanced selects.
- **Droits tab save is global, not per-card (v3.7.5.0)**: never re-introduce per-card save buttons. `loadPermissions` collects all cards and `Promise.all`s `PUT /permissions/{userId}`. "Appliquer à la sélection" only stages role+limits into the selected cards' UI in memory; nothing persists until the global save. Don't call `/permissions/bulk` from the client (the global per-user PUT path supersedes it).
- ⛔ **Cache-bust des modules JS (v3.7.6.0)** — `ScriptInjectionMiddleware` émet `<script src="/InfoPopup/client.js?v={Plugin.Instance.Version}">` et le loader `client.js` lit ce `?v=…` depuis `document.currentScript.src` et le propage à tous les modules (`ip-i18n.js`, `ip-utils.js`, etc.). Sans ce versionnement, **nginx/Cloudflare/le service worker Jellyfin cachent les `.js` indéfiniment** : symptôme « le plugin est à la bonne version mais l'UI ne change pas » (vérifié avec [[project-nginx-reverse-proxy]]). La sous-chaîne `"/InfoPopup/client.js"` reste contenue dans l'URL avec query → le test d'idempotence du middleware (`html.Contains("/InfoPopup/client.js")`) marche toujours. **Ne JAMAIS** retirer le `?v=…` ni hardcoder une version ; laisser `Plugin.Instance?.Version?.ToString()` (re-évalué à chaque chargement d'assembly, donc à chaque release).
- ⛔ **Rôle explicite persisté (`UserPermission.Role`, v3.7.6.0)** — `detectRole` côté client dérive le rôle des bools, mais si l'admin choisit explicitement « Personnalisé » (ou un preset dont la combinaison fortuitement matche un autre preset), il faut conserver ce choix. `UserPermission.Role` (string) est persisté ; `ToPermissionDto`/`UpdatePermissionsRequest`/`BulkUpdatePermissionsRequest` portent le champ ; `detectRole(u)` honore `u.role`/`u.Role` AVANT la dérivation à partir des bools. **Ne JAMAIS** retirer ce check explicite : le test côté client se réintroduirait silencieusement (le rôle reviendrait à un preset après save+reload).
- ⛔ **`GetMessage(id)` : autoriser l'auteur (v3.7.6.0)** — la garde 404 `msg.TargetUserIds.Count > 0 && !msg.TargetUserIds.Contains(userId)` bloquait l'auteur du message s'il n'était pas lui-même dans la liste de ciblage → onglet « Sent » côté user affichait un corps vide (lazy-load via `/messages/{id}` retournait 404). La condition doit inclure `&& msg.SentByUserId != userId`. Couplé : `/messages/sent` renvoie désormais `MessageDetail` (avec corps) plutôt que `MessageSummary`, pour éviter le round-trip.
- ⛔ **`.ip-perm-card{overflow:hidden}` clippe les dropdowns** : un `<select>` enrichi (`enhanceSelect`) ouvre une `.ip-sel-list` en `position:absolute` ; si la carte parente est `overflow:hidden`, la liste est coupée. Toujours utiliser `overflow:visible` sur la carte + `position:relative` pour pouvoir promouvoir `z-index` quand un dropdown est ouvert (`.ip-perm-card:has(.ip-sel.ip-open){z-index:5}`).
