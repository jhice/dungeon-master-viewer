// 3D colours come from the CSS variables of styles/tiles-2d.css, so the 2D and
// 3D renderers share a single theme.

const FALLBACK = {
  wall: '#5d5a52',
  floor: '#2a2620',
  pit: '#050403',
  pitLid: '#4a4033',
  stairsUp: '#b9a982',
  stairsDown: '#6f6450',
  door: '#a8742f',
  teleporter: '#4cc3ff',
  fakewall: '#6b5f73',
  frame: '#171614',
};

const CSS_VARS = {
  wall: '--tile-wall',
  floor: '--tile-floor',
  pit: '--tile-pit',
  pitLid: '--tile-pit-lid',
  stairsUp: '--tile-stairs-up',
  stairsDown: '--tile-stairs-down',
  door: '--tile-door',
  teleporter: '--tile-teleporter',
  fakewall: '--tile-fakewall',
  frame: '--frame-bg',
};

export function readTheme(element = document.documentElement) {
  const style = getComputedStyle(element);
  return Object.fromEntries(
    Object.entries(CSS_VARS).map(([key, cssVar]) => [key, style.getPropertyValue(cssVar).trim() || FALLBACK[key]]),
  );
}
