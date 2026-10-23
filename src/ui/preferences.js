// Per-browser view preferences (renderer, level, frame, zoom).
// Storage may be unavailable (private mode, blocked site data): never fail.

const KEY = 'dm-viewer:prefs';

export function loadPreferences(defaults) {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...defaults };
  }
}

export function savePreferences(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // ignored: preferences are a convenience only
  }
}
