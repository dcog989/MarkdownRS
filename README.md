# MarkdownRS

*MarkdownRS* is a fast, lightweight, minimal notepad focused on correct, standard markdown editing.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tauri](https://img.shields.io/badge/built%20with-Tauri-24C8DB.svg)
![Svelte](https://img.shields.io/badge/frontend-Svelte%205-FF3E00.svg)

## Why another notepad?

Microsoft and the others are forcing AI on us from every angle, notepad++ is ugly and does not allow correct markdown syntax, and all others I tried were some combination of ugly / bloated / not open source / lacking in function.

So, *MarkdownRS* will focus on just doing *one thing* perfectly. It aspires to be the *perfect* Markdown editor.

## Features

- conforms to standards - https://commonmark.org/ + https://github.github.com/gfm/ + ???.

## Tech Stack

- **Frontend:** Svelte 5, TypeScript, Vite
- **Backend:** Rust, Rusqlite (SQLite), Reqwest, Feed-RS
- **Build System:** Tauri v2

## Getting Started

### Prerequisites

1.  **Rust:** [Install Rust](https://www.rust-lang.org/tools/install).
2.  **Node.js:** [Install Node.js](https://nodejs.org/).
3.  **OS Dependencies:** Follow the [Tauri Prerequisites guide](https://v2.tauri.app/start/prerequisites/).

### Installation

```bash
# Install dependencies
npm install
```
