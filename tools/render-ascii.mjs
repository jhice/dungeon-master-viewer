#!/usr/bin/env node
// ASCII rendering of the levels in the terminal, plus a check of stairs/pits links.
// Usage:
//   node tools/render-ascii.mjs [level|all] [--local] [--wide] [--rulers] [--out file]
//   node tools/render-ascii.mjs links          (stairs/pits report only)

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dungeon } from '../src/core/dungeon.js';
import { findConnections } from '../src/core/connections.js';
import { renderLevelAscii, legendAscii } from '../src/render/ascii/ascii-renderer.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
const target = args.find((a, i) => !a.startsWith('--') && (outIndex < 0 || i !== outIndex + 1)) ?? 'all';

const dungeon = new Dungeon(JSON.parse(await readFile(resolve(projectRoot, 'data/dungeon.json'), 'utf8')));
const links = findConnections(dungeon);
const broken = links.filter((l) => !l.ok);

if (target === 'links') {
  for (const l of links) {
    console.log(
      `${l.ok ? 'ok ' : 'KO '} L${l.level} (${l.x},${l.y}) ${l.kind}${l.direction ? ' ' + l.direction : ''} -> L${l.toLevel} [${l.gx},${l.gy}] ${l.target}`,
    );
  }
} else {
  const levels = target === 'all' ? [...Array(dungeon.levelCount).keys()] : [Number(target)];
  const options = { frame: flag('local') ? 'local' : 'global', wide: flag('wide'), rulers: flag('rulers') };
  const blocks = levels.map((i) => {
    const m = dungeon.level(i);
    const title = `Level ${i} — ${m.width}x${m.height}, offset (${m.offset.x},${m.offset.y})`;
    return `${title}\n${renderLevelAscii(dungeon, i, options)}`;
  });
  const text = `${legendAscii()}\n\n${blocks.join('\n\n')}\n`;
  if (out) {
    await writeFile(resolve(projectRoot, out), text);
    console.log(`${out} written (${levels.length} level(s))`);
  } else {
    process.stdout.write(text);
  }
}

const stairs = links.filter((l) => l.kind === 'stairs').length;
console.error(`links: ${stairs} stairs, ${links.length - stairs} pits, ${broken.length} broken`);
process.exitCode = broken.length ? 1 : 0;
