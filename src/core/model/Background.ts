import { ByteStream } from '../io/ByteStream';
import { compressRle, decompressRle } from '../compression/rle';
import { compressLz77, decompressLz77 } from '../compression/lz77';

export enum Layer {
  BG0 = 0,
  BG1 = 1,
  BG2 = 2,
  BG3 = 3,
  Clip = 4,
}

export const LAYER_NAMES = ['BG 0', 'BG 1', 'BG 2', 'BG 3', 'Clipdata'] as const;

export const MAX_ROOM_AREA = 0x1800;

/** Property bits in the room header describing how a layer is stored. */
export const BgProp = { RLE: 0x10, LZ77: 0x40 } as const;

export type BackgroundFormat = 'rle' | 'lz77' | 'none';

export class CorruptLayerError extends Error {}

/**
 * One room layer as the editor sees it.
 *
 * RLE layers (BG0-2, clipdata) are block maps: `width × height` u16 values
 * (block numbers, or clipdata values). LZ77 layers (BG3, optionally BG0)
 * are GBA tilemaps of one or two 32×32 screen blocks, tiled across the
 * room when drawn; their data lives in a shared tilemap asset.
 */
export class Background {
  readonly layer: Layer;
  format: BackgroundFormat;
  width = 0;
  height = 0;
  /** Row-major block map for RLE layers. */
  blocks: Uint16Array = new Uint16Array(0);
  /** LZ77 tilemap layout: 0 = 32×32, 1 = 64×32, 2 = 32×64 tiles. */
  size = 0;
  /** LZ77 tilemap entries. */
  tileMap: Uint16Array = new Uint16Array(0);

  constructor(layer: Layer, format: BackgroundFormat) {
    this.layer = layer;
    this.format = format;
  }

  static blockMap(layer: Layer, width: number, height: number, blocks?: Uint16Array): Background {
    const bg = new Background(layer, 'rle');
    bg.width = width;
    bg.height = height;
    bg.blocks = blocks ?? new Uint16Array(width * height);
    return bg;
  }

  /** Decodes an RLE block map (`u8 w, u8 h, RLE data`). Returns the layer and its stored length. */
  static decodeRle(src: Uint8Array, offset: number, layer: Layer): { bg: Background; length: number } {
    if (offset < 0 || offset + 2 >= src.length) throw new CorruptLayerError('pointer out of range');
    const w = src[offset];
    const h = src[offset + 1];
    if (w === 0 || h === 0 || w * h > MAX_ROOM_AREA) throw new CorruptLayerError(`invalid size ${w}×${h}`);
    const { data, compressedLength } = decompressRle(src, offset + 2, w * h * 2);
    const blocks = new Uint16Array(w * h);
    for (let i = 0; i < blocks.length; i++) blocks[i] = data[i * 2] | (data[i * 2 + 1] << 8);
    return { bg: Background.blockMap(layer, w, h, blocks), length: compressedLength + 2 };
  }

  /** Decodes an LZ77 tilemap (`u32 size, LZ77 data`). */
  static decodeTileMap(src: Uint8Array, offset: number): { size: number; entries: Uint16Array; length: number } {
    if (offset < 0 || offset + 4 >= src.length) throw new CorruptLayerError('pointer out of range');
    const size = (src[offset] | (src[offset + 1] << 8) | (src[offset + 2] << 16) | (src[offset + 3] << 24)) >>> 0;
    const { data, compressedLength } = decompressLz77(src, offset + 4);
    const entries = new Uint16Array(data.length >> 1);
    for (let i = 0; i < entries.length; i++) entries[i] = data[i * 2] | (data[i * 2 + 1] << 8);
    return { size, entries, length: compressedLength + 4 };
  }

  static encodeTileMap(size: number, entries: Uint16Array): Uint8Array {
    const raw = new Uint8Array(entries.length * 2);
    for (let i = 0; i < entries.length; i++) {
      raw[i * 2] = entries[i] & 0xff;
      raw[i * 2 + 1] = entries[i] >> 8;
    }
    const comp = compressLz77(raw);
    const out = new ByteStream(comp.length + 4);
    out.writeU32(size >>> 0);
    out.writeBytes(comp);
    return out.bytes.slice();
  }

  get exists(): boolean {
    return this.format !== 'none';
  }

  get isRle(): boolean {
    return this.format === 'rle';
  }

  get isLz77(): boolean {
    return this.format === 'lz77';
  }

  /** Tilemap dimensions in 8×8 tiles for LZ77 layers. */
  get tileMapSize(): { width: number; height: number } {
    if ((this.size & 3) === 1) return { width: 64, height: 32 };
    if ((this.size & 3) === 2) return { width: 32, height: 64 };
    return { width: 32, height: 32 };
  }

  get(x: number, y: number): number {
    return this.blocks[y * this.width + x];
  }

  set(x: number, y: number, value: number): void {
    this.blocks[y * this.width + x] = value;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  clear(): void {
    this.blocks.fill(0);
  }

  /** Resizes the block map, keeping existing blocks at the top-left. */
  resize(width: number, height: number): void {
    const fill = this.exists ? 0 : 0xffff;
    const next = new Uint16Array(width * height).fill(fill);
    for (let y = 0; y < Math.min(height, this.height); y++) {
      for (let x = 0; x < Math.min(width, this.width); x++) next[y * width + x] = this.blocks[y * this.width + x];
    }
    this.blocks = next;
    this.width = width;
    this.height = height;
  }

  clone(): Background {
    const c = new Background(this.layer, this.format);
    Object.assign(c, this, { blocks: this.blocks.slice(), tileMap: this.tileMap.slice() });
    return c;
  }

  equals(o: Background): boolean {
    return this.format === o.format && this.width === o.width && this.height === o.height && equalU16(this.blocks, o.blocks);
  }

  /** RLE encoding as stored in ROM (`u8 w, u8 h, data`). */
  encodeRle(): Uint8Array {
    const raw = new Uint8Array(this.blocks.length * 2);
    for (let i = 0; i < this.blocks.length; i++) {
      raw[i * 2] = this.blocks[i] & 0xff;
      raw[i * 2 + 1] = this.blocks[i] >> 8;
    }
    const comp = compressRle(raw);
    const out = new Uint8Array(comp.length + 2);
    out[0] = this.width;
    out[1] = this.height;
    out.set(comp, 2);
    return out;
  }
}

export function equalU16(a: Uint16Array, b: Uint16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
