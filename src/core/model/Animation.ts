import type { Rom } from '../rom/Rom';
import { Gfx } from './Gfx';
import { Palette } from './Palette';
import { tableOffset } from './tables';

/** One animated graphics entry: a strip of `frames` 4-tile states. */
export class AnimGfx {
  constructor(
    readonly number: number,
    public type: number,
    public delay: number,
    public frames: number,
    readonly gfx: Gfx,
  ) {}

  static read(rom: Rom, number: number): AnimGfx {
    const at = tableOffset(rom, 'animatedGraphics') + number * 8;
    const d = rom.data;
    const type = d.u8(at);
    const delay = d.u8(at + 1);
    const frames = d.u8(at + 2);
    const gfxOffset = d.ptr(at + 4);
    const gfx = Gfx.readRaw(d, gfxOffset, Math.max(4, 4 * frames), 1);
    return new AnimGfx(number, type, delay, frames, gfx);
  }

  /** The animated energy/missile tank graphics shared by every tileset. */
  static readTank(rom: Rom, index: number): AnimGfx {
    const gfx = Gfx.readRaw(rom.data, rom.game.offsets.tankGfx + index * 0x200, 8, 2);
    return new AnimGfx(-1, 1, 5, 4, gfx);
  }

  /** The 4 tiles (0x80 bytes) shown for animation frame `frame`. */
  frameTiles(frame = 0): Uint8Array {
    const f = this.frames > 0 ? frame % this.frames : 0;
    return this.gfx.data.subarray(f * 0x80, f * 0x80 + 0x80);
  }
}

/** The 16 animated tile slots used by a tileset. */
export class AnimTileset {
  constructor(
    readonly number: number,
    readonly slots: AnimGfx[],
  ) {}

  static read(rom: Rom, number: number): AnimTileset {
    const at = tableOffset(rom, 'animatedTilesets') + number * 0x30;
    const slots: AnimGfx[] = [];
    for (let i = 0; i < 16; i++) slots.push(AnimGfx.read(rom, rom.data.u8(at + i * 3)));
    return new AnimTileset(number, slots);
  }
}

/** A cycling palette row applied to BG palette row 15. */
export class AnimPalette {
  constructor(
    readonly number: number,
    public type: number,
    public delay: number,
    readonly palette: Palette,
  ) {}

  static read(rom: Rom, number: number): AnimPalette {
    const at = tableOffset(rom, 'animatedPalettes') + number * 8;
    const d = rom.data;
    const type = d.u8(at);
    const delay = d.u8(at + 1);
    const rows = d.u8(at + 2);
    const palette = Palette.read(d, d.ptr(at + 4), rows);
    return new AnimPalette(number, type, delay, palette);
  }
}
