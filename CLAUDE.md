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
| Client-side CSS prefix and DOM IDs | `.ip-` / `#infopopup-` |
| JS double-execution guard | `window.__infoPopupLoaded` |
| .NET log message prefix | `InfoPopup:` |
| Plugin GUID (immutable) | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |

### Stack
- Backend: C# / .NET 8, `IBasePlugin`, `ControllerBase`, ASP.NET Core DI
- Frontend: Vanilla JavaScript ES2020, zero framework, zero external dependency
- Persistence: XML for messages (`BasePluginConfiguration`) + JSON for views (`infopopup_seen.json`)
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
    ├── Models/{PopupMessage,SeenRecord}.cs
    ├── DTOs/MessageDtos.cs            ← request/response DTOs (separated from controller)
    ├── Services/{MessageStore,SeenTrackerService}.cs
    ├── Controllers/InfoPopupController.cs
    ├── Middleware/{ScriptInjectionMiddleware,ScriptInjectionStartupFilter}.cs
    └── Web/
        ├── client.js                  ← loader séquentiel (~50 lignes)
        ├── ip-i18n.js                 ← détection langue + dictionnaires FR/EN
        ├── ip-utils.js                ← utilitaires partagés
        ├── ip-styles.js               ← CSS idempotent dans <head>
        ├── ip-admin.js                ← page de configuration admin
        ├── ip-popup.js                ← popup utilisateur + MutationObserver
        └── configurationpage.html
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
`client.js` is a lightweight loader (~50 lines) that sequentially injects `ip-i18n.js`, `ip-utils.js`, `ip-styles.js`, `ip-admin.js`, `ip-popup.js` via dynamic `<script>` tags with `load` event chaining. All inter-module communication goes through the `window.__IP` namespace (IIFE pattern: `(function(ns){ ... }(window.__IP = window.__IP || {}))`).

### i18n — language detection
`ip-i18n.js` detects the language from `document.documentElement.lang` (set by Jellyfin Web based on user settings), with `navigator.language` as fallback. Normalized to `'fr'` or `'en'` (default). `window.__IP.t(key, ...args)` is the single translation entry point. `applyStaticTranslations(page)` in `ip-admin.js` updates all static elements of `configurationpage.html` at init time.

**Jellyfin 10.11 React Router timing issue** — in 10.11, `document.documentElement.lang` is not set when the module first loads because the `localusersignedin` event fires before the subscriber is registered (confirmed by jellyfin-web PR #4306). Two complementary mechanisms handle this:
1. **`MutationObserver`** on `document.documentElement`: whenever Jellyfin sets or changes the `lang` attribute (even with a delay), `_lang` and `_dict` are updated immediately.
2. **Lazy re-detection in `t()`**: if `_lang` was resolved from `navigator.language` (unreliable fallback), every call to `t()` re-checks `document.documentElement.lang` until it gets a value. After the first successful read from `html.lang`, the flag `_resolvedFromHtml` is set to `true` and re-checks stop.

Both mechanisms are idempotent and stop once a reliable source (`html.lang`) is available. Dynamic elements (popup, toasts, table) always use the correct language because they call `t()` after the user is signed in. Static elements from `applyStaticTranslations(page)` are refreshed on each SPA navigation to the config page (`initConfigPage` re-runs).

### Login detection: MutationObserver only
`document.body` observed with `{ childList: true, subtree: true }` + `hashchange` and `popstate` listeners. `lastCheckedPath`, `checkScheduled` and `setTimeout(800ms)` deduplicate calls.
**Mandatory guards**: `schedulePopupCheck` returns immediately if `#infoPopupConfigPage` is in the DOM, or if `popupActive === true`.

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
| POST | `/InfoPopup/messages/delete` | **admin** | Delete (body `{ ids: [...] }`) |
| GET | `/InfoPopup/popup-data` | user | Unseen + history in a single call |
| GET | `/InfoPopup/unseen` | user | Unread messages (compatibility, prefer popup-data) |
| POST | `/InfoPopup/seen` | user | Mark as seen (body `{ ids: [...] }`) |
| GET | `/InfoPopup/{module}.js` | anonymous | JS modules — whitelist: `client.js`, `ip-i18n.js`, `ip-utils.js`, `ip-styles.js`, `ip-admin.js`, `ip-popup.js` |

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
- **Never** change the GUID
- **Never** manually edit `version.json` or `<Version>` in the `.csproj` → use `make bump-*`
- **Never** manually edit `manifest.json` → use `make manifest-update` (or a full `make release-*`)
- **Never** manually edit `dist/infopopup_*.zip` or compute/paste an MD5 checksum → the Makefile downloads the ZIP from GitHub and computes the real checksum

### After
- Verify rules R1–R10
- Add the entry to `CHANGELOG.md`
- Update `README.md` and `CLAUDE.md` if the architecture or a rule changes
- **Do not** run `make bump-*` or `make release-*` — that is the human's responsibility

---

## 9. Recurring pitfalls

- ⛔ **`version.json` — NEVER edit manually.** Use `make bump-patch / bump-minor / bump-major`. The script also updates `<Version>` in the `.csproj`. Any manual edit desynchronizes the two files and will produce a mismatch between the compiled DLL version and the manifest entry.
- ⛔ **`manifest.json` — NEVER edit manually.** Use `make manifest-update` (included in all `release-*` targets). The MD5 checksum must be computed from the ZIP actually served by GitHub, not the local file. A wrong checksum causes Jellyfin to refuse the installation.
- ⛔ **`<Version>` in `.csproj` — NEVER edit manually.** It is kept in sync with `version.json` by `scripts/bump_version.sh`. Editing it alone breaks `make pack` (ZIP name derived from `version.json`) and the manifest entry.
- ⛔ **`dist/*.zip` — NEVER commit or modify manually.** It is a build artifact, regenerated by `make pack`. It is excluded from git via `.gitignore`.

- ⛔ **`build.yml` — NEVER add `release: [created]` trigger.** This was the root cause of the checksum mismatch bug. When `make gh-release` creates a GitHub Release, `release: [created]` would re-trigger `build.yml`, which recompiles in a different environment and uploads a competing ZIP. Even with a different filename (e.g. with `v` prefix), it creates a CDN race condition that corrupts the MD5 in manifest.json. `build.yml` must only trigger on `push` and `pull_request`. `release.yml` was already fixed for this; `build.yml` must stay fixed too.

- All JS modules (`client.js`, `ip-*.js`) must be `<EmbeddedResource>` in the `.csproj` — otherwise 404 on `/InfoPopup/{module}.js`
- Assembly resource names: the .NET SDK replaces hyphens (`-`) and other non-identifier characters with underscores (`_`) in embedded resource manifest names. `ip-admin.js` becomes `Jellyfin.Plugin.InfoPopup.Web.ip_admin.js`. The controller applies `fileName.Replace('-', '_')` before calling `GetManifestResourceStream`. **Never remove this replacement.**
- **Module loading order is critical**: `ip-popup.js` depends on `ip-admin.js` (calls `ns.checkConfigPage`), which depends on `ip-utils.js` and `ip-styles.js`, which depend on `ip-i18n.js`. The loader in `client.js` enforces sequential loading via `load` events.
- **`window.__IP` namespace**: every module extends `window.__IP = window.__IP || {}`. Never access another module's functions directly — always go through `ns.functionName`.
- **`GET /InfoPopup/{module}.js` whitelist**: only filenames in `_allowedModules` are served. Adding a new module requires updating both the whitelist in the controller AND the `<EmbeddedResource>` list in the `.csproj`.
- **`_lang` frozen at load time (Jellyfin 10.11)**: in 10.11 with React Router, `document.documentElement.lang` is empty when `ip-i18n.js` loads, so `detectLang()` falls back to `navigator.language`. If the browser and Jellyfin are in different languages, all strings are wrong. The fix is the MutationObserver + lazy `t()` re-detection pattern already in place — **never remove these mechanisms** or replace them with a single `var _lang = detectLang()` call.
- **Adding a new language**: add a new dictionary in `_dicts`, add a case in `normalizeLang()`. All keys present in `en` and `fr` must be present in the new dictionary.
- **i18n — `t()` with plurals**: use separate keys (`key_singular` / `key_plural`) and select the key before calling `t()`. Never try to add pluralization logic inside `t()`.
- **i18n — `applyStaticTranslations()`**: called once at config page init. If a new translatable element is added to `configurationpage.html`, add its `id` to the `map` in `applyStaticTranslations()` in `ip-admin.js`.
- `HttpContext.User.FindFirst("Jellyfin-UserId")` — not `User.Identity.Name`
- Admin policy: `"RequiresElevation"` in Jellyfin 10.10+
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
