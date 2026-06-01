# Info Popup — User Guide

> A practical, non-technical guide to using the Info Popup plugin in Jellyfin.
> For installation, see the [main README](../README.md). For developer details, see [CLAUDE.md](../CLAUDE.md).

## Table of contents

- [What this plugin does](#what-this-plugin-does)
- [For administrators](#for-administrators)
- [For regular users](#for-regular-users)
- [Message formatting](#message-formatting)
- [Languages](#languages)
- [FAQ / troubleshooting](#faq--troubleshooting)

---

## What this plugin does

**Info Popup** lets administrators of a Jellyfin server broadcast announcement popups that appear when users log in (or navigate the web client). Beyond simple broadcasts, it can also be configured as a lightweight internal messaging system:

- One-to-many announcements ("Maintenance tonight at 8 PM")
- One-to-one or one-to-few targeted notes ("Hey @alice, your watch list import finished")
- A reply channel so users can answer
- A scoped permission system so trusted users can send messages too, with daily quotas

The plugin works through the **Jellyfin web client only**: any browser, any platform with a browser (desktop, mobile browser, Jellyfin Media Player), and PWAs. Native mobile/TV apps do not display the popup — see [Compatibility in the README](../README.md#compatibility).

---

## For administrators

### Where to find the plugin

After install, two entries appear in the Jellyfin sidebar:

1. **Info Popup** (admin section, with a bell icon) — the configuration page.
2. **My Messages** (under your username) — the same overlay regular users see, opened with your admin account.

> The Info Popup item only appears for accounts marked *Administrator* in Jellyfin. If it's missing, double-check the account policy.

### The four admin tabs

The configuration page has four tabs at the top:

| Tab | What it does |
|-----|-------------|
| **Messages** | Publish, edit, delete messages. Shows the full message list. |
| **Settings** | Global plugin options (popup on/off, auto-close, allow replies, retention…). |
| **Replies** | All replies grouped by message, with delete actions. |
| **Permissions** | Per-user roles and daily quotas. |

### Publishing a message

In the **Messages** tab:

1. Type a **title** (max 200 characters).
2. Type a **body** in either:
   - **WYSIWYG mode** (default) — rich text, use the toolbar or `Ctrl+B / I / U / Shift+S` shortcuts.
   - **Raw mode** (toggle in the editor header) — direct markdown-style input. See [Message formatting](#message-formatting).
3. Choose the **recipients**:
   - **All users** (checkbox checked) — broadcast.
   - Or uncheck "All users" and pick specific users from the list.
4. Click **Publish**.

The message immediately becomes available. Users with browsers open right now will see it on their next navigation; users who connect later will see it on their next login.

### Editing and deleting

In the Messages table:

- **Edit** — click the pencil icon on a row. The compose form fills with the message; click **Save** when done. *Editing a message does not re-display it to users who already saw it* — they keep their "seen" state even if the body changes.
- **Delete** — select one or more rows via the checkboxes and click the trash icon at the top. Deleted messages disappear permanently for everyone, in the popup, the inbox, and the history. Replies to a deleted message are also deleted.

### Read receipts — who saw what

Each message in the admin Messages tab shows a small badge like `3 / 10` — meaning 3 of the 10 targeted users have seen it. Click the badge to open a modal listing the names in two columns: **Read by** and **Not read by**.

- For a "send to all" message, the audience is the entire Jellyfin user base, including admins.
- For a targeted message, only the targets count.
- A user only appears as "read" once they've actually been shown the popup (or opened it from their inbox).

### Managing replies

The **Replies** tab lists every reply, grouped by the message it replies to:

- Click a message header to expand its replies.
- Each reply has a small delete button (admin-only).
- The "Delete all replies for this message" action wipes all replies for one message at once.
- Deleting the parent message also deletes its replies.

### Permissions and roles

The **Permissions** tab (called *Droits* in French) lists every Jellyfin user with a per-user card.

Each user gets a **role** that maps to a set of fine-grained flags:

| Role | Send | Reply | Edit own | Delete own | Edit others | Delete others |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| **Reader** (default) | — | — | — | — | — | — |
| **Contributor** | ✅ | ✅ | ✅ | ✅ | — | — |
| **Moderator** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Custom** | configurable via the "Details" toggle on each card |
| **Administrator** | All (auto, locked to admin accounts, cannot be changed) |

Each card also has two daily quotas:

- **Max messages/day** — how many new messages this user can send per day. `0` = unlimited.
- **Max replies/day** — how many replies they can send per day. `0` = unlimited.

#### Bulk operations

A toolbar at the top of the Permissions tab lets you:

- Select all / deselect all / invert the selection (admins are skipped).
- Apply a role and daily limits to all *selected* cards at once via **Apply to selection**.
- Search for a user (the search box filters the cards — only matching cards are affected by select-all and bulk-apply).

#### Saving

There is **one global Save button at the bottom** of the Permissions tab. Nothing is persisted until you click it. Changes are sent in parallel for all cards.

### Settings reference

The **Settings** tab. Every option saves on **Save**; some require a popup re-open to take effect.

| Setting | What it does |
|---------|-------------|
| **Enable popup** | Master switch. When OFF, no popup appears at login (messages are still readable from the inbox). |
| **Auto-close countdown (ms)** | A countdown bar at the top of the popup. After this duration, the popup closes itself. `0` = no auto-close, the user must click Close. |
| **Max messages in popup** | Limits how many cards appear simultaneously in the popup. Older unread messages get marked seen anyway. |
| **Allow replies** | Master switch for the reply system. When OFF, the reply field is hidden in the popup for everyone (admins included) and `POST /reply` returns 403. |
| **Enable history** | Shows previously-seen messages collapsed at the bottom of the popup. |
| **Rate limit (ms)** | Minimum delay between two Publish clicks (admin side). Protects against accidental double-submit. |
| **Admin retention (days)** | Auto-delete admin-sent messages after this many days. `0` = keep forever. |
| **User retention (days)** | Auto-delete user-sent messages after this many days. `0` = keep forever. |

### Maintenance actions

At the bottom of the **Settings** tab, four destructive actions. Each asks for confirmation:

| Action | Effect | What is NOT touched |
|--------|--------|--------------------|
| **Clear all views** | Empties `infopopup_seen.json` — every user sees every existing unseen message again on next connection. | Messages, settings, replies, permissions. |
| **Clear all replies** | Empties `infopopup_replies.json` — every reply ever sent is gone. | Messages, settings, views, permissions. |
| **Purge deleted messages** | Hard-deletes messages that were soft-deleted (and cascades their replies). Useful after a retention sweep. | Active messages, settings, views, permissions. |
| **Reset settings** | Resets all global settings to defaults (popup OFF, replies OFF, all retentions to 0, etc.). | Messages, views, replies, **permissions**. |

> The four "clear" actions are independent — running one doesn't affect the others. To wipe the plugin's entire state, run all four.

---

## For regular users

### The login popup

When you connect to Jellyfin via the web (browser, PWA, or Jellyfin Media Player), if the admin has sent you a new message, a popup appears within a second of arriving on the home page.

- **Multiple messages** — each one appears as a card inside the same popup.
- **Countdown bar** — if the admin enabled auto-close, a thin progress bar at the top counts down; you can also click Close at any time.
- **History** — if enabled, a collapsed list of previously-seen messages appears under the unread ones. Click a title to expand its body.

Once you close the popup, every visible *unread* message is marked as seen and won't pop up again — even on another device.

### Replying to a message

If the admin enabled replies globally AND your account has the *Reply* permission, each message card in the popup has a small reply textarea + **Send** button at the bottom.

- One reply per message per user (you can't reply twice to the same message).
- Daily quota applies (default 10/day, see your admin).
- Reply length is limited; the editor stops you past the cap.

> If you don't see the reply zone or you see "*Replies are disabled*" on Send, ask your admin — they need to enable replies globally AND give you the per-user permission.

### The "My Messages" sidebar

A **My Messages** entry appears in the Jellyfin sidebar (under your username area) for every authenticated user. It opens a full-screen overlay with up to three tabs:

| Tab | Always shown? | Contents |
|-----|---------------|----------|
| **Inbox** | Yes | Every message you've received (popped-up or not), collapsible cards. Click a card to expand the body. |
| **Send** | Only if you have *Send messages* permission | A compose form (same as the admin's, with formatting toolbar). |
| **Sent** | Only if you have *Send messages* permission | History of messages you sent, including responses received. |

**In the Inbox**, you can also:
- See the replies *you* sent to each message, inline under the message body.
- (If your admin gave you the right) edit or delete a message you received.

**In Sent**, you can also:
- See the replies *others* sent to your messages, listed under each sent message.
- (If your admin gave you the right) edit or delete your sent messages.

### Sending a message to other users

If your account has the *Send messages* permission, the **Send** tab appears.

1. Title + body (same formatting/editor as the admin's).
2. Pick recipients (all users, or a specific subset).
3. Click **Send**.

A daily quota applies (default 5/day, configurable per user by the admin).

### Reply notifications

When someone replies to one of your sent messages, a small toast appears at the bottom-right of the screen ("New reply from Alice"). This works in the background while you're navigating Jellyfin — no need to keep "My Messages" open.

- Polled roughly every 45 seconds while the tab is visible.
- Immediate check when you switch back to the tab from another window.
- Only new replies trigger a toast; replies seen before don't re-notify.

---

## Message formatting

The body editor supports a light Markdown-like syntax. In WYSIWYG mode you don't need to type it — the toolbar buttons and keyboard shortcuts insert the formatting visually. In Raw mode (toggle at the top of the editor), you type the syntax directly:

| Syntax | Result | Shortcut |
|--------|--------|---------|
| `**bold**` | **bold** | `Ctrl+B` |
| `_italic_` | *italic* | `Ctrl+I` |
| `__underline__` | underline | `Ctrl+U` |
| `~~strikethrough~~` | ~~strikethrough~~ | `Ctrl+Shift+S` |
| Lines starting with `- ` | bulleted list | toolbar button |

This same formatting is rendered in the popup, the inbox, the history, and the admin table.

---

## Languages

The plugin automatically picks the language of your Jellyfin account. Supported:

- English (default)
- French
- Spanish
- German
- Portuguese
- Italian
- Japanese
- Chinese (Simplified)

Any other language falls back to English. The same translation covers admin UI, user inbox, popup, toasts, and error messages.

---

## FAQ / troubleshooting

### Why don't I see the popup on my mobile / TV app?

Native Jellyfin apps (Android, iOS, Roku, Kodi, Swiftfin, Findroid…) render their own UI and bypass the web client's JavaScript. The plugin's popup only works in a browser or in clients that embed the web client (Jellyfin Media Player desktop, PWAs). You'll still see pending messages the next time you connect via a browser. See the [Compatibility table](../README.md#compatibility) in the README.

### Can I disable replies entirely?

Yes — in the **Settings** tab, turn off **Allow replies**. The reply zone disappears for all users (including admins), and the server rejects any reply attempt. Existing replies are preserved unless you also run *Clear all replies* in the maintenance section.

### How do I reset everything?

To wipe the plugin's state without uninstalling:

1. **Settings → Reset settings** — restores defaults.
2. **Settings → Clear all views** — every user re-sees pending messages.
3. **Settings → Clear all replies** — wipes the replies file.
4. Manually delete all messages from the **Messages** tab.

Permissions are kept across resets — to wipe those, delete `infopopup_permissions.json` from the plugin data folder and restart Jellyfin.

### My admin account shows as "Reader" in the Permissions tab

The plugin tries to detect admin status via multiple Jellyfin APIs (because the API changed across 10.11.x patch levels). If your install is on an unusual Jellyfin variant, this detection can fail and your admin account is shown as a regular user. Since **v4.0.3.0**, four detection paths are tried in sequence; if all fail, the row will look like a normal user but your account still has admin powers everywhere else (Jellyfin's own admin policy is authoritative).

Workaround if the row stays as Reader: it's purely cosmetic — admin accounts are not enforced through this row anyway, all their permissions are wired through Jellyfin's `RequiresElevation` policy on the server.

### After installing/updating, the popup interface is blank or has white buttons until I `Ctrl+Shift+R`

This is a known cross-plugin Jellyfin limitation (issues [jellyfin-web#5494](https://github.com/jellyfin/jellyfin-web/issues/5494), [#4549](https://github.com/jellyfin/jellyfin-web/issues/4549)): when the plugin is freshly installed, your browser may still hold a cached copy of `index.html` from *before* the install, which has no `<script>` tag pointing to the plugin.

Since **v4.0.2.0**, the config page detects this and force-reloads itself once. You may see a brief flicker the very first time you open the plugin config page after install — that's the recovery firing. After that, no hard refresh is required.

If the issue persists past one reload: restart Jellyfin (the plugin DLL may not be loaded yet), or try `Ctrl+Shift+R` once.

### A user can't reply, getting "Replies are disabled"

Two switches must both be ON:

1. **Settings → Allow replies** (global master switch — admin-only).
2. **Permissions → user's card → Can reply** (per-user — Contributor and Moderator roles have it by default; Reader does not).

If the global switch is OFF, even users with the per-user permission can't reply. Since v4.0.3.0, the reply zone is hidden entirely when the global switch is off, so no one gets a surprise 403.

### I see one plugin in the catalog but there are actually two binaries — what gives?

Since v4.1.0.0 the plugin ships a different DLL for Jellyfin 10.10.x and Jellyfin 10.11.9+ (the underlying user-management APIs differ between these versions). The manifest declares both with their respective `targetAbi`, and Jellyfin automatically downloads the right one for your server — so you still see and install **one** plugin entry. If you're curious which variant you got, the file name visible in the plugins folder will be either `infopopup_X.Y.Z.W-jf10.10.zip` or `infopopup_X.Y.Z.W-jf10.11.zip` (only one is installed).

If you run a Jellyfin between 10.11.0 and 10.11.8, the catalog will show no compatible version. Update Jellyfin to 10.11.9 (current stable) — the plugin will then install cleanly.

### Where is the plugin data stored?

Inside the Jellyfin plugins folder (e.g., `/config/plugins/InfoPopup/` on Docker, `~/.local/share/jellyfin/plugins/InfoPopup/` on Linux):

| File | Contents |
|------|---------|
| `Jellyfin.Plugin.InfoPopup.dll` | The plugin binary. |
| `infopopup_seen.json` | Who has seen which messages. |
| `infopopup_replies.json` | All replies. |
| `infopopup_permissions.json` | Per-user roles and quotas. |

The actual messages and global settings are stored in the standard Jellyfin plugin configuration XML, managed by Jellyfin itself.
