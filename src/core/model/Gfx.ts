import type { ByteStream } from '../io/ByteStream';
import { compressLz77, decompressLz77, lz77DecompressedSize } from '../compression/lz77';

export const TILE_BYTES = 0x20;

/**
 * 4bpp tile graphics (8×8 tiles, 32 bytes each, two pixels per byte with the
 * low nibble on the left), always held uncompressed. `widthInTiles` is only
 * a layout hint for display.
 */
export class Gfx {
  data: Uint8Array;
  widthInTiles: number;

  constructor(data: Uint8Array, widthInTiles = 32) {
    this.data = data;
    this.widthInTiles = widthInTiles;
  }

  static readRaw(data: ByteStream, offset: number, widthInTiles: number, heightInTiles: number): Gfx {
    return new Gfx(data.slice(offset, widthInTiles * heightInTiles * TILE_BYTES), widthInTiles);
  }

  /** Decompresses LZ77 graphics. Returns the graphics and the compressed length. */
  static readCompressed(data: ByteStream, offset: number, widthInTiles = 32): { gfx: Gfx; length: number } {
    if (offset < 0 || offset >= data.length || data.u8(offset) !== 0x10) throw new Error('not LZ77 data');
    if (lz77DecompressedSize(data.raw, offset) > 0x100000) throw new Error('LZ77 data too large');
    const { data: out, compressedLength } = decompressLz77(data.raw, offset);
    return { gfx: new Gfx(out, widthInTiles), length: compressedLength };
  }

  /** Reads compressed graphics, returning empty graphics if the data is corrupt. */
  static tryReadCompressed(data: ByteStream, offset: number, widthInTiles = 32): Gfx {
    try {
      return Gfx.readCompressed(data, offset, widthInTiles).gfx;
    } catch {
      return new Gfx(new Uint8Array(0), widthInTiles);
    }
  }

  get tileCount(): number {
    return Math.floor(this.data.length / TILE_BYTES);
  }

  get heightInTiles(): number {
    return Math.max(1, Math.ceil(this.tileCount / this.widthInTiles));
  }

  get pixelWidth(): number {
    return this.widthInTiles * 8;
  }

  get pixelHeight(): number {
    return this.heightInTiles * 8;
  }

  private indexOf(x: number, y: number): number {
    const tile = Math.floor(y / 8) * this.widthInTiles + Math.floor(x / 8);
    return tile * TILE_BYTES + (y % 8) * 4 + ((x % 8) >> 1);
  }

  getPixel(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.pixelWidth || y >= this.pixelHeight) return -1;
    const i = this.indexOf(x, y);
    if (i >= this.data.length) return -1;
    return x % 2 === 0 ? this.data[i] & 0xf : this.data[i] >> 4;
  }

  setPixel(x: number, y: number, value: number): void {
    if (value < 0 || x < 0 || y < 0 || x >= this.pixelWidth || y >= this.pixelHeight) return;
    const i = this.indexOf(x, y);
    if (i >= this.data.length) return;
    const v = value & 0xf;
    this.data[i] = x % 2 === 0 ? (this.data[i] & 0xf0) | v : (this.data[i] & 0x0f) | (v << 4);
  }

  clone(): Gfx {
    return new Gfx(this.data.slice(), this.widthInTiles);
  }

  encodeLz77(): Uint8Array {
    return compressLz77(this.data);
  }
}
