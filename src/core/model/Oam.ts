import type { ByteStream } from '../io/ByteStream';

/** Sizes of GBA OBJ shapes, indexed by `shape * 4 + size`. */
const OBJ_DIMENSIONS: ReadonlyArray<readonly [number, number]> = [
  [8, 8], [16, 16], [32, 32], [64, 64],
  [16, 8], [32, 8], [32, 16], [64, 32],
  [8, 16], [8, 32], [16, 32], [32, 64],
];

/** One hardware sprite piece of an animation frame. */
export interface OamPart {
  x: number;
  y: number;
  shape: number;
  size: number;
  hFlip: boolean;
  vFlip: boolean;
  tile: number;
  palette: number;
}

export interface OamFrame {
  duration: number;
  parts: OamPart[];
}

export function partDimensions(p: Pick<OamPart, 'shape' | 'size'>): { width: number; height: number } {
  const d = OBJ_DIMENSIONS[p.shape * 4 + p.size] ?? [8, 8];
  return { width: d[0], height: d[1] };
}

export function decodePart(attr0: number, attr1: number, attr2: number): OamPart {
  let y = attr0 & 0xff;
  if (y >= 128) y -= 256;
  let x = attr1 & 0x1ff;
  if (x >= 256) x -= 512;
  return {
    x,
    y,
    shape: attr0 >> 14,
    size: attr1 >> 14,
    hFlip: ((attr1 >> 12) & 1) !== 0,
    vFlip: ((attr1 >> 13) & 1) !== 0,
    tile: attr2 & 0x3ff,
    palette: attr2 >> 12,
  };
}

export function encodePart(p: OamPart): [number, number, number] {
  const attr0 = ((p.y + 256) & 0xff) | ((p.shape & 3) << 14);
  const attr1 = ((p.x + 512) & 0x1ff) | (p.hFlip ? 1 << 12 : 0) | (p.vFlip ? 1 << 13 : 0) | ((p.size & 3) << 14);
  const attr2 = (p.tile & 0x3ff) | ((p.palette & 0xf) << 12);
  return [attr0, attr1, attr2];
}

/** Bounding box of a frame relative to the sprite origin. */
export function frameBounds(frame: OamFrame): { x: number; y: number; width: number; height: number } {
  if (frame.parts.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of frame.parts) {
    const { width, height } = partDimensions(p);
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + width);
    y1 = Math.max(y1, p.y + height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const MAX_FRAMES = 0x200;

/**
 * Reads an animation: a list of `{ ptr parts, u16 duration, u16 pad }`
 * entries terminated by a zero duration. Each parts block starts with a
 * u16 count followed by `count` OBJ attribute triples.
 */
export function readOamAnimation(data: ByteStream, offset: number): OamFrame[] {
  const frames: OamFrame[] = [];
  for (let at = offset; frames.length < MAX_FRAMES; at += 8) {
    if (at + 8 > data.length) break;
    const duration = data.u16(at + 4);
    if (duration === 0) break;
    const partsAt = data.ptr(at);
    if (partsAt < 0 || partsAt >= data.length) break;
    const count = data.u16(partsAt);
    const parts: OamPart[] = [];
    for (let i = 0; i < count && i < 128; i++) {
      const p = partsAt + 2 + i * 6;
      parts.push(decodePart(data.u16(p), data.u16(p + 2), data.u16(p + 4)));
    }
    frames.push({ duration, parts });
  }
  return frames;
}
