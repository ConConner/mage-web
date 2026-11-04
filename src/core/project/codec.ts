/**
 * On-disk formats of project files. JSON assets are formatted for diffing:
 * grids of 16-bit values are written as one hex string per row, small
 * objects stay on one line. Graphics are raw 4bpp `.gfx` files that tile
 * editors can open directly.
 */
import { Background, Layer } from '../model/Background';
import { Gfx } from '../model/Gfx';
import { Palette } from '../model/Palette';
import { ROOM_PROP_FIELDS, type RoomProps } from '../model/RoomHeader';
import { RoomSpriteList } from '../model/Sprites';
import type { Door } from '../model/Doors';
import type { Scroll } from '../model/Scrolls';
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
  assetKindOf,
  type Asset,
} from './assets';
import { textDecoder, textEncoder } from './fs';

export const ASSET_FORMAT_VERSION = 1;
export const MANIFEST_FILE = 'project.mageproj';
export const BASE_ROM_FILE = 'baserom.gba';
export const BUILD_DIR = 'build';

/** Roles of the fixed-location "common" assets. */
export type CommonRole = 'bgGfx' | 'bgPalette' | 'spriteGfx' | 'spritePalette';

export interface ProjectManifest {
  format: 'mage-project';
  version: number;
  name: string;
  game: 'MF' | 'ZM';
  gameCode: string;
  baseRom: { file: string; crc32: string; size: number };
  build: { output: string };
  common: Partial<Record<CommonRole, string>>;
  map: { repo: string; commit: string };
  created: string;
}

export class AssetFormatError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}

// ------------------------------------------------------------ formatting

const hex4 = (v: number) => v.toString(16).toUpperCase().padStart(4, '0');

export function u16Rows(values: Uint16Array, perRow: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < values.length; i += perRow) rows.push(Array.from(values.subarray(i, i + perRow), hex4).join(' '));
  return rows;
}

export function parseU16Rows(rows: unknown, path: string, what: string): Uint16Array {
  if (!Array.isArray(rows)) throw new AssetFormatError(path, `${what} must be an array of hex rows`);
  const out: number[] = [];
  for (const row of rows) {
    if (typeof row !== 'string') throw new AssetFormatError(path, `${what} rows must be strings`);
    for (const t of row.trim().split(/\s+/)) {
      if (!t) continue;
      const v = parseInt(t, 16);
      if (!/^[0-9a-fA-F]{1,4}$/.test(t) || Number.isNaN(v)) throw new AssetFormatError(path, `invalid value "${t}" in ${what}`);
      out.push(v);
    }
  }
  return Uint16Array.from(out);
}

const isPrimitive = (v: unknown) => v === null || typeof v !== 'object';

/** JSON with primitive arrays and flat objects on one line, everything else expanded. */
export function formatJson(value: unknown, indent = ''): string {
  if (isPrimitive(value)) return JSON.stringify(value);
  const next = indent + '  ';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => typeof v === 'number' || typeof v === 'boolean' || v === null)) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
    return `[\n${value.map((v) => next + formatJson(v, next)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  const flat = entries.every(([, v]) => isPrimitive(v));
  if (flat) {
    const line = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
    if (line.length <= 120) return line;
  }
  return `{\n${entries.map(([k, v]) => `${next}${JSON.stringify(k)}: ${formatJson(v, next)}`).join(',\n')}\n${indent}}`;
}

const json = (v: unknown) => textEncoder.encode(formatJson(v) + '\n');

// ------------------------------------------------------------ serialize

const doorJson = (d: Door) => ({
  number: d.number,
  type: d.type,
  room: d.room,
  xStart: d.xStart,
  xEnd: d.xEnd,
  yStart: d.yStart,
  yEnd: d.yEnd,
  destination: d.destination,
  exitX: d.exitX,
  exitY: d.exitY,
});

const blockLayerJson = (bg: Background | null) => (bg ? { width: bg.width, height: bg.height, rows: u16Rows(bg.blocks, bg.width) } : null);

export function serializeAsset(a: Asset): Uint8Array {
  const head = { $type: a.kind, version: ASSET_FORMAT_VERSION };
  switch (a.kind) {
    case 'graphics':
      return a.gfx.data.slice();
    case 'palette':
      return json({ ...head, rows: u16Rows(a.palette.colors, 16) });
    case 'tiletable':
      return json({ ...head, header: a.header, blocks: u16Rows(a.entries, 4) });
    case 'tilemap':
      return json({ ...head, size: a.size, rows: u16Rows(a.entries, 32) });
    case 'tileset':
      return json({
        ...head,
        index: a.index,
        graphics: a.graphics,
        palette: a.palette,
        backgroundGraphics: a.backgroundGraphics,
        tileTable: a.tileTable,
        animatedTileset: a.animatedTileset,
        animatedPalette: a.animatedPalette,
      });
    case 'spriteset':
      return json({ ...head, index: a.index, entries: a.entries.map((e) => ({ sprite: e.spriteId, gfxRow: e.gfxRow })) });
    case 'sprite':
      return json({ ...head, id: a.id, name: a.name, graphics: a.graphics, palette: a.palette });
    case 'area':
      return json({ ...head, index: a.index, name: a.name, unassignedDoors: a.unassignedDoors.map(doorJson) });
    case 'room':
      return json({
        ...head,
        area: a.area,
        index: a.index,
        properties: a.props,
        layers: {
          bg0: a.bg0Tilemap ? { tilemap: a.bg0Tilemap } : blockLayerJson(a.bg0),
          bg1: blockLayerJson(a.bg1),
          bg2: blockLayerJson(a.bg2),
          bg3: a.bg3Tilemap ? { tilemap: a.bg3Tilemap } : null,
          clipdata: blockLayerJson(a.clipdata),
        },
        sprites: a.spriteLists.map((l) => (l ? l.sprites.map((s) => ({ x: s.x, y: s.y, properties: s.properties })) : null)),
        doors: a.doors.map(doorJson),
        scrolls: a.scrolls.map((s) => ({ ...s })),
      });
  }
}

// ---------------------------------------------------------------- parse

type Obj = Record<string, unknown>;

function num(o: Obj, key: string, path: string, fallback?: number): number {
  const v = o[key];
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new AssetFormatError(path, `"${key}" must be an integer`);
  return v;
}

function ref(o: Obj, key: string, path: string): string | null {
  const v = o[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new AssetFormatError(path, `"${key}" must be a path or null`);
  return v;
}

function parseDoor(o: Obj, area: number, path: string): Door {
  return {
    area,
    number: num(o, 'number', path),
    type: num(o, 'type', path),
    room: num(o, 'room', path),
    xStart: num(o, 'xStart', path),
    xEnd: num(o, 'xEnd', path),
    yStart: num(o, 'yStart', path),
    yEnd: num(o, 'yEnd', path),
    destination: num(o, 'destination', path),
    exitX: num(o, 'exitX', path) & 0xff,
    exitY: num(o, 'exitY', path) & 0xff,
  };
}

function parseBlockLayer(v: unknown, layer: Layer, path: string): Background | null {
  if (v === null || v === undefined) return null;
  const o = v as Obj;
  const w = num(o, 'width', path);
  const h = num(o, 'height', path);
  const blocks = parseU16Rows(o.rows, path, `${Layer[layer]} rows`);
  if (blocks.length !== w * h) throw new AssetFormatError(path, `${Layer[layer]} has ${blocks.length} blocks, expected ${w}×${h}`);
  return Background.blockMap(layer, w, h, blocks);
}

const tilemapRef = (v: unknown) => (v && typeof v === 'object' && typeof (v as Obj).tilemap === 'string' ? ((v as Obj).tilemap as string) : null);

/** Parses a project file into an asset. Returns undefined for files that aren't assets. */
export function parseAsset(path: string, bytes: Uint8Array): Asset | undefined {
  const kind = assetKindOf(path);
  if (!kind) return undefined;
  if (kind === 'graphics') return new GraphicsAsset(path, new Gfx(bytes.slice()));

  let o: Obj;
  try {
    o = JSON.parse(textDecoder.decode(bytes)) as Obj;
  } catch (e) {
    throw new AssetFormatError(path, `invalid JSON (${(e as Error).message})`);
  }
  if (o.$type !== kind) throw new AssetFormatError(path, `expected "$type": "${kind}"`);
  if (typeof o.version === 'number' && o.version > ASSET_FORMAT_VERSION) throw new AssetFormatError(path, `was written by a newer MAGE (format ${o.version})`);

  switch (kind) {
    case 'palette': {
      const colors = parseU16Rows(o.rows, path, 'rows');
      return new PaletteAsset(path, new Palette(Math.ceil(colors.length / 16), padTo(colors, 16)));
    }
    case 'tiletable': {
      const h = Array.isArray(o.header) ? (o.header as number[]) : [2, 0];
      return new TileTableAsset(path, parseU16Rows(o.blocks, path, 'blocks'), [h[0] & 0xff, h[1] & 0xff]);
    }
    case 'tilemap':
      return new TilemapAsset(path, num(o, 'size', path), parseU16Rows(o.rows, path, 'rows'));
    case 'tileset':
      return new TilesetAsset(
        path,
        num(o, 'index', path),
        ref(o, 'graphics', path),
        ref(o, 'palette', path),
        ref(o, 'backgroundGraphics', path),
        ref(o, 'tileTable', path),
        num(o, 'animatedTileset', path, 0),
        num(o, 'animatedPalette', path, 0),
      );
    case 'spriteset': {
      const entries = (Array.isArray(o.entries) ? (o.entries as Obj[]) : []).map((e) => ({ spriteId: num(e, 'sprite', path), gfxRow: num(e, 'gfxRow', path) }));
      return new SpritesetAsset(path, num(o, 'index', path), entries);
    }
    case 'sprite':
      return new SpriteAsset(path, num(o, 'id', path), typeof o.name === 'string' ? o.name : '', ref(o, 'graphics', path), ref(o, 'palette', path));
    case 'area': {
      const index = num(o, 'index', path);
      const doors = (Array.isArray(o.unassignedDoors) ? (o.unassignedDoors as Obj[]) : []).map((d) => parseDoor(d, index, path));
      return new AreaAsset(path, index, typeof o.name === 'string' ? o.name : `Area ${index}`, doors);
    }
    case 'room': {
      const area = num(o, 'area', path);
      const p = (o.properties ?? {}) as Obj;
      const props = {} as RoomProps;
      for (const k of ROOM_PROP_FIELDS) props[k] = num(p, k, path, k === 'effectY' ? 0xff : 0);
      const layers = (o.layers ?? {}) as Obj;
      const bg0Tilemap = tilemapRef(layers.bg0);
      const lists = Array.isArray(o.sprites) ? (o.sprites as unknown[]) : [];
      const spriteLists = [0, 1, 2].map((i) => {
        const l = lists[i];
        if (!Array.isArray(l)) return null;
        return new RoomSpriteList((l as Obj[]).map((s) => ({ x: num(s, 'x', path), y: num(s, 'y', path), properties: num(s, 'properties', path) })));
      }) as RoomAsset['spriteLists'];
      const scrolls = (Array.isArray(o.scrolls) ? (o.scrolls as Obj[]) : []).map(
        (s): Scroll => ({
          xStart: num(s, 'xStart', path),
          xEnd: num(s, 'xEnd', path),
          yStart: num(s, 'yStart', path),
          yEnd: num(s, 'yEnd', path),
          xBreak: num(s, 'xBreak', path),
          yBreak: num(s, 'yBreak', path),
          extend: num(s, 'extend', path),
          newBound: num(s, 'newBound', path),
        }),
      );
      return new RoomAsset(
        path,
        area,
        num(o, 'index', path),
        props,
        bg0Tilemap ? null : parseBlockLayer(layers.bg0, Layer.BG0, path),
        parseBlockLayer(layers.bg1, Layer.BG1, path),
        parseBlockLayer(layers.bg2, Layer.BG2, path),
        parseBlockLayer(layers.clipdata, Layer.Clip, path),
        bg0Tilemap,
        tilemapRef(layers.bg3),
        spriteLists,
        (Array.isArray(o.doors) ? (o.doors as Obj[]) : []).map((d) => parseDoor(d, area, path)),
        scrolls,
      );
    }
  }
}

function padTo(values: Uint16Array, multiple: number): Uint16Array {
  if (values.length % multiple === 0 && values.length > 0) return values;
  const out = new Uint16Array(Math.max(multiple, Math.ceil(values.length / multiple) * multiple));
  out.set(values);
  return out;
}

export function serializeManifest(m: ProjectManifest): Uint8Array {
  return textEncoder.encode(JSON.stringify(m, null, 2) + '\n');
}

export function parseManifest(bytes: Uint8Array): ProjectManifest {
  let m: ProjectManifest;
  try {
    m = JSON.parse(textDecoder.decode(bytes)) as ProjectManifest;
  } catch (e) {
    throw new AssetFormatError(MANIFEST_FILE, `invalid JSON (${(e as Error).message})`);
  }
  if (m.format !== 'mage-project') throw new AssetFormatError(MANIFEST_FILE, 'not a MAGE project file');
  if (m.game !== 'MF' && m.game !== 'ZM') throw new AssetFormatError(MANIFEST_FILE, `unknown game "${String(m.game)}"`);
  m.common ??= {};
  m.build ??= { output: `${BUILD_DIR}/${m.name || 'build'}.gba` };
  return m;
}
