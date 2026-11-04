# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/) for commit guidelines.

- - -
## v1.68.0 - 2026-11-04

#### Features

- (2a4f5d1) make MarkdownRS the default .md handler on first run - dcog989

#### Bug Fixes

- (598d811) keep callout lines the same height when the raw marker is revealed - dcog989

- (db5b0e2) put the unit inside the number field and spell it out. - dcog989

- (98d338b) apply the KDE HIG review fixes across labels, dialogs, menus and focus - dcog989

- (f47913d) scroll to headings for #anchor links instead of resolving them as file paths - dcog989

- (5589a7d) dynamic header, tweaks - dcog989

#### Refactoring

- (c5822de) new design, generated from readme.md - dcog989

- - -

## v1.67.0 - 2026-11-03

#### Features

- (26144b7) check and link to releases when self-update is unavailable - dcog989

- (51cbffb) highlight the line under the pointer on hover - dcog989

- (7144a28) label themes with their light/dark support + add theme mode - dcog989

- (3ca2331) make the go-to-tab command labels translatable - dcog989

- (64e227a) reject reserved keys when recording a shortcut - dcog989

- (3fac392) make both split handles keyboard accessible - dcog989

- (ccbfe48) honour the markdown flavour in EPUB and LaTeX export - dcog989

- (a60084d) build the EPUB table of contents from document headings - dcog989

- (251efbb) label fixed file type as markdown or text - dcog989

- (6598623) make toggle command labels reflect current state - dcog989

- (03a3693) add insert command and template placeholders - dcog989

- (eab1c48) add DOCX, EPUB and LaTeX export - dcog989

- (4e7a1f4) add side-by-side split pane for two files - dcog989

- (3eadb82) add navigable document outline modal with Ctrl+Shift+O - dcog989

- (4ca1fba) move files and folders by drag and drop - dcog989

- (fd22716) red border on find input when there are zero matches - dcog989

- (bf5d8b5) register AppImage in the desktop environment on launch - dcog989

#### Bug Fixes

- (2060a09) send startup logs immediately instead of batching - dcog989

- (1636106) stop rewriting settings.toml on every startup - dcog989

- (a14d2e7) keep the rendered horizontal rule height when its line is selected - dcog989

- (b782302) allow remote images and media in the Tauri CSP - dcog989

- (8764698) paint accent swatch and default the accent to the KDE accent colour - dcog989

- (fba5629) paste image-path text as plain text in unsaved files - dcog989

- (ed92ea9) use single-wildcard opener URL scopes - dcog989

- (51354fe) sniff content instead of file extensions when opening files - dcog989

- (f5cc049) let CodeMirror inject its styles under CSP - dcog989

- (ded46f2) declare markdown and text MIME associations for pacman installs - dcog989

- (454962e) allow sync_version.sh to re-run for the current version - dcog989

- (5482a28) drop openssl and libnm, which the binary never links - dcog989

- (aac13f9) stop deleting committed lockfiles in bun run clean - dcog989

- (427ea0f) write each error once at its real level - dcog989

- (89b2929) stop seeding theme copies and resolve theme CSS once - dcog989

- (4ac815b) readable image export, active tab and keyboard focus - dcog989

- (18306d4) satisfy the typed key checks - dcog989

- (bb30f93) make component text follow locale changes - dcog989

- (30c7685) type message keys and translate command labels once - dcog989

- (1b56ac5) remove the language picker until a second locale exists - dcog989

- (f1bf589) reject unsupported locales from settings - dcog989

- (a29ed39) pluralize find panel and replace counts - dcog989

- (3946be5) keep real diagnostic severities - dcog989

- (4413e14) drop stale cached results on settings change - dcog989

- (f0f1535) cap the per-tab lint cache - dcog989

- (5cd878b) toast a repeated lint failure only once - dcog989

- (a4ede08) write add-all words in one dictionary update - dcog989

- (ce61cc8) surface dictionary read and write failures - dcog989

- (7eafaf7) recover from slow or failed dictionary init - dcog989

- (a374cba) match unicode words and curly apostrophes - dcog989

- (277c3aa) require options in the null-returning callBackend overloads - dcog989

- (abd1ea5) record history only after the file opens - dcog989

- (e6471f9) draw image exports at scale 1 when the container has no width - dcog989

- (d6a794c) report imported rows instead of rows read from the file - dcog989

- (4dcec44) cap clipboard images below the memory spike - dcog989

- (90ee75d) restore large-file tabs to normal mode after they shrink - dcog989

- (aa2b87b) stop re-reading a clean file on every tab switch - dcog989

- (4a9832e) stop reporting success after a failed write - dcog989

- (fd47155) reload after a failed write instead of hiding the row - dcog989

- (44ce292) never write defaults over an unreadable settings file - dcog989

- (0a4160b) keep saving after a failed restore - dcog989

- (6f0f720) keep the filter effect out of the listings it loads - dcog989

- (c403dbe) import the editor store directly so appContext.editor is never undefined - dcog989

- (934a633) show an unparseable created timestamp instead of slicing it - dcog989

- (fd4938c) tell the user whether the path was copied - dcog989

- (2653551) filter from the first typed character like the history dialog - dcog989

- (e07d168) show the hover-only remove button while it has keyboard focus - dcog989

- (b3fb32c) ask before clearing file history with the app dialog - dcog989

- (f13e453) keep the list in step with the database after a delete - dcog989

- (890a85b) refresh the bookmark and history stores after an import - dcog989

- (d44b302) delete only the orphan paths the user was shown - dcog989

- (88c0bd1) expose the modal dialog instead of a button that contains it - dcog989

- (9c8801f) give tabs proper tab semantics and expose menu state - dcog989

- (9719092) act on the tab the menu is showing, not a stale list position - dcog989

- (2d853e8) only enable close-tabs modes that can close something - dcog989

- (e457630) copy the file name, not the content-derived tab title - dcog989

- (6eae1f2) await tab copy actions and report clipboard failures - dcog989

- (a1cb733) keep ctrl+tab working in writer mode and out of open dialogs - dcog989

- (5de23b3) stop the tab dropdown Enter key from missing the filtered list - dcog989

- (9878f5d) scope the tab context menu to the tab it was opened on - dcog989

- (9fea0c8) keep document text out of error logs - dcog989

- (128460e) keep at least one dictionary selected - dcog989

- (01dc5c7) label the file history limit as display-only - dcog989

- (541706d) keep the status badge on the focused tab - dcog989

- (0b40d62) confirm before discarding unsaved config edits - dcog989

- (66708f1) open a file once when it is clicked twice quickly - dcog989

- (4e9c914) ignore a theme response after the selection changed - dcog989

- (6fda2f3) delete stored closed tabs when the history setting is turned off - dcog989

- (62dbd0b) clamp numeric inputs and font sizes - dcog989

- (d5ba1b5) report failed deletes and renames - dcog989

- (07d7f8d) preview orphan cleanup before deleting - dcog989

- (4945fc8) retry failed saves and serialize writes - dcog989

- (d4b7175) report success when creating files and folders - dcog989

- (5fc4628) spell named keys from one shared table - dcog989

- (64fcbbe) record command usage only when the command handled the key - dcog989

- (531d9ce) update the MRU stack when switching tabs by number or last - dcog989

- (e8f8b69) persist the zoom level changed by the zoom commands - dcog989

- (98e7f36) always consume a matched key before the handler can await - dcog989

- (d93c995) block command execution while a modal or dialog is open - dcog989

- (34378f3) stop custom shortcuts from firing inside text inputs - dcog989

- (032a5b9) use unshifted chords for matching bracket and whitespace toggle - dcog989

- (cdb93f3) bind view and tab commands in the editor keymap - dcog989

- (0c22d8b) bind undo and redo in the editor keymap so rebinding works - dcog989

- (5ea95b3) unbind the losing command when a shortcut is reassigned - dcog989

- (d9bb62a) restore the keyboard when the shortcuts modal closes mid-recording - dcog989

- (45eee73) guard the pending-flush call when no editor view exists - dcog989

- (1dca2a3) ignore F3 while a modal is open - dcog989

- (9f4958d) count the match the caret is inside - dcog989

- (4ee7aad) page the command list ten rows at a time - dcog989

- (ae3ebc5) report cross-tab replace with a toast - dcog989

- (437f28b) start from the first heading on reopen - dcog989

- (e6ce139) clear all-tab results when the regex is invalid - dcog989

- (76ad090) let Enter activate the find bar's buttons - dcog989

- (f7e9767) keep the selected match when opening the panel - dcog989

- (9521916) anchor whole-word regex with a group - dcog989

- (9ae0d95) apply in-tabs replace to mounted editors - dcog989

- (ff274f3) type the drag target explicitly so tsgo keeps the HTMLElement methods - dcog989

- (dc1fdb1) honour prefers-reduced-motion when syncing panes - dcog989

- (94c4fdd) don't cancel the pending paint frame on every scroll event - dcog989

- (9933f43) end track drags when the pointer is released outside the window - dcog989

- (6e7e308) keep the preview line map in DOM order - dcog989

- (8564417) resolve images against the rendered tab's directory - dcog989

- (3c35b33) treat a failed TOC command as a no-op instead of inserting null - dcog989

- (2d81c3e) keep a literal trailing hash in heading text - dcog989

- (361b41d) re-render mermaid diagrams when the theme changes - dcog989

- (8618ca3) clear an existing TOC region when the document has no headings - dcog989

- (1ff6698) re-render when markdown flavor or file path changes - dcog989

- (428265a) only close a code fence when the line has no info string - dcog989

- (3953fed) resolve fragment links by element id instead of raw selector - dcog989

- (3788314) recompute a reopened tab's pending word count - dcog989

- (563138f) refresh the widest column after typing - dcog989

- (c2972e4) append a right-placed new tab when the active id is stale - dcog989

- (23fadf8) wait for the final save before closing the window - dcog989

- (58b4997) re-arm the file watcher when a closed tab is reopened - dcog989

- (4518d52) save each tab after its own idle interval - dcog989

- (d4e6ba2) load a reopened closed tab's text before it leaves the history - dcog989

- (59c1fe6) keep changes made while a session save is in flight - dcog989

- (3f7b28f) keep the metadata cache small and stop caching failures - dcog989

- (44365a3) tell the user when a clicked link is rejected - dcog989

- (7dba765) clamp maxFileSizeMB on load so both sides share one limit - dcog989

- (8efdbea) keep relative image links intact for notes in the root folder - dcog989

- (47ba384) reject names that would move a file out of its folder - dcog989

- (5d9e893) allow opening any local path, not just home - dcog989

- (3d794b7) always release the save lock when a save exits early - dcog989

- (c8f92cb) trash a tab's file only after its tab has closed - dcog989

- (7bf78eb) refuse to open binary files as editable text - dcog989

- (a333ec9) retry the active-file reveal after a lock or root change - dcog989

- (47ccfec) start a newly positioned tree at the top - dcog989

- (5465eee) search folders named build, dist, target and vendor - dcog989

- (19c7b61) drop bookmarks and file-history entries for deleted paths - dcog989

- (90df058) apply the rename extension rule to closed files as well - dcog989

- (153f736) bound the tree cache and cancel load state for deleted subtrees - dcog989

- (5b70de3) re-check a file whose change event lands inside the app's own write lock - dcog989

- (317b395) cap the filter walk depth so an ancestor symlink cannot extend it without bound - dcog989

- (51827be) re-run the filter after tree mutations and drop in-flight stale results - dcog989

- (09fd52e) refresh folders in place instead of clearing the cache first - dcog989

- (87dca06) close tabs before deleting to trash so a cancelled close cannot undo the delete - dcog989

- (8b0222a) reload each duplicate tab from disk instead of copying the first tab's text - dcog989

- (0f7892f) leave ~~ literal outside markdown prose - dcog989

- (f69707c) block remote images and media with a CSP - dcog989

- (2e7ddd6) reveal a heading's raw size under a selection - dcog989

- (c0eeeb0) drop a stale pointer target before the next press - dcog989

- (153fe4e) let modal search fields keep the left and right arrows - dcog989

- (982a783) copy code blocks without the closing fence - dcog989

- (afc06c9) treat a zero recent-changes period as unlimited - dcog989

- (51f3ba8) render * and + bullets and skip indented code - dcog989

- (c290951) keep tables raw under a selection - dcog989

- (91ff0c9) keep parsing when frontmatter is unclosed - dcog989

- (90adcf6) escape quotes in table cell link urls - dcog989

- (84ca944) free a command's old key when its shortcut is rebound - dcog989

- (6c5d336) indent at every cursor when Tab is pressed with multiple cursors - dcog989

- (0091f6a) delete text only after the clipboard write succeeds - dcog989

- (5a6c990) clear the pending content timer after flushing - dcog989

- (6d03264) turn spellcheck and recent-change tracking off when a tab grows into large-file mode - dcog989

- (429c62f) keep canonical CodeMirror key names for arrow and page keys - dcog989

- (990233a) drop text transforms whose document changed while awaiting the backend - dcog989

- (3ba776c) stop a second pane from claiming the active editor view - dcog989

- (53423ba) import clearTabCaches from the cache module - dcog989

- (5982729) only count exact New-<n> titles when naming new tabs - dcog989

- (6b8d2f8) never throttle errors and prune the throttle map - dcog989

- (3122842) refresh line and word counts after a programmatic text replace - dcog989

- (f850a12) normalize Windows separators in the file tree and dirname - dcog989

- (1eba3d5) apply the history limit when restoring entries - dcog989

- (76988a5) retry a folder after a failed listing - dcog989

- (1bbbf99) stop deleting the stale path before the upsert - dcog989

- (b3c6349) only mark the session dirty when a tab field changes - dcog989

- (1db88cb) honor the closed-tab history setting and stop rewriting closed content - dcog989

- (14d198a) queue prompt dialogs so a second request cannot hang the first - dcog989

- (298bed0) keep edits typed while a closed tab reloads from disk - dcog989

- (428a8fd) keep edits made during a save marked dirty - dcog989

- (4f39b9a) end splitter drags when the pointer is released outside the window - dcog989

- (4c75fdc) use one split range and persist the pane ratio - dcog989

- (b3fda55) hold dropped files until the session has restored - dcog989

- (b7533af) drop the old tab id from the editor registry on switch - dcog989

- (857c144) unify the is-this-tab-markdown rule - dcog989

- (24fb724) surface init failures and keep session persistence running - dcog989

- (575e849) reference-count file watchers by tab id - dcog989

- (135fc5b) keep the visible document on the pane tab during background saves - dcog989

- (76a41cf) reject unsafe language codes before using them as file names - dcog989

- (2f1a6d0) write the user dictionary atomically - dcog989

- (3c7f49a) reload the custom dictionary from disk instead of merging - dcog989

- (0c1baca) report failed dictionary loads in settings - dcog989

- (d0e1f53) pin dictionary sources to commits - dcog989

- (f797928) retry dictionaries after a partial load - dcog989

- (20082d4) invalidate unusable dictionary cache entries - dcog989

- (2403be5) prune unreachable language dictionaries and pin real sources - dcog989

- (ab714c8) report a missing active tab in HTML and PDF export - dcog989

- (05bbc82) use fancyvrb when a code block contains \end{verbatim} - dcog989

- (8656544) keep the start number of ordered lists in LaTeX - dcog989

- (11ae72a) embed a system CJK font in PDFs with non-Latin text - dcog989

- (c4f15f4) render LaTeX footnotes as \footnote at the reference - dcog989

- (0b2b4a6) repair EPUB, HTML and LaTeX export output - dcog989

- (0a1ded4) gate export commands correctly so --no-default-features compiles - dcog989

- (66d1c48) drop raw HTML from EPUB so the body is valid XHTML - dcog989

- (ff9dd66) keep relative image paths in exported HTML - dcog989

- (dc6c814) delete orphans in batches to stay under SQLite's parameter limit - dcog989

- (d2b7d8e) log malformed tags JSON instead of dropping tags silently - dcog989

- (5116bfc) accept an id-conflicting path update and duplicate import rows - dcog989

- (185dbc0) keep every tab column addable to an existing database - dcog989

- (66ca7f4) stop re-seeding cleared file history from the session - dcog989

- (cbddcba) treat the auto_vacuum conversion as best effort - dcog989

- (97e837c) refuse to persist until the session restore succeeds - dcog989

- (b4a3569) log non-filename theme names at debug instead of warn - dcog989

- (e2b167e) anchor relative-link containment on the base directory itself - dcog989

- (1201796) skip non-UTF-8 directory entries instead of listing mangled paths - dcog989

- (c74858a) fsync the parent directory after an atomic save rename - dcog989

- (26d2a39) stop project-scoped rumdl configs from landing in the home directory - dcog989

- (668e879) create the copy target with create_new so an existing file is never overwritten - dcog989

- (0698d71) follow symlinks when listing directory entries so linked folders stay expandable - dcog989

- (83cf69d) quarantine an unparseable settings file instead of blocking every save - dcog989

- (b42246e) reject theme names containing path components - dcog989

- (d4209b9) stat orphan candidates outside the connection lock and keep unstattable paths - dcog989

- (dd60ad4) run set_window_title on the main thread so the GTK fallback is safe - dcog989

- (4759a4d) decode amp entity last so heading labels are not double-decoded - dcog989

- (efaa00e) report the rumdl config actually loaded for file-only opens - dcog989

- (d220375) require valid JSON for brace-style frontmatter - dcog989

- (957bbc1) escape link metacharacters in generated TOC labels - dcog989

- (d624049) close callout div when blockquote has no attributes - dcog989

- (aea62aa) write the rumdl config atomically - dcog989

- (68c6e55) ignore TOC markers inside indented and inline code - dcog989

- (cf4629c) decode percent-encoded link targets before opening them - dcog989

- (3b74557) open external links in the browser instead of resolving them as paths - dcog989

- (4ab3104) escape % in AppImage paths in the desktop entry - dcog989

- (9da9e31) warn once per lock kind on poisoned locks - dcog989

- (911ad85) seed built-in themes synchronously at startup - dcog989

- (65873db) open every file passed on the command line - dcog989

- (a6da0d0) keep running when the log directory is unwritable - dcog989

- (0f3dde3) write settings.toml atomically - dcog989

- (962c8be) preserve target permissions and symlinks in atomic_write - dcog989

- (f8ac064) draw the bar above the minimap so the trailing buttons stay visible - dcog989

- (933573a) enforce a content security policy and drop unused fs read access - dcog989

- (ea62a08) migrate settings before the first settings read - dcog989

- (657a288) only quarantine the session database on real corruption - dcog989

- (ddbeec4) register process plugin so in-app updates can relaunch - dcog989

- (3ceadbe) reword word wrap toggle tooltip - dcog989

- (8ee28a5) keep scroll-to-top below the overlay find bar - dcog989

- (cd4c27f) default export save dialogs to the user home directory - dcog989

- (790b1d8) register vacuum listener before managed state - dcog989

- (1e6dd06) reduce minimap width to 108px - dcog989

#### Performance Improvements

- (5081ddb) save on change instead of a 5 second timer - dcog989

- (c035f82) only run ngram suggestions as a fallback - dcog989

- (53ac96f) scan excluded ranges with a moving cursor - dcog989

- (2bf7022) stop clearing caches when a word is added - dcog989

- (f133b57) skip the pre-save read when the file is unchanged - dcog989

- (b99c660) limit the drag reorder sweep to real pointer movement - dcog989

- (e3750be) stop scanning the document on every keystroke - dcog989

- (cd58c23) count all-tab matches without allocating them - dcog989

- (dfbdac7) reuse one Intl.NumberFormat instead of allocating per call - dcog989

- (86dc0ec) stop counting words for large tabs on every pause - dcog989

- (47b684c) cache the document scan across scroll frames - dcog989

- (0479607) skip rendering files above the large-file limit - dcog989

- (a2f84c0) evict the oldest render cache entry instead of clearing the cache - dcog989

- (35eadf7) open a file with one metadata call instead of three - dcog989

- (58e676c) fold callout scanning into the decoration walk - dcog989

- (b3efb1e) stop re-rendering tables on every cursor move - dcog989

- (8723587) adjust the cursor word index by the moved slice instead of rescanning the document - dcog989

- (b889962) read a dirty tab's disk baseline once per dirty episode - dcog989

- (acabedf) stop re-hashing and re-encoding large documents on every edit - dcog989

- (b08d358) list one folder at a time while filtering - dcog989

- (143bd20) scan each text range once per lint pass - dcog989

- (de2d26e) borrow AST nodes instead of cloning them in the LaTeX renderer - dcog989

- (5fc4db3) run document conversions on the blocking pool - dcog989

- (e63632d) cache listing sort keys instead of lowercasing per comparison - dcog989

- (9b6e58f) avoid extra document copy and callout pass per render - dcog989

- (60a4bde) drop unused document metrics from the render result - dcog989

- (4b36ce7) load bookmarks while settings load - dcog989

- (e037507) drop the redundant window icon decode - dcog989

- (7552c02) parse settings.toml once during bootstrap - dcog989

- (5244f39) ship the active theme CSS with load_settings - dcog989

- (cf764c8) run the database vacuum after the restore, not during it - dcog989

- (dd26412) register the AppImage desktop entry off the main thread - dcog989

- (7e9c4f3) reuse the restored tab's disk read instead of re-checking - dcog989

#### Refactoring

- (f41cce8) remove shared-infra drift and silent no-ops - dcog989

- (3bc2caf) type session state and reuse shared API types - dcog989

- (9e3248f) drop dead rules, unused variables and duplicate declarations - dcog989

- (3542643) merge duplicate copy and preview messages - dcog989

- (c8526f1) remove 22 unused messages - dcog989

- (6ac4068) drop the unused setAppLocale helper - dcog989

- (30d13ad) one add-words path for menu and F8 - dcog989

- (59e4751) share the validated date formatter - dcog989

- (d343cbb) look up one tab instead of rebuilding a Map - dcog989

- (bb15cba) drop a failure branch writeTextFile cannot take - dcog989

- (5b1d95e) share one escapeHtml - dcog989

- (c384229) remove the empty key handler from the modal panel - dcog989

- (930a826) render the About path rows from one list - dcog989

- (e711bd1) share one sort control between the bookmark and history dialogs - dcog989

- (4f0a7ce) remove the unused second debounce helper - dcog989

- (96a8b6c) drop the modal focus cache the tab trap never used - dcog989

- (9db5094) import the metadata cache helper statically - dcog989

- (cb45d3a) reuse the shared row scroll action in the MRU popup - dcog989

- (a6257b9) drop dead tab menu guards and one-line forwarders - dcog989

- (ea91a10) one tab icon ladder and one tab tooltip builder - dcog989

- (937a405) remove unused conditional and group fields - dcog989

- (d5e2a45) drop unused timing constants and the validator - dcog989

- (95a84dc) share the tab width defaults - dcog989

- (b2fbafc) share the modal predicate and drop the dead escape list - dcog989

- (66157cd) generate the editor registry and keymap from one table - dcog989

- (acc764a) delete the unused scored fuzzy matcher - dcog989

- (8c4444d) make throttle trailing-only - dcog989

- (7876468) drop the unused appContext.scrollSync alias - dcog989

- (0dbd373) share the html injection path between action setup and update - dcog989

- (0202ed0) drop the unreachable empty-session fallback - dcog989

- (ea98243) drop the tab load state machine and use contentLoaded - dcog989

- (6d2c825) call openFile directly, drop the pass-through wrapper - dcog989

- (1bddd19) reuse withActiveTab in saveAllFiles - dcog989

- (ae04de9) use one path normalizer for tab, tree and watcher paths - dcog989

- (1a5a99a) share one image extension list and drop stale poll comments - dcog989

- (731327f) drop the unused watcher cleanup and duplicate path/markdown helpers - dcog989

- (8843000) drop the non-CSS okhsl colour conversion - dcog989

- (e8c6855) install the ruler plugin directly instead of through a compartment - dcog989

- (ca301e3) drive both split dividers from createSplitResize - dcog989

- (476be7a) drop the unused request id - dcog989

- (deaa56e) break the state and bookmark import cycle - dcog989

- (23413c8) drop unused splitter isDragging getter - dcog989

- (95fe051) merge duplicate immediate-lint helpers - dcog989

- (94f87e1) remove the unlistened progress event - dcog989

- (88ca662) drop the unused init-cancel command - dcog989

- (a5f464c) drop the unused print stylesheet rules - dcog989

- (adc5347) collapse the four export commands into one writer - dcog989

- (9d1dd0e) drop the unused PDF background colour argument - dcog989

- (6aa3f72) drop the unused is_symlink and history_state contract fields - dcog989

- (8d3f6a5) drop the duplicate bookmark and file-history export commands - dcog989

- (3ad537c) drop unused flavor command and strum dependency - dcog989

- (b02f13c) drop temp-file cleanup that never covered user directories - dcog989

- (10cd17e) replace validate_path with a null-byte-only input guard - dcog989

- (0284339) remove dead category mapping and unused find-replace labels - dcog989

- (5fafaed) dock find UI as a single-row bar under the tab bar - dcog989

- - -

## v1.66.2 - 2026-10-25

#### Bug Fixes

- (068425f) always checkpoint after the startup vacuum - dcog989

- (64d1f2e) checkpoint after the startup vacuum - dcog989

- - -

## v1.66.1 - 2026-10-25

#### Bug Fixes

- (be144f7) set auto_vacuum before enabling WAL - dcog989

- (b4885a2) install mold on ubuntu runners - dcog989

- (6a95569) drop the stale bookmark when a rename reuses its path - dcog989

- (e831d2b) cap the WAL file at 16 MiB - dcog989

- (4194b68) reclaim freelist pages at startup instead of never - dcog989

#### Performance Improvements

- (679c2a1) skip the file history backfill once history is non-empty - dcog989

#### Refactoring

- (e598849) define the file history prune SQL once - dcog989

- - -

## v1.66.0 - 2026-10-25

#### Features

- (21191dc) render text glyphs instead of bars - dcog989

- (b6dda6f) add Toggle File Type command for shortcut assignment - dcog989

- (94f2e25) show the bookmark icon on bookmarked document tabs - dcog989

#### Bug Fixes

- (051d63c) dim glyph text when the minimap is not hovered - dcog989

- (7ac972c) reserve the scrollbar strip instead of overlaying text - dcog989

- (82cbc50) keep minimap and scrollbar state in sync and share scrollbar styling - dcog989

- (6c56742) tint the viewport band so it separates from the rest of the track - dcog989

- (5710c60) dim viewport line band, remove ineffective overlay - dcog989

- (1bd0f3d) import syntaxTree in markdownCopy - dcog989

- (018ea4e) keep editor scroll position when restoring focus on close - dcog989

- (1e2175b) copy only the selected text in rendered mode - dcog989

- (195dbb3) paint fenced code from fence state instead of token spans - dcog989

- (9f5aba6) draw URL spans with --editor-url instead of link color - dcog989

- (ada773d) remove redundant ternary in status bar and tab dropdown - dcog989

- (6b2d5a0) restore previous focus on close instead of blurring - dcog989

- (b3223bd) clear peek strip hover state when the cursor leaves the window - dcog989

- (94aaa05) tab dropdown consistent styling, dim tree expand chevron - dcog989

#### Performance Improvements

- (d94e1c0) cut dev startup cost - dcog989

- - -

## v1.65.1 - 2026-10-20

#### Bug Fixes

- (7e98fac) keep the collapsed peek chevron visible instead of fading it - dcog989

- (0412da3) separate ignored a11y codes with a comma - dcog989

- (fa5ca31) make the resize bar a keyboard-operable splitter - dcog989

- (7ddbfd2) open folders on click while filtering instead of toggling expansion - dcog989

- (16027c5) distinguish resize from click and keep the handle inside the panel - dcog989

- (c5b8af8) re-root the tree when a tab switch lands outside it - dcog989

- (e641933) stop batch saves from re-rooting and collapsing the tree - dcog989

- (b9d98d7) handle a filesystem-root tree in prefix checks - dcog989

- (e30c9e9) reload all expanded folders when hidden files are toggled - dcog989

- (35ebe9a) keep tabs and tree caches valid across folder rename/delete - dcog989

- (9350a60) rename folders against their parent directory - dcog989

- (c58451f) start resize handle below the filter input - dcog989

- (cacf3f7) drop oversized collapse overlay and collapse on resize bar click - dcog989

- (8f1dc52) make tab dropdown close icon fully opaque - dcog989

- (ef9ce75) put command shortcut on same row, right aligned - dcog989

- (7ccd6f9) skip disk write when the tab has no unsaved changes - dcog989

- (462642c) skip disk write when saving an unchanged document - dcog989

#### Performance Improvements

- (46e9a44) debounce the filter and skip heavy folders when searching - dcog989

#### Refactoring

- (8dc0df2) show title/date/tags on the first row and the path below - dcog989

- (7206faf) unify modal list rows on card styling - dcog989

- (504fbbe) match bookmark rows to command palette style - dcog989

- (b3a611f) match file history rows to command palette style - dcog989

- - -

## v1.65.0 - 2026-10-17

#### Features

- (084c699) add back buttons to shortcuts, rumdl, and data panels - dcog989

- (53631fa) replace copy-stats context menu with left copy button - dcog989

#### Bug Fixes

- (9a79607) run sync_version hook via bash - dcog989

- (ae2f82e) pin svelte-check to 4.7.6 and override it against version bumps - dcog989

- (b280c60) pin svelte-check to 4.7.6 and restore full type-check coverage - dcog989

- (667b32b) place replace toggle after scope toggle with left divider - dcog989

- (eef45e9) overlay editor behind status bar and fade copy button with opacity - dcog989

- (f7d9569) show close button without an opacity transition to stop hover flicker - dcog989

- (9436a87) mirror selection state onto classes instead of :has() to stop drag-select lag - dcog989

- (e0976af) apply opacity to whole find panel again - dcog989

- (c247976) fade panel background instead of element opacity to stop blur flicker - dcog989

- (8930f7e) paint the window background from the saved theme and drop the startup delays - dcog989

- (d1a0186) paint the window background from the saved theme - dcog989

- (ca79d61) pass expression instead of quoted attribute in FindReplacePanel - dcog989

#### Performance Improvements

- (0cb2d2a) lazy-load katex javascript like mermaid and highlight.js - dcog989

- (e2b678b) switch to fat lto for maximum optimization - dcog989

- (a9d87a7) optimize dependencies and trim debug info for faster tauri dev - dcog989

#### Refactoring

- (f5381fe) rename binary and asset slug from markdown-rs to markdownrs - dcog989

- (3487b7c) icon toolbar with match/scope toggles and arrow navigation - dcog989

- - -

## v1.64.2 - 2026-10-11

#### Bug Fixes

- (64a8aaf) render whitespace dots per cell, drop WebKit-mispositioned glyphs - dcog989

- (a50f68d) keep rumdl issues popup visible at reduced status bar opacity - dcog989

- - -

## v1.64.1 - 2026-10-10

#### Bug Fixes

- (326357a) stop unrelated re-renders clobbering the visible tooltip - dcog989

- (bfb579d) align number input step grid for off-step minimum - dcog989

- - -

## v1.64.0 - 2026-10-10

#### Features

- (5851162) move whitespace toggle from settings to status bar - dcog989

- (66a4ffd) show memory-warning tooltips instantly, ignoring tooltip delay - dcog989

- (c0c6e21) rename recent changes timespan label to "Recent Changes Period (secs)." - dcog989

- (87cd72d) add optional color swatches in rendered mode - dcog989

- (8c50247) add hover background to settings rows - dcog989

- (66e97b1) add sort dropdown with separate asc/desc toggle - dcog989

- (3506a3b) replace sort cycling with sort dropdown and asc/desc toggle - dcog989

#### Bug Fixes

- (6c75811) set explicit slider/stepper increments for delay and opacity controls - dcog989

- (129a089) use drawSelection cursorBlinkRate and correct linter enter return type - dcog989

- (98121a2) add timestamps to log file and console output - dcog989

- (8e3cf41) disable caret blink to stop WebKitGTK 2.54 idle CPU spin - dcog989

- (e6612a7) reserve reset-shortcut slot so all key chips align - dcog989

- (78e1ba0) align context menu scrollbars and widen the popup cap - dcog989

- (2e0dd79) show scrollbar in overflowing context menus - dcog989

- (cefa249) render strikethrough in body text color - dcog989

- (2bfdefe) stop tinting strikethrough with the quote color - dcog989

- (9761397) let command palette, file history and bookmarks shrink to min width - dcog989

- (552e9ce) correct misleading sort labels and keys - dcog989

- (2b4c305) define missing utilities referenced by markup - dcog989

- (896ed18) correct sort order and labels - dcog989

- (88feb10) stop flagging words inside URLs and inline code - dcog989

#### Refactoring

- (bbca46e) regroup settings categories - dcog989

- (2ba99a7) add dedicated Tabs category - dcog989

- (93abfd9) remove line ending setting, superseded by status bar toggle - dcog989

- (2e7c37d) move numeric unit suffixes from labels into input field hints - dcog989

- (a298dbc) drop editor view mode row, toggled from status bar - dcog989

- (222713a) consolidate toast color classes and drop dead CSS - dcog989

- (9b7fda1) drop redundant _editor.css mirror from custom-theme payload - dcog989

- (d8f669e) drop input chrome restated from the global element rule - dcog989

- (ea07713) unify selected-row styling into one shared contract - dcog989

- (f4b757e) extract shared .menu-item class for context-menu rows - dcog989

- (0737ea2) route all button styling through shared .btn-* variants - dcog989

- (9ffa814) remove stale tokens and unify theme naming - dcog989

- (0f1a474) remove duplicated element and alias utility classes - dcog989

- (cf195d6) consolidate duplicated row, scrollbar, modal and menu styles - dcog989

- (f739def) highlight bookmark, command, history and shortcut rows via CSS hover - dcog989

- (10adb2b) collapse ad-hoc type scale into .text-ui/.text-ui-sm/.text-lg - dcog989

- (ffc1650) style selects from the global element rule - dcog989

- (280db6d) centralize select styling in a shared Select component - dcog989

- (8f1d30a) move clear action into settings data modal - dcog989

- (3bdfba9) tighten level parsing, dedupe IPC errors, quiet poisoned locks - dcog989

- - -

## v1.63.0 - 2026-10-06

#### Features

- (ae26ce0) replace Find Panel Hides toggle with transparency slider - dcog989

#### Bug Fixes

- (2acd526) migrate svelte config into vite plugin for sveltekit 3 - dcog989

- (dccc23e) preserve word casing in valid/misspelled caches - dcog989

#### Refactoring

- (9548a1d) use opacity instead of transparency for sliders - dcog989

- (fa65a1b) unify check/fix scripts and drop format scripts, tidy - dcog989

- - -

## v1.62.1 - 2026-10-01

#### Bug Fixes

- (8635278) add accessible label to logo svg - dcog989

- (865d7bb) drop manual log-file creation, use flexi_logger rotation only - dcog989

- (c87c534) use stable log filename and create file eagerly - dcog989

- (de35a10) prefix theme labels for palette search - dcog989

- (f331554) prefix sort operation labels with "Sort" for palette search - dcog989

- (68eb306) escape `&#64;` in changelog - dcog989

#### Refactoring

- (1358034) demote hot-path session, storage and tab events to debug - dcog989

- (ca7fa4d) replace tauri-plugin-log with flexi_logger - dcog989

- - -

## v1.62.0 - 2026-09-23

#### Features

- (09ad7cc) localize command palette labels, categories, and text operations - dcog989

- (a963ce2) persist command usage on app close - dcog989

- (fcdcdd2) make line sorting case-insensitive by default, add case-sensitive option - dcog989

#### Bug Fixes

- (e0ae1fd) record usage from all command invocation paths - dcog989

- (a7e035c) correct invalid @const syntax in EditorContextMenu - dcog989

- (5b03e5c) correct invalid @const syntax in EditorContextMenu - dcog989

- (bfe3417) correct invalid @const syntax in EditorContextMenu - dcog989

- (802b402) render `---` under text as a horizontal rule, not a setext heading - dcog989

#### Refactoring

- (9765f76) remove footer close button - dcog989

- (abc23ec) move Reverse/Shuffle into sort submenu - dcog989

- (8e58ed8) drop Reverse/Shuffle from sort submenu - dcog989

- (1402f39) split config.rs into flavor and rumdl modules - dcog989

- (f3eaa3f) split config.rs into flavor and rumdl modules - dcog989

- (1c48073) split files.rs into a files module directory - dcog989

- (7997147) split minimap logic out of Minimap.svelte - dcog989

- (c07a7d3) split markdown decorations into focused modules - dcog989

- - -

## v1.61.2 - 2026-09-16

#### Bug Fixes

- (e9df9b2) stop migrating themes and custom dictionary to the config dir - dcog989

- (aaff6ef) detect the .portable marker next to AppImages - dcog989

- (30a089c) store themes and custom dictionary in the data directory - dcog989

- (e49f531) store the database in the application data directory - dcog989

- (fd8647e) redirect XDG directories in Linux portable mode - dcog989

- (d3951b0) clean stale temp files from the app cache directory - dcog989

- (020abd8) color markdown link targets with the URL color - dcog989

- (2bb37c5) render a fixed-size placeholder for missing rendered images - dcog989

- (86ffcc2) don't snap fragment selections inside rendered images to the full image syntax - dcog989

- (02e1dfc) snap edge clicks to document top/bottom - dcog989

- (f04376f) snap end-of-line clicks past a closing masked marker - dcog989

#### Refactoring

- (2d49887) store spellcheck dictionaries in app cache dir - dcog989

- (656fbd0) tweak color chroma - dcog989

- (dd4bf53) derive functional status colors from OKLCH scale - dcog989

- (f872d86) derive all GFM callout accents from source hues - dcog989

- (f11034d) normalize auto theme content lightness with OKLCH - dcog989

- (c188ce7) rename built-in "System" theme to "Auto (Light/Dark)" - dcog989

- - -

## v1.61.1 - 2026-09-14

#### Bug Fixes

- (1c0b32c) import Extension from @codemirror/state - dcog989

- (4c7bcc8) correct wrapped-line-end clicks before paint - dcog989

- (576d29b) keep clicks at the end of a wrapped rendered line on that line - dcog989

- (7505355) resolve nullable view type error in drag handler - dcog989

#### Refactoring

- (b191539) unify rendered click-to-caret handlers into one extension - dcog989

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
