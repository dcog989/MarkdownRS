import type { Line } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { type DecorationWalk, isVisibleInCodeBlock } from "./markdownDecorationCore";

/**
 * Color literals surfaced as an inline swatch in rendered mode. Matches the CSS
 * Color 4 function forms plus bare hex; the WebView resolves them, and the
 * widget hides any value it cannot parse. Non-CSS colour spaces such as
 * `okhsl()` are deliberately not matched: nothing else renders them either.
 */
const COLOR_LITERAL_RE =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()\n]*\)/gi;

/** Ancestors whose text should never receive a swatch (links, code, raw HTML). */
const SKIP_ANCESTORS = new Set(["Link", "Image", "Autolink", "URL", "HTMLBlock", "HTMLTag", "Comment"]);

class ColorSwatchWidget extends WidgetType {
  constructor(private readonly color: string) {
    super();
  }

  eq(other: ColorSwatchWidget): boolean {
    return other.color === this.color;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-color-swatch";
    span.setAttribute("aria-hidden", "true");
    span.style.backgroundColor = this.color;
    // The WebView reports an empty value for CSS it cannot parse; hide the
    // swatch rather than leaving an unstyled box behind.
    if (!span.style.backgroundColor) {
      span.classList.add("cm-color-swatch-invalid");
    }
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/** `#` must start a token; functions must not read as the tail of an identifier. */
function hasValidBoundary(text: string, index: number, isHex: boolean): boolean {
  if (index === 0) return true;
  const prev = text[index - 1];
  return isHex ? !/[0-9a-zA-Z#]/.test(prev) : !/[0-9a-zA-Z-]/.test(prev);
}

function isInSkippedConstruct(tree: DecorationWalk["tree"], pos: number): boolean {
  let node: SyntaxNode | null = tree.resolveInner(pos, 1);
  while (node) {
    if (SKIP_ANCESTORS.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

/**
 * Appends a prefix swatch decoration for every color literal on the line. Skips
 * code, links, and raw HTML so swatches only decorate prose color values.
 */
export function collectColorSwatches(walk: DecorationWalk, line: Line): void {
  if (!walk.colorSwatches) return;
  if (isVisibleInCodeBlock(walk.tree, line.from)) return;

  for (const { literal, index } of findColorLiterals(line.text)) {
    const start = line.from + index;
    if (isVisibleInCodeBlock(walk.tree, start)) continue;
    if (isInSkippedConstruct(walk.tree, start)) continue;
    walk.ranges.push(Decoration.widget({ widget: new ColorSwatchWidget(literal), side: -1 }).range(start));
  }
}

/** Finds standalone color literals in plain text, ignoring tokens inside identifiers. */
export function findColorLiterals(text: string): Array<{ literal: string; index: number }> {
  const found: Array<{ literal: string; index: number }> = [];
  COLOR_LITERAL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (true) {
    match = COLOR_LITERAL_RE.exec(text);
    if (match === null) break;
    if (hasValidBoundary(text, match.index, match[0][0] === "#")) {
      found.push({ literal: match[0], index: match.index });
    }
  }
  return found;
}
