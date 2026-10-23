#!/usr/bin/env node
// Builds data/dungeon.json from Dungeon.xml.
// Usage: node tools/build-dungeon.mjs [input.xml] [output.json]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXml } from './xml-parser.mjs';
import { convertDungeon } from './dungeon-converter.mjs';
import { validateDungeon } from './dungeon-validator.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(projectRoot, process.argv[2] ?? 'Dungeon.xml');
const output = resolve(projectRoot, process.argv[3] ?? 'data/dungeon.json');

const t0 = performance.now();
// The file is declared ISO-8859-1 (and is pure ASCII in practice).
const source = new TextDecoder('latin1').decode(await readFile(input));
const root = parseXml(source);
const { dungeon, warnings } = convertDungeon(root);
const { errors, unplaced } = validateDungeon(dungeon);

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (Object.keys(unplaced).length) console.log('unplaced objects:', JSON.stringify(unplaced));

if (errors.length) {
  console.error(`\n${errors.length} validation error(s), ${output} not written.`);
  process.exit(1);
}

for (const m of dungeon.maps) delete m._overview;
const json = serialize(dungeon);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, json);

const ms = Math.round(performance.now() - t0);
console.log(`${output}: ${(json.length / 1024).toFixed(0)} KB, ${dungeon.maps.length} maps, ${warnings.length} warning(s), ${ms} ms`);

// One entry per line for pools and tiles: compact but still diffable and readable.
function serialize(d) {
  const line = (v) => JSON.stringify(v);
  const block = (items, indent) => items.map((s) => `${indent}${s}`).join(',\n');
  const parts = [];
  for (const [key, value] of Object.entries(d)) {
    if (key === 'maps') {
      const maps = value.map((m) => {
        const { grid, allowDecoration, tiles, ...head } = m;
        const fields = Object.entries(head).map(([k, v]) => `      ${line(k)}: ${line(v)}`);
        fields.push(`      "grid": [\n${block(grid.map(line), '        ')}\n      ]`);
        fields.push(`      "allowDecoration": [\n${block(allowDecoration.map(line), '        ')}\n      ]`);
        const tileLines = Object.entries(tiles).map(([xy, t]) => `${line(xy)}: ${line(t)}`);
        fields.push(`      "tiles": {\n${block(tileLines, '        ')}\n      }`);
        return `    {\n${fields.join(',\n')}\n    }`;
      });
      parts.push(`  "maps": [\n${maps.join(',\n')}\n  ]`);
    } else if (Array.isArray(value)) {
      parts.push(`  ${line(key)}: [\n${block(value.map(line), '    ')}\n  ]`);
    } else {
      parts.push(`  ${line(key)}: ${line(value)}`);
    }
  }
  return `{\n${parts.join(',\n')}\n}\n`;
}
