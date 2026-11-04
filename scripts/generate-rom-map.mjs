#!/usr/bin/env node
/**
 * Generates the compact ROM maps in src/core/game/map/ from a checkout of
 * https://github.com/biosp4rk/mf-zm-info (info extracted from the mf/mzm
 * decompilation projects).
 *
 *   git clone https://github.com/biosp4rk/mf-zm-info /tmp/mf-zm-info
 *   node scripts/generate-rom-map.mjs /tmp/mf-zm-info
 *
 * Only North American (U) addresses are kept, and only the symbols the
 * project pipeline needs: master tables (with the code literal pools that
 * point at them), asset-like data used for naming extracted files, and a
 * few enums for display names.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/generate-rom-map.mjs <path to mf-zm-info checkout>');
  process.exit(1);
}
const outDir = resolve(import.meta.dirname, '../src/core/game/map');
mkdirSync(outDir, { recursive: true });

let commit = 'unknown';
try {
  commit = execSync('git rev-parse HEAD', { cwd: src }).toString().trim();
} catch {
  /* not a git checkout */
}

/** Table keys used by the core, mapped to symbol names per game. */
const TABLES = {
  ZM: {
    areaRoomEntries: 'sAreaRoomEntryPointers',
    tilesets: 'sTilesetEntries',
    spritesets: 'sSpritesetPointers',
    spriteGraphics: 'sSpritesGraphicsPointers',
    spritePalettes: 'sSpritesPalettePointers',
    doors: 'sAreaDoorsPointers',
    scrolls: 'sAreaScrollPointers',
    animatedTilesets: 'sAnimatedTilesetEntries',
    animatedGraphics: 'sAnimatedGraphicsEntries',
    animatedPalettes: 'sAnimatedPaletteEntries',
    areaConnections: 'sAreaConnections',
    clipdataCollisionTypes: 'sClipdataCollisionTypes',
    commonTilesGfx: 'sCommonTilesGfx',
    commonTilesPal: 'sCommonTilesPal',
    commonSpritesGfx: 'sCommonSpritesGfx',
    commonSpritesPal: 'sCommonSpritesPal',
  },
  MF: {
    areaRoomEntries: 'sAreaRoomEntryPointers',
    tilesets: 'sTilesetEntries',
    spritesets: 'sSpritesetPointers',
    spriteGraphics: 'sSpritesGraphicsPointers',
    spritePalettes: 'sSpritesPalettePointers',
    spriteGraphicsLength: 'sSpritesGraphicsLength',
    doors: 'sAreaDoorPointers',
    scrolls: 'sAreaScrollPointers',
    animatedTilesets: 'sAnimatedTilesetEntries',
    animatedGraphics: 'sAnimatedGraphicsEntries',
    animatedPalettes: 'sAnimatedPaletteEntries',
    areaConnections: 'sAreaConnections',
    clipdataCollisionTypes: 'sClipdataCollisionTypes',
    commonTilesGfx: 'sCommonTilesGfx',
    commonTilesPal: 'sCommonTilesPal',
    commonSpritesGfx: 'sCommonSpritesGfx',
    commonSpritesPal: 'sCommonSpritesPal',
  },
};

const ENUMS = {
  ZM: { primarySprites: 'PrimarySprite_', events: 'Event_', areas: 'Area_', effects: 'RoomEffect_' },
  MF: { primarySprites: 'PrimarySpriteId', events: 'Event', areas: 'Area' },
};

const GAMES = [
  { kind: 'ZM', dir: 'zm', gameCode: 'BMXE' },
  { kind: 'MF', dir: 'mf', gameCode: 'AMTE' },
];

const PRIMITIVE = { u8: 1, s8: 1, bool8: 1, u16: 2, s16: 2, u32: 4, s32: 4 };

/** Data that becomes (or names) project assets. */
const ASSET_LOC = /src\/data\/(rooms|tilesets|spriteset|sprites\/|animated_graphics|default_background|common|hud_data|clipdata)/;
const ASSET_CAT = new Set(['gfx', 'palette', 'bg_blocks', 'bg_map', 'tilemap']);
const ASSET_NAME = /(Gfx|Pal|Tilemap|Bg\d|Clipdata|Scrolls|Spriteset\d*|Doors|RoomEntries|Entries)$/;

function elementSize(type, structs) {
  let t = type.replace(/\bconst\b/g, '').trim();
  let mult = 1;
  const arr = /\[(0x[0-9a-f]+|\d+)\]\s*$/i.exec(t);
  if (arr) {
    mult = Number(arr[1]);
    t = t.slice(0, arr.index).trim();
  }
  if (t.includes('*')) return 4 * mult;
  const s = /^struct\s+(\w+)/.exec(t);
  if (s) return (structs.get(s[1]) ?? NaN) * mult;
  return (PRIMITIVE[t] ?? NaN) * mult;
}

for (const g of GAMES) {
  const read = (f) => JSON.parse(readFileSync(join(src, 'json', g.dir, f), 'utf8'));
  const data = read('data.json');
  const code = read('code.json');
  const refs = read('data_refs.json');
  const enums = read('enums.json');
  const structs = new Map(read('structs.json').map((s) => [s.name, s.size]));
  const typedefs = read('typedefs.json');
  for (const t of typedefs) if (!structs.has(t.name) && PRIMITIVE[t.type] !== undefined) PRIMITIVE[t.name] = PRIMITIVE[t.type];

  const functions = new Map(code.map((c) => [c.name, c.addr.U]));
  const byName = new Map(data.map((d) => [d.name, d]));
  const sizeOf = (d) => {
    const n = elementSize(d.type, structs) * (d.count ?? 1);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const tables = {};
  for (const [key, symbol] of Object.entries(TABLES[g.kind])) {
    const d = byName.get(symbol);
    if (!d || d.addr.U === undefined) throw new Error(`${g.kind}: ${symbol} not found`);
    const pools = (refs[symbol]?.pool ?? [])
      .map((p) => (functions.has(p.name) ? functions.get(p.name) + p.offset : undefined))
      .filter((a) => a !== undefined)
      .sort((a, b) => a - b);
    tables[key] = { symbol, addr: d.addr.U, count: d.count ?? 1, size: sizeOf(d), pools };
  }

  // Area order comes from the room entry pointer table; names come from the
  // per-area entry symbols, which are matched by address at load time.
  const roomEntryTables = data
    .filter((d) => d.addr.U !== undefined && /RoomEntries$/.test(d.name) && d.type.includes('RoomEntryRom'))
    .map((d) => ({ symbol: d.name, addr: d.addr.U, count: d.count ?? 0 }))
    .sort((a, b) => a.addr - b.addr);

  const symbols = data
    .filter((d) => d.addr.U !== undefined && d.addr.U < 0x2000000)
    .filter((d) => ASSET_CAT.has(d.cat) || ASSET_LOC.test(d.loc) || ASSET_NAME.test(d.name))
    .map((d) => [d.addr.U, d.name, sizeOf(d)])
    .sort((a, b) => a[0] - b[0]);

  const enumOut = {};
  for (const [key, name] of Object.entries(ENUMS[g.kind])) {
    const e = enums.find((x) => x.name === name);
    if (!e) throw new Error(`${g.kind}: enum ${name} not found`);
    const vals = {};
    for (const v of e.vals) if (vals[v.val] === undefined) vals[v.val] = v.name;
    enumOut[key] = vals;
  }

  const out = {
    game: g.kind,
    gameCode: g.gameCode,
    region: 'U',
    source: { repo: 'https://github.com/biosp4rk/mf-zm-info', commit },
    tables,
    roomEntryTables,
    enums: enumOut,
    symbols,
  };
  const file = join(outDir, `${g.kind}_U.json`);
  writeFileSync(file, JSON.stringify(out));
  console.log(`${file}: ${symbols.length} symbols, ${roomEntryTables.length} room tables, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
}
