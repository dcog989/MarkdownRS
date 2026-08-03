# Agent Directives

## Project Context

- Name: MarkdownRS
- Description: Tauri + Svelte 5 + Rust desktop Markdown editor focused on performance and clean UI.
- Tech: Tauri v2, Rust (edition 2024), Svelte 5 (runes), TypeScript 6, CodeMirror 6, comrak (Markdown), rusqlite (SQLite), Biome, Vitest, Lefthook

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

## Development Workflow

- Install: `bun install`
- Dev: `bun run dev`
- Test: `bun run test`
- Lint: `bun run check` (types + frontend (Biome) + backend (cargo clippy))
- Format: `bun run format` (Biome + cargo fmt)
- Build: `bun run build`

## File System Access

- Root: `/home/bubba/Projects/MarkdownRS`
- Allowed: All subdirectories, `/tmp/*`
- Read-Only: `.env*`, `.git/`, `node_modules/`, `.assets/`
- Disallowed: system dirs, user config, other projects
- Require confirmation: adding/removing dependencies, changes outside `src/` or `src-tauri/src/`, any operation outside project root

## Rules

- Keep modifications minimal and scoped. Ask before architectural changes.
- Do not delete files or make destructive changes without confirmation.
- Do not create documentation files unless explicitly requested.
- Do not create test files for minor changes, or for behavior that is not reliably unit-testable in jsdom (e.g. CodeMirror layout/click mapping). Prefer no new files; only add a test when the logic is genuinely testable and worth guarding.
- Prefer incremental improvements over rewrites.
- Use explicit types and named constants (no magic numbers).
- Return explicit error types; do not suppress exceptions.
- Follow standard repository linting and formatting configs (Biome, rustfmt, .editorconfig).
- Decompose files over 400 lines if they mix concerns.
- Never run git mutations (commit, push, reset, rebase, amend) unless explicitly asked.
- Self-documenting code via clear naming. Use comments only for complex workarounds or issues that need noting.
- Do not run full `bun run check`/`bun run test` on trivial changes (constant tweaks, one-line edits, CSS value changes). Run `bunx biome check --write <file>` on the touched file, or nothing if the change is a simple value edit. Only run the full suite on real logic changes.

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
- On completion of an update or fix, provide a singe line, concise commit message in a code block so the user can copy it easily.

## Definition of Done

- Logic fully implemented.
- `bun run check` and `bun run test` pass with zero errors.
- Tests added only where the change is non-trivial and the logic is unit-testable (see Rules); do not add test files for minor changes.
- Existing docs updated if public interfaces changed.
