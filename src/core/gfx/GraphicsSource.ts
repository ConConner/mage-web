import type { Rom } from '../rom/Rom';
import type { Gfx } from '../model/Gfx';
import type { Palette } from '../model/Palette';

/**
 * Where renderers get shared graphics from. A project implements this with
 * its assets; data that isn't an asset yet (OAM, animated tiles, tank
 * graphics, mother ship variants) is read from the base ROM.
 */
export interface GraphicsSource {
  /** The base ROM. Read only. */
  readonly rom: Rom;
  /** Generic BG graphics (hatches, breakable blocks, tanks), 0x1000 bytes. */
  commonBgGfx(motherShip: boolean): Gfx;
  /** Generic BG palette, 3 rows. */
  commonBgPalette(motherShip: boolean): Palette;
  commonSpriteGfx(): Gfx;
  /** Generic sprite palette, 6 rows. */
  commonSpritePalette(): Palette;
  /** Decompressed graphics and palette of a primary sprite. */
  spriteGraphics(spriteId: number): { gfx: Gfx; palette: Palette } | undefined;
}
