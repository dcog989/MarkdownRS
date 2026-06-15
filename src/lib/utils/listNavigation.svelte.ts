export function createListNavigation(getLength: () => number, onEnter: (index: number) => void) {
  let selectedIndex = $state(0);

  function handleKeydown(e: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;

    const len = getLength();
    if (len === 0) return;

    e.preventDefault();

    if (e.key === 'ArrowDown') {
      selectedIndex = (selectedIndex + 1) % len;
    } else if (e.key === 'ArrowUp') {
      selectedIndex = (selectedIndex - 1 + len) % len;
    } else if (e.key === 'Enter') {
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
