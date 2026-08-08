# MarkdownRS

MarkdownRS is a focused Markdown editor. It prioritises performance and a clean, minimal UI while still being fully featured for technical and general users.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![GitHub Issues](https://img.shields.io/GitHub/issues/username/repo.svg)](https://github.com/username/repo/issues) [![GitHub Stars](https://img.shields.io/GitHub/stars/username/repo.svg)](https://github.com/username/repo/stargazers)

[insert screenshot]

The only Markdown editor you need? Many people are saying so.

## Features

### Editing & Authoring

- Markdown Flavors: GFM (GitHub Flavored Markdown) and CommonMark.
- Smart Formatting: Auto-Markdown formatting for standards=compliant, consistent output.
- Text Operations: Sort lines, trim whitespace, change case, etc.
- Rendered Mode: Edit in rendered or raw Markdown mode.
- Find & Replace: Across all open documents.

### Performance & Reliability

- Fast, Low Resource Use: Built with a Rust backend for instant startup and smooth editing.
- Auto-Save: Session persistence with hot-exit support — never lose your work.

### Preview & Rendering

- Live Preview: Split view with smooth, bi-directional synchronized scrolling.
- Math (KaTeX): Render math in the preview with KaTeX.
- Diagrams (Mermaid): Render flowcharts, sequence diagrams, and more with Mermaid.js.

#### Math (KaTeX)

Math renders in the preview with KaTeX. Delimiters:

| Style | Syntax |
| --- | --- |
| Inline | `$...$`, `\(...\)` |
| Display | `$$...$$`, `\[...\]`, <code>```math</code> fence |

Math is rendered to HTML via KaTeX `renderToString` and cached by expression hash, so unchanged expressions are never re-rendered. KaTeX CSS and fonts are bundled for offline use.

#### Diagrams (Mermaid)

Flowcharts, sequence diagrams, and other diagrams render in the preview from <code>```mermaid</code> fenced blocks. Mermaid is lazy-loaded only when a diagram is present and rendered diagrams are cached by content hash, so unchanged diagrams are never re-rendered.

### Documents & Organisation

- Multi-Tab: Work on multiple documents simultaneously, pin them, bookmark them.
- File Tree: Sidebar file tree for browsing and opening files.
- Bookmark System: Bookmark and tag local documents with instant filter search.
- New File Template: Create new files from a configurable template.

### Customisation

- Command Palette: Efficient navigation with command palette (Ctrl+Shift+P).
- Keyboard Shortcuts: Customise any command's shortcut as you want.
- Themes: Multiple built-in light and dark themes, plus custom themes.

### Export

- Export your documents to PDF, PNG, WEBP, or HTML.

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

## Markdown Style & Formatting

MarkdownRS uses [*rumdl*](https://github.com/rvben/rumdl/), a linter and formatter, to ensure standard, consistent Markdown.

You can change which style rules that *rumdl* applies by creating a config file:

1. **Put one in your project** — the app looks for a config file near your document (e.g. `.rumdl.toml` or `rumdl.toml`). It checks the document's folder, then works its way up to your chosen workspace root.
2. **Put one in your home folder** — if no project config is found, it uses a config from your user config folder or your home directory.
3. **Use the defaults** — if neither exists, the built-in default rules are used.

The most important config wins: a project config always overrides a home-folder config, and both override the defaults. Files that haven't been saved yet (no location on disk) only use the home-folder config or the defaults.

## Contributing

[Pull Requests](https://github.com/dcog989/MarkdownRS/pulls) and [bug reports / feature requests](https://github.com/dcog989/MarkdownRS/issues) are welcomed.

## License

[MIT License](https://github.com/dcog989/MarkdownRS/blob/main/LICENSE).
