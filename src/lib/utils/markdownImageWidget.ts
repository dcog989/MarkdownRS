import type { Range } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import { widgetPointerAction } from "./editorWidgetClick";
import type { PointerResolver } from "./renderedPointer";

/** Inline placeholder shown when an image fails to load. Inlined (rather than
 *  set as an `<img>` source) so `currentColor` follows the editor theme. */
const MISSING_IMAGE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-off" aria-hidden="true"><line x1="2" x2="22" y1="2" y2="22"/><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/><line x1="13.5" x2="6" y1="13.5" y2="21"/><line x1="18" x2="21" y1="12" y2="15"/><path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/><path d="M21 15V5a2 2 0 0 0-2-2H9"/></svg>';

export class ImageWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly src: string,
    private readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.from === this.from && other.src === this.src && other.alt === this.alt;
  }

  ignoreEvent(_event: Event): boolean {
    return false;
  }

  toDOM(): HTMLElement {
    // Wrapper stays the widget root on both success and failure so CodeMirror's
    // DOM tracking remains valid when the placeholder replaces the image.
    const root = document.createElement("span");
    root.className = "cm-image-widget";
    root.dataset.from = String(this.from);

    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt || "";
    img.loading = "lazy";
    img.draggable = false;
    img.addEventListener(
      "error",
      () => {
        // A failed `<img>` otherwise falls back to rendering its `alt` text,
        // which sizes the element by the label and insets the browser's
        // broken-image glyph by its length. Swap it for a fixed-size icon so
        // the marker stays compact regardless of the alt text.
        root.classList.add("cm-image-widget-missing");
        if (this.alt) root.title = this.alt;
        root.innerHTML = MISSING_IMAGE_ICON;
      },
      { once: true },
    );

    root.appendChild(img);
    return root;
  }
}

export function imageWidgetDecoration(from: number, to: number, src: string, alt: string): Range<Decoration> {
  return Decoration.replace({ widget: new ImageWidget(from, src, alt) }).range(from, to);
}

export const imageWidgetPointer: PointerResolver = (_view, event) =>
  widgetPointerAction(event, ".cm-image-widget", (widget) => {
    const from = Number(widget.dataset.from);
    return Number.isFinite(from) ? from : null;
  });
