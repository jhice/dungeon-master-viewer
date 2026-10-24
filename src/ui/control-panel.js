// Generic control panel, built from a schema. Knows nothing about renderers:
// main.js composes the schema from common controls (levels, states…) and the
// active renderer's own settings (`renderer.settingsSchema`).
//
// Schema items:
//   { type: 'buttons', items: [{ label, title?, action(), disabled?() }] }
//   { type: 'checkbox', key, label, shortcut? }
//   { type: 'range', key, label, min, max, step, format?(v) }

/**
 * @param {HTMLElement} container
 * @param {Array<object>} schema
 * @param {object} values current values of checkboxes and ranges, by key
 * @param {(changes: object) => void} onChange called with { [key]: value } while editing
 * @param {object} [options]
 * @param {boolean} [options.open=true] initial unfolded state
 * @param {(open: boolean) => void} [options.onToggle] the panel was folded/unfolded
 * @returns {{ element: HTMLElement, setValues(values: object): void, refresh(): void, dispose(): void }}
 */
export function createControlPanel(container, schema, values, onChange, { open = true, onToggle } = {}) {
  const panel = document.createElement('details');
  panel.className = 'control-panel';
  panel.open = open;
  panel.addEventListener('toggle', () => onToggle?.(panel.open));
  const summary = document.createElement('summary');
  summary.textContent = 'Contrôles';
  panel.append(summary);

  const setters = {}; // key -> (value) => void, to reflect changes made elsewhere (keyboard)
  const buttons = []; // [{ element, disabled }] re-evaluated by refresh()

  for (const field of schema) {
    if (field.type === 'buttons') {
      const row = document.createElement('div');
      row.className = 'control-row control-buttons';
      for (const item of field.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.label;
        if (item.title) button.title = item.title;
        button.addEventListener('click', () => {
          item.action();
          button.blur(); // keep the keyboard for the viewer
        });
        row.append(button);
        buttons.push({ element: button, disabled: item.disabled });
      }
      panel.append(row);
      continue;
    }

    const row = document.createElement('label');
    row.className = `control-row control-${field.type}`;
    const name = document.createElement('span');
    name.textContent = field.label;
    const input = document.createElement('input');
    input.type = field.type;
    input.name = field.key;

    if (field.type === 'range') {
      Object.assign(input, { min: field.min, max: field.max, step: field.step, value: values[field.key] });
      const output = document.createElement('output');
      const format = field.format ?? String;
      output.textContent = format(values[field.key]);
      input.addEventListener('input', () => {
        const value = Number(input.value);
        output.textContent = format(value);
        onChange({ [field.key]: value });
      });
      row.append(name, input, output);
      setters[field.key] = (value) => {
        input.value = value;
        output.textContent = format(value);
      };
    } else {
      input.checked = Boolean(values[field.key]);
      input.addEventListener('change', () => onChange({ [field.key]: input.checked }));
      if (field.shortcut) {
        const key = document.createElement('kbd');
        key.textContent = field.shortcut;
        name.append(' ', key);
      }
      row.append(input, name);
      setters[field.key] = (value) => {
        input.checked = Boolean(value);
      };
    }
    // After a mouse adjustment, give the keyboard back to the viewer (arrows = levels).
    input.addEventListener('pointerup', () => input.blur());
    panel.append(row);
  }

  // Keys typed in the panel must not drive the viewer (arrows move sliders).
  panel.addEventListener('keydown', (event) => event.stopPropagation());
  container.append(panel);

  const refresh = () => {
    for (const { element, disabled } of buttons) element.disabled = Boolean(disabled?.());
  };
  refresh();

  return {
    element: panel,
    setValues(newValues) {
      for (const [key, value] of Object.entries(newValues)) setters[key]?.(value);
    },
    refresh,
    dispose: () => panel.remove(),
  };
}
