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
- Lint: `bun run check` (types + frontend (Biome) + backend (cargo clippy))
- Format: `bun run format` (Biome + cargo fmt)
- Build: `bun run build`
- Release: `bun run release` (Cocogitto, external Rust binary — `cargo install cocogitto` / `pacman -S cocogitto`; config in `cog.toml`, `tag_prefix = "v"`). Bumps the version from conventional commits, syncs manifests via `scripts/sync_version.sh`, writes `CHANGELOG.md` (template `changelog.tpl`), commits and tags, then pushes. Manual version: `bun run version -- 1.2.3`.
- Update crates: `bun run crates` (requires `cargo-edit`, external Rust binary — `cargo install cargo-edit` / `pacman -S cargo-edit`).

### Common Patterns

- Add feature: Update store in `src/lib/stores/`, add UI in `src/lib/components/`, wire with events
- Backend call: Create Rust command in `src-tauri/src/commands/`, register in `main.rs`, call via `invoke()` from frontend (`src/lib/commands/`)
- Editor extension: Add to `src/lib/utils/*Extension.ts`, configure in editor component
- State access: Import `appContext` from `src/lib/stores/state.svelte.ts`

### File System Access

- Allowed: `/home/bubba/Projects/MarkdownRS` and all contained directories + files; `/tmp/*`
- Read-Only: `.env*`, `.git/`, `node_modules/`, `.assets/`
- Disallowed: everything not listed in 'Allowed' unless user grants permission.
- Require confirmation: adding/removing dependencies, any operation outside project root
- Do not delete files or make destructive changes without confirmation.

---

## General Guidelines

### Code Changes

- For non-trivial work, propose an approach and confirm before implementing.
- Keep modifications minimal and scoped; prefer incremental improvements over rewrites. Ask before architectural changes.
- Use explicit types and named constants (no magic numbers).
- Return explicit error types; do not suppress exceptions.
- Follow standard repository linting and formatting configs.
- Decompose files over 400 lines if they mix concerns.
- Use clear naming over comments; reserve comments for complex workarounds or non-obvious issues — why, not what.
- Never run git mutations (commit, push, reset, rebase, amend) unless explicitly instructed.
- Do not create documentation files unless explicitly requested.

### Verification

- Do not run test, lint, format, or type-check commands; the user builds, tests, and lints manually.
- Run them only when the user explicitly asks.

### Author Environment

- CachyOS, KDE Plasma 6, Wayland, Btrfs.
- fish shell, Ghostty terminal, Fresh TUI editor, yay package manager, bun npm manager, Firefox, and Zed code editor.

### Testing

- Do not create test files for trivial changes, or for behavior that is not reliably unit-testable in the test environment (e.g. UI layout/click mapping). Prefer no new files; only add a test when the logic is genuinely testable and worth guarding.

### Definition of Done

- Logic fully implemented.
- Existing docs updated if public interfaces changed.
- When required by the `Verification` rules, run the corresponding `Workflow` command.
- On completion of an update or fix, print a concise conventional commit message in a fenced code block.

### Communication Style

- Provide concise, actionable responses.
- Ask clarifying questions when requirements are ambiguous.
- Flag potential risks or edge cases proactively.
- Do not pretend to understand how the user feels.
- Never editorialise your answer. No "to be honest", "honestly", hedging, disclaimers, or meta-commentary — just answer.
