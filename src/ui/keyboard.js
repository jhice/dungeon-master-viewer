// Keyboard shortcuts, independent of the active renderer.
// `bindings` maps a KeyboardEvent.key to an action; returns an unbind function.

export function bindKeys(bindings) {
  const onKey = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = bindings[event.key];
    if (!action) return;
    event.preventDefault();
    action(event);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
