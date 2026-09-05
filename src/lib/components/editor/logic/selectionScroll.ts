import type { EditorView } from "@codemirror/view";

export function setupSelectionDragScroll(view: EditorView): () => void {
  let selScrollRAF: number | null = null;
  let selScrollVel = 0;
  let selMouseMovePending = false;

  const handleSelMouseMove = (e: MouseEvent) => {
    if (selMouseMovePending) return;
    selMouseMovePending = true;
    requestAnimationFrame(() => {
      selMouseMovePending = false;
      if (e.buttons !== 1) {
        selScrollVel = 0;
        return;
      }
      const scroller = view.scrollDOM;
      const rect = scroller.getBoundingClientRect();
      const ZONE = 60;
      const MAX = 32;
      const dy = e.clientY;
      if (dy < rect.top + ZONE) selScrollVel = -MAX * ((rect.top + ZONE - dy) / ZONE) ** 2;
      else if (dy > rect.bottom - ZONE) selScrollVel = MAX * ((dy - (rect.bottom - ZONE)) / ZONE) ** 2;
      else selScrollVel = 0;

      if (selScrollVel !== 0 && selScrollRAF === null) {
        const tick = () => {
          if (selScrollVel !== 0) {
            view.scrollDOM.scrollTop += selScrollVel;
            selScrollRAF = requestAnimationFrame(tick);
          } else {
            selScrollRAF = null;
          }
        };
        selScrollRAF = requestAnimationFrame(tick);
      } else if (selScrollVel === 0 && selScrollRAF !== null) {
        cancelAnimationFrame(selScrollRAF);
        selScrollRAF = null;
      }
    });
  };

  const stopSelScroll = () => {
    selScrollVel = 0;
    if (selScrollRAF !== null) {
      cancelAnimationFrame(selScrollRAF);
      selScrollRAF = null;
    }
  };

  document.addEventListener("mousemove", handleSelMouseMove);
  document.addEventListener("mouseup", stopSelScroll);

  return () => {
    document.removeEventListener("mousemove", handleSelMouseMove);
    document.removeEventListener("mouseup", stopSelScroll);
    stopSelScroll();
  };
}
