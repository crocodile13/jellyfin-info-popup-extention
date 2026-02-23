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
    └── Web/{client.js,configurationpage.html}
```

---

## 3. version.json — Single source of truth

**Never edit version numbers manually. Use `make bump-*`.**

```json
{
  "major": 0,
  "minor": 6,
  "patch": 0,
  "targetAbi": "10.10.0.0"
}
```

---

## 4. Makefile workflow — Complete reference

```bash
make              # Help
make check        # Verify dotnet, git, jq, gh CLI
make build        # Compile in Debug
make build-release
make pack         # Release + ZIP in dist/
make clean

make bump-patch / bump-minor / bump-major
make release-patch / release-minor / release-major
```

**Internal sequence of `release-*`:**
1. bump version → `version.json` + `.csproj`
2. `pack` → `dist/infopopup_X.Y.Z.0.zip`
3. `manifest-update` → MD5, prepend entry in `manifest.json`
4. `push` → commit + push main
5. `tag` → git tag + push
6. `gh-release` → GitHub Release + upload ZIP

---

## 5. Architecture — Critical points

### Mandatory dual-layer SPA
Jellyfin-Web is a SPA. All client UI goes through `Web/client.js` injected into `index.html`. No server-side HTML rendering.

### Automatic injection via middleware
`ScriptInjectionMiddleware` intercepts `/`, `/web`, `/web/`, `/web/index.html` and injects `<script src="/InfoPopup/client.js"></script>` before `</body>`.

### Login detection: MutationObserver only
`document.body` observed with `{ childList: true, subtree: true }` + `hashchange` and `popstate` listeners. `lastCheckedPath`, `checkScheduled` and `setTimeout(800ms)` deduplicate calls.
**Mandatory guards**: `schedulePopupCheck` returns immediately if `#infoPopupConfigPage` is in the DOM, or if `popupActive === true`.

### View tracking: 100% server-side
`infopopup_seen.json` via `SeenTrackerService`. Never `localStorage` / `sessionStorage` / cookie.

### Message edit: stable ID
`PUT /InfoPopup/messages/{id}` updates title and body without changing the ID. `infopopup_seen.json` is not touched. A user who had already seen the message will not see it again after editing.

`MessageStore.Update()` returns `PopupMessage?` (snapshot captured inside the lock) and not `bool`. The controller uses this snapshot directly — never add a `GetById()` call after `Update()` (TOCTOU).

### Formatted preview (v0.6)
The admin input field toggles between two modes via `setPreviewMode(page, on)`:
- **Preview (on=true)**: `#ip-body-preview` div visible, `#ip-body` hidden. Rendered via `updatePreview(page)` → `renderBody()`.
- **Raw (on=false)**: `#ip-body` textarea visible, `#ip-body-preview` hidden.

Mandatory rules:
- `enterEditMode` → `setPreviewMode(page, false)` (admin must be able to edit).
- `exitEditMode` → `setPreviewMode(page, true)` (return to preview after cancellation).
- `publishMessage` POST success → `setPreviewMode(page, true)`.
- Click on a format button → `setPreviewMode(page, false)` before applying.
- Click on the preview → `setPreviewMode(page, false)`.
- `updatePreview(page)` is called on each textarea `input` event and inside `setPreviewMode(page, true)`.
- **Never** show the textarea and the preview div simultaneously.

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
| PUT | `/InfoPopup/messages/{id}` | **admin** | Edit title/body (stable ID, views preserved) |
| POST | `/InfoPopup/messages/delete` | **admin** | Delete (body `{ ids: [...] }`) |
| GET | `/InfoPopup/popup-data` | user | Unseen + history in a single call |
| GET | `/InfoPopup/unseen` | user | Unread messages (compatibility, prefer popup-data) |
| POST | `/InfoPopup/seen` | user | Mark as seen (body `{ ids: [...] }`) |
| GET | `/InfoPopup/client.js` | anonymous | Embedded client script |

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
| R8 | `PUT /InfoPopup/messages/{id}` **never** modifies the ID or `infopopup_seen.json` — an edited message is not re-displayed to users who had already seen it. |
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
- **Never** manually edit `version.json` or `<Version>` in the `.csproj`
- **Never** manually edit `manifest.json`

### After
- Verify rules R1–R10
- Add the entry to `CHANGELOG.md`
- Update `README.md` and `CLAUDE.md` if the architecture or a rule changes

---

## 9. Recurring pitfalls

- `client.js` must be `<EmbeddedResource>` in the `.csproj` — otherwise 404 on `/InfoPopup/client.js`
- The assembly resource name is exactly `Jellyfin.Plugin.InfoPopup.Web.client.js`
- `HttpContext.User.FindFirst("Jellyfin-UserId")` — not `User.Identity.Name`
- Admin policy: `"RequiresElevation"` in Jellyfin 10.10+
- **`popupActive` reset too early**: never set `popupActive = false` before the `.finally()` of `markAllSeen()`. Symptom: the popup reappears immediately after closing if navigation is fast.
- **DELETE with body**: use `POST /InfoPopup/messages/delete`. Never revert to `DELETE` with a body — it may be silently ignored by proxies.
- **`GetConfig()` outside lock**: always capture `var cfg = GetConfig()` inside the locked block in `MessageStore`. Never access it via the static property directly in a multi-step operation.
- **SeenTrackerService cache**: do not read the JSON file directly — always go through `ReadStore()` which handles the cache.
- **`injectStyles()` not called**: any component that generates DOM elements styled by IP classes must ensure `injectStyles()` has been called. Symptom: styles missing when navigating directly to the config page.
- **`renderBody()` vs `textContent`**: use `renderBody()` + `innerHTML` for message body rendering. Never use `textContent` for final rendering.
- **Dynamic `emby-checkbox`**: `<span></span>` empty = 0px = zero click area. Always use native `<input type="checkbox">` with inline `accent-color`.
- **SPA styles**: the `<style>` blocks in `configurationpage.html` disappear during transitions. All CSS for overlays/elements added to `<body>` must be in `injectStyles()`.
- **PascalCase fallback**: always `msg.body || msg.Body || ''` — never a single casing.
- **Jellyfin 10.11**: React Router + MUI. Legacy selectors (`#indexPage`, `.homePage`) no longer exist. MutationObserver on `document.body` without selector restriction is the only reliable approach.
- **`PUT` without changing the ID**: never recreate a message to simulate an edit. Always go through `MessageStore.Update()` which preserves the ID and doesn't touch `infopopup_seen.json`.
- **`Update()` returns `PopupMessage?`**: never call `GetById()` after `Update()` in the controller — the snapshot returned by `Update()` is the source of truth (eliminates TOCTOU).
- **Forgotten `setPreviewMode` / `updatePreview`**: any code that programmatically modifies `bodyEl.value` (enterEditMode, exitEditMode, post-publish reset) must call `setPreviewMode` and/or `updatePreview`. Symptom: the preview shows old content or the textarea remains visible after publishing.
- **`usersCache` TTL**: `fetchUsers()` applies a 5-minute TTL via `usersCacheAt`. Do not remove this mechanism — without it, users created during the session are invisible in the targeting selector.
- **Admin styles in `injectStyles()`**: table, badges, toast, target picker, toolbar, editor-wrap and toggle switch are in `injectStyles()`. Never put them back in a `<style>` in `configurationpage.html` — they would disappear on SPA navigation.
