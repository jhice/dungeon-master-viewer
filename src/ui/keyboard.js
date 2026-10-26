// Keyboard shortcuts, independent of the active renderer.
// `bindings` is either a map KeyboardEvent.key -> action, or a function
// (key, event) -> action|undefined (to resolve keys dynamically, or by
// event.code for the simulation). Returns an unbind function.

export function bindKeys(bindings) {
  const resolve = typeof bindings === 'function' ? bindings : (key) => bindings[key];
  const onKey = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = resolve(event.key, event);
    if (!action) return;
    event.preventDefault();
    action(event);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
