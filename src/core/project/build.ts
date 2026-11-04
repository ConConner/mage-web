/**
 * Builds a ROM from the base ROM and the project's assets.
 *
 * The output always starts as a fresh copy of the base ROM. Every asset is
 * compared with what the base ROM contains at the same place (the
 * baseline); unchanged data is left untouched, so a project without edits
 * builds a byte-identical ROM. Changed data is written in place if it fits
 * and nothing else shares it, otherwise it goes into free space and the
 * pointers to it are updated.
 */
import { Rom } from '../rom/Rom';
import { BgProp, Background } from '../model/Background';
import { LAYER_POINTER_FIELDS, ROOM_HEADER_SIZE, ROOM_PROP_FIELDS, SPRITE_LIST_POINTER_FIELDS, writeHeaderField } from '../model/RoomHeader';
import { Spriteset } from '../model/Sprites';
import { decodeDoorTable, doorsEqual, emptyDoor, encodeDoorTable, type Door } from '../model/Doors';
import { decodeScrollList, encodeScrollEntry, scrollsEqual } from '../model/Scrolls';
import { TILESET_ENTRY_SIZE } from '../model/Tileset';
import { sameContent, type Asset, type RoomAsset } from './assets';
import type { Baseline, LeafEncoding, Origin } from './extract';
import type { Project } from './Project';

export interface BuildStats {
  unchanged: number;
  inPlace: number;
  relocated: number;
}

export interface BuildResult {
  rom: Uint8Array;
  log: string[];
  warnings: string[];
  stats: BuildStats;
}

export class BuildError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.length === 1 ? problems[0] : `${problems.length} problems prevent building:\n${problems.join('\n')}`);
  }
}

const hex = (v: number, n = 2) => v.toString(16).toUpperCase().padStart(n, '0');

function encodeLeaf(a: Asset, enc: LeafEncoding): Uint8Array | undefined {
  if (a.kind === 'graphics') return enc === 'lz77' ? a.gfx.encodeLz77() : a.gfx.data;
  if (a.kind === 'palette') return a.palette.toBytes();
  if (a.kind === 'tilemap') return Background.encodeTileMap(a.size, a.entries);
  if (a.kind === 'tiletable') {
    const out = new Uint8Array(2 + a.entries.length * 2);
    out[0] = a.header[0];
    out[1] = a.header[1];
    a.entries.forEach((e, i) => {
      out[2 + i * 2] = e & 0xff;
      out[3 + i * 2] = e >> 8;
    });
    return out;
  }
  return undefined;
}

class Writer {
  readonly stats: BuildStats = { unchanged: 0, inPlace: 0, relocated: 0 };
  readonly log: string[] = [];

  constructor(
    readonly rom: Rom,
    private readonly base: Baseline,
  ) {}

  get data() {
    return this.rom.data;
  }

  isShared(origin: Origin | undefined): boolean {
    return !!origin && (this.base.refCounts.get(origin.offset) ?? 0) > 1;
  }

  /**
   * Stores `bytes` for data that was at `origin` in the base ROM (if any).
   * `exclusive`: nothing else uses the original data, so it may be
   * overwritten or freed. `repointAll`: also rewrite every other pointer to
   * the original (code literal pools); the caller sets the structural ones.
   */
  place(label: string, bytes: Uint8Array, origin: Origin | undefined, exclusive: boolean, repointAll: boolean): number {
    const { rom } = this;
    if (origin && exclusive && bytes.length <= origin.length) {
      rom.data.set(origin.offset, bytes);
      if (bytes.length < origin.length) rom.allocator.release(origin.offset, origin.length, bytes.length);
      this.stats.inPlace++;
      this.log.push(`${label}: written in place at ${hex(origin.offset, 6)}`);
      return origin.offset;
    }
    const { offset, atEnd } = rom.allocator.allocate(bytes.length);
    rom.data.set(offset, bytes);
    if (atEnd) rom.allocator.finishAppend(offset, bytes.length);
    if (origin && exclusive) {
      if (repointAll) for (const p of rom.findPointers(origin.offset)) rom.data.setPtr(p, offset);
      rom.allocator.release(origin.offset, origin.length, 0);
    }
    this.stats.relocated++;
    this.log.push(`${label}: ${bytes.length} bytes ${origin ? `moved from ${hex(origin.offset, 6)} ` : ''}to ${hex(offset, 6)}`);
    return offset;
  }
}

export function buildRom(project: Project): BuildResult {
  const base = project.baseline();
  const rom = Rom.load(project.baseRomBytes);
  const d = rom.data;
  const map = rom.map;
  const w = new Writer(rom, base);
  const problems: string[] = [];
  const warnings: string[] = [];

  // ------------------------------------------------------------ leaf assets
  const placedLeaves = new Map<string, number>();
  const leaf = (path: string | null, enc: LeafEncoding, user: string): number | undefined => {
    if (!path) return undefined;
    const key = `${path}|${enc}`;
    const done = placedLeaves.get(key);
    if (done !== undefined) return done;
    const a = project.assets.get(path);
    if (!a) {
      problems.push(`${user} references ${path}, which does not exist.`);
      return undefined;
    }
    const origin = base.origins.get(path);
    const sameEncoding = origin?.encoding === enc;
    const baseAsset = base.assets.get(path);
    let offset: number;
    if (origin && sameEncoding && baseAsset && sameContent(a, baseAsset)) {
      offset = origin.offset;
      w.stats.unchanged++;
    } else {
      const bytes = encodeLeaf(a, enc);
      if (!bytes) {
        problems.push(`${user} references ${path}, which is a ${a.kind}, not data it can use.`);
        return undefined;
      }
      offset = w.place(path, bytes, sameEncoding ? origin : undefined, true, true);
    }
    placedLeaves.set(key, offset);
    return offset;
  };

  // Common graphics: referenced directly from code, so relocation repoints the literal pools.
  for (const path of Object.values(project.manifest.common)) {
    const a = path ? project.assets.get(path) : undefined;
    if (a) leaf(path!, 'raw', 'The project');
  }

  // ---------------------------------------------------------------- tilesets
  const tilesetBase = map.tableOffset(d, 'tilesets');
  const tilesetCount = map.table('tilesets').count;
  for (const t of project.ofKind('tileset')) {
    if (t.index < 0 || t.index >= tilesetCount) {
      problems.push(`${t.path}: tileset ${hex(t.index)} is outside the tileset table (adding tilesets isn't supported yet).`);
      continue;
    }
    const at = tilesetBase + t.index * TILESET_ENTRY_SIZE;
    const set = (field: number, offset: number | undefined) => offset !== undefined && d.setPtr(at + field, offset);
    set(0, leaf(t.graphics, 'lz77', t.path));
    set(4, leaf(t.palette, 'raw', t.path));
    set(8, leaf(t.backgroundGraphics, 'lz77', t.path));
    set(0xc, leaf(t.tileTable, 'tiletable', t.path));
    d.setU8(at + 0x10, t.animatedTileset);
    d.setU8(at + 0x11, t.animatedPalette);
  }

  // ----------------------------------------------------------------- sprites
  const gfxTable = map.tableOffset(d, 'spriteGraphics');
  const palTable = map.tableOffset(d, 'spritePalettes');
  const spriteCount = map.table('spriteGraphics').count;
  for (const s of project.ofKind('sprite')) {
    const i = s.id - 0x10;
    if (i < 0 || i >= spriteCount) {
      problems.push(`${s.path}: sprite ID ${hex(s.id)} is not a primary sprite.`);
      continue;
    }
    const gfx = leaf(s.graphics, project.game.isMF ? 'raw' : 'lz77', s.path);
    if (gfx !== undefined) d.setPtr(gfxTable + i * 4, gfx);
    if (project.game.isMF && s.graphics) {
      const g = project.get(s.graphics, 'graphics');
      if (g) d.setU32(map.tableOffset(d, 'spriteGraphicsLength') + i * 4, g.gfx.data.length);
    }
    const pal = leaf(s.palette, 'raw', s.path);
    if (pal !== undefined) d.setPtr(palTable + i * 4, pal);
  }

  // -------------------------------------------------------------- spritesets
  const setTable = map.tableOffset(d, 'spritesets');
  const setCount = map.table('spritesets').count;
  for (const s of project.ofKind('spriteset')) {
    if (s.index < 0 || s.index >= setCount) {
      problems.push(`${s.path}: spriteset ${hex(s.index)} is outside the spriteset table.`);
      continue;
    }
    const baseSet = [...base.assets.values()].find((a) => a.kind === 'spriteset' && a.index === s.index);
    if (baseSet && sameContent(s, baseSet)) {
      w.stats.unchanged++;
      continue;
    }
    const origin = baseSet ? base.origins.get(baseSet.path) : undefined;
    const offset = w.place(s.path, Spriteset.encode(s.entries), origin, !w.isShared(origin), false);
    d.setPtr(setTable + s.index * 4, offset);
  }

  // ------------------------------------------------------------------ rooms
  const baseRooms = new Map<string, RoomAsset>();
  for (const a of base.assets.values()) if (a.kind === 'room') baseRooms.set(`${a.area}:${a.index}`, a);
  const areaTable = map.tableOffset(d, 'areaRoomEntries');

  for (const room of project.ofKind('room')) {
    const label = `${project.areaName(room.area)} ${hex(room.index)}`;
    if (room.area >= base.roomCounts.length || room.index >= base.roomCounts[room.area]) {
      problems.push(`${room.path}: room ${room.area}-${hex(room.index)} doesn't exist in the base ROM (adding rooms isn't supported yet).`);
      continue;
    }
    const header = d.ptr(areaTable + room.area * 4) + room.index * ROOM_HEADER_SIZE;
    const old = baseRooms.get(`${room.area}:${room.index}`);
    const part = (key: string) => (old ? base.origins.get(`${old.path}#${key}`) : undefined);
    for (const k of ROOM_PROP_FIELDS) writeHeaderField(d, header, k, room.props[k]);

    const layers: [Background | null, Background | null | undefined, string, number][] = [
      [room.bg0, old?.bg0, 'bg0', 0],
      [room.bg1, old?.bg1, 'bg1', 1],
      [room.bg2, old?.bg2, 'bg2', 2],
      [room.clipdata, old?.clipdata, 'clip', 4],
    ];
    for (const [bg, before, key, layer] of layers) {
      if (!bg) continue;
      if (bg.width > 0xff || bg.height > 0xff || bg.width * bg.height > 0x1800) {
        problems.push(`${room.path}: ${key} is ${bg.width}×${bg.height} blocks, larger than the game allows.`);
        continue;
      }
      if (before && bg.equals(before)) {
        w.stats.unchanged++;
        continue;
      }
      const origin = part(key);
      const offset = w.place(`${label} ${key}`, bg.encodeRle(), origin, !w.isShared(origin), false);
      writeHeaderField(d, header, LAYER_POINTER_FIELDS[layer], offset);
    }
    const bg0 = leaf(room.bg0Tilemap, 'tilemap', room.path);
    if (bg0 !== undefined) writeHeaderField(d, header, 'bg0Ptr', bg0);
    const bg3 = leaf(room.bg3Tilemap, 'tilemap', room.path);
    if (bg3 !== undefined) writeHeaderField(d, header, 'bg3Ptr', bg3);

    const p = room.props;
    if (p.bg1Prop & BgProp.RLE && !room.bg1) warnings.push(`${label}: BG1 is marked as RLE but the room has no BG1 blocks.`);
    if (p.bg0Prop & BgProp.LZ77 && !room.bg0Tilemap) warnings.push(`${label}: BG0 is marked as LZ77 but no tilemap is set.`);

    room.spriteLists.forEach((list, i) => {
      if (!list) return;
      const before = old?.spriteLists[i];
      if (before && list.equals(before)) {
        w.stats.unchanged++;
        return;
      }
      if (list.sprites.length > 24) problems.push(`${room.path}: sprite list ${i} has more than 24 sprites.`);
      const origin = part(`sprites${i}`);
      const offset = w.place(`${label} sprites ${i}`, list.encode(), origin, !w.isShared(origin), false);
      writeHeaderField(d, header, SPRITE_LIST_POINTER_FIELDS[i], offset);
    });
  }

  // ------------------------------------------------------------------ doors
  const doorTable = map.tableOffset(d, 'doors');
  for (let area = 0; area < base.roomCounts.length; area++) {
    const doors = project.doors.areaDoors(area);
    const byNumber = new Map<number, Door>();
    for (const door of doors) {
      if (byNumber.has(door.number)) problems.push(`${project.areaName(area)}: door ${hex(door.number)} exists more than once.`);
      byNumber.set(door.number, door);
    }
    const count = doors.length ? Math.max(...doors.map((x) => x.number)) + 1 : 0;
    if (count > 0xff) problems.push(`${project.areaName(area)}: door numbers must be below FF.`);
    const full = Array.from({ length: count }, (_, n) => byNumber.get(n) ?? emptyDoor(area, n));
    const origin = base.origins.get(`doors:${area}`);
    const before = origin ? decodeDoorTable(project.baseRom.data, origin.offset, area) : [];
    if (before.length === full.length && before.every((x, i) => doorsEqual(x, full[i]))) {
      w.stats.unchanged++;
      continue;
    }
    if (full.some((x) => x.type === 0)) problems.push(`${project.areaName(area)}: a door has type 0, which would end the door table.`);
    const offset = w.place(`${project.areaName(area)} doors`, encodeDoorTable(full), origin, true, true);
    d.setPtr(doorTable + area * 4, offset);
  }

  // ---------------------------------------------------------------- scrolls
  const scrollTable = map.tableOffset(d, 'scrolls');
  for (let area = 0; area < base.roomCounts.length; area++) {
    const rooms = project.rooms(area);
    const changed = rooms.filter((r) => {
      const old = baseRooms.get(`${area}:${r.index}`);
      return !old || !scrollsEqual(r.scrolls, old.scrolls);
    });
    if (changed.length === 0) continue;
    const listOrigin = base.origins.get(`scrolls:${area}`);
    if (!listOrigin) {
      problems.push(`${project.areaName(area)}: the base ROM has no scroll list for this area.`);
      continue;
    }
    const { entries, terminator } = decodeScrollList(project.baseRom.data, listOrigin.offset);
    const existing = new Map(entries.map((e) => [e.room, e]));
    const changedSet = new Set(changed.map((r) => r.index));
    const roomNumbers = new Set([...existing.keys(), ...rooms.filter((r) => r.scrolls.length > 0).map((r) => r.index)]);
    const pointers: number[] = [];
    for (const n of [...roomNumbers].sort((a, b) => a - b)) {
      const e = existing.get(n);
      if (!changedSet.has(n)) {
        if (e) pointers.push(e.offset);
        continue;
      }
      const scrolls = project.room(area, n)?.scrolls ?? [];
      const origin = e ? { offset: e.offset, length: e.length } : undefined;
      if (scrolls.length === 0) {
        if (origin) rom.allocator.release(origin.offset, origin.length, 0);
        continue;
      }
      pointers.push(w.place(`${project.areaName(area)} ${hex(n)} scrolls`, encodeScrollEntry(n, scrolls), origin, true, false));
    }
    pointers.push(terminator);
    const list = new Uint8Array(pointers.length * 4);
    const view = new DataView(list.buffer);
    pointers.forEach((p, i) => view.setUint32(i * 4, p + 0x08000000, true));
    d.setPtr(scrollTable + area * 4, w.place(`${project.areaName(area)} scroll list`, list, listOrigin, true, false));
  }

  if (problems.length) throw new BuildError(problems);
  return { rom: rom.snapshot(), log: w.log, warnings, stats: w.stats };
}
