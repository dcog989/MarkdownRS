# Agent Directives

## Project Specifics

- Name: MarkdownRS
- Description: Tauri + Svelte 5 + Rust desktop Markdown editor focused on performance and clean UI.
- Tech: Tauri v2, Rust (edition 2024), Svelte 5 (runes), TypeScript 6, CodeMirror 6, comrak (Markdown), rusqlite (SQLite), Biome, Vitest, Lefthook, Cocogitto

### Key Files

- `src-tauri/src/main.rs` — Backend entry point
- `src-tauri/src/commands/` — Tauri command handlers
- `src-tauri/src/markdown/` — Markdown rendering (comrak), linting, formatting (rumdl), TOC
- `src-tauri/src/db/` — SQLite (rusqlite) for bookmarks, file history, session
- `src-tauri/src/state.rs` — Backend state management
- `src-tauri/src/setup.rs` — App initialization
- `src/routes/+page.svelte` — Main application page
- `src/routes/+layout.svelte` — Root layout
- `src/lib/stores/state.svelte.ts` — Central state (`appContext`)
- `src/lib/stores/` — Frontend state (appState, editorStore, interfaceStore, settingsState, etc.)
- `src/lib/components/editor/` — CodeMirror 6 editor component
- `src/lib/components/preview/` — Markdown preview component
- `src/lib/utils/` — Frontend utilities (spellcheck, scroll sync, lint, etc.)
- `src/lib/commands/` — `invoke()` wrappers for Tauri commands

### Workflow

- Install: `bun install`
- Dev: `bun run dev`
- Test: `bun run test`
- Lint: `bun run check` (types + frontend (Biome) + backend (clippy))
- Fix: `bun run fix` (Biome autofix + cargo clippy --fix + cargo fmt, then `check`)
- Build: `bun run build`
- Release: `cog bump --auto` (Cocogitto, external Rust binary — `cargo install cocogitto` / `pacman -S cocogitto`; config in `cog.toml`, `tag_prefix = "v"`). Bumps the version from conventional commits, syncs manifests via `bash scripts/sync_version.sh`, writes `CHANGELOG.md` (template `changelog.tpl`), commits and tags, then pushes. Manual version: `cog bump --version 1.2.3`.
- Update crates: `bun run crates` (requires `cargo-edit`, external Rust binary — `cargo install cargo-edit` / `pacman -S cargo-edit`).

### Tools

- File tools (glob, grep, read, write, edit, shell) are called directly, never as `tools.*` inside execute. execute exposes only `browser.*`, `opencode.*`, and search() results.

### Common Patterns

- Add feature: Update store in `src/lib/stores/`, add UI in `src/lib/components/`, wire with events
- Backend call: Create Rust command in `src-tauri/src/commands/`, register in `main.rs`, call via `invoke()` from frontend (`src/lib/commands/`)
- Editor extension: Add to `src/lib/utils/*Extension.ts`, configure in editor component
- State access: Import `appContext` from `src/lib/stores/state.svelte.ts`

### File System Access

- Allowed: `/home/bubba/Projects/MarkdownRS` and all contained directories + files; `/tmp/*`
- Read-Only: `.env*`, `.git/`, `node_modules/`, `.assets/`, `.docs`
- Disallowed: everything not listed in 'Allowed' unless user grants permission.
- Require confirmation: adding/removing dependencies, any operation outside project root
- Do not delete files or make destructive changes without confirmation.

### Verification

- Do not run test, lint, format, or type-check commands unless the user explicitly asks.

---

## General Guidelines

### Code Changes

- For non-trivial work, propose an approach and confirm before implementing, including architectural changes.
- Keep modifications minimal and scoped; prefer incremental improvements over rewrites.
- Use explicit types and named constants (no magic numbers).
- Return explicit error types; do not suppress exceptions.
- Follow standard repository linting and formatting configs.
- Decompose files over 400 lines if they mix concerns.
- Name things clearly; reserve comments for the non-obvious why (workarounds, edge cases).
- Never run git mutations (commit, push, reset, rebase, amend) unless explicitly instructed.
- Do not create documentation files unless explicitly requested.
- Adhere to <https://develop.kde.org/hig/>.

### Author Environment

- Ryzen 5800X3D, Radeon RX 7900 XT, Display (AW3225QF); CachyOS, KDE, KWin / Wayland, Btrfs.
- fish shell, Ghostty terminal, Fresh TUI editor, yay package manager, bun npm manager, Firefox, Zed code editor.

### Testing

- Add tests only when the logic is genuinely testable and worth guarding. No test files for trivial changes or behavior the environment cannot test reliably (e.g. UI layout/click mapping).

### Definition of Done

- Logic fully implemented.
- Existing docs updated if public interfaces changed.
- Run the corresponding `Workflow` command when `Verification` requires it.

### Commit Messages

- On completion of an update or fix, print a conventional commit message in a fenced code block.
- Add a body only when the "why" isn't obvious.
- Never hard-wrap: one physical line per paragraph, however long.

### Communication Style

- Format: short declarative sentences, one idea per line.
- Instructions: numbered steps, one action each (exact command, path, or code); no prose recap.
- Explanations: essential context only. End question answers with `TL;DR:`, one sentence; omit for status updates and completed work.
- Tone: no preamble, restating, hedging, disclaimers, emotional framing, or closing offers. Keep every fact, command, flag, path, default, caveat.
- Edge Cases: state risks explicitly; ask when requirements are ambiguous.
