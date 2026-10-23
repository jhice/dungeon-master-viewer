// Keyboard navigation between levels, independent of the active renderer.

export function bindLevelKeys({ levelCount, getLevel, onLevel, onToggleFrame }) {
  const go = (delta) => {
    const next = Math.min(levelCount - 1, Math.max(0, getLevel() + delta));
    if (next !== getLevel()) onLevel(next);
  };

  const onKey = (event) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'PageDown':
        go(+1);
        break;
      case 'ArrowUp':
      case 'PageUp':
        go(-1);
        break;
      case 'g':
      case 'G':
        onToggleFrame?.();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
