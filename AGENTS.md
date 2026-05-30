# MarkdownRS

Tauri + Svelte 5 + Rust desktop Markdown editor focused on performance and clean UI.

## Dev Environment

Linux CachyOS, Limine boot loader, KDE Plasma 6, Wayland, Btrfs. Firefox, Kate text editor, Zed code editor, fish shell with Ghostty + Fresh editor. paru and bun package managers. All software is updated as of today.

## Tech Stack

- **Tauri** (v2) — Desktop framework
- **Rust** (edition 2024) — Backend logic, Markdown processing, file I/O
- **Svelte 5** (runes, `.svelte.ts`) — Frontend
- **TypeScript 6** — Type-safe frontend code
- **CodeMirror 6** — Code editor
- **rusqlite** (SQLite) — Metadata/bookmarks

## Entry Points

### Frontend (`src/`)

- `+page.svelte` — Main application page
- `+layout.svelte` — Root layout
- `lib/stores/state.svelte.ts` — Central state (`appContext`)
- `lib/components/editor/Editor.svelte` — Editor component
- `lib/components/preview/Preview.svelte` — Markdown preview

### Backend (`src-tauri/`)

- `src/main.rs` — Entry point
- `src/commands/` — Tauri command handlers
- `src/markdown/` — Markdown processing
- `src/db/` — SQLite operations

## Coding Principles

- KISS, DRY, YAGNI, Occam's razor
- Self-documenting code (clear naming, no comments for commentary)
- No magic numbers; split files >400 lines
- Follow existing patterns (Svelte 5 runes, modern TS/Rust)
- Do NOT create docs files unless explicitly asked

## File System Access

### Allowed

- `/home/bubba/Projects/MarkdownRS/` unless excluded below.

### Disallowed

- `.context/`, `.assets/`, `.docs/`, `.git/`, `node_modules/`, `.repomix/`
- `repomix.config.json`, `.repomixignore`, `bun.lock`
- `src-tauri/Cargo.lock`, `src-tauri/target/`, `src-tauri/gen/`, `src-tauri/icons/`

## Common Patterns

- **Add feature**: Update store in `lib/stores/`, add UI in `lib/components/`, wire with events
- **Backend call**: Create Rust command in `src-tauri/src/commands/`, expose in `main.rs`, call via `invoke()` from frontend
- **Editor extension**: Add to `lib/utils/*Extension.ts`, configure in `lib/components/editor/codemirror/config.ts`
- **State access**: Import `appContext` from `lib/stores/state.svelte.ts`

## Build Scripts

- `bun run dev` — Start Tauri dev server
- `bun run build` — Full Tauri build (AppImage)
- `bun run build:frontend` — Vite build only (debug)
- `bun run check` — Full lint pass (types + frontend + backend)
- `bun run format` — Auto-format all files
- `bun run test` — Run Vitest suite
- `bun run release` — Bump version and tag
- `bun run clean` — Remove all build artifacts