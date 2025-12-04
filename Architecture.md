# MarkdownRS Architecture

*MarkdownRS* is a fast, minimal, cross-platform desktop notepad focused on correct, standard markdown editing.

## Core Goals
- **Performance:** Instant startup, handles large files (100k+ lines) gracefully.
- **Standards:** Strict adherence to CommonMark or GFM (user selectable).
- **Design:** Clean, clutter-free, dark-mode native. Repurpose titlebar.
- **Stack:** Rust (Tauri v2) + Svelte 5 (Runes) + TypeScript, versions correct as of December 2025.

## Standards

Ensure that coding is correct to current standards for December 2025 for Svelte 5 / Runes, Tauri v2, Rust 2024 edition (v1.91), TS 5.9, etc.

## Core Architecture Decisions

### 1. The Editor Engine: CodeMirror 6
We will use **CodeMirror 6** (headless, modular).
- **Why:** Supports incremental parsing (Lezer), viewport virtualization (rendering only visible lines), and is fully accessible.
- **State:** Decouples state from the DOM, mapping perfectly to Svelte's reactive paradigm.

### 2. Rendering & Preview Strategy (Split View)
- **Structure:** Two-pane layout (Vertical or Horizontal split).
  - **Pane A:** CodeMirror Editor (Raw text + Syntax Highlighting).
  - **Pane B:** HTML Preview (Sanitized, Rendered Markdown).
- **Syncing:** **Synchronized Scrolling** is required.
  - The Markdown parser will inject source line numbers (e.g., `data-source-line`) into the generated HTML.
  - Svelte will track scroll events to ensure Pane B matches the viewport of Pane A.
- **Security:** Preview content must be sanitized (e.g., DOMPurify) to prevent XSS from malicious markdown files.

### 3. Syntax & Enforcement
- **Parsing:** CodeMirror's `lang-markdown` package handles highlighting in the editor.
- **Flavors:** User can toggle between:
  - **CommonMark:** Strict standard.
  - **GFM (Github Flavored):** Enables tables, task lists, strikethrough, autolinks.
- **Linting:** Asynchronous linter service to visually flag syntax errors in the gutter.
- **Formatter** Either auto or on demand.

### 4. Backend vs. Frontend Split
- **Frontend (Svelte/TS):**
  - Editor interaction, syntax highlighting.
  - Preview rendering & scroll sync logic.
  - UI State (Tabs, Command Palette, Settings).
- **Backend (Rust):**
  - **File I/O:** Atomic reads/writes, Encoding detection (UTF-8/ANSI).
  - **Heavy Lifting:** Global search (Ripgrep), text manipulation (sorting/deduping).
  - **Session Management:** Auto-saving unsaved buffers to IndexedDB / SQLite for crash recovery ("Hot Exit").

## v1 Feature Set
- **Split View Interface:** Editor + Live Preview with synchronized scrolling.
- **Multi-tab Interface:** Draggable tabs, dirty state indicators.
- **Command Palette:** `SHIFT+Ctrl/Cmd+P` approach to replace cluttered toolbars. Search bar input at centre of titlebar.
- **Auto-Save / Hot Exit:** Never lose data. App state restores on relaunch.
- **Text Ops:** Sort lines, Trim whitespace, Change Case.
- **Log Rotation:** Integrated Rust logging.
- Custom user themes for fonts, colors
- colorize line numbers / content bg to show updated content
- search / find / replace in current document

## v2 Features (Post-Launch)
- **Snippets & Templates:** Expandable text macros.
- **Export:** PDF / PNG / HTML export via Rust libraries.
- **Git Integration:** Basic status and diff viewing.
- search / find / replace in all opened documents
- context 'Send To...' menu - browser / configurable app list
