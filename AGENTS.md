# Agent Directives

## Project

- Name: MarkdownRS
- Description: Tauri + Svelte 5 + Rust desktop Markdown editor focused on performance and clean UI.
- Tech: Tauri v2, Rust (edition 2024), Svelte 5 (runes), TypeScript 6, CodeMirror 6, comrak (Markdown), rusqlite (SQLite), Biome, Vitest, Lefthook, Cocogitto

## Key Files

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

## Workflow

### Commands

- Install: `bun install`
- Dev: `bun run dev`
- Test: `bun run test`
- Lint: `bun run check` (types + frontend (Biome) + backend (cargo clippy))
- Format: `bun run format` (Biome + cargo fmt)
- Build: `bun run build`
- Release: `bun run release` (Cocogitto, external Rust binary — `cargo install cocogitto` / `pacman -S cocogitto`; config in `cog.toml`, `tag_prefix = "v"`). Bumps the version from conventional commits, syncs manifests via `scripts/sync_version.sh`, writes `CHANGELOG.md` (template `changelog.tpl`), commits and tags, then pushes. Manual version: `bun run version -- 1.2.3`.

### Code Changes

- Keep modifications minimal and scoped; prefer incremental improvements over rewrites. Ask before architectural changes.
- Use explicit types and named constants (no magic numbers).
- Return explicit error types; do not suppress exceptions.
- Follow standard repository linting and formatting configs (Biome, rustfmt, .editorconfig).
- Decompose files over 400 lines if they mix concerns.
- Self-documenting code via clear naming. Use comments only for complex workarounds or issues that need noting.
- Never run git mutations (commit, push, reset, rebase, amend) unless explicitly asked.
- Do not create documentation files unless explicitly requested.

### Verification

- Do not run test, lint, clippy, biome, format, or type-check commands. The user builds, tests, and lints manually.
- Run them only for a major refactor, or when the user explicitly asks.

## File System Access

- Allowed: `/home/bubba/Projects/MarkdownRS` and all contained directories + files; `/tmp/*`
- Read-Only: `.env*`, `.git/`, `node_modules/`, `.assets/`
- Disallowed: everything not listed in 'Allowed' unless user grants permission.
- Require confirmation: adding/removing dependencies, any operation outside project root
- Do not delete files or make destructive changes without confirmation.

## Testing

- Do not create test files for minor changes, or for behavior that is not reliably unit-testable in jsdom (e.g. CodeMirror layout/click mapping). Prefer no new files; only add a test when the logic is genuinely testable and worth guarding.

## Common Patterns

- Add feature: Update store in `src/lib/stores/`, add UI in `src/lib/components/`, wire with events
- Backend call: Create Rust command in `src-tauri/src/commands/`, register in `main.rs`, call via `invoke()` from frontend (`src/lib/commands/`)
- Editor extension: Add to `src/lib/utils/*Extension.ts`, configure in editor component
- State access: Import `appContext` from `src/lib/stores/state.svelte.ts`

## Communication Style

- Provide concise, actionable responses.
- Ask clarifying questions when requirements are ambiguous.
- Flag potential risks or edge cases proactively.
- Do not pretend to understand how the user feels.

## Definition of Done

- Logic fully implemented.
- Existing docs updated if public interfaces changed.
- On completion of an update or fix, print a concise conventional commit message in a fenced code block.
