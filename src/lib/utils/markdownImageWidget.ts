import type { Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

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
    const img = document.createElement('img');
    img.className = 'cm-image-widget';
    img.dataset.from = String(this.from);
    img.src = this.src;
    img.alt = this.alt || '';
    img.loading = 'lazy';
    img.draggable = false;
    return img;
  }
}

export function imageWidgetDecoration(from: number, to: number, src: string, alt: string): Range<Decoration> {
  return Decoration.replace({ widget: new ImageWidget(from, src, alt) }).range(from, to);
}

export const imageWidgetClickHandler = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    const target = event.target as Node | null;
    const element = target instanceof Element ? target : target?.parentElement;
    const img = element?.closest<HTMLElement>('.cm-image-widget');
    if (!img) return false;

    const from = Number(img.dataset.from);
    if (!Number.isFinite(from)) return false;

    event.preventDefault();
    view.focus();
    view.dispatch({ selection: { anchor: from }, scrollIntoView: false });
    return true;
  },
});
