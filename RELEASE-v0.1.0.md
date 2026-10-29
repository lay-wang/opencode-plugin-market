## v0.1.0 — first release

A plugin market inside the OpenCode desktop app.

### What you get

- **Settings › Plugin Market** page listing the full [OpenDock](https://www.opendock.net/zh/plugins/) catalog (2,700+ plugins).
- Search across names, titles and descriptions.
- Filters that mirror OpenDock: category, maintenance health, OpenCode version (V1/V2), last commit, minimum stars — with live counts per option.
- **Install** runs `opencode plugin add <name>`; **Uninstall** runs `opencode plugin remove <spec>`.
- The row waits until the server has actually loaded (or dropped) the plugin, so a plugin that installs but fails to load reports its error instead of looking healthy.
- One-time confirmation before the first install, since plugins run with your privileges.
- Catalog cached for 12 hours; the refresh button re-fetches it.

### Install

```sh
opencode plugin add opencode-plugin-market
```

### Known limits

- Global configuration only — the desktop app has no per-project plugin toggle.
- Catalog metadata comes from OpenDock as-is; the `opencode` version field is frequently `null` even for working plugins, so it is shown as a badge rather than used to filter results away.
