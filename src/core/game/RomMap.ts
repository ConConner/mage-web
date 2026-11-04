/**
 * The ROM map: where the game keeps its data, generated from
 * https://github.com/biosp4rk/mf-zm-info (see scripts/generate-rom-map.mjs).
 *
 * Tables are located through the code literal pools that point at them, so
 * a base ROM whose tables were already repointed (e.g. by MAGE) still
 * works. Symbol names are used to name extracted asset files.
 */
import zmMap from './map/ZM_U.json';
import mfMap from './map/MF_U.json';
import type { ByteStream } from '../io/ByteStream';
import type { GameKind } from './GameInfo';

export interface MapTable {
  symbol: string;
  /** Address in the vanilla ROM. */
  addr: number;
  /** Element count in the vanilla ROM. */
  count: number;
  /** Size in bytes in the vanilla ROM (0 if unknown). */
  size: number;
  /** Addresses of code literal pool words that point at the table. */
  pools: number[];
}

export type TableKey =
  | 'areaRoomEntries'
  | 'tilesets'
  | 'spritesets'
  | 'spriteGraphics'
  | 'spritePalettes'
  | 'spriteGraphicsLength'
  | 'doors'
  | 'scrolls'
  | 'animatedTilesets'
  | 'animatedGraphics'
  | 'animatedPalettes'
  | 'areaConnections'
  | 'clipdataCollisionTypes'
  | 'commonTilesGfx'
  | 'commonTilesPal'
  | 'commonSpritesGfx'
  | 'commonSpritesPal';

interface RawMap {
  game: string;
  gameCode: string;
  region: string;
  source: { repo: string; commit: string };
  tables: Record<string, MapTable>;
  roomEntryTables: { symbol: string; addr: number; count: number }[];
  enums: Record<string, Record<string, string>>;
  symbols: [number, string, number][];
}

export interface MapSymbol {
  name: string;
  addr: number;
  size: number;
}

export class RomMap {
  readonly source: { repo: string; commit: string };
  private readonly addrs: Int32Array;
  private readonly raw: RawMap;

  constructor(raw: RawMap) {
    this.raw = raw;
    this.source = raw.source;
    this.addrs = Int32Array.from(raw.symbols.map((s) => s[0]));
  }

  get gameCode(): string {
    return this.raw.gameCode;
  }

  table(key: TableKey): MapTable {
    const t = this.raw.tables[key];
    if (!t) throw new Error(`The ROM map has no "${key}" table for ${this.raw.game}.`);
    return t;
  }

  hasTable(key: TableKey): boolean {
    return key in this.raw.tables;
  }

  /**
   * Current location of a table: the target of its first code pointer, or
   * the vanilla address when nothing points at it.
   */
  tableOffset(data: ByteStream, key: TableKey): number {
    const t = this.table(key);
    if (t.pools.length > 0) {
      const p = data.ptr(t.pools[0]);
      if (p >= 0 && p < data.length) return p;
    }
    return t.addr;
  }

  /** The symbol starting exactly at `addr`, if the map knows one. */
  symbolAt(addr: number): MapSymbol | undefined {
    let lo = 0, hi = this.addrs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = this.addrs[mid];
      if (v === addr) {
        const s = this.raw.symbols[mid];
        return { addr: s[0], name: s[1], size: s[2] };
      }
      if (v < addr) lo = mid + 1;
      else hi = mid - 1;
    }
    return undefined;
  }

  /** Room entry table (one per area) starting at `addr`. */
  roomEntryTable(addr: number): { symbol: string; count: number } | undefined {
    return this.raw.roomEntryTables.find((t) => t.addr === addr);
  }

  enumName(enumKey: string, value: number): string | undefined {
    return this.raw.enums[enumKey]?.[String(value)];
  }

  /** Display name of a primary sprite, e.g. "Zoomer" for PSPRITE_ZOOMER. */
  spriteName(id: number): string | undefined {
    const n = this.enumName('primarySprites', id);
    return n ? prettyEnum(n.replace(/^PSPRITE_/, '')) : undefined;
  }

  eventName(id: number): string | undefined {
    const n = this.enumName('events', id);
    return n ? prettyEnum(n.replace(/^EVENT_/, '')) : undefined;
  }

  /** Every value of an enum, for pickers. */
  enumValues(enumKey: string): { value: number; name: string }[] {
    return Object.entries(this.raw.enums[enumKey] ?? {}).map(([v, name]) => ({ value: Number(v), name }));
  }
}

/** `CHOZO_STATUE_LONG` → `Chozo Statue Long`. */
export function prettyEnum(name: string): string {
  return name
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** `Chozo Statue Long` → `ChozoStatueLong` (for file names). */
export const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^[^A-Za-z0-9]+/, '');

const cache = new Map<GameKind, RomMap>();

export function romMapFor(kind: GameKind): RomMap {
  let m = cache.get(kind);
  if (!m) {
    m = new RomMap((kind === 'MF' ? mfMap : zmMap) as unknown as RawMap);
    cache.set(kind, m);
  }
  return m;
}
