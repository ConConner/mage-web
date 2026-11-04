/** A DOM-free RGBA image. `pixels` uses the `0xAABBGGRR` layout of ImageData. */
export class PixelBuffer {
  readonly pixels: Uint32Array;

  constructor(
    readonly width: number,
    readonly height: number,
    pixels?: Uint32Array,
  ) {
    this.pixels = pixels ?? new Uint32Array(width * height);
  }

  fill(color: number): void {
    this.pixels.fill(color);
  }

  fillRect(x: number, y: number, w: number, h: number, color: number): void {
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w), y1 = Math.min(this.height, y + h);
    for (let yy = y0; yy < y1; yy++) this.pixels.fill(color, yy * this.width + x0, yy * this.width + x1);
  }

  /** Bytes suitable for `new ImageData(new Uint8ClampedArray(bytes.buffer), w, h)`. */
  get bytes(): Uint8ClampedArray {
    return new Uint8ClampedArray(this.pixels.buffer, this.pixels.byteOffset, this.pixels.byteLength);
  }

  /** Copies a rectangle of `src` onto this buffer, skipping transparent pixels. */
  blit(src: PixelBuffer, sx: number, sy: number, w: number, h: number, dx: number, dy: number): void {
    for (let y = 0; y < h; y++) {
      const ty = dy + y, fy = sy + y;
      if (ty < 0 || ty >= this.height || fy < 0 || fy >= src.height) continue;
      for (let x = 0; x < w; x++) {
        const tx = dx + x, fx = sx + x;
        if (tx < 0 || tx >= this.width || fx < 0 || fx >= src.width) continue;
        const p = src.pixels[fy * src.width + fx];
        if (p >>> 24) this.pixels[ty * this.width + tx] = p;
      }
    }
  }
}

/**
 * Draws one 8×8 4bpp tile into `dst`.
 * @param lut RGBA lookup table (16 entries per palette row)
 */
export function drawTile(
  dst: PixelBuffer,
  tiles: Uint8Array,
  tileByteOffset: number,
  lut: Uint32Array,
  paletteRow: number,
  dx: number,
  dy: number,
  hFlip: boolean,
  vFlip: boolean,
  transparent = true,
): void {
  const base = paletteRow * 16;
  for (let r = 0; r < 8; r++) {
    const y = dy + (vFlip ? 7 - r : r);
    if (y < 0 || y >= dst.height) continue;
    const row = y * dst.width;
    for (let c = 0; c < 8; c++) {
      const byte = tiles[tileByteOffset + r * 4 + (c >> 1)];
      if (byte === undefined) return;
      const index = c & 1 ? byte >> 4 : byte & 0xf;
      if (index === 0 && transparent) continue;
      const x = dx + (hFlip ? 7 - c : c);
      if (x < 0 || x >= dst.width) continue;
      dst.pixels[row + x] = lut[base + index] | 0xff000000;
    }
  }
}

/** Renders 4bpp graphics as a sheet `widthInTiles` tiles wide using one palette row. */
export function renderGfxSheet(tiles: Uint8Array, widthInTiles: number, lut: Uint32Array, paletteRow: number, opaque = true): PixelBuffer {
  const count = Math.floor(tiles.length / 32);
  const rows = Math.max(1, Math.ceil(count / widthInTiles));
  const out = new PixelBuffer(widthInTiles * 8, rows * 8);
  for (let t = 0; t < count; t++) {
    drawTile(out, tiles, t * 32, lut, paletteRow, (t % widthInTiles) * 8, Math.floor(t / widthInTiles) * 8, false, false, !opaque);
  }
  return out;
}
