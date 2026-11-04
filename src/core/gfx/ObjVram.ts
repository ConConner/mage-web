import type { SpritesetEntry } from '../model/Sprites';
import { spriteGfxRows } from '../model/Sprites';
import { Palette } from '../model/Palette';
import type { GraphicsSource } from './GraphicsSource';
import { OamFrame, partDimensions, readOamAnimation } from '../model/Oam';
import { PixelBuffer, drawTile } from './PixelBuffer';

const OBJ_VRAM = 0x8000;
const SPRITE_AREA = 0x4000;
const ROW_BYTES = 0x800;

/**
 * Object VRAM for a spriteset: shared sprite graphics in the lower half,
 * each spriteset entry's graphics at `0x4000 + gfxRow * 0x800`, and its
 * palette at row `8 + gfxRow`.
 */
export class ObjVram {
  readonly tiles = new Uint8Array(OBJ_VRAM);
  readonly palette = new Palette(16);
  lut: Uint32Array;
  private readonly frameCache = new Map<string, OamFrame | null>();

  constructor(private readonly src: GraphicsSource, entries: readonly SpritesetEntry[] = []) {
    this.tiles.set(src.commonSpriteGfx().data.subarray(0, OBJ_VRAM - 0x800), 0x800);
    this.palette.copyRows(src.commonSpritePalette(), 0, 2, 6);
    for (const e of entries) this.loadSprite(e.spriteId, e.gfxRow);
    this.lut = this.palette.toRgba();
  }

  loadSprite(spriteId: number, gfxRow: number): void {
    if (gfxRow >= 8) return;
    const sprite = this.src.spriteGraphics(spriteId);
    if (!sprite) return;
    const rows = spriteGfxRows(sprite.gfx.data.length);
    const at = SPRITE_AREA + gfxRow * ROW_BYTES;
    this.tiles.set(sprite.gfx.data.subarray(0, OBJ_VRAM - at), at);
    this.palette.copyRows(sprite.palette, 0, 8 + gfxRow, Math.min(rows, 8 - gfxRow));
    this.lut = this.palette.toRgba();
  }

  /** First animation frame of a sprite, using project overrides first. */
  firstFrame(oamOffset: number | undefined): OamFrame | undefined {
    if (oamOffset === undefined || oamOffset <= 0) return undefined;
    const key = String(oamOffset);
    if (!this.frameCache.has(key)) {
      const frames = readOamAnimation(this.src.rom.data, oamOffset);
      this.frameCache.set(key, frames[0] ?? null);
    }
    return this.frameCache.get(key) ?? undefined;
  }

  /**
   * Draws an OAM frame with its origin at (ox, oy). `gfxRow` shifts tile
   * numbers and palette rows to where the spriteset loaded the graphics.
   */
  drawFrame(dst: PixelBuffer, frame: OamFrame, gfxRow: number, ox: number, oy: number, blend?: (src: number, dst: number) => number): void {
    for (let i = frame.parts.length - 1; i >= 0; i--) {
      const p = frame.parts[i];
      const { width, height } = partDimensions(p);
      const tilesW = width / 8, tilesH = height / 8;
      const baseTile = (p.tile + gfxRow * 64) % 1024;
      const paletteRow = (p.palette + gfxRow) % 16;
      const target = blend ? new PixelBuffer(width, height) : dst;
      const bx = blend ? 0 : ox + p.x, by = blend ? 0 : oy + p.y;
      for (let ty = 0; ty < tilesH; ty++) {
        for (let tx = 0; tx < tilesW; tx++) {
          const col = (baseTile % 32) + tx, row = Math.floor(baseTile / 32) + ty;
          const offset = (row * 0x400 + col * 0x20) % OBJ_VRAM;
          const px = p.hFlip ? width - 8 - tx * 8 : tx * 8;
          const py = p.vFlip ? height - 8 - ty * 8 : ty * 8;
          drawTile(target, this.tiles, offset, this.lut, paletteRow, bx + px, by + py, p.hFlip, p.vFlip);
        }
      }
      if (blend) {
        for (let y = 0; y < height; y++) {
          const dy = oy + p.y + y;
          if (dy < 0 || dy >= dst.height) continue;
          for (let x = 0; x < width; x++) {
            const dx = ox + p.x + x;
            if (dx < 0 || dx >= dst.width) continue;
            const s = target.pixels[y * width + x];
            if (s >>> 24) dst.pixels[dy * dst.width + dx] = blend(s, dst.pixels[dy * dst.width + dx]);
          }
        }
      }
    }
  }
}
