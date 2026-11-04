import type { GameKind } from './GameInfo';

/**
 * How clipdata values are visualized in the room editor.
 *
 * Breakable blocks and items are drawn with icons taken from the generic BG
 * graphics (a 256×32 px sheet). Each icon is one 16×16 cell, or — for tanks —
 * two 16×8 strips stacked vertically.
 */
export interface IconSource {
  /** Source rectangles in the generic BG sheet, drawn top to bottom. */
  parts: { sx: number; sy: number; w: number; h: number }[];
}

const cell = (sx: number): IconSource => ({ parts: [{ sx, sy: 16, w: 16, h: 16 }] });
const tank = (top: number, bottom: number): IconSource => ({
  parts: [
    { sx: top, sy: 0, w: 16, h: 8 },
    { sx: bottom, sy: 0, w: 16, h: 8 },
  ],
});

function table(entries: [number[], IconSource][]): Map<number, IconSource> {
  const m = new Map<number, IconSource>();
  for (const [values, src] of entries) for (const v of values) m.set(v, src);
  return m;
}

const SHOT = cell(160), MISSILE = cell(112), BOMB = cell(80), POWER = cell(128);
const SPEED = cell(96), SCREW = cell(144), CRUMBLE = cell(64), SUPER = cell(176), SLOW_CRUMBLE = cell(0);
const BOMB_CHAIN = [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77];

const MF_ICONS = table([
  [[0x50, 0x51, 0x52, 0x53, 0x5b, 0x5c, 0x5d, 0x60, 0x61, 0x6c, 0x6d], SHOT],
  [[0x54, 0x5e], MISSILE],
  [[0x55, 0x56, ...BOMB_CHAIN], BOMB],
  [[0x57], POWER],
  [[0x58, 0x6b], SPEED],
  [[0x59], SCREW],
  [[0x5a], CRUMBLE],
  [[0x64], tank(128, 144)],
  [[0x65], tank(160, 176)],
  [[0x69], tank(192, 208)],
]);

const ZM_ICONS = table([
  [[0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x60, 0x61, 0x62, 0x63, 0x64], SHOT],
  [[0x56], CRUMBLE],
  [[0x57, 0x67, ...BOMB_CHAIN], BOMB],
  [[0x58, 0x68], MISSILE],
  [[0x59, 0x69], SUPER],
  [[0x5a, 0x6a], SPEED],
  [[0x5b], POWER],
  [[0x66], SLOW_CRUMBLE],
  [[0x6b], SCREW],
  [[0x6c], tank(40, 56)],
  [[0x6d], tank(8, 24)],
  [[0x6e], tank(104, 120)],
  [[0x6f], tank(72, 88)],
]);

export function breakableIcon(game: GameKind, clip: number): IconSource | undefined {
  return (game === 'MF' ? MF_ICONS : ZM_ICONS).get(clip);
}

/** Collision type values from the game's clipdata-type table. */
export const CollisionType = {
  Air: 0,
  Solid: 1,
  SteepCeilingRight: 2,
  SteepFloorRight: 3,
  SlightUpperDescending: 4,
  SlightLowerDescending: 5,
  SlightLowerAscending: 6,
  SlightUpperAscending: 7,
  EnemyOnly: 8,
  Samus: 9,
  Item: 0xa,
  Door: 0xb,
  Enemy: 0xc,
} as const;

/** Category used for coloring collision outlines. */
export function collisionCategory(type: number): 'air' | 'solid' | 'slope' | 'enemy' | 'samus' | 'item' | 'door' {
  if (type === 0 || type > 0xc) return 'air';
  if (type === 1) return 'solid';
  if (type >= 2 && type <= 7) return 'slope';
  if (type === 9) return 'samus';
  if (type === 0xa) return 'item';
  if (type === 0xb) return 'door';
  return 'enemy';
}

/**
 * Slope line segments inside a 16×16 block, as [x0, y0, x1, y1] pairs in
 * pixels, for collision types 2-7.
 */
export function slopeSegment(type: number): [number, number, number, number] | undefined {
  switch (type) {
    case 2: return [0, 0, 15, 15];
    case 3: return [0, 15, 15, 0];
    case 4: return [0, 0, 15, 7];
    case 5: return [0, 8, 15, 15];
    case 6: return [0, 15, 15, 8];
    case 7: return [0, 7, 15, 0];
    default: return undefined;
  }
}

/** Translucent hue used to tint a clipdata value in "values" view. */
export function clipValueTint(value: number): [number, number, number, number] {
  const x = (value % 43) * 6;
  switch (value % 6) {
    case 0: return [255, x, 0, 64];
    case 1: return [255 - x, 255, 0, 64];
    case 2: return [0, 255, x, 64];
    case 3: return [0, 255 - x, 255, 64];
    case 4: return [x, 0, 255, 64];
    default: return [255, 0, 255 - x, 64];
  }
}
