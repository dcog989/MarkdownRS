# MarkdownRS

A Markdown editor that focuses performance and a clean, minimal UI that still provides a full feature set for technical and general users.

[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE) [![GitHub Issues](https://img.shields.io/github/issues/dcog989/MarkdownRS.svg)](https://github.com/dcog989/MarkdownRS/issues) [![GitHub Stars](https://img.shields.io/github/stars/dcog989/MarkdownRS.svg)](https://github.com/dcog989/MarkdownRS/stargazers)

![screenshot 1](assets/screen-1.webp)

The only Markdown editor you need? Many people are saying so.

## Features

- *Editing* — GFM and CommonMark, raw or rendered mode, find & replace across open documents, line sorting and case/whitespace tools, optional colour swatches.
- *Live preview* — split view with bi-directional synchronized scrolling.
- *Math and diagrams* — KaTeX math and Mermaid diagrams render in the preview, fully offline.
- *Documents* — multi-tab with pinning, file tree with drag and drop, tagged bookmarks with filter search, new-file templates.
- *Auto-save* — session persistence with hot-exit support.
- *Formatting* — rumdl linting and auto-formatting ([usage](#usage)).
- *Grammar* — optional Harper grammar check ([usage](#usage)).
- *Customisation* — command palette, custom shortcuts, built-in and custom themes.
- *Export* — PDF, DOCX, EPUB, LaTeX, PNG, WebP, HTML.
- *Performance* — Tauri / Rust / SQLite backend; TypeScript / Svelte / CodeMirror frontend.

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

## Usage

### Math

| Style   | Syntax |
|---------|--------|
| Inline  | `$...$`, `\(...\)` |
| Display | `$$...$$`, `\[...\]`, ```` ```math ```` fence |

Math renders to HTML via KaTeX `renderToString` and is cached by expression hash, so unchanged expressions are never re-rendered. KaTeX CSS and fonts are bundled for offline use.

### Formatting

The embedded [rumdl](https://github.com/rvben/rumdl/) lints and formats Markdown; rules can be configured with the built-in editor. Config files (`.rumdl.toml` or `rumdl.toml`) can sit at project or home level; without one, the built-in defaults apply.

### Grammar

The [Harper](https://writewithharper.com/) grammar check is optional. Rules can be edited in `settings.toml`:

```toml
[harperLinters]
OxfordComma = false      # disable a rule
LongSentences = true     # force a rule on
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
bun run check        # Full check: Svelte types, Biome lint, and cargo clippy
bun run fix          # Apply all fixes, then run the full check
bun run update       # Update packages + crates
bun run dev          # Start dev server / HMR
bunx tauri build     # Build distributable bundles (.deb, .rpm, .AppImage, NSIS)
bun run clean        # Remove build artifacts, target, and node_modules
bun run package      # build, pack, then install (rerun `bun run pkg-install` if the password prompt is missed)
```

---

## License

[GNU General Public License v3](https://github.com/dcog989/MarkdownRS/blob/main/LICENSE).
