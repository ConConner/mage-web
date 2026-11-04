import type { Rom } from '../rom/Rom';
import type { GraphicsSource } from '../gfx/GraphicsSource';
import type { RoomAsset } from '../project/assets';
import type { RoomProps } from './RoomHeader';
import type { Tileset } from './Tileset';
import { Background, Layer } from './Background';
import type { RoomSpriteList, SpritesetEntry } from './Sprites';
import type { Door } from './Doors';
import type { Scroll } from './Scrolls';
import { clipdataTypeOf } from './tables';

/** Values of the four block layers at one position (0xFFFF = layer missing). */
export interface Block {
  bg0: number;
  bg1: number;
  bg2: number;
  clip: number;
}

export const EMPTY = 0xffff;

export const BLOCK_LAYER_KEYS = ['bg0', 'bg1', 'bg2', 'clip'] as const;
export type BlockLayerKey = (typeof BLOCK_LAYER_KEYS)[number];
export const blockKeyOf = (layer: Layer.BG0 | Layer.BG1 | Layer.BG2 | Layer.Clip): BlockLayerKey =>
  layer === Layer.Clip ? 'clip' : BLOCK_LAYER_KEYS[layer];

/** Screen size in blocks; rooms have a 2 block border on each side. */
export const SCREEN_W = 15;
export const SCREEN_H = 10;

/** A loaded spriteset: its table number and entries (shared with the spriteset asset). */
export interface RoomSpriteset {
  number: number;
  entries: SpritesetEntry[];
  spriteInSlot(slot: number): SpritesetEntry | undefined;
}

export interface RoomDependencies {
  tileset: Tileset;
  spritesets: (RoomSpriteset | undefined)[];
  tilemaps: { bg0?: { size: number; entries: Uint16Array }; bg3?: { size: number; entries: Uint16Array } };
}

/**
 * Everything the room editor needs about one room: the room asset plus the
 * tileset, spritesets and tilemaps it references. Block layers, sprite
 * lists, doors and scrolls are the asset's own objects, so edits go
 * straight into the asset.
 */
export class Room {
  readonly layers: [Background, Background, Background, Background, Background];
  tileset: Tileset;
  spritesets: (RoomSpriteset | undefined)[];

  constructor(
    readonly asset: RoomAsset,
    readonly source: GraphicsSource,
    deps: RoomDependencies,
  ) {
    this.tileset = deps.tileset;
    this.spritesets = deps.spritesets;
    const lz = (layer: Layer, t?: { size: number; entries: Uint16Array }) => {
      const bg = new Background(layer, t ? 'lz77' : 'none');
      if (t) {
        bg.size = t.size;
        bg.tileMap = t.entries;
      }
      return bg;
    };
    const blocks = (layer: Layer, bg: Background | null) => bg ?? new Background(layer, 'none');
    this.layers = [
      asset.bg0Tilemap ? lz(Layer.BG0, deps.tilemaps.bg0) : blocks(Layer.BG0, asset.bg0),
      blocks(Layer.BG1, asset.bg1),
      blocks(Layer.BG2, asset.bg2),
      lz(Layer.BG3, deps.tilemaps.bg3),
      blocks(Layer.Clip, asset.clipdata),
    ];
    // Missing layers still need the room's size for block access.
    for (const l of this.layers) if (!l.exists) l.resize(this.width, this.height);
  }

  get rom(): Rom {
    return this.source.rom;
  }

  get area(): number {
    return this.asset.area;
  }

  get id(): number {
    return this.asset.index;
  }

  get header(): RoomProps {
    return this.asset.props;
  }

  get spriteLists(): (RoomSpriteList | undefined)[] {
    const h = this.asset.props;
    const active = [true, h.spriteset1Event > 0, h.spriteset2Event > 0];
    return this.asset.spriteLists.map((l, i) => (active[i] && l ? l : undefined));
  }

  get doors(): Door[] {
    return this.asset.doors;
  }

  get scrolls(): Scroll[] {
    return this.asset.scrolls;
  }

  set scrolls(s: Scroll[]) {
    this.asset.scrolls = s;
  }

  get clip(): Background {
    return this.layers[Layer.Clip];
  }

  get width(): number {
    return this.asset.clipdata?.width ?? this.asset.bg1?.width ?? 0;
  }

  get height(): number {
    return this.asset.clipdata?.height ?? this.asset.bg1?.height ?? 0;
  }

  get widthInScreens(): number {
    return Math.max(1, Math.floor((this.width - 4) / SCREEN_W));
  }

  get heightInScreens(): number {
    return Math.max(1, Math.floor((this.height - 4) / SCREEN_H));
  }

  layer(l: Layer): Background {
    return this.layers[l];
  }

  /** Spriteset slots that exist (slot 0 always; 1 and 2 when an event is set). */
  get spriteSetIndices(): number[] {
    const lists = this.spriteLists;
    return [0, 1, 2].filter((i) => lists[i] !== undefined);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getBlock(x: number, y: number): Block {
    const [bg0, bg1, bg2] = this.layers;
    return {
      bg0: bg0.isRle ? bg0.get(x, y) : EMPTY,
      bg1: bg1.isRle ? bg1.get(x, y) : EMPTY,
      bg2: bg2.isRle ? bg2.get(x, y) : EMPTY,
      clip: this.clip.isRle ? this.clip.get(x, y) : EMPTY,
    };
  }

  setBlock(x: number, y: number, b: Block): void {
    const [bg0, bg1, bg2] = this.layers;
    if (bg0.isRle && b.bg0 !== EMPTY) bg0.set(x, y, b.bg0);
    if (bg1.isRle && b.bg1 !== EMPTY) bg1.set(x, y, b.bg1);
    if (bg2.isRle && b.bg2 !== EMPTY) bg2.set(x, y, b.bg2);
    if (this.clip.isRle && b.clip !== EMPTY) this.clip.set(x, y, b.clip);
  }

  collisionType(x: number, y: number): number {
    return clipdataTypeOf(this.rom, this.clip.get(x, y));
  }

  /** Resizes every block layer. */
  resize(width: number, height: number): void {
    for (const l of this.layers) if (l.isRle || !l.exists) l.resize(width, height);
  }
}
