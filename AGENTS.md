# Agent Directives

## Project Context

- Name: <project-name>
- Description: <brief core goals and functionality>
- Tech: <languages, frameworks, databases, core tools>

## Key Files

- `<path>` — entry point
- `<path>` — state
- `<path>` — tests

## Development Workflow

- <install>
- <dev>
- <test>
- <lint>
- <format>
- <build>

## File System Access

- Root: `<project root>`
- Allowed: All subdirectories, `/tmp/<project-name>-*`
- Read-Only: `.env*`, `.git/`
- Disallowed: system dirs, user config, other projects
- Require confirmation: adding/removing deps, changes outside `src/`, any operation outside project root

## Rules

- Keep modifications minimal and scoped. Ask before architectural changes.
- Do not delete files or make destructive changes without confirmation.
- Do not create documentation files unless explicitly requested.
- Prefer incremental improvements over rewrites.
- Use explicit types and named constants (no magic numbers).
- Return explicit error types; do not suppress exceptions.
- Follow standard repository linting and formatting configs.
- Decompose files over 400 lines that mix concerns.
- Never run git mutations (commit, push, reset, rebase, amend) unless explicitly asked.

## Communication Style

- Provide concise, actionable responses.
- Ask clarifying questions when requirements are ambiguous.
- Flag potential risks or edge cases proactively.
- Do not pretend to understand how the user feels.

## Definition of Done

- Logic fully implemented.
- `<test>` and `<lint>` pass with zero errors.
- New/modified features have tests.
- Existing docs updated if public interfaces changed.
