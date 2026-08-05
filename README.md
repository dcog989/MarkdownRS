# MarkdownRS

MarkdownRS is a text editor focused on editing, formatting, and previewing Markdown. It prioritises performance and a clean, minimal UI while still being fully featured for technical and general users.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![GitHub Issues](https://img.shields.io/GitHub/issues/username/repo.svg)](https://github.com/username/repo/issues) [![GitHub Stars](https://img.shields.io/GitHub/stars/username/repo.svg)](https://github.com/username/repo/stargazers)

[insert screenshot]

The only Markdown editor you need? Many people are saying so.

## Features

- Fast, Low Resource Use: Built with Rust backend for instant startup and smooth editing.
- Live Preview: Split view with smooth, bi-directional synchronized scrolling.
- Auto-Save: Session persistence with hot-exit support - never lose your work.
- File Tree: Sidebar file tree for browsing and opening files.
- New File Template: Create new files from a configurable template.
- Themes: Multiple built-in light and dark themes, plus custom themes.
- Rendered Mode: Edit in rendered or raw Markdown mode.
- KaTeX Math: Render math in the preview with KaTeX.
- Mermaid Diagrams: Render flowcharts, sequence diagrams, and more with Mermaid.js.
- Command Palette: Efficient navigation with command palette (Ctrl+Shift+P).
- Keyboard Shortcuts: Customise any command shortcut as you want.
- Multi-Tab: Work on multiple documents simultaneously, pin them, bookmark them.
- Text Operations: Sort lines, trim whitespace, change case, etc.
- Bookmark System: Bookmark and tag local documents with instant filter search.
- Full Markdown Support: GFM (GitHub Flavored Markdown) and CommonMark with tables, strikethrough, task lists, etc.
- Smart Formatting: Auto-Markdown formatting for consistent, semantic-preserving results.
- Find & replace across all documents
- Export to PDF/PNG/WEBP/HTML

## Math (KaTeX)

Math renders in the preview with KaTeX. Delimiters:

| Style | Syntax |
| --- | --- |
| Inline | `$...$`, `\(...\)` |
| Display | `$$...$$`, `\[...\]`, <code>```math</code> fence |

Math is rendered to HTML via KaTeX `renderToString` and cached by expression hash, so unchanged expressions are never re-rendered. KaTeX CSS and fonts are bundled for offline use.

## Diagrams (Mermaid)

Flowcharts, sequence diagrams, and other diagrams render in the preview from <code>```mermaid</code> fenced blocks. Mermaid is lazy-loaded only when a diagram is present and rendered diagrams are cached by content hash, so unchanged diagrams are never re-rendered.

## Code / Dev Stack

Developed using the latest versions of:

- [bun](https://bun.com/)
- [Biome](https://biomejs.dev/)
- [CodeMirror](https://codemirror.net/)
- [lefthook](https://github.com/evilmartians/lefthook)
- [Node.js](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/)
- [SQLite](https://sqlite.org/)
- [Svelte](https://svelte.dev/)
- [Tauri](https://v2.tauri.app/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Vitest](https://vitest.dev/)

## Development

```sh
# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for production
bun run package
```

CachyOS build: `makepkg -sif`

## Available Scripts

- `bun run clean` - Remove build artifacts, target, and node_modules
- `bun run check` - Full check: Svelte types, Biome lint, and cargo check + clippy
- `bun run format` - Format code with Biome + 'cargo fmt'
- `bun run update` - Update packages + crates
- `bun run dev` - Start dev server / HMR
- `bun run preview` - Preview the production build

## rumdl Config Cascade

rumdl is embedded as a library, so the CLI (`--config`, inline overrides) does not apply. Config resolution in priority order (highest → lowest):

1. **Project discovery** — Walk upward from the open file's directory to the workspace root (from the `workspaceRoot` setting). At each directory, tries: `.rumdl.toml` → `rumdl.toml` → `.config/rumdl.toml` → `pyproject.toml` (`[tool.rumdl]`). Falls back to `.markdownlint*` / `markdownlint.*` files if none found. The walk stops at the workspace root, not the git root / `$HOME`.
2. **User config fallback** (only if step 1 finds nothing) — `$XDG_CONFIG_HOME/rumdl/` or `~/.config/rumdl/`, then `~/.rumdl.toml`, then `~/rumdl.toml`.
3. **Defaults** — Built-in default rules if no config is found anywhere.

Unsaved buffers (no file path) skip project discovery and use only the user config fallback (step 2). Configs are cached by path + modification time.

## Contributing

 [Pull Requests](https://github.com/dcog989/MarkdownRS/pulls) and [bug reports / feature requests](https://github.com/dcog989/MarkdownRS/issues) are welcomed.

## License

[MIT License](https://github.com/dcog989/MarkdownRS/blob/main/LICENSE).
