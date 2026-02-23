# jellyfin-info-popup-extention

A Jellyfin plugin that allows administrators to display popup messages to users when they log in.

This extension was almost entirely vibe-coded by Claude. That's intentional: I simply needed such an extension and didn't want to embark on a ten-day development project.

---

## 📸 Preview

Config page:
![Preview 1](images/image1.png)
Popup example:
![Preview 2](images/image2.png)

---

## Features

- **Multilingual UI**: admin page and user popup automatically displayed in the user's Jellyfin language — supported: English, French, Spanish, German, Portuguese, Italian, Japanese, Chinese (Simplified). Falls back to English for any other language.
- **Login popup**: post-login detection via MutationObserver (SPA-compatible, tested on Jellyfin 10.10–10.11)
- **Show once**: server-side tracking — no localStorage, works across all devices
- **Multiple unread messages**: if several messages haven't been read yet, each one is displayed in its own card (title + body) within the same popup
- **Collapsible history**: previously seen messages in an accordion collapsed by default, with body available on click
- **Body formatting**: lightweight syntax — `**bold**`, `_italic_`, `__underline__`, `~~strikethrough~~`, `- list` lines
- **Admin page**: publishing, multiple selection, confirmed deletion, editing existing messages
- **Edit without re-display**: an edited message (`PUT`) keeps its ID — users who had already seen it won't see it again
- **Editable targeting on edit**: the recipients selector is pre-filled with the current message targeting when entering edit mode — title, body and recipients can all be changed in a single operation
- **Formatting toolbar**: row of buttons above the textarea to apply formatting without typing the syntax manually; buttons act directly on the always-visible textarea without switching view modes
- **Optional formatted preview**: a formatted preview panel can be displayed below the textarea via the "Preview" toggle — the textarea remains visible at all times regardless of this setting
- **Inline row expand**: click on a message title in the admin table to display its body inline
- **Full deletion**: a deleted message disappears immediately, everywhere, for everyone
- **Auto-injection**: `client.js` injected into `index.html` by `ScriptInjectionMiddleware` — no manual modification required
- **Jellyfin theme integration**: native CSS variables, standard dashboard classes
- **XSS security**: `escHtml()` applied before any rendering, no raw user HTML in the DOM
- **Targeting access control**: users can only see messages intended for them, including via the direct API

---

## Add the repository in Jellyfin

```
Dashboard → Plugins → Repositories → Add
URL: https://raw.githubusercontent.com/crocodile13/jellyfin-info-popup-extention/main/manifest.json
```

Then install **Info Popup** from the catalogue and restart Jellyfin.

> **Docker fallback**: if a volume mounts a custom `index.html` that overrides the Jellyfin-Web one, manually add before `</body>`:
> ```html
> <script src="/InfoPopup/client.js"></script>
> ```

---

## Manual installation

1. Download `infopopup_X.Y.Z.0.zip` from [Releases](../../releases)
2. Extract `Jellyfin.Plugin.InfoPopup.dll` into:
   - Linux: `~/.local/share/jellyfin/plugins/InfoPopup/`
   - Docker: `/config/plugins/InfoPopup/`
3. Restart Jellyfin

---

## Message formatting syntax

The message body supports a lightweight syntax:

| Syntax | Render |
|--------|--------|
| `**text**` | **bold** |
| `_text_` | *italic* |
| `__text__` | underline |
| `~~text~~` | strikethrough |
| Line starting with `- ` | bulleted list item |

Formatting is rendered in the user popup, in the history, and in the admin table expand rows.

---

## Development

### Prerequisites

| Tool | Version |
|------|---------|
| [.NET SDK](https://dotnet.microsoft.com) | 8.x |
| [git](https://git-scm.com) | >= 2.x |
| [jq](https://stedolan.github.io/jq/) | >= 1.6 |
| [GitHub CLI](https://cli.github.com) | >= 2.x |

### Initial setup

```bash
git clone https://github.com/YOUR_ACCOUNT/jellyfin-info-popup-extention
cd jellyfin-info-popup-extention

cp .env.make.example .env.make
# Edit .env.make: GITHUB_USER = your-login

make check
```

### Available commands

```bash
make              # Help + Jellyfin repository URL

make build        # Compile in Debug
make pack         # Compile Release + create ZIP in dist/
make clean        # Clean bin/, obj/, dist/*.zip

make bump-patch   # 0.4.0.0 -> 0.4.1.0
make bump-minor   # 0.4.0.0 -> 0.5.0.0
make bump-major   # 0.4.0.0 -> 1.0.0.0

make release-patch
make release-minor
make release-major
```

### Release workflow

```bash
# 1. Add your changes to CHANGELOG.md
# 2. Run the release
make release-minor   # or patch / major
```

### Cleaning build artifacts from the repository

If `bin/` and `obj/` were committed by mistake before being in `.gitignore`:

```bash
git rm -r --cached Jellyfin.Plugin.InfoPopup/bin/ Jellyfin.Plugin.InfoPopup/obj/
git commit -m "chore: untrack bin/ and obj/ build artifacts"
```

---

## Architecture

```
REST API (/InfoPopup/*)               JS Client (injected into index.html)
┌─────────────────────────────────┐   ┌────────────────────────────────────────────┐
│ GET    /messages          [user]│   │ ScriptInjectionMiddleware → index.html     │
│ GET    /messages/{id}     [user]│◄──│ MutationObserver → all SPA navigation      │
│ POST   /messages         [ADMIN]│   │ Guards: popupActive, #infoPopupConfigPage  │
│ PUT    /messages/{id}    [ADMIN]│   │ GET /InfoPopup/popup-data (1 single call)  │
│ POST   /messages/delete  [ADMIN]│   │ showPopup() → renderBody() → innerHTML     │
│ GET    /popup-data        [user]│   │ close → POST /seen → popupActive=false     │
│ GET    /unseen            [user]│   └────────────────────────────────────────────┘
│ POST   /seen              [user]│
│ GET    /client.js         [anon]│   Admin Page (Jellyfin dashboard)
└─────────────────────────────────┘   ┌────────────────────────────────────────────┐
                                       │ POST /messages        → publish            │
Access control                         │ PUT  /messages/{id}   → edit (stable ID,  │
┌─────────────────────────────────┐   │                          title/body/target)│
│ Admins: all messages            │   │ POST /messages/delete → confirm modal      │
│ Users:  targeted only           │   │ GET  /messages        → table + editing    │
│ Missing UserId → 401            │   │ Toolbar: B I U S • List (always on textarea│
│ Not targeted → 404 (not 403)    │   │ Preview toggle: optional panel below       │
└─────────────────────────────────┘   └────────────────────────────────────────────┘

                                       Persistence
                                       ┌────────────────────────────────────────────┐
                                       │ XML  : messages (BasePluginConfiguration)  │
                                       │ JSON : infopopup_seen.json (memory cache)  │
                                       └────────────────────────────────────────────┘
```

---

## Compatibility

| Jellyfin | .NET | Status |
|----------|------|--------|
| 10.10.x  | 8.0  | Supported |
| 10.11.x  | 8.0  | Tested (React/MUI dashboard) |

---

## License
GPL3

## Contributing
If you modify the code, add features or fix bugs, please share your work!
