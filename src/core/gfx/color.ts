/**
 * Color conversions between the GBA's 15-bit BGR555 format and the 32-bit
 * RGBA pixels used for rendering (stored as little-endian `0xAABBGGRR`
 * words so a `Uint32Array` view maps directly onto `ImageData`).
 */

export type Rgba32 = number;

const expand5 = (v: number) => (v << 3) | (v >> 2);

export function gbaToRgb(color: number): { r: number; g: number; b: number } {
  return {
    r: expand5(color & 0x1f),
    g: expand5((color >> 5) & 0x1f),
    b: expand5((color >> 10) & 0x1f),
  };
}

export function rgbToGba(r: number, g: number, b: number): number {
  return ((r >> 3) & 0x1f) | (((g >> 3) & 0x1f) << 5) | (((b >> 3) & 0x1f) << 10);
}

/** Opaque RGBA word for a GBA color. */
export function gbaToRgba32(color: number): Rgba32 {
  const r = expand5(color & 0x1f);
  const g = expand5((color >> 5) & 0x1f);
  const b = expand5((color >> 10) & 0x1f);
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function rgba32(r: number, g: number, b: number, a = 255): Rgba32 {
  return (((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;
}

export function gbaToHex(color: number): string {
  const { r, g, b } = gbaToRgb(color);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function hexToGba(hex: string): number | undefined {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return undefined;
  return rgbToGba(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
}

/**
 * GBA-style alpha blending (BLDALPHA): `src * eva/16 + dst * evb/16`,
 * clamped per channel, operating on 5-bit components.
 */
export function blendRgba32(src: Rgba32, dst: Rgba32, eva: number, evb: number): Rgba32 {
  const ch = (shift: number) => {
    const s = ((src >>> shift) & 0xff) >> 3;
    const d = ((dst >>> shift) & 0xff) >> 3;
    return expand5(Math.min(31, ((s * eva) >> 4) + ((d * evb) >> 4)));
  };
  return ((0xff << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}

/** Simple averaging used to preview semi-transparent sprites. */
export function averageRgba32(a: Rgba32, b: Rgba32): Rgba32 {
  const ch = (shift: number) => ((((a >>> shift) & 0xff) + ((b >>> shift) & 0xff)) >> 1) & 0xff;
  return ((0xff << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}
