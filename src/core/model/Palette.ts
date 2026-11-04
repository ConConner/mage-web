import type { ByteStream } from '../io/ByteStream';
import { gbaToRgba32, Rgba32 } from '../gfx/color';

/** A set of 16-color palette rows holding raw BGR555 values. */
export class Palette {
  readonly colors: Uint16Array;

  constructor(rows: number, colors?: Uint16Array) {
    this.colors = colors ?? new Uint16Array(rows * 16);
  }

  static read(data: ByteStream, offset: number, rows: number): Palette {
    const p = new Palette(rows);
    for (let i = 0; i < rows * 16; i++) p.colors[i] = data.u16(offset + i * 2) & 0x7fff;
    return p;
  }

  get rows(): number {
    return this.colors.length / 16;
  }

  get(row: number, index: number): number {
    if (row < 0 || row >= this.rows || index < 0 || index > 15) return 0;
    return this.colors[row * 16 + index];
  }

  set(row: number, index: number, color: number): void {
    if (row < 0 || row >= this.rows || index < 0 || index > 15) return;
    this.colors[row * 16 + index] = color & 0x7fff;
  }

  /** Copies `count` rows from `src` starting at `srcRow` into `dstRow`. */
  copyRows(src: Palette, srcRow: number, dstRow: number, count: number): void {
    for (let r = 0; r < count; r++) {
      if (srcRow + r >= src.rows || dstRow + r >= this.rows) break;
      this.colors.set(src.colors.subarray((srcRow + r) * 16, (srcRow + r + 1) * 16), (dstRow + r) * 16);
    }
  }

  clone(): Palette {
    return new Palette(this.rows, this.colors.slice());
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.colors.length * 2);
    for (let i = 0; i < this.colors.length; i++) {
      out[i * 2] = this.colors[i] & 0xff;
      out[i * 2 + 1] = this.colors[i] >> 8;
    }
    return out;
  }

  write(data: ByteStream, offset: number): void {
    data.set(offset, this.toBytes());
  }

  /**
   * Converts to a lookup table of RGBA words. Index 0 of every row is
   * transparent unless `opaque` is set, matching hardware behavior.
   */
  toRgba(opaque = false): Uint32Array {
    const lut = new Uint32Array(this.colors.length);
    for (let i = 0; i < this.colors.length; i++) {
      lut[i] = !opaque && i % 16 === 0 ? 0 : gbaToRgba32(this.colors[i]);
    }
    return lut;
  }

  rgbaAt(row: number, index: number): Rgba32 {
    return gbaToRgba32(this.get(row, index));
  }
}
