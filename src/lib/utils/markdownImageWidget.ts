import type { Range } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import { widgetPointerAction } from "./editorWidgetClick";
import type { PointerResolver } from "./renderedPointer";

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
    const img = document.createElement("img");
    img.className = "cm-image-widget";
    img.dataset.from = String(this.from);
    img.src = this.src;
    img.alt = this.alt || "";
    img.loading = "lazy";
    img.draggable = false;
    return img;
  }
}

export function imageWidgetDecoration(from: number, to: number, src: string, alt: string): Range<Decoration> {
  return Decoration.replace({ widget: new ImageWidget(from, src, alt) }).range(from, to);
}

export const imageWidgetPointer: PointerResolver = (_view, event) =>
  widgetPointerAction(event, ".cm-image-widget", (img) => {
    const from = Number(img.dataset.from);
    return Number.isFinite(from) ? from : null;
  });
