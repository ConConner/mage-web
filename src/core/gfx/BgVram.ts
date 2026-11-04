import type { GraphicsSource } from './GraphicsSource';
import type { Tileset } from '../model/Tileset';
import { Gfx } from '../model/Gfx';
import { Palette } from '../model/Palette';
import { AnimGfx } from '../model/Animation';
import { PixelBuffer, drawTile } from './PixelBuffer';

export interface BgVramOptions {
  /** Apply the tileset's animated palette to row 15. */
  animatedPalette: boolean;
  /** (MF) Use the Main Deck "mother ship" hatch graphics. */
  motherShipHatches: boolean;
}

export const DEFAULT_BG_VRAM_OPTIONS: BgVramOptions = { animatedPalette: true, motherShipHatches: false };

const VRAM_SIZE = 0xc000;
const LEVEL_GFX_AT = 0x1800;
const BG3_GFX_END = 0xbde0;
const GENERIC_GFX_AT = 0x800;

/** The generic BG graphics (hatches, breakable blocks, tanks) with real tank graphics patched in. */
export function genericBgGfx(src: GraphicsSource, motherShip = false): Gfx {
  const gfx = src.commonBgGfx(motherShip).clone();
  const rom = src.rom;
  const [tanks, at] = rom.game.isMF ? [3, 0x200] : [4, 0x20];
  for (let i = 0; i < tanks; i++) gfx.data.set(AnimGfx.readTank(rom, i).gfx.data.subarray(0, 0x80), at + i * 0x80);
  return gfx;
}

export function genericBgPalette(src: GraphicsSource, motherShip = false): Palette {
  const p = src.commonBgPalette(motherShip).clone();
  p.set(0, 0, 0);
  return p;
}

/**
 * Reconstructs background VRAM as the game sets it up for a room:
 *   0x0000  16 animated tile slots (0x80 each)
 *   0x0800  generic graphics
 *   0x1800  level graphics
 *   ....    BG3 graphics, ending at 0xBDE0
 * and the 16-row BG palette (rows 0-2 generic, 3-15 from the tileset).
 */
export class BgVram {
  readonly tiles = new Uint8Array(VRAM_SIZE);
  readonly palette = new Palette(16);
  lut: Uint32Array;

  constructor(
    src: GraphicsSource,
    readonly tileset: Tileset,
    readonly options: BgVramOptions = DEFAULT_BG_VRAM_OPTIONS,
  ) {
    const t = this.tiles;
    t.set(tileset.levelGfx.data.subarray(0, VRAM_SIZE - LEVEL_GFX_AT), LEVEL_GFX_AT);
    const bg3 = tileset.bg3Gfx.data.subarray(0, BG3_GFX_END);
    t.set(bg3, BG3_GFX_END - bg3.length);
    t.set(genericBgGfx(src, options.motherShipHatches).data.subarray(0, 0x1000), GENERIC_GFX_AT);
    tileset.animTileset.slots.forEach((slot, i) => t.set(slot.frameTiles(0), i * 0x80));
    t.copyWithin(BG3_GFX_END, 0x600, 0x800);

    this.palette.copyRows(tileset.palette, 1, 3, 13);
    this.palette.copyRows(genericBgPalette(src, options.motherShipHatches), 0, 0, 3);
    if (tileset.animPalette.type !== 0 && options.animatedPalette) this.palette.copyRows(tileset.animPalette.palette, 0, 15, 1);
    this.lut = this.palette.toRgba();
  }

  /** Re-derives the color lookup after palette edits. */
  refreshPalette(): void {
    this.lut = this.palette.toRgba();
  }

  /** Draws a 16×16 block (4 tile-table entries) at (dx, dy). */
  drawBlock(dst: PixelBuffer, block: number, dx: number, dy: number, tileTable = this.tileset.tileTable): void {
    for (let i = 0; i < 4; i++) {
      const entry = tileTable[block * 4 + i];
      if (entry === undefined) return;
      drawTile(dst, this.tiles, (entry & 0x3ff) * 0x20, this.lut, entry >> 12, dx + (i & 1) * 8, dy + (i >> 1) * 8, (entry & 0x400) !== 0, (entry & 0x800) !== 0);
    }
  }

  /** All blocks of the tile table arranged 16 per row. */
  renderBlockSheet(): PixelBuffer {
    const count = this.tileset.blockCount;
    const out = new PixelBuffer(256, Math.ceil(count / 16) * 16);
    for (let b = 0; b < count; b++) this.drawBlock(out, b, (b % 16) * 16, Math.floor(b / 16) * 16);
    return out;
  }

  /** Renders an LZ77 tilemap (screen blocks of 32×32 tiles). Tile numbers are offset by 0x200. */
  renderTileMap(map: Uint16Array, size: number): PixelBuffer {
    const w = size === 1 ? 64 : 32;
    const h = size === 2 ? 64 : 32;
    const out = new PixelBuffer(w * 8, h * 8);
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        // Each 32×32 screen block is stored contiguously.
        const blockIndex = (tx >> 5) + (ty >> 5);
        const entry = map[blockIndex * 0x400 + (ty & 31) * 32 + (tx & 31)];
        if (entry === undefined) continue;
        drawTile(out, this.tiles, ((entry & 0x3ff) + 0x200) * 0x20, this.lut, entry >> 12, tx * 8, ty * 8, (entry & 0x400) !== 0, (entry & 0x800) !== 0);
      }
    }
    return out;
  }
}
