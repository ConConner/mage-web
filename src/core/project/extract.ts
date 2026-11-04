/**
 * Turns a ROM into project assets, guided by the ROM map. The same pass
 * also records where every piece of data came from (the baseline), which
 * the builder uses to keep unchanged data where it is.
 */
import type { Rom } from '../rom/Rom';
import { fileSafe } from '../game/RomMap';
import { Background, BgProp, Layer } from '../model/Background';
import { Gfx } from '../model/Gfx';
import { Palette } from '../model/Palette';
import { LAYER_POINTER_FIELDS, ROOM_HEADER_SIZE, SPRITE_LIST_POINTER_FIELDS, pickProps, readRoomHeader } from '../model/RoomHeader';
import { RoomSpriteList, Spriteset, spriteGfxRows } from '../model/Sprites';
import { DOOR_ENTRY_SIZE, NO_ROOM, decodeDoorTable } from '../model/Doors';
import { decodeScrollList } from '../model/Scrolls';
import { TILESET_ENTRY_SIZE } from '../model/Tileset';
import { crc32Hex } from '../util/crc32';
import {
  AreaAsset,
  GraphicsAsset,
  PaletteAsset,
  RoomAsset,
  SpriteAsset,
  SpritesetAsset,
  TilemapAsset,
  TilesetAsset,
  TileTableAsset,
  type Asset,
} from './assets';
import { ASSET_FORMAT_VERSION, BASE_ROM_FILE, BUILD_DIR, type CommonRole, type ProjectManifest } from './codec';

export interface Origin {
  offset: number;
  /** Bytes the data occupies in the ROM (compressed length if compressed). */
  length: number;
  /** How a leaf asset is stored there. */
  encoding?: LeafEncoding;
}

/** Storage formats of leaf assets in the ROM. */
export type LeafEncoding = 'lz77' | 'raw' | 'tilemap' | 'tiletable';

/** Where the base ROM keeps each piece of asset data. */
export interface Baseline {
  assets: Map<string, Asset>;
  /**
   * Keys: asset path for leaf assets; `<room path>#bg0|bg1|bg2|clip|sprites0-2`
   * for room parts; `doors:<area>` and `scrolls:<area>` / `scrolls:<area>:<room>`
   * for per-area tables.
   */
  origins: Map<string, Origin>;
  /** Number of structural pointers (room parts, spritesets) to each offset. */
  refCounts: Map<number, number>;
  /** Room count per area; rooms can't be added yet. */
  roomCounts: number[];
  /** Header address per room path. */
  headerAddress: Map<string, number>;
  warnings: string[];
}

export interface Extraction {
  manifest: ProjectManifest;
  assets: Asset[];
  baseline: Baseline;
}

const hex = (v: number, n = 2) => v.toString(16).toUpperCase().padStart(n, '0');

export const roomPath = (areaFolder: string, areaName: string, room: number) => `rooms/${areaFolder}/${areaName}_${hex(room)}.room.json`;

export function extractProject(rom: Rom, name: string): Extraction {
  const map = rom.map;
  const d = rom.data;
  const game = rom.game;
  const warnings: string[] = [];
  const assets = new Map<string, Asset>();
  const origins = new Map<string, Origin>();
  const refCounts = new Map<number, number>();
  const headerAddress = new Map<string, number>();
  const addRef = (offset: number) => refCounts.set(offset, (refCounts.get(offset) ?? 0) + 1);
  const valid = (offset: number) => offset >= 0 && offset < d.length;

  /** Unique file stem for data at `offset`: its map symbol, or a fallback with the address. */
  const usedNames = new Set<string>();
  const stem = (offset: number, fallback: string) => {
    const sym = map.symbolAt(offset);
    let s = sym ? sym.name.replace(/^s(?=[A-Z])/, '') : `${fallback}_${hex(offset, 6)}`;
    if (usedNames.has(s)) s = `${s}_${hex(offset, 6)}`;
    usedNames.add(s);
    return s;
  };
  const byOffset = new Map<string, string>();
  const ENCODING: Record<string, LeafEncoding> = { lzgfx: 'lz77', rawgfx: 'raw', tilemap: 'tilemap', tiletable: 'tiletable' };
  const shared = <T extends Asset>(key: string, offset: number, make: () => { asset: T; length: number } | undefined): string | null => {
    const k = `${key}:${offset}`;
    const existing = byOffset.get(k);
    if (existing) return existing;
    if (!valid(offset)) return null;
    let made: { asset: T; length: number } | undefined;
    try {
      made = make();
    } catch (e) {
      warnings.push(`${key} at ${hex(offset, 6)}: ${(e as Error).message}`);
    }
    if (!made) return null;
    assets.set(made.asset.path, made.asset);
    origins.set(made.asset.path, { offset, length: made.length, encoding: ENCODING[key] ?? 'raw' });
    byOffset.set(k, made.asset.path);
    return made.asset.path;
  };

  const lz77Gfx = (folder: string, fallback: string) => (offset: number) =>
    shared('lzgfx', offset, () => {
      const { gfx, length } = Gfx.readCompressed(d, offset);
      return { asset: new GraphicsAsset(`${folder}/${stem(offset, fallback)}.gfx`, gfx), length };
    });
  const rawGfx = (path: (offset: number) => string, offset: number, length: number) =>
    shared('rawgfx', offset, () => ({ asset: new GraphicsAsset(path(offset), new Gfx(d.slice(offset, length))), length }));
  const palette = (folder: string, fallback: string, offset: number, rows: number) =>
    shared(`pal${rows}`, offset, () => ({ asset: new PaletteAsset(`${folder}/${stem(offset, fallback)}.palette.json`, Palette.read(d, offset, rows)), length: rows * 32 }));

  // ---------------------------------------------------------- common data
  const common: Partial<Record<CommonRole, string>> = {};
  const commonSpec: [CommonRole, 'commonTilesGfx' | 'commonTilesPal' | 'commonSpritesGfx' | 'commonSpritesPal', number, number][] = [
    ['bgGfx', 'commonTilesGfx', game.offsets.genericBgGfx, 0x1000],
    ['bgPalette', 'commonTilesPal', game.offsets.genericBgPalette, 3 * 32],
    ['spriteGfx', 'commonSpritesGfx', game.offsets.genericSpriteGfx, 0x3800],
    ['spritePalette', 'commonSpritesPal', game.offsets.genericSpritePalette, 6 * 32],
  ];
  for (const [role, key, fallbackOffset, length] of commonSpec) {
    const offset = map.table(key).pools.length ? map.tableOffset(d, key) : fallbackOffset;
    const isPal = role.endsWith('alette');
    const path = isPal
      ? palette('common', map.table(key).symbol.slice(1), offset, length / 32)
      : rawGfx((o) => `common/${stem(o, map.table(key).symbol.slice(1))}.gfx`, offset, length);
    if (path) common[role] = path;
  }

  // ------------------------------------------------------------- tilesets
  const tilesetBase = map.tableOffset(d, 'tilesets');
  const tilesetCount = map.table('tilesets').count;
  for (let t = 0; t < tilesetCount; t++) {
    const at = tilesetBase + t * TILESET_ENTRY_SIZE;
    const gfx = lz77Gfx('tilesets/graphics', 'TilesetGfx')(d.ptr(at));
    const pal = palette('tilesets/palettes', 'TilesetPal', d.ptr(at + 4), 14);
    const bgGfx = lz77Gfx('tilesets/graphics', 'TilesetBgGfx')(d.ptr(at + 8));
    const ttOffset = d.ptr(at + 0xc);
    const tt = shared('tiletable', ttOffset, () => {
      const header: [number, number] = [d.u8(ttOffset), d.u8(ttOffset + 1)];
      const rows = header[1] || game.tileTableRows.get(ttOffset) || 0x40;
      const entries = new Uint16Array(rows * 0x40);
      for (let i = 0; i < entries.length; i++) entries[i] = d.u16(ttOffset + 2 + i * 2);
      return { asset: new TileTableAsset(`tilesets/tiletables/${stem(ttOffset, 'TileTable')}.tiletable.json`, entries, header), length: 2 + entries.length * 2 };
    });
    const asset = new TilesetAsset(`tilesets/Tileset_${hex(t)}.tileset.json`, t, gfx, pal, bgGfx, tt, d.u8(at + 0x10), d.u8(at + 0x11));
    assets.set(asset.path, asset);
  }

  // -------------------------------------------------------------- sprites
  const gfxTable = map.tableOffset(d, 'spriteGraphics');
  const palTable = map.tableOffset(d, 'spritePalettes');
  const lengthTable = game.isMF ? map.tableOffset(d, 'spriteGraphicsLength') : 0;
  const spriteCount = map.table('spriteGraphics').count;
  for (let i = 0; i < spriteCount; i++) {
    const id = i + 0x10;
    const display = map.spriteName(id) ?? `Sprite ${hex(id)}`;
    const gfxOffset = d.ptr(gfxTable + i * 4);
    let gfxPath: string | null;
    let bytes = 0;
    if (game.isMF) {
      bytes = d.u32(lengthTable + i * 4);
      gfxPath = bytes > 0 && bytes <= 0x8000 ? rawGfx((o) => `sprites/graphics/${stem(o, 'SpriteGfx')}.gfx`, gfxOffset, bytes) : null;
    } else {
      gfxPath = lz77Gfx('sprites/graphics', 'SpriteGfx')(gfxOffset);
      bytes = gfxPath ? (assets.get(gfxPath) as GraphicsAsset).gfx.data.length : 0;
    }
    const palPath = gfxPath ? palette('sprites/palettes', 'SpritePal', d.ptr(palTable + i * 4), spriteGfxRows(bytes)) : null;
    const asset = new SpriteAsset(`sprites/${hex(id)}_${fileSafe(display)}.sprite.json`, id, display, gfxPath, palPath);
    assets.set(asset.path, asset);
  }

  // ----------------------------------------------------------- spritesets
  const setTable = map.tableOffset(d, 'spritesets');
  for (let n = 0; n < map.table('spritesets').count; n++) {
    const offset = d.ptr(setTable + n * 4);
    if (!valid(offset)) {
      warnings.push(`Spriteset ${hex(n)} points outside the ROM.`);
      continue;
    }
    const { entries, length } = Spriteset.decode(d, offset);
    const asset = new SpritesetAsset(`spritesets/Spriteset_${hex(n)}.spriteset.json`, n, entries);
    assets.set(asset.path, asset);
    origins.set(asset.path, { offset, length });
    addRef(offset);
  }

  // ------------------------------------------------------- areas & rooms
  const areaTable = map.tableOffset(d, 'areaRoomEntries');
  const doorTable = map.tableOffset(d, 'doors');
  const scrollTable = map.tableOffset(d, 'scrolls');
  const areaCount = Math.min(map.table('areaRoomEntries').count, game.areaNames.length);
  const roomCounts: number[] = [];
  const tilemap = (offset: number, fallback: string) =>
    shared('tilemap', offset, () => {
      const t = Background.decodeTileMap(d.raw, offset);
      return { asset: new TilemapAsset(`backgrounds/${stem(offset, fallback)}.tilemap.json`, t.size, t.entries), length: t.length };
    });

  for (let area = 0; area < areaCount; area++) {
    const entries = d.ptr(areaTable + area * 4);
    const table = map.roomEntryTable(entries);
    const roomCount = table?.count ?? game.roomsPerArea[area] ?? 0;
    roomCounts.push(roomCount);
    const areaName = table ? table.symbol.replace(/^s/, '').replace(/RoomEntries$/, '') : fileSafe(game.areaNames[area] ?? `Area${area}`);
    const folder = `${area}_${areaName}`;
    const rooms: RoomAsset[] = [];

    const scrollList = d.ptr(scrollTable + area * 4);
    const scrolls = valid(scrollList) ? decodeScrollList(d, scrollList) : { entries: [], terminator: 0, listLength: 0 };
    if (valid(scrollList)) origins.set(`scrolls:${area}`, { offset: scrollList, length: scrolls.listLength });

    for (let r = 0; r < roomCount; r++) {
      const path = roomPath(folder, areaName, r);
      const base = entries + r * ROOM_HEADER_SIZE;
      headerAddress.set(path, base);
      const h = readRoomHeader(d, base);
      const props = pickProps(h);
      const blockLayer = (layer: Layer, key: string): Background | null => {
        const offset = h[LAYER_POINTER_FIELDS[layer]];
        try {
          const { bg, length } = Background.decodeRle(d.raw, offset, layer);
          origins.set(`${path}#${key}`, { offset, length });
          addRef(offset);
          return bg;
        } catch (e) {
          warnings.push(`${areaName} ${hex(r)} ${key}: ${(e as Error).message}`);
          return null;
        }
      };
      const lzBg0 = (h.bg0Prop & BgProp.LZ77) !== 0;
      const bg0 = !lzBg0 && h.bg0Prop & BgProp.RLE ? blockLayer(Layer.BG0, 'bg0') : null;
      const bg1 = h.bg1Prop & BgProp.RLE ? blockLayer(Layer.BG1, 'bg1') : null;
      const bg2 = h.bg2Prop & BgProp.RLE ? blockLayer(Layer.BG2, 'bg2') : null;
      const clip = blockLayer(Layer.Clip, 'clip');
      const bg0Tilemap = lzBg0 ? tilemap(h.bg0Ptr, `${areaName}_${r}_Bg0`) : null;
      const bg3Tilemap = tilemap(h.bg3Ptr, `${areaName}_${r}_Bg3`);

      const events = [1, h.spriteset1Event, h.spriteset2Event];
      const lists = [0, 1, 2].map((i) => {
        const offset = h[SPRITE_LIST_POINTER_FIELDS[i]];
        if (!events[i] || !valid(offset)) return null;
        const { list, length } = RoomSpriteList.decode(d, offset);
        origins.set(`${path}#sprites${i}`, { offset, length });
        addRef(offset);
        return list;
      }) as RoomAsset['spriteLists'];

      const entry = scrolls.entries.find((e) => e.room === r);
      if (entry) origins.set(`scrolls:${area}:${r}`, { offset: entry.offset, length: entry.length });

      const room = new RoomAsset(path, area, r, props, bg0, bg1, bg2, clip, bg0Tilemap, bg3Tilemap, lists, [], entry ? entry.scrolls.map((s) => ({ ...s })) : []);
      rooms.push(room);
      assets.set(path, room);
    }

    // Doors live in the room they're placed in; the rest stay with the area.
    const doorsAt = d.ptr(doorTable + area * 4);
    const doors = valid(doorsAt) ? decodeDoorTable(d, doorsAt, area) : [];
    if (valid(doorsAt)) origins.set(`doors:${area}`, { offset: doorsAt, length: (doors.length + 1) * DOOR_ENTRY_SIZE });
    const unassigned = [];
    for (const door of doors) {
      if (door.room !== NO_ROOM && door.room < roomCount) rooms[door.room].doors.push(door);
      else unassigned.push(door);
    }
    const areaAsset = new AreaAsset(`rooms/${folder}/${areaName}.area.json`, area, game.areaNames[area] ?? areaName, unassigned);
    assets.set(areaAsset.path, areaAsset);
  }

  const manifest: ProjectManifest = {
    format: 'mage-project',
    version: ASSET_FORMAT_VERSION,
    name,
    game: game.kind,
    gameCode: game.gameCode,
    baseRom: { file: BASE_ROM_FILE, crc32: crc32Hex(rom.data.bytes), size: rom.data.length },
    build: { output: `${BUILD_DIR}/${fileSafe(name) || 'build'}.gba` },
    common,
    map: map.source,
    created: new Date().toISOString(),
  };

  return {
    manifest,
    assets: [...assets.values()],
    baseline: { assets, origins, refCounts, roomCounts, headerAddress, warnings },
  };
}
