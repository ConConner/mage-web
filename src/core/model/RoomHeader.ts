import type { ByteStream } from '../io/ByteStream';

export const ROOM_HEADER_SIZE = 0x3c;

/** Field layout of the 0x3C byte room header (`RoomEntryRom` in the decomp). */
export const HeaderField = {
  tileset: { at: 0x00, size: 1 },
  bg0Prop: { at: 0x01, size: 1 },
  bg1Prop: { at: 0x02, size: 1 },
  bg2Prop: { at: 0x03, size: 1 },
  bg3Prop: { at: 0x04, size: 1 },
  bg0Ptr: { at: 0x08, size: 4 },
  bg1Ptr: { at: 0x0c, size: 4 },
  bg2Ptr: { at: 0x10, size: 4 },
  clipPtr: { at: 0x14, size: 4 },
  bg3Ptr: { at: 0x18, size: 4 },
  bg3Scroll: { at: 0x1c, size: 1 },
  transparency: { at: 0x1d, size: 1 },
  enemyList0Ptr: { at: 0x20, size: 4 },
  spriteset0: { at: 0x24, size: 1 },
  spriteset1Event: { at: 0x25, size: 1 },
  enemyList1Ptr: { at: 0x28, size: 4 },
  spriteset1: { at: 0x2c, size: 1 },
  spriteset2Event: { at: 0x2d, size: 1 },
  enemyList2Ptr: { at: 0x30, size: 4 },
  spriteset2: { at: 0x34, size: 1 },
  mapX: { at: 0x35, size: 1 },
  mapY: { at: 0x36, size: 1 },
  effect: { at: 0x37, size: 1 },
  effectY: { at: 0x38, size: 1 },
  music: { at: 0x3a, size: 2 },
} as const;

export type HeaderFieldName = keyof typeof HeaderField;
export type RoomHeaderData = Record<HeaderFieldName, number>;

/** Header fields that are plain values (everything except data pointers). */
export const ROOM_PROP_FIELDS = [
  'tileset',
  'bg0Prop',
  'bg1Prop',
  'bg2Prop',
  'bg3Prop',
  'bg3Scroll',
  'transparency',
  'spriteset0',
  'spriteset1Event',
  'spriteset1',
  'spriteset2Event',
  'spriteset2',
  'mapX',
  'mapY',
  'effect',
  'effectY',
  'music',
] as const satisfies readonly HeaderFieldName[];

export type RoomPropName = (typeof ROOM_PROP_FIELDS)[number];
/** The editable room header values stored in a room asset. */
export type RoomProps = Record<RoomPropName, number>;

/** Pointer field holding layer data, indexed as BG0, BG1, BG2, BG3, Clip. */
export const LAYER_POINTER_FIELDS = ['bg0Ptr', 'bg1Ptr', 'bg2Ptr', 'bg3Ptr', 'clipPtr'] as const;
export const SPRITE_LIST_POINTER_FIELDS = ['enemyList0Ptr', 'enemyList1Ptr', 'enemyList2Ptr'] as const;

export function readHeaderField(data: ByteStream, base: number, name: HeaderFieldName): number {
  const f = HeaderField[name];
  if (f.size === 1) return data.u8(base + f.at);
  if (f.size === 2) return data.u16(base + f.at);
  return data.ptr(base + f.at);
}

export function writeHeaderField(data: ByteStream, base: number, name: HeaderFieldName, value: number): void {
  const f = HeaderField[name];
  if (f.size === 1) data.setU8(base + f.at, value);
  else if (f.size === 2) data.setU16(base + f.at, value);
  else data.setPtr(base + f.at, value);
}

export function readRoomHeader(data: ByteStream, base: number): RoomHeaderData {
  const out = {} as RoomHeaderData;
  for (const name of Object.keys(HeaderField) as HeaderFieldName[]) out[name] = readHeaderField(data, base, name);
  return out;
}

export function pickProps(h: RoomHeaderData | RoomProps): RoomProps {
  const out = {} as RoomProps;
  for (const k of ROOM_PROP_FIELDS) out[k] = h[k];
  return out;
}
