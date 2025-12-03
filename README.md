# MarkdownRS

A fast, minimal, cross-platform desktop markdown editor built with Tauri v2, Svelte 5, and Rust.

## Features

- 🚀 **Fast & Performant**: Built with Rust backend for instant startup and smooth editing
- 📝 **Live Preview**: Split view with synchronized scrolling
- 💾 **Auto-Save**: Session persistence with hot-exit support - never lose your work
- 🎨 **Clean UI**: Dark-mode native interface with minimal distractions
- ⌨️ **Keyboard Shortcuts**: Efficient navigation with command palette (Ctrl+P)
- 📂 **Multi-Tab**: Work on multiple documents simultaneously
- 🔧 **Text Operations**: Sort lines, trim whitespace, change case, and more

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Rust](https://www.rust-lang.org/) (latest stable)
- [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

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
- **Editor**: CodeMirror 6 for markdown editing with syntax highlighting
- **Preview**: Marked.js for markdown parsing with DOMPurify for security
- **State Management**: Svelte 5 runes for reactive state
- **Styling**: TailwindCSS v4 for modern, utility-first styling

### Backend (Rust + Tauri)
- **File I/O**: Atomic file operations
- **Session Management**: SQLite for crash recovery and hot-exit
- **Logging**: Comprehensive logging for debugging

## Project Structure

```
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
│   │   ├── db/             # Database logic
│   │   └── main.rs         # Entry point
│   └── tauri.conf.json     # Tauri configuration
├── static/                  # Static assets
└── package.json            # Node dependencies & scripts
```

## Roadmap

### v1 (Current)
- ✅ Split view with live preview
- ✅ Multi-tab interface
- ✅ Auto-save & hot-exit
- ✅ Command palette
- ✅ Text operations

### v2 (Planned)
- Custom themes
- Snippets & templates
- Export to PDF/PNG/HTML
- Vim mode
- Git integration
- Find & replace across all documents
- Context menu with "Send to..." options

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
