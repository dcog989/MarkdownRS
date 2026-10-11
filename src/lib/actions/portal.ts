/**
 * Reparents a node to `document.body` so it escapes ancestor stacking contexts
 * (`opacity`, `transform`, `overflow`) that would otherwise dim or clip it — e.g.
 * the fadeable status bar. Svelte keeps delegated events working after the move.
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);

  return {
    destroy() {
      node.remove();
    },
  };
}
