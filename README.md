# MarkdownRS

MarkdownRS is a fast, low-resource, cross-platform desktop Markdown editor with clean, minimal UI. It's built with the latest Rust / Tauri / Svelte (Runes) / Tailwind stack.

The only markdown editor you need.

## Features

- **Fast & Performant**: Built with Rust backend for instant startup and smooth editing
- **Live Preview**: Split view with smooth, bi-directional synchronized scrolling
- **Auto-Save**: Session persistence with hot-exit support - never lose your work
- **Clean UI**: Dark-mode native interface with minimal distractions
- **Keyboard Shortcuts**: Efficient navigation with command palette (Ctrl+P)
- **Multi-Tab**: Work on multiple documents simultaneously
- **Text Operations**: Sort lines, trim whitespace, change case, etc.
- **Bookmark System**: Bookmark and tag local documents with instant filter search
- **Full Markdown Support**: GFM (GitHub Flavored Markdown) and CommonMark with tables, strikethrough, task lists, etc.
- **Smart Formatting**: AST-based markdown formatting for consistent, semantic-preserving results

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v25)
- [Rust](https://www.rust-lang.org/) (v1.92)
- [Tauri](https://v2.tauri.app/) (v2.9)
- [Svelte](https://svelte.dev/) (v5.46)
- [Tailwind](https://tailwindcss.com/) (v4.1)

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
npm run tauri dev

# Build for production
npm run build
npm run tauri build
```

### Available Scripts

- `npm run dev` - Start Vite dev server
- `npm run build` - Build the frontend
- `npm run preview` - Preview the production build
- `npm run check` - Type-check Svelte files
- `npm run format` - Format code with Prettier
- `npm run clean` - Remove build directories (frontend and Rust)
- `npm run clean:all` - Remove everything (build, target, and node_modules)
- `npm run clean:build` - Remove only frontend build directory
- `npm run clean:rust` - Remove only Rust target directory
- `npm run clean:modules` - Remove only node_modules directory

## Keyboard Shortcuts

### File Operations

- `Ctrl+N` - New file
- `Ctrl+O` - Open file
- `Ctrl+S` - Save file
- `Ctrl+W` - Close tab

### View

- `Ctrl+\` - Toggle split preview
- `Ctrl+P` - Open command palette

### Editing

- Standard text editing shortcuts
- Access text operations via command palette (Ctrl+P)

## Architecture

### Frontend (Svelte 5 + TypeScript)

- **Editor**: CodeMirror for markdown editing with syntax highlighting
- **Preview**: Rust `comrak` for full CommonMark / GFM markdown parsing with security hardening
- **State Management**: Svelte with Runes for reactive state
- **Styling**: TailwindCSS for modern, utility-first styling

### Backend (Rust + Tauri)

- **File I/O**: Atomic file operations
- **Session Management**: IndexedDB / SQLite for crash recovery and hot-exit
- **Logging**: Comprehensive logging for debugging

## Project Structure

    MarkdownRS/
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

## Roadmap

### v1 (Current)

- ✅ Split view with live preview
- ✅ Multi-tab interface
- ✅ Auto-save & hot-exit
- ✅ Command palette
- ✅ Text operations
- ✅ Full GFM support (comrak)
- ✅ Smart formatting
- ✅ Custom themes
- ✅ Find & replace across all documents
- ✅ Export to PDF/PNG/WEBP/HTML

### v2 (Planned)

- Git integration - TBD???
- Context menu with "Send to..." options
- fix / implement restore Undo History on restart: although `history_state TEXT` is added to the SQLite schema and the frontend sends history data to the backend, the Rust `TabState` struct in `src-tauri/src/db/mod.rs` is missing the `history_state` field. **note**: cm6 history is not stored in json format. verify format for this to work.
- Recent Files: see D:/Code/MarkdownRS/.docs/Recent Files Plus.md
- customise format function to auto replace words?
- Set up GitHub Actions for macOS / Linux / portable formats
- comprehensive Markdown formatting options.
- OS Theme Sync: the app query the System Theme mode on install and apply dark / light theme as appropriate.
- add region / languages
- add option to close and / or minimize to tray - https://v2.tauri.app/learn/system-tray/
- focused writer mode: F11, full screen, all ui hidden - titlebar + tabs display on hover, content centered in app and constrained to NN characters (settings option).
- Sidebar / File Explorer: a collapsible sidebar showing the folder structure of the currently open file’s directory.
- Table of Contents: generate TOC For long documents
- Math and Diagrams: Support for `KaTeX` or `MathJax`. Support for `Mermaid.js`.

## License

MIT.

## Contributing

Contributions are welcome. Please submit a Pull Request or an issue for bugs and feature requests.
