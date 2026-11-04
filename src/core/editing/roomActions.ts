import type { Room, Block, BlockLayerKey } from '../model/Room';
import { EMPTY } from '../model/Room';
import type { DoorStore, Door } from '../model/Doors';
import type { Scroll } from '../model/Scrolls';
import type { RoomSprite } from '../model/Sprites';
import type { EditAction } from './UndoStack';
import type { BlockRect } from '../gfx/RoomRenderer';

/** Everything a room edit may touch. */
export interface RoomEditTarget {
  room: Room;
  doors: DoorStore;
}

export type RoomChange =
  | { kind: 'blocks'; rect: BlockRect }
  | { kind: 'sprites' }
  | { kind: 'doors' }
  | { kind: 'scrolls' }
  | { kind: 'header' }
  | { kind: 'all' };

export interface RoomAction extends EditAction<RoomEditTarget> {
  readonly change: RoomChange;
}

// ------------------------------------------------------------------ blocks

/** Which layers a block edit writes. */
export interface LayerMask {
  bg0?: boolean;
  bg1?: boolean;
  bg2?: boolean;
  clip?: boolean;
}

interface BlockDelta {
  before: Block;
  after: Block;
}

export class EditBlocksAction implements RoomAction {
  private readonly deltas = new Map<number, BlockDelta>();
  change: { kind: 'blocks'; rect: BlockRect };

  constructor(
    target: RoomEditTarget,
    /** Source blocks indexed [y][x]. */
    source: Block[][],
    dstX: number,
    dstY: number,
    mask: LayerMask,
    readonly label = 'Edit blocks',
  ) {
    const room = target.room;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    source.forEach((row, sy) =>
      row.forEach((src, sx) => {
        const x = dstX + sx, y = dstY + sy;
        if (!room.inBounds(x, y)) return;
        const before = room.getBlock(x, y);
        const after = { ...before };
        for (const k of ['bg0', 'bg1', 'bg2', 'clip'] as BlockLayerKey[]) {
          if (mask[k] && src[k] !== EMPTY && before[k] !== EMPTY) after[k] = src[k];
        }
        this.deltas.set(y * 256 + x, { before, after });
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }),
    );
    this.change = { kind: 'blocks', rect: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
    this.mask = mask;
  }

  private readonly mask: LayerMask;

  get isEmpty(): boolean {
    return this.deltas.size === 0;
  }

  private write(room: Room, which: 'before' | 'after'): void {
    for (const [k, d] of this.deltas) room.setBlock(k % 256, Math.floor(k / 256), d[which]);
  }

  apply(t: RoomEditTarget): void {
    this.write(t.room, 'after');
  }
  revert(t: RoomEditTarget): void {
    this.write(t.room, 'before');
  }

  merge(next: EditAction<RoomEditTarget>): boolean {
    if (!(next instanceof EditBlocksAction)) return false;
    for (const [k, d] of next.deltas) {
      const existing = this.deltas.get(k);
      this.deltas.set(k, existing ? { before: existing.before, after: d.after } : d);
    }
    Object.assign(this.mask, next.mask);
    const a = this.change.rect, b = next.change.rect;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    this.change = { kind: 'blocks', rect: { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y } };
    return true;
  }
}

/**
 * Flood fills the connected area of identical values (on `matchLayer`)
 * around (x, y). Each filled block takes a random block from `pool`.
 * With `diagonal`, corner neighbours connect as well.
 */
export function floodFill(
  room: Room,
  x: number,
  y: number,
  matchLayer: BlockLayerKey,
  pool: Block[],
  diagonal: boolean,
  random: () => number = Math.random,
): { blocks: Block[][]; x: number; y: number } | undefined {
  if (!room.inBounds(x, y) || pool.length === 0) return undefined;
  const target = room.getBlock(x, y)[matchLayer];
  const seen = new Set<number>();
  const stack = [[x, y]];
  const hits: [number, number][] = [];
  const dirs = diagonal
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    const k = cy * 256 + cx;
    if (seen.has(k) || !room.inBounds(cx, cy) || room.getBlock(cx, cy)[matchLayer] !== target) continue;
    seen.add(k);
    hits.push([cx, cy]);
    for (const [dx, dy] of dirs) stack.push([cx + dx, cy + dy]);
  }
  const minX = Math.min(...hits.map((h) => h[0])), minY = Math.min(...hits.map((h) => h[1]));
  const maxX = Math.max(...hits.map((h) => h[0])), maxY = Math.max(...hits.map((h) => h[1]));
  const none: Block = { bg0: EMPTY, bg1: EMPTY, bg2: EMPTY, clip: EMPTY };
  const blocks: Block[][] = Array.from({ length: maxY - minY + 1 }, () => Array.from({ length: maxX - minX + 1 }, () => none));
  for (const [hx, hy] of hits) blocks[hy - minY][hx - minX] = pool[Math.floor(random() * pool.length)];
  return { blocks, x: minX, y: minY };
}

// ----------------------------------------------------------------- sprites

export class SpriteListAction implements RoomAction {
  readonly change = { kind: 'sprites' } as const;
  private before?: RoomSprite[];

  constructor(
    readonly label: string,
    readonly listIndex: number,
    private mutate: (sprites: RoomSprite[]) => RoomSprite[],
    private readonly mergeKey?: string,
  ) {}

  apply(t: RoomEditTarget): void {
    const list = t.room.spriteLists[this.listIndex];
    if (!list) return;
    this.before ??= list.sprites.map((s) => ({ ...s }));
    list.sprites = this.mutate(this.before.map((s) => ({ ...s })));
  }

  revert(t: RoomEditTarget): void {
    const list = t.room.spriteLists[this.listIndex];
    if (list && this.before) list.sprites = this.before.map((s) => ({ ...s }));
  }

  merge(next: EditAction<RoomEditTarget>): boolean {
    if (!(next instanceof SpriteListAction) || !this.mergeKey || next.mergeKey !== this.mergeKey) return false;
    const first = this.mutate;
    const second = next.mutate;
    this.mutate = (s) => second(first(s));
    return true;
  }
}

export const setSprite = (listIndex: number, index: number, sprite: RoomSprite, continuous = false) =>
  new SpriteListAction('Edit sprite', listIndex, (s) => s.map((o, i) => (i === index ? { ...sprite } : o)), continuous ? `sprite:${listIndex}:${index}` : undefined);

export const addSprite = (listIndex: number, sprite: RoomSprite) =>
  new SpriteListAction('Add sprite', listIndex, (s) => [...s, { ...sprite }]);

export const removeSprite = (listIndex: number, index: number) =>
  new SpriteListAction('Remove sprite', listIndex, (s) => s.filter((_, i) => i !== index));

// ------------------------------------------------------------------- doors

export class DoorAction implements RoomAction {
  readonly change = { kind: 'doors' } as const;
  private before?: Door;
  private beforeTaken = false;
  private after?: Door;

  /** `next` replaces the door with the given number; `undefined` removes it. */
  constructor(
    readonly label: string,
    private area: number,
    private number: number,
    private next: Door | undefined | 'create',
    private readonly createAt?: { room: number; x: number; y: number },
    private readonly mergeable = false,
  ) {}

  apply(t: RoomEditTarget): void {
    if (this.next === 'create') {
      const c = this.createAt!;
      const door = t.doors.add(this.area, c.room, c.x, c.y);
      this.next = { ...door };
      this.number = door.number;
      this.before = undefined;
      this.beforeTaken = true;
    } else {
      if (!this.beforeTaken) {
        const b = t.doors.find(this.area, this.number);
        this.before = b && { ...b };
        this.beforeTaken = true;
      }
      if (this.next) t.doors.update(this.next);
      else t.doors.remove(this.area, this.number);
    }
    this.after = this.next;
  }

  revert(t: RoomEditTarget): void {
    if (this.before) t.doors.update(this.before);
    else t.doors.remove(this.area, this.number);
  }

  merge(next: EditAction<RoomEditTarget>): boolean {
    if (!(next instanceof DoorAction) || !this.mergeable || !next.mergeable) return false;
    if (next.area !== this.area || next.number !== this.number) return false;
    this.next = next.next;
    this.after = next.after;
    return true;
  }
}

export const editDoor = (door: Door, continuous = false) => new DoorAction('Edit door', door.area, door.number, { ...door }, undefined, continuous);
export const removeDoor = (door: Door) => new DoorAction('Remove door', door.area, door.number, undefined);
export const createDoor = (area: number, room: number, x: number, y: number) =>
  new DoorAction('Add door', area, -1, 'create', { room, x, y });

// ----------------------------------------------------------------- scrolls

export class ScrollsAction implements RoomAction {
  readonly change = { kind: 'scrolls' } as const;
  private before?: Scroll[];
  constructor(
    readonly label: string,
    private mutate: (s: Scroll[]) => Scroll[],
    private readonly mergeKey?: string,
  ) {}

  apply(t: RoomEditTarget): void {
    this.before ??= t.room.scrolls.map((s) => ({ ...s }));
    t.room.scrolls = this.mutate(this.before.map((s) => ({ ...s })));
  }
  revert(t: RoomEditTarget): void {
    if (!this.before) return;
    t.room.scrolls = this.before.map((s) => ({ ...s }));
  }
  merge(next: EditAction<RoomEditTarget>): boolean {
    if (!(next instanceof ScrollsAction) || !this.mergeKey || next.mergeKey !== this.mergeKey) return false;
    const a = this.mutate, b = next.mutate;
    this.mutate = (s) => b(a(s));
    return true;
  }
}

export const setScroll = (index: number, scroll: Scroll, continuous = false) =>
  new ScrollsAction('Edit scroll', (s) => s.map((o, i) => (i === index ? { ...scroll } : o)), continuous ? `scroll:${index}` : undefined);
export const addScroll = (scroll: Scroll) => new ScrollsAction('Add scroll', (s) => [...s, { ...scroll }]);
export const removeScroll = (index: number) => new ScrollsAction('Remove scroll', (s) => s.filter((_, i) => i !== index));

// ------------------------------------------------------------------ header

/** Edits one of the room's header values. */
export class HeaderFieldAction implements RoomAction {
  readonly change = { kind: 'header' } as const;
  private before?: number;
  constructor(
    readonly label: string,
    private readonly field: 'effectY' | 'transparency' | 'bg3Scroll' | 'mapX' | 'mapY' | 'music' | 'effect',
    private value: number,
    private readonly mergeable = false,
  ) {}
  apply(t: RoomEditTarget): void {
    const r = t.room;
    this.before ??= r.header[this.field];
    r.header[this.field] = this.value;
  }
  revert(t: RoomEditTarget): void {
    const r = t.room;
    if (this.before === undefined) return;
    r.header[this.field] = this.before;
  }
  merge(next: EditAction<RoomEditTarget>): boolean {
    if (!(next instanceof HeaderFieldAction) || !this.mergeable || next.field !== this.field) return false;
    this.value = next.value;
    return true;
  }
}

// ---------------------------------------------------------------- resizing

export class ResizeRoomAction implements RoomAction {
  readonly label = 'Resize room';
  readonly change = { kind: 'all' } as const;
  private backup?: { w: number; h: number; blocks: Uint16Array[] };
  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}
  apply(t: RoomEditTarget): void {
    const r = t.room;
    this.backup ??= { w: r.width, h: r.height, blocks: [0, 1, 2, 4].map((l) => r.layers[l].blocks.slice()) };
    r.resize(this.width, this.height);
  }
  revert(t: RoomEditTarget): void {
    if (!this.backup) return;
    const r = t.room;
    [0, 1, 2, 4].forEach((l, i) => {
      const bg = r.layers[l];
      if (!bg.isRle) return;
      bg.width = this.backup!.w;
      bg.height = this.backup!.h;
      bg.blocks = this.backup!.blocks[i].slice();
    });
  }
}
