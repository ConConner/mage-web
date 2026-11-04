import type { ByteStream } from '../io/ByteStream';

export const DOOR_ENTRY_SIZE = 12;
/** Room value marking an unused door slot. */
export const NO_ROOM = 0xff;
export const MAX_DOORS_PER_AREA = 0xff;

/**
 * A door (12 bytes):
 *   type, source room, xStart, xEnd, yStart, yEnd, destination door,
 *   exit distance x (signed), exit distance y (signed), 3 bytes padding.
 * The low nibble of `type` is the door kind (1 = area connection).
 * `area` and `number` (index in the area's door table) identify the door.
 */
export interface Door {
  area: number;
  number: number;
  type: number;
  room: number;
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  destination: number;
  exitX: number;
  exitY: number;
}

export const DoorKind = {
  AreaConnection: 1,
  NoHatch: 2,
  OpenHatch: 3,
  ClosedHatch: 4,
  RemoveMotherShip: 5,
  SetMotherShip: 6,
} as const;

export const toSigned8 = (v: number) => (v & 0x80 ? v - 0x100 : v);

/** Pixel position Samus spawns at relative to the door, before the exit offset. */
export function doorAnchor(d: Door): { x: number; y: number } {
  return { x: d.xStart * 16 + 8, y: (d.yEnd + 1) * 16 };
}

export function doorExitPoint(d: Door): { x: number; y: number } {
  const a = doorAnchor(d);
  return { x: a.x + toSigned8(d.exitX), y: a.y + toSigned8(d.exitY) };
}

export function doorContains(d: Door, x: number, y: number): boolean {
  return x >= d.xStart && x <= d.xEnd && y >= d.yStart && y <= d.yEnd;
}

/** Placeholder for unused slots. Type must be non-zero: a zero type terminates the table. */
export function emptyDoor(area: number, number: number): Door {
  return { area, number, type: DoorKind.NoHatch, room: NO_ROOM, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, destination: 0, exitX: 0, exitY: 0 };
}

export function doorsEqual(a: Door, b: Door): boolean {
  return (
    a.number === b.number &&
    a.type === b.type &&
    a.room === b.room &&
    a.xStart === b.xStart &&
    a.xEnd === b.xEnd &&
    a.yStart === b.yStart &&
    a.yEnd === b.yEnd &&
    a.destination === b.destination &&
    a.exitX === b.exitX &&
    a.exitY === b.exitY
  );
}

/** Reads an area's door table (ends at a door with type 0). */
export function decodeDoorTable(src: ByteStream, at: number, area: number): Door[] {
  const doors: Door[] = [];
  while (at + DOOR_ENTRY_SIZE <= src.length && src.u8(at) !== 0 && doors.length < 0x100) {
    doors.push({
      area,
      number: doors.length,
      type: src.u8(at),
      room: src.u8(at + 1),
      xStart: src.u8(at + 2),
      xEnd: src.u8(at + 3),
      yStart: src.u8(at + 4),
      yEnd: src.u8(at + 5),
      destination: src.u8(at + 6),
      exitX: src.u8(at + 7),
      exitY: src.u8(at + 8),
    });
    at += DOOR_ENTRY_SIZE;
  }
  return doors;
}

/** Encodes a complete door table; `doors` must be indexed by number with no gaps. */
export function encodeDoorTable(doors: Door[]): Uint8Array {
  const bytes = new Uint8Array((doors.length + 1) * DOOR_ENTRY_SIZE);
  doors.forEach((d, i) => {
    bytes.set([d.type, d.room, d.xStart, d.xEnd, d.yStart, d.yEnd, d.destination, d.exitX & 0xff, d.exitY & 0xff], i * DOOR_ENTRY_SIZE);
  });
  return bytes;
}

/** An area connection: door `door` of `area` leads into `destinationArea`. */
export interface AreaConnection {
  area: number;
  door: number;
  destinationArea: number;
}

export function decodeAreaConnections(src: ByteStream, at: number): AreaConnection[] {
  const list: AreaConnection[] = [];
  for (let i = 0; i < 0x1000 && at + 3 <= src.length; i++, at += 3) {
    const area = src.u8(at);
    if (area === 0xff) break;
    list.push({ area, door: src.u8(at + 1), destinationArea: src.u8(at + 2) });
  }
  return list;
}

/** Door bookkeeping used by room edits; the project implements it on top of room assets. */
export interface DoorStore {
  /** All doors of an area including unassigned slots, ordered by number. */
  areaDoors(area: number): Door[];
  /** A door that belongs to a room, if any. */
  get(area: number, number: number): Door | undefined;
  /** Door with that number even if it's unassigned. */
  find(area: number, number: number): Door | undefined;
  roomDoors(area: number, room: number): Door[];
  update(door: Door): void;
  canAdd(area: number): boolean;
  add(area: number, room: number, x: number, y: number): Door;
  remove(area: number, number: number): void;
  destinationOf(door: Door): Door | undefined;
}
