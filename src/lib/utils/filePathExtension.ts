import type { Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

const PATH_REGEX =
  /(['"`])((?!https?:\/\/|www\.)(?:[a-zA-Z]:[/\\]|(?:\.\.?|~)[/\\]|\/(?:[^/\s'"`\r\n]+[/\\])+[^'"`\r\n]*|[^'"`\r\n]+?\.[a-zA-Z0-9]{1,10}))\1|(?:https?:\/\/|www\.)[^\s"'`(){}[\]<>]+|(?:[a-zA-Z]:[/\\]|(?:\.{1,2}|~)[/\\]|(?:\/(?:[^/\s"'\r\n(){}[\]<>]+[/\\])+))(?:[^"'\r\n(){}[\]<>]+?\.[a-zA-Z0-9]{1,10}(?=[\s)\]}>.,;:?!]|$)|[^\s"'(){}[\]<>]+)/g;

function stripTrailingPunctuation(str: string): string {
  return str.replace(/[.,;:?!]+$/, "");
}

const WIKILINK_REGEX = /\[\[([^[|]+?)(?:\|([^[|]+?))?]]/g;

export function extractWikilinkAtPos(text: string, pos: number): string | null {
  WIKILINK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  for (;;) {
    match = WIKILINK_REGEX.exec(text);
    if (match === null) break;
    const start = match.index;
    const end = start + match[0].length;
    if (pos >= start && pos < end) {
      const target = (match[1] || "").trim();
      return target || null;
    }
  }

  return null;
}

export function extractPathAtPos(text: string, pos: number): string | null {
  PATH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  for (;;) {
    match = PATH_REGEX.exec(text);
    if (match === null) break;
    if (match[1]) {
      const content = match[2];
      const start = match.index + 1;
      const end = start + content.length;
      if (pos >= start && pos < end) return content;
    } else {
      const raw = match[0];
      const isUrl = raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("www.");
      if (isUrl) {
        const clean = stripTrailingPunctuation(raw);
        const start = match.index;
        const end = start + clean.length;
        if (pos >= start && pos < end) return clean;
      } else {
        if (match.index > 0 && /[\w-]/.test(text[match.index - 1])) continue;
        const clean = stripTrailingPunctuation(raw);
        const start = match.index;
        const end = start + clean.length;
        if (pos >= start && pos < end) return clean;
      }
    }
  }

  return null;
}

const filePathMark = Decoration.mark({ class: "cm-file-path" });
const urlMark = Decoration.mark({ class: "cm-url" });
const wikilinkMark = Decoration.mark({ class: "cm-wikilink" });

function createMatcherPlugin(matcher: MatchDecorator): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

const pathMatcher = new MatchDecorator({
  regexp: PATH_REGEX,
  decorate: (add, from, _to, match, view) => {
    if (match[1]) {
      const content = match[2];
      if (content.length > 0) add(from + 1, from + 1 + content.length, filePathMark);
      return;
    }

    const raw = match[0];
    const isUrl = raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("www.");
    if (isUrl) {
      const clean = stripTrailingPunctuation(raw);
      if (clean.length > 0) add(from, from + clean.length, urlMark);
      return;
    }

    if (from > 0 && /[\w-]/.test(view.state.sliceDoc(from - 1, from))) return;
    const clean = stripTrailingPunctuation(raw);
    if (clean.length > 0) add(from, from + clean.length, filePathMark);
  },
});

const wikilinkMatcher = new MatchDecorator({
  regexp: WIKILINK_REGEX,
  decorate: (add, from, _to, match) => {
    const start = from + 2;
    const end = from + match[0].length - 2;
    if (end > start) add(start, end, wikilinkMark);
  },
});

export const linkPlugin: Extension = [createMatcherPlugin(pathMatcher), createMatcherPlugin(wikilinkMatcher)];
