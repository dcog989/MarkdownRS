import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

// Regex to match file paths: Windows paths (C:\...), Unix paths (/...), or relative paths (./... or ../....)
// Unix absolute paths must have at least one slash after the initial slash (e.g., /home/user, not /hibernate)
const FILE_PATH_REGEX =
    /(?:(?:^|\s)(?:[a-zA-Z]:[\\\/]|\.\.?[\\\/])[a-zA-Z0-9._\-\/\\!@#$%^&()\[\]{}~`+]+)|(?:(?:^|\s)\/[a-zA-Z0-9._\-]+[\\\/][a-zA-Z0-9._\-\/\\!@#$%^&()\[\]{}~`+]*)/g;

// Mark to apply to file paths
const filePathMark = Decoration.mark({
    class: "cm-file-path",
});

function findFilePaths(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;

    for (let { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
            const line = doc.lineAt(pos);
            const lineText = line.text;

            // Reset regex
            FILE_PATH_REGEX.lastIndex = 0;

            let match: RegExpExecArray | null;
            while ((match = FILE_PATH_REGEX.exec(lineText)) !== null) {
                const matchText = match[0].trim();
                const startOffset = match.index + (match[0].length - matchText.length);
                const matchFrom = line.from + startOffset;
                const matchTo = matchFrom + matchText.length;

                builder.add(matchFrom, matchTo, filePathMark);
            }

            pos = line.to + 1;
        }
    }

    return builder.finish();
}

export const filePathPlugin: Extension = ViewPlugin.fromClass(
    class {
        decorations;

        constructor(view: EditorView) {
            this.decorations = findFilePaths(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = findFilePaths(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

// Theme to style file paths
export const filePathTheme = EditorView.baseTheme({
    ".cm-file-path": {
        color: "var(--color-accent-link)",
        textDecoration: "underline",
        "&:hover": {
            color: "var(--color-accent-link-hover)",
            textDecoration: "underline",
        },
    },
    // Only show pointer cursor when the editor has the modifier-down class
    "&.cm-modifier-down .cm-file-path": {
        cursor: "pointer",
    },
});
