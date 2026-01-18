# MarkdownRS

MarkdownRS is a text editor primarily focused on editing, formatting, and previewing Markdown. It prioritises performance; minimal use of system resources; a clean, minimal UI while still being fully featured for technical and general users.

[insert screenshot]

The only markdown editor you need? Many people are saying so.

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

The latest versions of:

- [Tauri](https://v2.tauri.app/)
- [Rust](https://www.rust-lang.org/)
- [Svelte](https://svelte.dev/)
- [Typescript](https://www.typescriptlang.org/)
- [Tailwind](https://tailwindcss.com/)
- [CodeMirror](https://codemirror.net/)
- [SQLite](https://sqlite.org/)

Built on top of:

- [bun](https://bun.com/)
- [Node.js](https://nodejs.org/)
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

### Available Scripts

- `bun run check` - Type-check Svelte files
- `bun run clean` - Remove everything (build, target, and node_modules)
- `bun run dev` - Start dev server / HRM
- `bun run format` - Format code with Prettier + 'cargo fmt'
- `bun run lint` - lint entire app
- `bun run package` - Build and package install / portable for distribution
- `bun run preview` - Preview the production build

## Project Structure

    MarkdownRS/
    ├── src/                      # Frontend source
    ├── src/                      # Frontend source
    │   ├── lib/
    ├── src/                      # Frontend source
    ├── src/                      # Frontend source
    │   ├── lib/
    ├── src/                      # Frontend source
    │   ├── lib/
    │   │   ├── components/      # Svelte components
    │   │   ├── stores/          # State management
    │   │   └── utils/           # Utility functions
    │   └── routes/              # SvelteKit routes
    ├── src-tauri/               # Rust backend
    │   ├── src/
    │   │   ├── commands/        # Tauri commands
    │   │   ├── db/              # Database logic
    │   │   └── main.rs          # Entry point
    │   └── tauri.conf.json      # Tauri configuration
    ├── static/                  # Static assets
    └── package.json             # Node dependencies & scripts

- TBD

## Contributing

[Pull Requests](url) and [bug reports / feature requests](url) are welcomed.

## License

[MIT](url).
