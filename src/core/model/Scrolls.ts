import type { ByteStream } from '../io/ByteStream';

export const NONE = 0xff;

/**
 * A camera scroll region (8 bytes). When the block at (xBreak, yBreak) is
 * destroyed, the side selected by `extend` (0 left, 1 right, 2 top,
 * 3 bottom; 0xFF = none) is moved to `newBound`.
 */
export interface Scroll {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  xBreak: number;
  yBreak: number;
  extend: number;
  newBound: number;
}

/** Handle on a scroll used for hit-testing and dragging. */
export type ScrollHandle = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'extension' | 'break';

export function newScroll(x: number, y: number): Scroll {
  return { xStart: x, xEnd: x + 1, yStart: y, yEnd: y + 1, xBreak: NONE, yBreak: NONE, extend: NONE, newBound: NONE };
}

/** Bounds (in blocks) of the area a scroll can extend into. */
export function scrollExtensionRect(s: Scroll): { x: number; y: number; w: number; h: number } | undefined {
  switch (s.extend) {
    case 0: return { x: s.newBound, y: s.yStart, w: s.xStart - s.newBound, h: s.yEnd - s.yStart + 1 };
    case 1: return { x: s.xEnd + 1, y: s.yStart, w: s.newBound - s.xEnd, h: s.yEnd - s.yStart + 1 };
    case 2: return { x: s.xStart, y: s.newBound, w: s.xEnd - s.xStart + 1, h: s.yStart - s.newBound };
    case 3: return { x: s.xStart, y: s.yEnd + 1, w: s.xEnd - s.xStart + 1, h: s.newBound - s.yEnd };
    default: return undefined;
  }
}

export function findScrollHandle(scrolls: Scroll[], x: number, y: number): { index: number; handle: ScrollHandle } | undefined {
  for (let i = 0; i < scrolls.length; i++) {
    const s = scrolls[i];
    if (x === s.xStart && y === s.yStart) return { index: i, handle: 'topLeft' };
    if (x === s.xEnd && y === s.yStart) return { index: i, handle: 'topRight' };
    if (x === s.xStart && y === s.yEnd) return { index: i, handle: 'bottomLeft' };
    if (x === s.xEnd && y === s.yEnd) return { index: i, handle: 'bottomRight' };
    if (s.extend !== NONE) {
      if (s.extend <= 1 && x === s.newBound && (y === s.yStart || y === s.yEnd)) return { index: i, handle: 'extension' };
      if (s.extend >= 2 && y === s.newBound && (x === s.xStart || x === s.xEnd)) return { index: i, handle: 'extension' };
      if (x === s.xBreak && y === s.yBreak) return { index: i, handle: 'break' };
    }
  }
  return undefined;
}

/** Returns a copy of `s` with `handle` dragged to (x, y), or `s` unchanged if invalid. */
export function moveScrollHandle(s: Scroll, handle: ScrollHandle, x: number, y: number): Scroll {
  const c = { ...s };
  switch (handle) {
    case 'topLeft':
      if (x >= s.xEnd || y >= s.yEnd) return s;
      if ((s.extend === 0 && x <= s.newBound) || (s.extend === 2 && y <= s.newBound)) return s;
      c.xStart = x;
      c.yStart = y;
      break;
    case 'topRight':
      if (x <= s.xStart || y >= s.yEnd) return s;
      if ((s.extend === 1 && x >= s.newBound) || (s.extend === 2 && y <= s.newBound)) return s;
      c.xEnd = x;
      c.yStart = y;
      break;
    case 'bottomLeft':
      if (x >= s.xEnd || y <= s.yStart) return s;
      if ((s.extend === 0 && x <= s.newBound) || (s.extend === 3 && y >= s.newBound)) return s;
      c.xStart = x;
      c.yEnd = y;
      break;
    case 'bottomRight':
      if (x <= s.xStart || y <= s.yStart) return s;
      if ((s.extend === 1 && x >= s.newBound) || (s.extend === 3 && y >= s.newBound)) return s;
      c.xEnd = x;
      c.yEnd = y;
      break;
    case 'extension':
      if (s.extend === 0 && x < s.xStart) c.newBound = x;
      else if (s.extend === 1 && x > s.xEnd) c.newBound = x;
      else if (s.extend === 2 && y < s.yStart) c.newBound = y;
      else if (s.extend === 3 && y > s.yEnd) c.newBound = y;
      else return s;
      break;
    case 'break':
      c.xBreak = x;
      c.yBreak = y;
      break;
  }
  return c;
}

export const SCROLL_SIZE = 8;

export function scrollsEqual(a: Scroll[], b: Scroll[]): boolean {
  return a.length === b.length && a.every((s, i) => encodeScroll(s).every((v, j) => v === encodeScroll(b[i])[j]));
}

const encodeScroll = (s: Scroll) => [s.xStart, s.xEnd, s.yStart, s.yEnd, s.xBreak, s.yBreak, s.extend, s.newBound];

/** One room's scroll entry: `u8 room, u8 count, Scroll[count]`. */
export interface ScrollEntry {
  room: number;
  offset: number;
  length: number;
  scrolls: Scroll[];
}

/**
 * Reads an area's scroll list: pointers to entries, terminated by a pointer
 * to an entry whose room is 0xFF.
 */
export function decodeScrollList(src: ByteStream, listAt: number): { entries: ScrollEntry[]; terminator: number; listLength: number } {
  const entries: ScrollEntry[] = [];
  for (let i = 0; i < 0x100; i++, listAt += 4) {
    const at = src.ptr(listAt);
    if (at < 0 || at + 2 > src.length) break;
    const room = src.u8(at);
    if (room === 0xff) return { entries, terminator: at, listLength: (i + 1) * 4 };
    const count = src.u8(at + 1);
    const scrolls: Scroll[] = [];
    for (let k = 0; k < count; k++) {
      const p = at + 2 + k * SCROLL_SIZE;
      scrolls.push({
        xStart: src.u8(p),
        xEnd: src.u8(p + 1),
        yStart: src.u8(p + 2),
        yEnd: src.u8(p + 3),
        xBreak: src.u8(p + 4),
        yBreak: src.u8(p + 5),
        extend: src.u8(p + 6),
        newBound: src.u8(p + 7),
      });
    }
    entries.push({ room, offset: at, length: 2 + count * SCROLL_SIZE, scrolls });
  }
  return { entries, terminator: src.ptr(listAt), listLength: entries.length * 4 + 4 };
}

export function encodeScrollEntry(room: number, scrolls: Scroll[]): Uint8Array {
  const out = new Uint8Array(2 + scrolls.length * SCROLL_SIZE);
  out[0] = room;
  out[1] = scrolls.length;
  scrolls.forEach((s, i) => out.set(encodeScroll(s), 2 + i * SCROLL_SIZE));
  return out;
}
