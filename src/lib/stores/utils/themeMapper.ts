import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const themeHighlightStyle = HighlightStyle.define([
    { tag: t.heading1, class: "cm-h1" },
    { tag: t.heading2, class: "cm-h2" },
    { tag: t.heading3, class: "cm-h3" },
    { tag: t.heading4, class: "cm-h4" },
    { tag: t.keyword, class: "cm-keyword" },
    { tag: t.atom, class: "cm-atom" },
    { tag: t.number, class: "cm-number" },
    { tag: t.string, class: "cm-string" },
    { tag: t.comment, class: "cm-comment" },
    { tag: t.url, class: "cm-link" },
    { tag: t.link, class: "cm-link" },
    { tag: t.emphasis, class: "cm-emphasis" },
    { tag: t.strong, class: "cm-strong" },
    { tag: t.list, class: "cm-list" },
    { tag: t.meta, class: "cm-meta" },
    { tag: t.monospace, class: "cm-code" },
    { tag: t.strikethrough, class: "cm-strikethrough" },
]);

export const userThemeExtension = syntaxHighlighting(themeHighlightStyle);
