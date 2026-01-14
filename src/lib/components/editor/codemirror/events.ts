import { extractPathAtPos } from '$lib/utils/filePathExtension';
import { navigateToPath } from '$lib/utils/fileSystem';
import { syntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { openPath } from '@tauri-apps/plugin-opener';

export type ContextMenuCallback = (event: MouseEvent, view: EditorView) => void;

export function createEditorEventHandlers(onContextMenu?: ContextMenuCallback) {
    return EditorView.domEventHandlers({
        mousedown: (event, view) => {
            // Ctrl/Cmd + Click for Links
            if ((event.ctrlKey || event.metaKey) && event.button === 0) {
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                if (pos === null) return false;

                let targetString = '';

                // 1. Check syntax tree for Link/URL nodes (CommonMark links)
                let node = syntaxTree(view.state).resolveInner(pos, 1);
                while (node && node.parent && !['URL', 'Link', 'LinkEmail'].includes(node.name)) {
                    node = node.parent;
                }

                if (node && ['URL', 'Link', 'LinkEmail'].includes(node.name)) {
                    if (node.name === 'Link') {
                        const urlNode = node.node.getChild('URL');
                        if (urlNode) targetString = view.state.sliceDoc(urlNode.from, urlNode.to);
                    } else {
                        targetString = view.state.sliceDoc(node.from, node.to);
                    }
                }

                // 2. Check for File Paths (using shared regex logic)
                if (!targetString) {
                    const line = view.state.doc.lineAt(pos);
                    const posInLine = pos - line.from;
                    targetString = extractPathAtPos(line.text, posInLine) || '';
                }

                // 3. Fallback: heuristic regex matching on the current line (Word-based, fails on spaces)
                if (!targetString) {
                    const line = view.state.doc.lineAt(pos);
                    const text = line.text;
                    const posInLine = pos - line.from;

                    if (posInLine >= 0 && posInLine < text.length && /\S/.test(text[posInLine])) {
                        let start = posInLine;
                        while (start > 0 && /\S/.test(text[start - 1])) start--;
                        let end = posInLine;
                        while (end < text.length && /\S/.test(text[end])) end++;

                        targetString = text.slice(start, end).trim();
                        // Strip wrapping brackets common in markdown/text
                        targetString = targetString.replace(/^[<(\[]+|[>)\]]+$/g, '');

                        // Strip trailing punctuation
                        if (!/^https?:\/\//i.test(targetString)) {
                            targetString = targetString.replace(/[.,;:!?)\]]+$/, '');
                        } else {
                            targetString = targetString.replace(/[.,;!?)\]]+$/, '');
                        }
                    }
                }

                if (targetString) {
                    event.preventDefault();
                    event.stopImmediatePropagation();

                    if (/^(https?:\/\/|www\.)/i.test(targetString)) {
                        const url = targetString.startsWith('www.') ? `https://${targetString}` : targetString;
                        openPath(url).catch(() => {});
                    } else {
                        navigateToPath(targetString);
                    }
                    return true;
                }
            }
            return false;
        },
        contextmenu: (event, view) => {
            if (onContextMenu) {
                onContextMenu(event, view);
                return true;
            }
            return false;
        },
    });
}
