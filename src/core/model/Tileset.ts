import type { Gfx } from './Gfx';
import type { Palette } from './Palette';
import type { AnimPalette, AnimTileset } from './Animation';

export const TILESET_ENTRY_SIZE = 0x14;

/**
 * A tileset as used for rendering, composed from its assets.
 *
 * In ROM a tileset entry (0x14 bytes) is:
 *   +0  ptr  level graphics (LZ77)
 *   +4  ptr  palette (14 rows)
 *   +8  ptr  BG3 graphics (LZ77)
 *   +C  ptr  tile table (u8 2, u8 rows, then rows×64 u16 entries)
 *   +10 u8   animated tileset
 *   +11 u8   animated palette
 *
 * A tile table maps a 16×16 "block" number to four 8×8 tile entries
 * (top-left, top-right, bottom-left, bottom-right) in GBA screen-entry
 * format: `tile:10 | hflip:1 | vflip:1 | palette:4`.
 *
 * The graphics, palette and tile table objects are the assets' own data, so
 * edits made through any editor show up wherever the tileset is drawn.
 */
export class Tileset {
  constructor(
    readonly number: number,
    readonly levelGfx: Gfx,
    readonly palette: Palette,
    readonly bg3Gfx: Gfx,
    readonly tileTable: Uint16Array,
    readonly animTileset: AnimTileset,
    readonly animPalette: AnimPalette,
  ) {}

  /** Number of 16×16 blocks defined by the tile table. */
  get blockCount(): number {
    return this.tileTable.length / 4;
  }
}
