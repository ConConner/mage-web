import type { Room } from '../model/Room';
import { Layer } from '../model/Background';
import { spriteSlot } from '../model/Sprites';
import { BgVram, BgVramOptions, DEFAULT_BG_VRAM_OPTIONS } from './BgVram';
import { ObjVram } from './ObjVram';
import { PixelBuffer } from './PixelBuffer';
import { averageRgba32, blendRgba32 } from './color';

export interface RoomViewOptions {
  /** Visible layers, indexed BG0..BG3. */
  showLayer: [boolean, boolean, boolean, boolean];
  showSprites: boolean;
  /** Which of the room's sprite lists to display (0-2). */
  spriteSet: number;
  /** Backdrop shown behind BG3 (RGBA word). */
  backdrop: number;
}

export const DEFAULT_VIEW_OPTIONS: RoomViewOptions = {
  showLayer: [true, true, true, true],
  showSprites: true,
  spriteSet: 0,
  backdrop: 0xff000000,
};

/** Layering and alpha derived from the header's transparency value. */
export interface BlendInfo {
  /** The layer drawn directly beneath BG0 (1, 2 or 3). */
  layerUnderBg0: number;
  /** Weight of BG0 (0-16). */
  eva: number;
  /** Weight of what's beneath BG0 (0-16). */
  evb: number;
  /** Whether BG0 is alpha blended at all. */
  blended: boolean;
}

export function blendInfo(transparency: number): BlendInfo {
  let layerUnderBg0 = 1;
  if (transparency >= 4 && transparency < 0x34) layerUnderBg0 = [1, 2, 2, 3][transparency % 4];
  let evb = 16;
  let eva = 0;
  if (transparency >= 8 && transparency < 0x18) {
    eva = 7 + Math.floor((transparency - 8) / 4) * 3;
  } else if (transparency >= 0x18 && transparency < 0x34) {
    evb = [0, 3, 6, 9, 11, 13, 16][Math.floor((transparency - 0x18) / 4)];
    eva = 16 - evb;
  }
  return { layerUnderBg0, eva, evb, blended: transparency >= 8 };
}

/** Back-to-front drawing order; 'sprites' marks where sprites are composited. */
export function layerOrder(info: BlendInfo): (Layer | 'sprites')[] {
  switch (info.layerUnderBg0) {
    case 3: return [Layer.BG3, Layer.BG0, Layer.BG2, Layer.BG1, 'sprites'];
    case 2: return [Layer.BG3, Layer.BG2, Layer.BG0, Layer.BG1, 'sprites'];
    default: return [Layer.BG3, Layer.BG2, Layer.BG1, 'sprites', Layer.BG0];
  }
}

export interface BlockRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Renders a room into a pixel buffer. Holds the VRAM state and cached
 * tilemap/block images; call `invalidateGraphics` after graphics, palette or
 * tile table edits.
 */
export class RoomRenderer {
  bgVram: BgVram;
  private objVrams: (ObjVram | undefined)[] = [];
  private blockSheet?: PixelBuffer;
  private tileMaps = new Map<Layer, PixelBuffer>();
  readonly buffer: PixelBuffer;

  constructor(
    readonly room: Room,
    private vramOptions: BgVramOptions = DEFAULT_BG_VRAM_OPTIONS,
  ) {
    this.bgVram = new BgVram(room.source, room.tileset, vramOptions);
    this.buffer = new PixelBuffer(room.width * 16, room.height * 16);
  }

  invalidateGraphics(vramOptions = this.vramOptions): void {
    this.vramOptions = vramOptions;
    this.bgVram = new BgVram(this.room.source, this.room.tileset, vramOptions);
    this.blockSheet = undefined;
    this.tileMaps.clear();
  }

  invalidateSprites(): void {
    this.objVrams = [];
  }

  get blocks(): PixelBuffer {
    return (this.blockSheet ??= this.bgVram.renderBlockSheet());
  }

  objVram(set: number): ObjVram {
    return (this.objVrams[set] ??= new ObjVram(this.room.source, this.room.spritesets[set]?.entries));
  }

  private tileMap(layer: Layer): PixelBuffer | undefined {
    const bg = this.room.layer(layer);
    if (!bg.isLz77 || bg.tileMap.length === 0) return undefined;
    let img = this.tileMaps.get(layer);
    if (!img) {
      img = this.bgVram.renderTileMap(bg.tileMap, bg.size);
      this.tileMaps.set(layer, img);
    }
    return img;
  }

  /** Renders the whole room, or only `region` (in blocks) of it. */
  render(options: RoomViewOptions, region?: BlockRect): PixelBuffer {
    const room = this.room;
    const r = clampRect(region ?? { x: 0, y: 0, w: room.width, h: room.height }, room.width, room.height);
    const px = { x: r.x * 16, y: r.y * 16, w: r.w * 16, h: r.h * 16 };
    this.buffer.fillRect(px.x, px.y, px.w, px.h, options.backdrop);

    const info = blendInfo(room.header.transparency);
    for (const step of layerOrder(info)) {
      if (step === 'sprites') {
        if (options.showSprites) this.drawSprites(options.spriteSet, px);
        continue;
      }
      if (!options.showLayer[step as 0 | 1 | 2 | 3]) continue;
      const bg = room.layer(step);
      if (!bg.exists) continue;
      if (step === Layer.BG3) this.drawTiled(step, px, 32, false, info);
      else if (step === Layer.BG0 && bg.isLz77) {
        if (room.header.effectY !== 0xff) this.drawLiquid(px, info);
        else this.drawTiled(step, px, 0, info.blended, info);
      } else this.drawBlocks(step, r, step === Layer.BG0 && info.blended ? info : undefined);
    }
    return this.buffer;
  }

  private drawBlocks(layer: Layer, r: BlockRect, blend?: BlendInfo): void {
    const bg = this.room.layer(layer);
    const sheet = this.blocks;
    const count = this.room.tileset.blockCount;
    const dst = this.buffer;
    for (let by = r.y; by < r.y + r.h; by++) {
      for (let bx = r.x; bx < r.x + r.w; bx++) {
        const block = bg.get(bx, by);
        if (block === 0 || block >= count) continue;
        const sx = (block % 16) * 16, sy = Math.floor(block / 16) * 16;
        for (let y = 0; y < 16; y++) {
          const srcRow = (sy + y) * sheet.width + sx;
          const dstRow = (by * 16 + y) * dst.width + bx * 16;
          for (let x = 0; x < 16; x++) {
            const p = sheet.pixels[srcRow + x];
            if (!(p >>> 24)) continue;
            dst.pixels[dstRow + x] = blend ? blendRgba32(p, dst.pixels[dstRow + x], blend.eva, blend.evb) : p;
          }
        }
      }
    }
  }

  /**
   * Tiles an LZ77 layer across the region. BG3 is shifted up by `yShift`
   * pixels so it lines up with the room's 2 block border.
   */
  private drawTiled(layer: Layer, px: { x: number; y: number; w: number; h: number }, yShift: number, blended: boolean, info: BlendInfo): void {
    const img = this.tileMap(layer);
    if (!img) return;
    const dst = this.buffer;
    for (let y = px.y; y < px.y + px.h; y++) {
      const v = (((y - yShift) % img.height) + img.height) % img.height;
      for (let x = px.x; x < px.x + px.w; x++) {
        const p = img.pixels[v * img.width + (x % img.width)];
        if (!(p >>> 24)) continue;
        const i = y * dst.width + x;
        dst.pixels[i] = blended ? blendRgba32(p, dst.pixels[i], info.eva, info.evb) : p;
      }
    }
  }

  /** Liquid BG0: drawn from `effectY` downward, with the surface strip just above it. */
  private drawLiquid(px: { x: number; y: number; w: number; h: number }, info: BlendInfo): void {
    const img = this.tileMap(Layer.BG0);
    if (!img) return;
    const dst = this.buffer;
    const surface = this.room.header.effectY * 16;
    const blend = info.blended ? info : { eva: 16, evb: 0 };
    for (let y = Math.max(px.y, surface - 8); y < px.y + px.h; y++) {
      // The 8 pixel surface row is stored at the bottom of a 32×64 tilemap.
      const v = y < surface ? Math.min(img.height - 8, 504) + (y - surface + 8) : (y - surface) % 256;
      if (v < 0 || v >= img.height) continue;
      for (let x = px.x; x < px.x + px.w; x++) {
        const p = img.pixels[v * img.width + (x % img.width)];
        if (!(p >>> 24)) continue;
        const i = y * dst.width + x;
        dst.pixels[i] = blendRgba32(p, dst.pixels[i], blend.eva, blend.evb);
      }
    }
  }

  private drawSprites(set: number, px: { x: number; y: number; w: number; h: number }): void {
    const list = this.room.spriteLists[set];
    const spriteset = this.room.spritesets[set];
    if (!list || !spriteset) return;
    const vram = this.objVram(set);
    const game = this.room.rom.game;
    for (const s of list.sprites) {
      if (s.properties < 0x10) continue;
      const entry = spriteset.spriteInSlot(spriteSlot(s));
      if (!entry) continue;
      const frame = vram.firstFrame(game.primarySpriteOam.get(entry.spriteId));
      if (!frame) continue;
      const adjust = game.spritePositions.get(entry.spriteId) ?? { x: 0, y: 0 };
      const ox = s.x * 16 + 8 + adjust.x;
      const oy = s.y * 16 + 16 + adjust.y;
      // Skip sprites far from the redraw region.
      if (ox + 128 < px.x || ox - 128 > px.x + px.w || oy + 128 < px.y || oy - 128 > px.y + px.h) continue;
      const translucent = game.isMF && s.properties >= 0x90;
      vram.drawFrame(this.buffer, frame, entry.gfxRow & 7, ox, oy, translucent ? averageRgba32 : undefined);
    }
  }
}

function clampRect(r: BlockRect, w: number, h: number): BlockRect {
  const x = Math.max(0, r.x), y = Math.max(0, r.y);
  return { x, y, w: Math.max(0, Math.min(w, r.x + r.w) - x), h: Math.max(0, Math.min(h, r.y + r.h) - y) };
}
