// Normal map of a procedural texture (relief, phase H3, docs/036): its luminance is taken as a
// height (light = high: stone blocks stand out of their darker joints), and the slopes come from a
// Sobel filter. The texture tiles (one per tile of the dungeon), so the filter wraps at the edges.

import * as THREE from 'three';

/**
 * @param {THREE.CanvasTexture} texture a texture drawn on a canvas
 * @param {number} strength slope factor (higher: sharper relief)
 * @returns {THREE.CanvasTexture} its normal map (linear colours)
 */
export function normalMapOf(texture, strength) {
  const source = texture.image;
  const { width: w, height: h } = source;
  const pixels = source.getContext('2d').getImageData(0, 0, w, h).data;
  const height = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) height[i] = (0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2]) / 255;
  const at = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const out = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel: slopes along x and y (canvas y goes down, the texture's v goes up).
      const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const nx = -dx * strength;
      const ny = dy * strength;
      const length = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((nx / length) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.NoColorSpace;
  map.anisotropy = texture.anisotropy;
  return map;
}
