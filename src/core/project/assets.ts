/**
 * Project assets: everything editable, one file each. Most mirror a single
 * ROM structure (palette, graphics, tile table, tilemap, tileset entry,
 * spriteset, sprite). A room is a composite of its header values, block
 * layers, sprite lists, scrolls and the doors that sit in it; it references
 * tilemaps, a tileset and spritesets.
 *
 * Asset data is held decoded. Compression and placement in the ROM happen
 * only when the project is built.
 */
import type { Background } from '../model/Background';
import { equalBytes, equalU16 } from '../model/Background';
import type { Gfx } from '../model/Gfx';
import type { Palette } from '../model/Palette';
import type { RoomProps } from '../model/RoomHeader';
import type { RoomSpriteList, SpritesetEntry } from '../model/Sprites';
import type { Door } from '../model/Doors';
import type { Scroll } from '../model/Scrolls';

export type AssetKind = 'room' | 'area' | 'tileset' | 'tilemap' | 'tiletable' | 'palette' | 'graphics' | 'spriteset' | 'sprite';

export class PaletteAsset {
  readonly kind = 'palette';
  constructor(
    public path: string,
    public palette: Palette,
  ) {}
}

/** 4bpp tile graphics, stored as a raw `.gfx` file (uncompressed). */
export class GraphicsAsset {
  readonly kind = 'graphics';
  constructor(
    public path: string,
    public gfx: Gfx,
  ) {}
}

/** Block → 4 tile entries. `header` holds the two bytes stored before the entries in ROM. */
export class TileTableAsset {
  readonly kind = 'tiletable';
  constructor(
    public path: string,
    public entries: Uint16Array,
    public header: [number, number],
  ) {}
}

/** A GBA tilemap used by LZ77 layers (BG3 backgrounds, LZ77 BG0). */
export class TilemapAsset {
  readonly kind = 'tilemap';
  constructor(
    public path: string,
    /** The u32 stored before the data; low 2 bits = layout (0 32×32, 1 64×32, 2 32×64). */
    public size: number,
    public entries: Uint16Array,
  ) {}
}

export class TilesetAsset {
  readonly kind = 'tileset';
  constructor(
    public path: string,
    public index: number,
    public graphics: string | null,
    public palette: string | null,
    public backgroundGraphics: string | null,
    public tileTable: string | null,
    public animatedTileset: number,
    public animatedPalette: number,
  ) {}
}

export class SpritesetAsset {
  readonly kind = 'spriteset';
  constructor(
    public path: string,
    public index: number,
    public entries: SpritesetEntry[],
  ) {}
}

/** A primary sprite's graphics and palette (sprite AI and OAM stay in the ROM). */
export class SpriteAsset {
  readonly kind = 'sprite';
  constructor(
    public path: string,
    public id: number,
    public name: string,
    public graphics: string | null,
    public palette: string | null,
  ) {}
}

export class AreaAsset {
  readonly kind = 'area';
  constructor(
    public path: string,
    public index: number,
    public name: string,
    /** Door slots not placed in any room (room 0xFF or out of range). */
    public unassignedDoors: Door[],
  ) {}
}

export class RoomAsset {
  readonly kind = 'room';
  constructor(
    public path: string,
    public area: number,
    public index: number,
    public props: RoomProps,
    /** RLE block layers. `null` when the layer isn't stored as blocks. */
    public bg0: Background | null,
    public bg1: Background | null,
    public bg2: Background | null,
    public clipdata: Background | null,
    /** Tilemap assets for LZ77 layers. */
    public bg0Tilemap: string | null,
    public bg3Tilemap: string | null,
    /** Sprite lists for spriteset 0-2; `null` when the list is unused. */
    public spriteLists: [RoomSpriteList | null, RoomSpriteList | null, RoomSpriteList | null],
    public doors: Door[],
    public scrolls: Scroll[],
  ) {}
}

export type Asset = PaletteAsset | GraphicsAsset | TileTableAsset | TilemapAsset | TilesetAsset | SpritesetAsset | SpriteAsset | AreaAsset | RoomAsset;
export type AssetOfKind<K extends AssetKind> = Extract<Asset, { kind: K }>;

/** File extension per asset kind. */
export const ASSET_EXTENSIONS: Record<AssetKind, string> = {
  room: '.room.json',
  area: '.area.json',
  tileset: '.tileset.json',
  tilemap: '.tilemap.json',
  tiletable: '.tiletable.json',
  palette: '.palette.json',
  graphics: '.gfx',
  spriteset: '.spriteset.json',
  sprite: '.sprite.json',
};

export function assetKindOf(path: string): AssetKind | undefined {
  const lower = path.toLowerCase();
  for (const [kind, ext] of Object.entries(ASSET_EXTENSIONS) as [AssetKind, string][]) if (lower.endsWith(ext)) return kind;
  return undefined;
}

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  room: 'Room',
  area: 'Area',
  tileset: 'Tileset',
  tilemap: 'Tilemap',
  tiletable: 'Tile Table',
  palette: 'Palette',
  graphics: 'Graphics',
  spriteset: 'Spriteset',
  sprite: 'Sprite',
};

/** Paths of other assets this asset references. */
export function assetReferences(a: Asset): string[] {
  const refs: (string | null)[] =
    a.kind === 'tileset' ? [a.graphics, a.palette, a.backgroundGraphics, a.tileTable] : a.kind === 'sprite' ? [a.graphics, a.palette] : a.kind === 'room' ? [a.bg0Tilemap, a.bg3Tilemap] : [];
  return refs.filter((r): r is string => !!r);
}

/** Content equality of two leaf assets (paths are ignored). */
export function sameContent(a: Asset, b: Asset): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'palette':
      return equalU16(a.palette.colors, (b as PaletteAsset).palette.colors);
    case 'graphics':
      return equalBytes(a.gfx.data, (b as GraphicsAsset).gfx.data);
    case 'tiletable': {
      const o = b as TileTableAsset;
      return a.header[0] === o.header[0] && a.header[1] === o.header[1] && equalU16(a.entries, o.entries);
    }
    case 'tilemap': {
      const o = b as TilemapAsset;
      return a.size === o.size && equalU16(a.entries, o.entries);
    }
    case 'spriteset': {
      const o = b as SpritesetAsset;
      return a.entries.length === o.entries.length && a.entries.every((e, i) => e.spriteId === o.entries[i].spriteId && e.gfxRow === o.entries[i].gfxRow);
    }
    default:
      return JSON.stringify(a) === JSON.stringify(b);
  }
}
