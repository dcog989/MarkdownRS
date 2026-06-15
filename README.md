# MarkdownRS

MarkdownRS is a text editor focused on editing, formatting, and previewing Markdown. It prioritises performance and a clean, minimal UI while still being fully featured for technical and general users.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![GitHub Issues](https://img.shields.io/GitHub/issues/username/repo.svg)](https://github.com/username/repo/issues) [![GitHub Stars](https://img.shields.io/GitHub/stars/username/repo.svg)](https://github.com/username/repo/stargazers)

[insert screenshot]

The only Markdown editor you need? Many people are saying so.

## Features

- Fast, Low Resource Use: Built with Rust backend for instant startup and smooth editing.
- Live Preview: Split view with smooth, bi-directional synchronized scrolling.
- Auto-Save: Session persistence with hot-exit support - never lose your work.
- Themes: Dark-mode aware, you can easily create your own theme.
- Command Palette: Efficient navigation with command palette (Ctrl+Shift+P).
- Keyboard Shortcuts: Customise any command shortcut as you want.
- Multi-Tab: Work on multiple documents simultaneously, pin them, bookmark them.
- Text Operations: Sort lines, trim whitespace, change case, etc.
- Bookmark System: Bookmark and tag local documents with instant filter search.
- Full Markdown Support: GFM (GitHub Flavored Markdown) and CommonMark with tables, strikethrough, task lists, etc.
- Smart Formatting: Auto-Markdown formatting for consistent, semantic-preserving results.
- Find & replace across all documents
- Export to PDF/PNG/WEBP/HTML

## Code / Dev Stack

Developed using the latest versions of:

- [Tauri](https://v2.tauri.app/)
- [Rust](https://www.rust-lang.org/)
- [Svelte](https://svelte.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [CodeMirror](https://codemirror.net/)
- [SQLite](https://sqlite.org/)

Along with these dev tools:

- [Node.js](https://nodejs.org/)
- [bun](https://bun.com/)
- [Vite](https://vite.dev/)
- [Velopack](https://velopack.io/)

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for production
bun run package
```

CachyOS build: `makepkg -sif`

### Available Scripts

- `bun run check` - Type-check Svelte files
- `bun run clean` - Remove everything (build, target, and node_modules)
- `bun run dev` - Start dev server / HRM
- `bun run format` - Format code with Prettier + 'cargo fmt'
- `bun run preview` - Preview the production build

### rumdl Config Cascade

rumdl resolves configuration in this priority order (highest → lowest):

1. **Explicit `--config <path>`** — Skips auto-discovery entirely.
2. **Upward walk from CWD** (to git root / `$HOME`) — Per directory, tries: `.rumdl.toml` → `rumdl.toml` → `.config/rumdl.toml` → `pyproject.toml` (`[tool.rumdl]`). Falls back to `.markdownlint*` / `markdownlint.*` files if none found.
3. **User config fallback** (only if step 2 finds nothing) — `$XDG_CONFIG_HOME/rumdl/` or `~/.config/rumdl/`, then `~/.rumdl.toml`, then `~/rumdl.toml`.
4. **CLI inline overrides** (`--config 'RULE.key=value'`) — Always wins last.

## Roadmap

- TBD

## Contributing

 [Pull Requests](https://github.com/dcog989/MarkdownRS/pulls) and [bug reports / feature requests](https://github.com/dcog989/MarkdownRS/issues) are welcomed.

## License

[MIT License](https://github.com/dcog989/MarkdownRS/blob/main/LICENSE).

```text

```
