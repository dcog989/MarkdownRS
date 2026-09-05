export function createListNavigation(getLength: () => number, onEnter: (index: number) => void, columns = 1) {
  let selectedIndex = $state(0);

  function handleKeydown(e: KeyboardEvent) {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"].includes(e.key)) return;

    const len = getLength();
    if (len === 0) return;

    e.preventDefault();

    if (e.key === "ArrowDown") {
      selectedIndex = (selectedIndex + columns) % len;
    } else if (e.key === "ArrowUp") {
      selectedIndex = (selectedIndex - columns + len) % len;
    } else if (e.key === "ArrowRight") {
      selectedIndex = Math.min(selectedIndex + 1, len - 1);
    } else if (e.key === "ArrowLeft") {
      selectedIndex = Math.max(selectedIndex - 1, 0);
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
