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
├── tests/                            ← v4.1.1.0
│   └── Jellyfin.Plugin.InfoPopup.Tests/
│       ├── Jellyfin.Plugin.InfoPopup.Tests.csproj  ← xUnit, net9.0, ref jf10.11
│       └── PermissionServiceTests.cs               ← 11 tests sur NormalizeUserId
└── Jellyfin.Plugin.InfoPopup/
    ├── Jellyfin.Plugin.InfoPopup.jf10.10.csproj  ← variant Jellyfin 10.10.x (net8.0)
    ├── Jellyfin.Plugin.InfoPopup.jf10.11.csproj  ← variant Jellyfin 10.11.9+ (net9.0)
    ├── Plugin.cs
    ├── PluginServiceRegistrator.cs
    ├── Configuration/PluginConfiguration.cs
    ├── Models/{PopupMessage,SeenRecord,MessageReply}.cs
    ├── DTOs/MessageDtos.cs            ← request/response DTOs (separated from controller)
    ├── Services/{MessageStore,SeenTrackerService,ReplyStoreService,PermissionService}.cs
    ├── Services/IJellyfinCompat.cs    ← frontière unique pour APIs Jellyfin version-dependent (v4.1.0.0)
    ├── Compat/
    │   ├── Jellyfin10_10/JellyfinCompat.cs  ← impl 10.10 (compile uniquement par jf10.10.csproj)
    │   └── Jellyfin10_11/JellyfinCompat.cs  ← impl 10.11.9+ (compile uniquement par jf10.11.csproj)
    ├── Controllers/
    │   ├── InfoPopupControllerBase.cs   ← abstract base : helpers + per-request caches (v4.1.1.0)
    │   ├── MessagesController.cs        ← /messages/* + popup-data + seen/unseen
    │   ├── RepliesController.cs         ← /reply, /replies/*
    │   ├── PermissionsController.cs     ← /permissions/*
    │   └── SettingsController.cs        ← /settings, /client-settings, /admin/*, /{module}.js
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
2. `<Version>X.Y.Z.0</Version>` in **every** `Jellyfin.Plugin.InfoPopup.*.csproj` variant — sed replace looped (v4.1.0.0). Keeps all variant DLLs in sync with `version.json`.

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
| GET | `/InfoPopup/messages/{id}/views` | **admin** | Liste des lecteurs / non-lecteurs d'un message (`MessageViewsDto`). Pour « Tous » la cible est l'univers Jellyfin entier ; pour ciblage explicite seuls les targets comptent. v3.8.6.0. |
| POST | `/InfoPopup/admin/clear-seen` | **admin** | Vide `infopopup_seen.json`. v3.8.7.0. |
| POST | `/InfoPopup/admin/clear-replies` | **admin** | Vide `infopopup_replies.json`. v3.8.7.0. |
| POST | `/InfoPopup/admin/purge-deleted` | **admin** | Hard-delete des messages soft-deletés + cascade des réponses orphelines. v3.8.7.0. |
| POST | `/InfoPopup/admin/reset-settings` | **admin** | Réinitialise `PluginConfiguration` aux defaults des field-initializers. **Ne touche** ni à `Messages`, ni à `infopopup_seen.json`, ni à `infopopup_replies.json`, ni à `infopopup_permissions.json`. v3.8.7.0. |
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

### Commits
- **NEVER add `Co-Authored-By: Claude …` (or any Claude/Anthropic attribution) trailer to commit messages.** The user noticed that GitHub picked up Claude as a 2nd Contributor on the public repo because of those trailers and explicitly asked to stop. Commit attribution must remain his own GitHub identity only. The README's "vibe-coded by Claude" line is sufficient public acknowledgment.
- When suggesting `git commit` HEREDOC bodies, write the message without the trailer. Just subject + optional body. No `Co-Authored-By` lines at all.

### After
- Verify rules R1–R10
- **Write the `CHANGELOG.md` entry for the new version before any release** — see section 10 for the mandatory format. The entry must exist in `CHANGELOG.md` *before* the human runs `make release-*`, because `make gh-release` and `make manifest-update` extract it at release time. A missing or malformed entry means GitHub Release notes and the Jellyfin plugin description will be empty or wrong.
- Update `README.md` and `CLAUDE.md` if the architecture or a rule changes
- **Update `docs/USER_GUIDE.md` when a user-visible feature changes** — adding/removing a setting, a tab, a permission flag, an admin maintenance action, a popup behavior, anything visible in the UI. CHANGELOG describes *what changed since last release*; USER_GUIDE describes *how the plugin currently works*. The two drift apart fast if the guide isn't touched. Reference it from any pitfall/architecture note that introduces a new user-facing behavior.
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
- ⛔ **Workflow 2-channels dev/stable (v3.8.9.0).** Le `Makefile` calcule `CHANNEL := $(if $(filter 1,$(STABLE)),stable,dev)` — donc **par défaut tout cible dev** (branche `dev`, `manifest-dev.json`, tag suffixé `-dev`, ZIP suffixé `-dev`, GH `--prerelease`). Pour shipper en stable : **JAMAIS** appeler `release-*` directement sur main, **TOUJOURS** passer par `make promote VERSION_ARG=X.Y.Z.W` qui fast-forward main sur le tag dev puis rebuild propre en stable. Le garde-fou `_check-branch` empêche un `release-patch` sur main par défaut (et un `release-patch STABLE=1` sur dev). **Ne JAMAIS** retirer ce garde — c'est ce qui évite les release accidentelles sur le mauvais channel. Le `update_manifest.sh` accepte un 7e arg `MANIFEST_FILE` (défaut `manifest.json`) et un 8e arg `CHANNEL` qui suffixe le nom plugin par " (Dev)" pour distinguer les deux dans le catalogue Jellyfin si un user a ajouté les deux dépôts simultanément.
- ⛔ **`Cache-Control: no-cache, must-revalidate` sur le HTML injecté (v3.8.9.0).** `ScriptInjectionMiddleware` ajoute ces headers sur la réponse `/`, `/web`, `/web/index.html`. Sans ça, un user qui installe le plugin alors qu'un onglet Jellyfin est déjà ouvert garde un `index.html` caché AVANT injection → aucun script plugin chargé → boutons sans CSS (« boutons blanc », issue #2). **Ne RÉSOUT PAS** le tout premier affichage si le browser a déjà un cache long TTL (les headers d'avant restent dans l'entrée cachée), mais réduit la fenêtre de mauvaise UX à 1 F5 normal au lieu d'un Ctrl+Shift+R. **Ne JAMAIS** retirer ces headers — l'`index.html` ne doit JAMAIS être servi depuis un cache long.
- ⛔ **`update_manifest.sh` doit refuser un manifest corrompu en entrée ET en sortie (v4.0.4.0).** Piège historique : une session externe (Claude dans un Docker à disque plein, éditeur qui crash, copie de fichier interrompue…) corrompt `manifest-dev.json` localement en le remplissant de null bytes. `make release-*` lance `update_manifest.sh` qui lit l'input null via `jq` (output dégradé/vide) → écrit le `.tmp` corrompu → `mv` écrase le manifest VALIDE par du junk → commit + push → manifest cassé sur GitHub → Jellyfin ne voit plus le plugin. C'est arrivé sur v4.0.3.0-dev. **Fix obligatoire** : 3 gardes successives dans `update_manifest.sh` — (a) refuse de continuer si l'input contient des null bytes ; (b) refuse si l'input n'est pas un JSON parsable par `jq empty` ; (c) refuse le `mv` si le `.tmp` produit est vide / a des null bytes / n'est pas JSON valide. Toute violation = exit 1 + message « restaurer depuis git ». **Ne JAMAIS** retirer ces gardes même si « le script marche depuis 6 mois » — la corruption ne se voit qu'au moment où elle frappe, et elle est silencieuse côté shell (pas d'erreur visible, juste un manifest invalide pushé sur main/dev).
- ⛔ **Tests xUnit dans `tests/Jellyfin.Plugin.InfoPopup.Tests/` (v4.1.1.0).** Le projet de tests référence la variant `jf10.11.csproj` pour compiler mais ne charge AUCUNE API Jellyfin runtime — il teste uniquement les méthodes statiques pures (`PermissionService.NormalizeUserId` notamment). Lancé via `make test`. **Ne JAMAIS** ajouter le projet de tests à la sln des variants pour `make pack`/`release-*` — il a son propre TFM (net9.0) et un `<PackageReference Microsoft.NET.Test.Sdk>` qui n'a rien à faire dans un ZIP plugin. Le test le plus critique (et celui qui doit JAMAIS casser) : `NormalizeUserId_FormatsAreEquivalent` — il vérifie que `NormalizeUserId(formatD)` == `NormalizeUserId(formatN)` pour le même Guid sous-jacent. Si ce test casse, **TOUT** le système de permissions devient silencieusement inopérant cf. [[guid-format-userid]]. Pour ajouter des tests : viser les helpers statiques purs (faciles à tester sans DI) ; ne pas chercher à mocker `IUserManager` ou ASP.NET Core MVC, c'est out-of-scope tant qu'il n'y a pas un harness intégration.
- ⛔ **CancellationToken sur les async (v4.1.1.0).** Toutes les 9 méthodes `public async Task<...>` des 4 controllers acceptent `CancellationToken ct = default` en dernier paramètre. ASP.NET Core MVC binde automatiquement `HttpContext.RequestAborted` à ce paramètre — pas besoin d'un attribut `[FromServices]`. **Ne JAMAIS** retirer ces paramètres au prétexte « on ne les utilise pas » : (a) ASP.NET Core peut signaler l'annulation pour interrompre des opérations futures (ex. un `_store.GetAllAsync(ct)` quand on migrera vers EF Core), (b) les analyseurs de code recommandent leur présence sur toute méthode async d'un controller, (c) les calls explicites `ct.ThrowIfCancellationRequested()` dans `GetMessages` (chemin admin) et `GetPopupData` servent à abandonner tôt si un client a fermé sa connexion pendant l'itération sur les messages — gain de threads sur les serveurs Jellyfin chargés.
- ⛔ **Controllers split en 4 — partage helpers via `InfoPopupControllerBase` (v4.1.1.0).** L'ancien `InfoPopupController` (1393 lignes, 30 endpoints) est splitté en `MessagesController`, `RepliesController`, `PermissionsController`, `SettingsController`. Tous héritent de `InfoPopupControllerBase` (abstract) qui contient les helpers transverses (`GetUserId`, `IsAdminAsync`, `IsValidId`, `AreValidUserIds`, `IsOwner`, `ResolveUserName`, `GetPermCached`, `PreloadRepliesByMessage`, `GetRepliesForMessage`, `ToSummary`, `ToDetail`, `ToDetailForUser`, `ToPermissionDto`, `ToReplyDto`, `ComputeSenderRole`, `EnumerateUsers`) ET les caches per-request (`_userNameCache`, `_permCache`, `_repliesByMessage`). **Pourquoi ça marche :** ASP.NET Core instancie un contrôleur PAR REQUÊTE HTTP, donc les dictionnaires d'instance sont scope-naturellement à une requête — un GET /messages et un GET /popup-data dans des requêtes différentes ne partagent pas leurs caches (et ne devraient pas, car les données peuvent changer entre les deux). Tous les 4 contrôleurs partagent `[Route("InfoPopup")]` ; ASP.NET Core route correctement par `[HttpVerbe("sub-path")]` exact. **Ne JAMAIS** mettre un endpoint qui dépend d'un cache rempli par un autre — chaque méthode publique appelle `PreloadRepliesByMessage()` si elle utilise `GetRepliesForMessage()`. Pour ajouter un endpoint, choisir le contrôleur par domaine fonctionnel ; si vraiment un nouveau domaine émerge (ex. analytics), créer un 5e contrôleur qui hérite aussi de `InfoPopupControllerBase`. **Ne JAMAIS** remettre tout dans une seule classe au prétexte de « simplifier ».
- ⛔ **Multi-target — Jellyfin 10.11.0-10.11.8 = zone morte (audit v4.1.0.0).** Découvert pendant l'audit post-release v4.1.0.0 : la 10.11.0 a DÉJÀ déplacé l'entité `User` vers `Jellyfin.Database.Implementations.Entities` mais conserve la propriété `IUserManager.Users` (pas encore `GetUsers()`). Le combo `Users` propriété + nouveau namespace n'existe NULLE PART dans nos variants : jf10.10 est compilé contre l'ancien namespace, jf10.11 est compilé contre `GetUsers()` introduit en 10.11.9. **Résultat : aucun de nos 2 variants ne tourne sur 10.11.0-10.11.8.** Pire, Jellyfin 10.11.0-10.11.8 propose quand même jf10.10 au user (targetAbi 10.10.0.0 satisfait), qui crash au load avec TypeLoadException — le manifest Jellyfin ne supporte PAS de `maxAbi`. **Mitigation** : documentation prominente dans README/USER_GUIDE. **NE PAS** essayer de "fixer" via une 3e variant pinned 10.11.0-10.11.8 sauf demande explicite — la majorité des users sont sur 10.11.9+ (current stable) ou 10.10 LTS-like ; le coût de maintenance d'un 3e variant ne se justifie pas pour un fragment minoritaire.
- ⛔ **Multi-target — APIs Jellyfin 10.10 vs 10.11.9+ vérifiées (v4.1.0.0).** Le piège : la doc/le code avant v4.1 mentionnait `User.Policy.IsAdministrator` comme « ancienne API ». **CE N'EST PAS LE CAS.** Ni Jellyfin 10.10 ni 10.11 n'exposent `User.Policy`. La méthode disponible des deux côtés est `user.HasPermission(PermissionKind.IsAdministrator)`. Différences entre variants : (a) le namespace de `PermissionKind` — `Jellyfin.Data.Enums` en 10.10, `Jellyfin.Database.Implementations.Enums` en 10.11 ; (b) `IUserManager.Users` (propriété, 10.10) vs `IUserManager.GetUsers()` (méthode, 10.11.9+) ; (c) **En 10.11, le `User` n'a PAS de méthode `HasPermission` du tout — ni directement, ni via l'interface `IHasPermissions` (qui n'expose QUE la collection `Permissions`). Il faut filtrer la collection : `user.Permissions.Any(p => p.Kind == PermissionKind.IsAdministrator && p.Value)`.** En 10.10 par contre, `HasPermission(PermissionKind)` est exposé directement sur `User`. C'est une vraie divergence d'API entre les deux majors, pas juste un cast. **Ne JAMAIS** revenir à un accès `user.Policy.*` — la propriété n'existe pas. **Ne JAMAIS** non plus retirer le cast `(IHasPermissions)` du variant 10.11 — sans lui le compilo C# ne trouve pas la méthode. Si une nouvelle API Jellyfin change, vérifier la VRAIE source GitHub (tags `v10.X.0`) AVANT d'écrire le compat — pas la mémoire de Claude.
- ⛔ **Multi-target — PAS de `BaseIntermediateOutputPath` custom dans les csprojs (v4.1.0.0).** MSBuild positionne `BaseIntermediateOutputPath` AVANT d'évaluer le PropertyGroup des csprojs ; le surcharger trop tard déclenche le warning MSB3539 et NuGet continue d'écrire dans le `obj/` par défaut. Résultat : si une variant a déjà été buildée puis qu'on builde l'autre, les anciens `AssemblyInfo.cs` générés (à des chemins non exclus) sont scannés par le compilo → `error CS0579: Attribut 'AssemblyCompanyAttribute' en double`. Solution : laisser les paths par défaut. Comme les 2 variants ont des `TargetFramework` distincts (net8.0 vs net9.0), leurs `obj/Release/net{tfm}/` ne se chevauchent jamais nativement. Si plus tard tu veux DEUX variants avec le MÊME TFM (ex : jf10.11 et jf10.11-experimental), faudra passer par `Directory.Build.props` (qui s'évalue avant les csprojs).
- ⛔ **Architecture multi-target (v4.1.0.0) — `IJellyfinCompat` + 2 csproj.** Le plugin ship 2 binaires distincts par release : `infopopup_X.Y.Z.W-jf10.10.zip` (net8.0, pin Jellyfin.Controller 10.10.*) et `infopopup_X.Y.Z.W-jf10.11.zip` (net9.0, pin 10.11.9). Le manifest Jellyfin contient 2 entrées versions[] par release, une par variant avec son `targetAbi` (10.10.0.0 / 10.11.9.0). Jellyfin filtre automatiquement à l'install et le user ne voit qu'une seule entrée plugin. Code partagé à 100% SAUF `Compat/Jellyfin10_XX/JellyfinCompat.cs` : chaque csproj inclut sa propre impl typée et exclut l'autre via `<Compile Remove="Compat/Jellyfin10_YY/**" />`. Plus aucune réflexion : avant 4.1, `ResolveIsAdmin` et `EnumerateUsers` faisaient du runtime probing ; maintenant tout est typé statiquement et le compilo catch les changements d'API. **Ne JAMAIS** réintroduire de la réflexion défensive : si une nouvelle API Jellyfin change, ajouter une méthode à `IJellyfinCompat` et fournir une impl dans chaque variant — pas un `try { reflect } catch`. **Ne JAMAIS** non plus toucher à une API Jellyfin instable DIRECTEMENT dans le contrôleur ou un service — tout passe par `IJellyfinCompat`. Pour ajouter une variant (ex jf12.0 quand Jellyfin 12 sort) : (1) dupliquer le csproj jf10.11 → jf12.0 avec le bon pin, (2) créer `Compat/Jellyfin12_0/JellyfinCompat.cs` avec les nouvelles APIs, (3) ajouter `<Compile Remove="Compat/Jellyfin12_0/**" />` dans les csprojs sœurs, (4) ajouter `jf12.0` dans `JF_VARIANTS` du Makefile + map `TARGET_ABI_jf12.0`. C'est documenté en tête de chaque csproj. Pour DROP une variant (ex 10.10 quand plus personne ne l'utilise), supprimer le csproj + le dossier `Compat/Jellyfin10_10/` + l'entrée dans `JF_VARIANTS` + les anciennes entrées dans `manifest*.json` (les vieilles versions restent dans l'historique git). **Ne JAMAIS** déplacer `IJellyfinCompat.cs` hors de `Services/` — il doit rester côté shared, pas côté Compat (sinon le `<Compile Remove>` l'éliminerait des deux variants).
- ⛔ **Multi-target — `update_manifest.sh` doit dédupliquer sur `(version, targetAbi)` PAS juste `version` (v4.1.0.0).** Sinon le 2e appel pour la même version (mais variant différent) écrase le 1er. Le filtre jq est `.[0].versions | map(select(.version != $entry.version or .targetAbi != $entry.targetAbi))`. **Ne JAMAIS** revenir à un dédup `version` seul — ça casse silencieusement le manifest en multi-target (1 seule entrée pour 2 ZIPs uploadés, l'autre variant devient inaccessible). Le Makefile appelle update_manifest.sh dans une boucle for sur `JF_VARIANTS` — chaque itération injecte sa propre `targetAbi`.
- ⛔ **Makefile — `case` shell pour mapper variant → targetAbi, JAMAIS `eval` (v4.1.0.0).** Premier essai foireux : `ABI_VAR="TARGET_ABI_$$v"; ABI=$$(eval echo \$$$$ABI_VAR);`. Problème : les noms de variables shell ne supportent PAS les points (e.g. `jf10.10` casse). Bash voyait `$TARGET_ABI_jf10` (vide) suivi du literal `.10` → ABI calculé = `.10`. Le manifest s'est retrouvé pushé avec `targetAbi: ".10"` et `".11"` au lieu de `10.10.0.0` et `10.11.9.0` → **Jellyfin ne reconnaît plus le plugin du tout**. Fix : un `case "$$v" in jf10.10) ABI="$(TARGET_ABI_jf10.10)" ;; ...` qui interpole côté Make (variable Make valide avec des points) et passe la valeur littérale au shell. **Ne JAMAIS** revenir à de l'indirection shell sur des noms de variables contenant des points. Si jamais on doit ajouter une variant `jf12.0` ou autre, dupliquer une branche `case` — pas la peine de faire du dynamic indirection.
- ⛔ **Multi-target — `.NET 8 SDK ET .NET 9 SDK requis sur la machine de build (v4.1.0.0).** jf10.10.csproj cible `net8.0`, jf10.11.csproj cible `net9.0`. Si une seule version du SDK est installée, `make pack` échouera sur la variant manquante. La CI doit installer les deux : `actions/setup-dotnet` avec `dotnet-version: 8.0.x\n9.0.x` (multi-ligne). En dev local, `dotnet --list-sdks` doit lister au moins une `8.0.*` et une `9.0.*`. **Ne JAMAIS** unifier les deux variants sur le même `TargetFramework` — net9.0 n'est pas compatible avec Jellyfin 10.10.x (qui tourne sous net8.0 côté serveur).
- ⛔ **`AllowReplies` est un master-switch global qui s'applique AUSSI aux admins (v4.0.3.0).** Le endpoint `POST /messages/{id}/reply` renvoie 403 même pour admin si `cfg.AllowReplies` est `false` (contrôleur ligne ~1022). DONC `EffectivePermissionsDto.CanReply` doit **également** refléter ce master-switch côté admin — sinon la popup affiche un formulaire de réponse, l'admin tape, clique Envoyer, et se mange un 403 surprise. Fix appliqué dans `GetPopupData` ET `GetMyPermissions` : `CanReply = cfgPerms.AllowReplies` (non plus `true`) pour la branche admin. Non-admin reste sur `cfg.AllowReplies && p.CanReply`. **Ne JAMAIS** remettre `CanReply = true` inconditionnel pour admin — la cohérence UI/serveur en dépend. Si plus tard tu veux que les admins puissent bypasser le master-switch, change AUSSI le check dans le endpoint /reply (lignes 1022-1024).
- ⛔ **`ResolveIsAdmin` : 4 chemins de fallback obligatoires (v4.0.3.0).** Jellyfin a churn énormément sur l'accès admin status : (1) `User.Policy.IsAdministrator` (10.10 / début 10.11), (2) `user.HasPermission(PermissionKind.IsAdministrator)` (10.11.9+), (3) `user.GetPermission(...)` (alias présent sur certaines branches 10.11.x où `HasPermission` a été retirée — v4.0.3.0), (4) raccourci direct `user.IsAdministrator` (cas dégénérés du modèle de données — v4.0.3.0). Si Path 1 ET Path 2 échouent silencieusement (cas typique d'une branche 10.11 qui n'expose ni Policy ni HasPermission), l'admin est traité comme un non-admin → carte « Lecteur » au lieu de « ADMIN » dans l'onglet Droits. **Ne JAMAIS** retirer Path 3 et Path 4 — sans eux, certaines installs 10.11.x affichent silencieusement l'admin comme un user lambda. Même piège que [[guid-format-userid]] : runtime-bind tout ce qui touche aux APIs Jellyfin qui changent.
- ⛔ **Cohérence editState ↔ deleteSelected ↔ PUT 404 (v4.0.3.0).** Avant v4.0.3.0, si l'admin éditait un message puis le sélectionnait pour suppression, le formulaire restait rempli avec les données d'un message fantôme — un futur clic « Enregistrer » faisait un PUT 404 silencieux. Fix dans `deleteSelected` : détecte `editState.id ∈ ids` AVANT le POST, et si oui, appelle `exitEditMode(page)` + `editState.id = null` dans le `.then` (après succès serveur). Et dans `publishMessage` (PUT path) : catch sur `HTTP 404` → `exitEditMode` + refresh, parce qu'un autre admin (ou la rétention auto) peut avoir supprimé le message entre l'ouverture du formulaire et le Save. Même fix côté `ip-user.js:enterMessageEditMode` (404 → exit + refresh). **Ne JAMAIS** ignorer le cas 404 sur ces PUT — sinon l'utilisateur reste piégé dans un éditeur sur un message fantôme.
- ⛔ **Auto-reload de récupération dans `configurationpage.html` (v4.0.2.0).** Petit script inline au tout début du fichier qui vérifie `window.__IP` après 2 s ; si absent → `window.location.reload()` UNE fois (`sessionStorage.ipBootstrapReloadAttempted` anti-boucle). **Raison** : le `Cache-Control: no-cache` (v3.8.9.0) et l'inline retry loader (v4.0.1.0) sont des fixes serveur qui ne peuvent PAS rewrite un `index.html` déjà mis en cache par le navigateur AVANT l'install/update du plugin. Si le HTML cached n'a pas notre `<script>`, aucun script plugin ne se charge, point final côté serveur. La détection côté HTML config page (qui est SERVI par Jellyfin avec headers Jellyfin, pas par notre middleware) capture cette situation et déclenche un reload qui revalide → le browser récupère le nouveau HTML avec injection → tout marche. **Ne JAMAIS** retirer le garde `sessionStorage.ipBootstrapReloadAttempted` — sans lui, une vraie cassure (genre serveur down) crée une boucle de reload infinie. **Ne JAMAIS** non plus retirer le `try/catch` autour des accès `sessionStorage` — certains modes navigation privée le bloquent et lèvent. C'est documenté comme limitation cross-plugin de Jellyfin (issues jellyfin-web #5494, #4549).
- ⛔ **Inline retry loader pour `/InfoPopup/client.js` (v4.0.1.0).** Le `ScriptTag` du middleware n'est PAS un simple `<script src=…>` mais un mini-IIFE qui crée le `<script>` programmatiquement et retry jusqu'à 5x avec backoff (`setTimeout(l, 500 * t)`) sur `onerror`. **Raison** : sur une fresh install, Jellyfin redémarre pour charger la DLL et renvoie 503 pendant ~5-30s. Une balise `<script src>` plate qui se mange un 503 N'EST PAS retry par le navigateur → plugin JS jamais chargé → boutons blancs jusqu'au Ctrl+Shift+R. C'est la **vraie cause root** de l'issue #2 (le `Cache-Control: no-cache` de v3.8.9.0 aide pour la revalidation HTML mais pas la race serveur-pas-prêt vs script-chargé-tôt). **Ne JAMAIS** revenir à un `<script src>` simple. L'idempotence du middleware (`html.Contains("/InfoPopup/client.js")`) reste intacte car la chaîne littérale est toujours présente dans le contenu inline.
- ⛔ **Rôle explicite persisté (`UserPermission.Role`, v3.7.6.0)** — `detectRole` côté client dérive le rôle des bools, mais si l'admin choisit explicitement « Personnalisé » (ou un preset dont la combinaison fortuitement matche un autre preset), il faut conserver ce choix. `UserPermission.Role` (string) est persisté ; `ToPermissionDto`/`UpdatePermissionsRequest`/`BulkUpdatePermissionsRequest` portent le champ ; `detectRole(u)` honore `u.role`/`u.Role` AVANT la dérivation à partir des bools. **Ne JAMAIS** retirer ce check explicite : le test côté client se réintroduirait silencieusement (le rôle reviendrait à un preset après save+reload).
- ⛔ **`GetMessage(id)` : autoriser l'auteur (v3.7.6.0)** — la garde 404 `msg.TargetUserIds.Count > 0 && !msg.TargetUserIds.Contains(userId)` bloquait l'auteur du message s'il n'était pas lui-même dans la liste de ciblage → onglet « Sent » côté user affichait un corps vide (lazy-load via `/messages/{id}` retournait 404). La condition doit inclure `&& msg.SentByUserId != userId`. Couplé : `/messages/sent` renvoie désormais `MessageDetail` (avec corps) plutôt que `MessageSummary`, pour éviter le round-trip.
- ⛔ **`.ip-perm-card{overflow:hidden}` clippe les dropdowns** : un `<select>` enrichi (`enhanceSelect`) ouvre une `.ip-sel-list` en `position:absolute` ; si la carte parente est `overflow:hidden`, la liste est coupée. Toujours utiliser `overflow:visible` sur la carte + `position:relative` pour pouvoir promouvoir `z-index` quand un dropdown est ouvert (`.ip-perm-card:has(.ip-sel.ip-open){z-index:5}`).
- ⛔ **`Cache-Control: immutable` sur les modules JS versionnés (v3.8.4.0)** — `GetJsModule` émet `Cache-Control: public, max-age=31536000, immutable` **uniquement** quand `?v=…` est présent dans la query (cas normal via `ScriptInjectionMiddleware` + `client.js`). Sans ça, chaque navigation SPA refait 6 GETs sur les modules embarqués (ex : nginx + service worker Jellyfin → 50-150 ms gaspillés/transition). Le `?v=Plugin.Instance.Version` change à chaque release et **invalide automatiquement** le cache navigateur — la combinaison cache long + query versionnée est SAFE. **Ne JAMAIS** servir `immutable` sans query (=> branche fallback `max-age=300`), et **ne JAMAIS** retirer le check `Query.ContainsKey("v")`. Voir [[project-nginx-reverse-proxy]].
- ⛔ **Loader parallèle `async=false` (v3.8.4.0)** — `client.js` insère les 6 `<script async=false>` dans un `DocumentFragment` poussé en bloc dans `<head>` ; le navigateur fetche en parallèle MAIS exécute dans l'ordre du document (spec HTML "in-order async=false dynamic scripts"). **Ne JAMAIS** revenir à la chaîne `load → loadNext(i+1)` historique : c'était 6 RTT séquentielles (≈ 300-900 ms cumulées sur connexion lente). Les dépendances inter-modules via `window.__IP` restent garanties par l'ordre d'exécution préservé.
- ⛔ **Fuite mémoire : listeners `document`/`window` doivent être retirés sur TOUS les chemins de fermeture (corrigé en v3.8.4.0).** Deux bugs historiques : (1) popup `keydown` n'était retiré que par Escape → fermeture par X/backdrop laissait le listener cumuler à chaque cycle ; (2) overlay « Mes messages » keydown/hashchange/popstate n'étaient retirés que par Escape → fermetures via back button/navigation/sidebar accumulaient. **Pattern obligatoire** : stocker les handlers dans une variable de scope ENGLOBANTE (closure de `showPopup` pour la popup, module-level `_overlayListeners` pour l'overlay), et les `removeEventListener` **inconditionnellement** dans la fonction `close`/`closeUserOverlay` — pas seulement dans la branche `if (key==='Escape')`. Un listener `document` jamais retiré retient toute la closure et ses captures (popup → backdrop DOM + messages, overlay → potentiellement la sidebar) en mémoire pour la durée de la session.
- ⛔ **Caches per-request dans `InfoPopupController` (v3.8.4.0)** — les champs `_userNameCache` / `_permCache` / `_repliesByMessage` exploitent le scoping ASP.NET Core (un contrôleur = une requête HTTP) pour éviter N lookups Jellyfin redondants. **Ne JAMAIS** les déclarer `static` ni les promouvoir au scope service : ils refléteraient des données figées entre requêtes. **Ne JAMAIS** non plus appeler `_replyStore.GetByMessageId(...)` en boucle quand on itère plusieurs messages — toujours `PreloadRepliesByMessage()` une seule fois en amont, puis `GetRepliesForMessage(id)` qui consulte le dictionnaire local. Le `_replyStore.GetAll()` interne fait *un* read-lock + un scan, au lieu de N read-locks + N scans.
- ⛔ **Skip `GET /permissions/me` dans l'overlay « Mes messages » (v3.8.4.0)** — `GET /InfoPopup/popup-data` retourne déjà `EffectivePermissionsDto` dans `Permissions` ; l'overlay les consomme via le callback `onPermsLoaded` de `loadInbox`. **Ne JAMAIS** réintroduire un `apiFetch('/InfoPopup/permissions/me')` séquentiel avant `loadInbox` : c'est 1 RTT gaspillé à chaque ouverture. Si jamais `popup-data` ne renvoie pas les perms (cas dégénéré), le défaut module-level `_userPerms` reste à `canSendMessages:false` → onglet « Envoyer » caché par défaut, comportement sûr.
- ⛔ **`SeenTrackerService` : HashSet AVANT la boucle (v3.8.5.0)** — `record.SeenMessageIds` est une `List<string>` persistée telle quelle dans `infopopup_seen.json`. En itérant des centaines de nouveaux IDs vus avec un `Contains` linéaire dessus, on bouffe O(M·N). `GetUnseenIds` et `MarkAsSeen` convertissent **d'abord** la List en HashSet, **puis** itèrent. **Ne JAMAIS** retirer la conversion en pensant simplifier : le `record.SeenMessageIds` doit rester une List<string> (pour la persistance JSON), mais le scan en mémoire doit être en HashSet. Garder aussi le garde `if (changed || removed > 0) WriteStore(...)` — un `MarkAsSeen` idempotent ne doit PAS toucher au fichier disque.
- ⛔ **`MessageStore.GetAllIds()` vs `GetAll()` (v3.8.5.0)** — quand seule la liste des IDs est nécessaire (ex. cleanup d'orphelins dans `MarkAsSeen`), utiliser `GetAllIds()` qui retourne directement une `List<string>` sans tri ni copies de PopupMessage. `GetAll()` reste utile pour le rendu et les filtres, mais une chaîne `GetAll().Select(m => m.Id)` est gâcheur — refactorer vers `GetAllIds()`.
- ⛔ **`MutationObserver` central de ip-popup.js : throttle requestAnimationFrame OBLIGATOIRE (v3.8.5.0)** — l'observer écoute `childList+subtree` sur `<body>` ; sur la page d'accueil Jellyfin, **des dizaines de mutations par seconde** (carrousels, lazy images, progress bars). Sans throttle, c'est 4 querySelector + setTimeout × ~30/s = CPU gaspillé pour des checks idempotents. Pattern : un flag `mutationPending` + `requestAnimationFrame` coalesce tous les events d'un même frame en UN callback. **Ne JAMAIS** retirer le throttle « pour simplifier » — le coût CPU revient instantanément et est sensible sur les machines modestes (Raspberry Pi, etc.) où tourne souvent Jellyfin.
- ⛔ **Accusés de lecture : `MessageSummary.SeenCount` / `TargetedCount` admin-only (v3.8.6.0).** Les champs sont `int?` (nullable) et **populés uniquement** dans la branche `if (await IsAdminAsync())` de `GetMessages` — laisser `null` côté user pour éviter de leaker l'audience d'un message à un non-admin (privacy). Le badge JS check `seenCount !== null && targetedCount !== null` avant de rendre, donc un user sans droits ne voit jamais l'info. **Ne JAMAIS** déplacer le populate hors du bloc admin, et **ne JAMAIS** rendre les champs `int` non-nullable : la valeur `0` serait visible et indiquerait quand même qu'un message ciblé existe.
- ⛔ **`/messages/{id}/views` : compter dans l'INTERSECTION cible (v3.8.6.0).** Pour un message ciblé explicitement, ne compter comme « lecteur » qu'un utilisateur dont l'ID **normalisé** est dans `TargetUserIds`. Un user hors-cible qui se serait marqué `seen` (cas dégénéré : ancienne version, bug, MarkSeen manuel via l'API) ne doit pas gonfler le compteur. Pour les messages à « Tous », tous les lecteurs comptent (admins inclus). La comparaison passe systématiquement par `PermissionService.NormalizeUserId` des deux côtés — même piège que [[guid-format-userid]].
- ⛔ **Self-sent messages filtrés des vues « Reçus » (v3.8.8.0).** `GetMessages` (chemin non-admin), `GetPopupData` et `GetUnseen` excluent désormais les messages où `IsOwner(m.SentByUserId, userId)` est true. La comparaison passe par `NormalizeUserId` (cf. [[guid-format-userid]]) — JAMAIS de `m.SentByUserId == userId` brut sur le chemin filtrage utilisateur. **Ne JAMAIS** étendre ce filtre au chemin ADMIN de `GetMessages` (`if (await IsAdminAsync()) return Ok(...)`) — l'admin doit toujours voir TOUS les messages dans son tableau de bord, y compris les siens. Le filtre concerne uniquement les vues « ce que je reçois » (popup + inbox + legacy /messages user view).
- ⛔ **Rôle « admin » dans le select Droits : option exclusive aux cartes admin (v3.8.8.0).** Pas dans `buildRoleOptions()` (sinon contaminerait le select bulk-apply et les cartes non-admin). Injectée à la volée dans `buildPermCard` UNIQUEMENT quand `isAdmin` est true, AVANT le `.forEach` qui peuple les options, suivie d'un `role = 'admin'` forcé. Le select est de toute façon disabled pour les admins, mais l'option visible évite d'afficher « Lecteur » ou « Personnalisé » pour un user qui a en réalité tous les droits. **Ne JAMAIS** ajouter 'admin' à `ROLES` (le dict des presets) — `applyRole('admin')` doit rester un no-op (early return car `ROLES['admin']` undefined), sinon le code essaiera d'appliquer un preset inexistant aux checkboxes.
- ⛔ **Bootstrap silencieux des réponses : seuil >3, pas seen.size===0 (corrigé en v3.8.8.0).** L'idée originale du « bootstrap » dans `checkReceivedReplies` était d'éviter qu'un admin qui installe le plugin sur une instance avec un historique de 50 réponses ne reçoive 50 toasts d'un coup. La logique initiale (`if (seen.size === 0)`) avait un effet de bord toxique : tout utilisateur frais (ou ayant cleared son `localStorage`) ne voyait JAMAIS sa première notif. Fix : `seen.size === 0 && replies.length > REPLIES_BOOTSTRAP_THRESHOLD` (=3). Petit volume = on notifie, gros volume = silence. **Ne JAMAIS** revenir à un check basé uniquement sur `seen.size` — c'est silencieux pour de mauvaises raisons. **Ne JAMAIS** non plus retirer le seuil — un fresh install avec 50 réponses pré-existantes spammerait l'admin.
- ⛔ **Premier `pollRepliesReceived` immédiat à l'init (v3.8.8.0).** Le `setInterval(…, 10000)` ne déclenche son premier tick qu'après 10 s, et seul ce tick appelle `pollRepliesReceived`. Sans appel d'init explicite, un user qui ouvre Jellyfin juste après qu'on lui ait répondu attendait jusqu'à 10 s (tick 1) puis potentiellement 45 s (intervalle replies) avant le toast. **Toujours** appeler `pollRepliesReceived()` une fois en synchrone après l'init de l'observer, et mettre `lastRepliesPoll = Date.now()` AVANT pour que les ticks suivants respectent l'intervalle de 45 s (sinon double-fire la première minute).
- ⛔ **Éditeur user « Mes messages → Envoyer » : mêmes helpers que l'admin (v3.8.8.0).** Le mode WYSIWYG/Raw côté user partage `ns.markdownToHtml` / `ns.htmlToMarkdown` / `ns.applyWysiwygFormat` exposés par `ip-admin.js` (block `// ── Exposition`). **Ne JAMAIS** dupliquer ces fonctions dans `ip-user.js` — la conversion markdown ↔ HTML doit rester un point unique de vérité (sinon divergence du dialecte markdown supporté entre admin et user). `applyFormat` et `toggleListLines` restent volontairement dupliqués (ils sont déjà dans `ip-user.js` historiquement, indépendants du WYSIWYG). Si `ip-admin.js` n'a pas chargé (cas dégénéré), des fallbacks `escHtml`/`textContent` empêchent un crash mais rendent sans formatage — le toolbar fonctionne quand même en mode Raw.
- ⛔ **Reset settings : NE PAS toucher à `Messages`, ni aux 3 fichiers JSON séparés (v3.8.7.0).** `ResetSettings` copie champ par champ du `new PluginConfiguration()` vers `cfg`, **uniquement** les réglages globaux (booleens, ints). `cfg.Messages` est volontairement NON réécrit — sinon on perdrait tout l'historique. Le séparateur mental : « tout ce qui est dans `PluginConfiguration.cs` SAUF Messages ». `infopopup_seen.json` / `infopopup_replies.json` / `infopopup_permissions.json` sont des fichiers distincts gérés par leurs services dédiés — `ResetSettings` ne les touche pas. Pour vider ces fichiers, utiliser les autres endpoints `/admin/clear-*`.
- ⛔ **`initSettingsTab` idempotence : reloadSettingsValues vs initSettingsTab (v3.8.7.0).** Avant v3.8.7.0, `initSettingsTab` bindait `saveBtn` ET le toggle `chkReplies.change` dans la même fonction. Appeler `initSettingsTab` plusieurs fois (par exemple après un reset) dupliquait les listeners → double save, toggle stack. **Pattern correct** : `reloadSettingsValues(page)` ne fait QUE le fetch+populate (idempotent, sans binding), `initSettingsTab(page)` a un guard `page._ipSettingsInitDone` qui force à appeler seulement `reloadSettingsValues` au 2e appel. **Ne JAMAIS** remettre les `addEventListener` à l'intérieur de `reloadSettingsValues`.
- ⛔ **Filtre recherche : « select all » et bulk-apply doivent SKIP les lignes/cards cachées (v3.8.6.0).** Sinon une recherche filtrant 5 cards sur 50, suivie d'un « tout sélectionner », sélectionne en réalité les 50 → modification massive non-souhaitée au save. Le filtre désélectionne aussi automatiquement les lignes/cards qu'il vient de masquer (pour qu'une ancienne sélection ne persiste pas en arrière-plan). À l'inverse, **le save GLOBAL itère bien sur TOUTES les cards** (visibles + cachées) — une carte cachée mais dont les droits ont été modifiés AVANT le filtrage doit toujours être persistée.
- ⛔ **`SeenTrackerService.GetSeenUsersByMessage` : bulk lookup à privilégier (v3.8.6.0).** Pour N messages, **ne JAMAIS** appeler `GetSeenUsersForMessage(id)` en boucle (chaque appel = read-lock + scan de TOUS les records). Le bulk lookup fait un single read-lock + un seul passage : retourne `Dictionary<MessageId, HashSet<UserId>>`. Un message sans aucun lecteur est ABSENT du dict (le caller doit traiter `TryGetValue` false comme « 0 lecture »). Pattern utilisé par `GetMessages` admin pour les stats inline ET par `GetMessageViews` pour le détail.
