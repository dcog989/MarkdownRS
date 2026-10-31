// Left/right are deliberately absent: this handler is bound to a modal's search
// input, where they must move the text caret, and every list is one column.
const NAV_KEYS = ["ArrowDown", "ArrowUp", "Enter", "PageDown", "PageUp"];
const DEFAULT_PAGE_SIZE = 10;

export function createListNavigation(
  getLength: () => number,
  onEnter: (index: number) => void,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  let selectedIndex = $state(0);

  function handleKeydown(e: KeyboardEvent) {
    if (!NAV_KEYS.includes(e.key)) return;

    const len = getLength();
    if (len === 0) return;

    e.preventDefault();

    if (e.key === "ArrowDown") {
      selectedIndex = (selectedIndex + 1) % len;
    } else if (e.key === "ArrowUp") {
      selectedIndex = (selectedIndex - 1 + len) % len;
    } else if (e.key === "PageDown") {
      selectedIndex = Math.min(selectedIndex + pageSize, len - 1);
    } else if (e.key === "PageUp") {
      selectedIndex = Math.max(selectedIndex - pageSize, 0);
    } else if (e.key === "Enter") {
      onEnter(selectedIndex);
    }
  }

  function reset() {
    selectedIndex = 0;
  }

  function select(index: number) {
    selectedIndex = index;
  }

  return {
    get selectedIndex() {
      return selectedIndex;
    },
    handleKeydown,
    reset,
    select,
  };
}
