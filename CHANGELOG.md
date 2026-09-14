# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/) for commit guidelines.

- - -
## v1.61.0 - 2026-09-14

#### Features

- (255c20e) add save-all command and make context-menu hints platform-aware - dcog989

#### Bug Fixes

- (661b027) resolve nullable view type error in drag handler - dcog989

- (2a6ce4a) map viewport rect and drag through source-line layout - dcog989

- (6a29434) use deleteGroupForwardWin so ctrl+delete consumes next line indentation - dcog989

- (c75270d) show shortcut hints for add-bookmark and reopen-closed - dcog989

- (5184295) persist unsaved tab file type across restarts - dcog989

- (e78bd6b) match inline code styling in rendered tables to body code - dcog989

#### Refactoring

- (4e191c0) restore sync scroll with EditorView.scrollSnapshot - dcog989

- (0db490c) drop custom selection drag-scroll in favor of CodeMirror's built-in - dcog989

- (974d149) use MatchDecorator for path, URL and wikilink decorations - dcog989

- (e25e58e) reuse CodeMirror indentMore/indentLess for tab indentation - dcog989

- - -

## v1.60.4 - 2026-09-10

#### Bug Fixes

- (0ba45be) style code blocks and horizontal rules in raw mode, keep headings plain - dcog989

- (dc1e12b) sync file history and bookmark stores after deleting orphans - dcog989

- (9f3f268) drop deprecated comrak tagfilter option - dcog989

- (154426d) dedent tab-indented lines with shift+tab - dcog989
- - -

## v1.60.3 - 2026-09-05

#### Bug Fixes

- (1e88b0d) update bench files to vitest 5.0 benchmark API - dcog989
- - -

## v1.60.2 - 2026-09-02
- - -

## v1.60.1 - 2026-09-02

#### Bug Fixes

- (01d5495) allow GPL-3.0-only license in cargo-deny - dcog989
- - -

## v1.60.0 - 2026-09-02

#### Features

- (6a17256) hide view mode toggle for text files - dcog989

- (6b0531f) show eye-off icon in raw view mode - dcog989

- (51ce9f8) restrict text/markdown toggle to unsaved documents - dcog989

- (f6089ce) add content folding toggle - dcog989

#### Bug Fixes

- (d9e1212) fail loudly when version sync cannot match a manifest field - dcog989

- (8589e6e) only mark non-blank content removals as deletions - dcog989

- (7a1dd33) disable debug subpackage in PKGBUILD - dcog989

#### Refactoring

- (f30b440) use eye icon for rendered mode toggle - dcog989
- - -

## v1.59.0 - 2026-08-29

#### Features

- (a894c53) format option to hard wrap content - dcog989

- (ba89d6f) offer code fence language selection after ``` - dcog989

#### Bug Fixes

- (9c657c4) don't copy inline-code backticks when selection is inside them - dcog989

- (8f4e075) position panel clear of minimap/scrollbar and size counter like ui text - dcog989

- (2a49d98) keep links unstyled inside code blocks in markdown - dcog989

- (5bd2fbf) only style txt document links on ctrl+hover - dcog989

- (e0b9222) highlight clickable links in txt documents - dcog989

- (14980d9) keep unsaved tabs with content marked modified so close prompts for save - dcog989

- (a8fbeeb) publish releases as final and drop redundant name prefix - dcog989
- - -

## v1.58.2 - 2026-08-24

#### Bug Fixes

- (360caeb) bump h2, whitelist unmaintained paste advisory, rotate updater key - dcog989
- - -

## v1.58.1 - 2026-08-24
- - -

## v1.58.0 - 2026-08-24
- - -
