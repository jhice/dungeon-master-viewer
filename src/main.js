import { loadDungeon } from './core/dungeon.js';
import { createAsciiRenderer, legendAscii } from './render/ascii/ascii-renderer.js';
import { bindLevelKeys } from './ui/level-keys.js';

const view = document.getElementById('view');
const label = document.getElementById('level-label');

const dungeon = await loadDungeon('./data/dungeon.json');
document.getElementById('legend').textContent = legendAscii();

let frame = 'global';
let renderer = null;

function mountRenderer(level) {
  renderer?.dispose();
  renderer = createAsciiRenderer(view, dungeon, { frame, wide: true });
  showLevel(level);
}

function showLevel(level) {
  renderer.showLevel(level);
  const m = dungeon.level(level);
  label.textContent = `Niveau ${level} / ${dungeon.levelCount - 1} — ${m.width}×${m.height}, offset (${m.offset.x}, ${m.offset.y}) — repère ${frame}`;
}

bindLevelKeys({
  levelCount: dungeon.levelCount,
  getLevel: () => renderer.currentLevel,
  onLevel: showLevel,
  onToggleFrame: () => {
    frame = frame === 'global' ? 'local' : 'global';
    mountRenderer(renderer.currentLevel);
  },
});

mountRenderer(0);
