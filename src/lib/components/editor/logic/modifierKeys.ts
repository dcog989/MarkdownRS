import type { EditorView } from '@codemirror/view';

export function setupModifierKeyHandler(view: EditorView): () => void {
  const handleModifierKey = (e: KeyboardEvent) => {
    if (e.key === 'Control' || e.key === 'Meta') {
      if (e.type === 'keydown') {
        view.dom.classList.add('cm-modifier-down');
      } else {
        view.dom.classList.remove('cm-modifier-down');
      }
    }
  };
  const clearModifier = () => view.dom.classList.remove('cm-modifier-down');

  window.addEventListener('keydown', handleModifierKey);
  window.addEventListener('keyup', handleModifierKey);
  window.addEventListener('blur', clearModifier);

  return () => {
    window.removeEventListener('keydown', handleModifierKey);
    window.removeEventListener('keyup', handleModifierKey);
    window.removeEventListener('blur', clearModifier);
  };
}
