import type { ByteStream } from '../io/ByteStream';

/** A spriteset assigns sprite IDs to slots, each with a VRAM graphics row. */
export interface SpritesetEntry {
  spriteId: number;
  gfxRow: number;
}

export const MAX_SPRITESET_ENTRIES = 15;

/** Spriteset data: up to 15 `{u8 sprite, u8 gfxRow}` pairs ending with a zero sprite. */
export const Spriteset = {
  decode(src: ByteStream, at: number): { entries: SpritesetEntry[]; length: number } {
    const entries: SpritesetEntry[] = [];
    for (let i = 0; i < MAX_SPRITESET_ENTRIES; i++, at += 2) {
      const spriteId = src.u8(at);
      if (spriteId === 0) break;
      entries.push({ spriteId, gfxRow: src.u8(at + 1) });
    }
    return { entries, length: (entries.length + 1) * 2 };
  },

  encode(entries: SpritesetEntry[]): Uint8Array {
    const out = new Uint8Array((entries.length + 1) * 2);
    entries.forEach((e, i) => {
      out[i * 2] = e.spriteId;
      out[i * 2 + 1] = e.gfxRow;
    });
    return out;
  },
};

/** A sprite placed in a room. `properties` packs slot (low nibble, 1-based) and extra flags. */
export interface RoomSprite {
  x: number;
  y: number;
  properties: number;
}

export const spriteSlot = (s: RoomSprite) => (s.properties & 0xf) - 1;

export const MAX_ROOM_SPRITES = 24;

/** The sprite list for one spriteset slot (0 = default, 1/2 = event-based) of a room. */
export class RoomSpriteList {
  constructor(public sprites: RoomSprite[] = []) {}

  /** Reads `{y, x, props}` triples up to the `FF FF FF` terminator. */
  static decode(src: ByteStream, at: number): { list: RoomSpriteList; length: number } {
    const sprites: RoomSprite[] = [];
    for (let i = 0; i < MAX_ROOM_SPRITES; i++, at += 3) {
      const y = src.u8(at);
      const x = src.u8(at + 1);
      const properties = src.u8(at + 2);
      if (y === 0xff && x === 0xff && properties === 0xff) break;
      sprites.push({ x, y, properties });
    }
    return { list: new RoomSpriteList(sprites), length: (sprites.length + 1) * 3 };
  }

  find(x: number, y: number): number {
    return this.sprites.findIndex((s) => s.x === x && s.y === y);
  }

  encode(): Uint8Array {
    const out = new Uint8Array((this.sprites.length + 1) * 3).fill(0xff);
    this.sprites.forEach((s, i) => {
      out[i * 3] = s.y;
      out[i * 3 + 1] = s.x;
      out[i * 3 + 2] = s.properties;
    });
    return out;
  }

  equals(o: RoomSpriteList): boolean {
    return this.sprites.length === o.sprites.length && this.sprites.every((s, i) => s.x === o.sprites[i].x && s.y === o.sprites[i].y && s.properties === o.sprites[i].properties);
  }

  clone(): RoomSpriteList {
    return new RoomSpriteList(this.sprites.map((s) => ({ ...s })));
  }
}

/** Bytes of VRAM one sprite graphics row occupies (two rows of 32 tiles). */
export const SPRITE_GFX_ROW_BYTES = 0x800;

/** Number of VRAM graphics rows a sprite's (decompressed) graphics use, 1-8. */
export const spriteGfxRows = (byteLength: number) => Math.max(1, Math.min(8, Math.floor(byteLength / SPRITE_GFX_ROW_BYTES)));
