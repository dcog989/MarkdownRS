# MarkdownRS

A Markdown editor that focuses performance and a clean, minimal UI that still provides a full feature set for technical and general users.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![GitHub Issues](https://img.shields.io/github/issues/dcog989/MarkdownRS.svg)](https://github.com/dcog989/MarkdownRS/issues) [![GitHub Stars](https://img.shields.io/github/stars/dcog989/MarkdownRS.svg)](https://github.com/dcog989/MarkdownRS/stargazers)

![screenshot 1](assets/screen-1.webp)

The only Markdown editor you need? Many people are saying so.

## Features

### Editing

- Markdown Flavors: GFM (GitHub Flavored Markdown) and CommonMark.
- Smart Formatting: Auto-Markdown formatting for standards-compliant, consistent output.
- Text Operations: Sort lines, trim whitespace, change case, etc.
- Rendered Mode: Edit in rendered or raw Markdown mode.
- Optional color swatches prefixed to HEX, RGB, HSL, etc.
- Find & Replace: Across all open documents.

### Performance

- Fast, Low Resource Use: Tauri / Rust / SQLite backend; Svelte / CodeMirror / TypeScript frontend.
- Auto-Save: Session persistence with hot-exit support.

### Preview

- Live Preview: Split view with smooth, bi-directional synchronized scrolling.
- Diagrams (Mermaid): Render flowcharts, sequence diagrams, and more with Mermaid.js.
- Math (KaTeX): Render math in the preview with KaTeX delimiters:

| Style   | Syntax |
|---------|--------|
| Inline  | `$...$`, `\(...\)` |
| Display | `$$...$$`, `\[...\]`, ```` ```math ```` fence |

Math is rendered to HTML via KaTeX `renderToString` and cached by expression hash, so unchanged expressions are never re-rendered. KaTeX CSS and fonts are bundled for offline use.

### Diagrams

Flowcharts, sequence diagrams, and other diagrams render in the preview from ```` ```mermaid ```` fenced blocks.

### Documents & Organisation

- Multi-Tab: Work on multiple documents simultaneously, pin them, bookmark them.
- File Tree: Sidebar file tree for browsing and opening files, with drag / drop support.
- Bookmark System: Bookmark and tag local documents with instant filter search.
- New File Template: Create new files from a configurable template.

### Customisation

- Command Palette: Efficient navigation with command palette (Ctrl+Shift+P).
- Keyboard Shortcuts: Customise any command's shortcut as you want.
- Themes: Multiple built-in light and dark themes, plus custom themes.

### Export

- Export documents to PDF, PNG, WebP, or HTML.

### Markdown Formatting

The embedded [rumdl](https://github.com/rvben/rumdl/) lints and formats Markdown content; rules can be configured with the built-in editor.

*rumdl* config files - `.rumdl.toml` or `rumdl.toml` - can be placed at project or home folder levels. If neither exists, the built-in defaults are used.

### Grammar Checking

The [Harper](https://writewithharper.com/) Grammar Check is optional and its rules can be edited in `settings.toml`:

```toml
[harperLinters]
OxfordComma = false      # disable a rule
LongSentences = true     # force a rule on
```

---

## Installation

Download relevant package from [GitHub Latest Release](https://github.com/dcog989/MarkdownRS/releases/latest).

| Platform | Format | Install |
|----------|--------|---------|
| Linux | AppImage | `chmod +x MarkdownRS_*.AppImage && ./MarkdownRS_*.AppImage` |
| Debian / Ubuntu | `.deb` | `sudo apt install ./MarkdownRS_*.deb` |
| Fedora / RHEL | `.rpm` | `sudo dnf install ./MarkdownRS-*.rpm` |
| Arch / CachyOS | `.pkg.tar.zst` | `sudo pacman -U MarkdownRS-*.pkg.tar.zst` |
| Arch / CachyOS | `PKGBUILD` (local build) | `bun install && bun run package` |
| Windows | NSIS `.exe` | Download and run the installer from the [latest release](https://github.com/dcog989/MarkdownRS/releases/latest) |

The AppImage installs nothing: the first run adds itself to the application menu, with a Markdown/`.txt` handler. Move the file anywhere persistent before the first run; later runs repoint the menu entry if it moves. To make it the default Markdown handler:

```sh
xdg-mime default markdownrs.desktop text/markdown
```

---

## Technical

### Dev Stack

- [bun](https://bun.com/)
- [Biome](https://biomejs.dev/)
- [CodeMirror](https://codemirror.net/)
- [Lefthook](https://github.com/evilmartians/lefthook)
- [Node.js](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/)
- [SQLite](https://sqlite.org/)
- [Svelte](https://svelte.dev/)
- [Tauri](https://v2.tauri.app/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Vitest](https://vitest.dev/)

### Development

Requires: [Rust](https://rustup.rs/), [bun](https://bun.com/), [Tauri](https://v2.tauri.app/start/prerequisites/).

```sh
bun install          # Install dependencies
bun run check        # Full check: Svelte types, Biome lint, and cargo check + clippy
bun run fix          # Apply all fixes: Biome autofix, cargo clippy --fix, cargo fmt
bun run update       # Update packages + crates
bun run dev          # Start dev server / HMR
bun run preview      # Preview the production build
bunx tauri build     # Build distributable bundles (.deb, .rpm, .AppImage, NSIS)
bun run clean        # Remove build artifacts, target, and node_modules
bun run package      # build, pack, then install (rerun `bun run pkg-install` if the password prompt is missed)
```

---

## License

[GNU General Public License v3](https://github.com/dcog989/MarkdownRS/blob/main/LICENSE).
