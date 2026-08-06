import { throttle } from '$lib/utils/timing';
import type { AppEditorView } from '../../../../global';

export function setupScrollSync(
  view: AppEditorView,
  getTabId: () => string,
  isRestoring: () => boolean,
  onScrollChange?: (percentage: number, scrollTop: number, topLine: number) => void,
): () => void {
  if (!onScrollChange) return () => {};

  const handler = throttle(() => {
    if (view._currentTabId !== getTabId() || isRestoring()) return;
    const dom = view.scrollDOM;
    const max = dom.scrollHeight - dom.clientHeight;
    const percentage = max > 0 ? dom.scrollTop / max : 0;
    const scrollTop = dom.scrollTop;
    const lineBlock = view.lineBlockAtHeight(scrollTop);
    const docLine = view.state.doc.lineAt(lineBlock.from);
    onScrollChange(percentage, scrollTop, docLine.number);
  }, 50);

  view.scrollDOM.addEventListener('scroll', handler, { passive: true });
  return () => view.scrollDOM.removeEventListener('scroll', handler);
}
