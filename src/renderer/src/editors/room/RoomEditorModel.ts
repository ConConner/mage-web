import type { Project } from '@core/project/Project';
import { assetReferences } from '@core/project/assets';
import type { Room, Block } from '@core/model/Room';
import { EMPTY } from '@core/model/Room';
import { RoomRenderer, type BlockRect, type RoomViewOptions } from '@core/gfx/RoomRenderer';
import { Emitter } from '@core/util/Emitter';
import type { UndoStack } from '@core/editing/UndoStack';
import {
  EditBlocksAction,
  floodFill,
  type RoomAction,
  type RoomEditTarget,
  type LayerMask,
} from '@core/editing/roomActions';
import { doorContains, doorExitPoint, type Door } from '@core/model/Doors';
import { findScrollHandle, type ScrollHandle } from '@core/model/Scrolls';
import { spriteSlot } from '@core/model/Sprites';
import { frameBounds } from '@core/model/Oam';
import { Store } from '../../services/store';
import type { RoomToolsService, ToolState } from './RoomTools';

export type SelectedObject =
  | { kind: 'sprite'; list: number; index: number }
  | { kind: 'door'; area: number; number: number }
  | { kind: 'scroll'; index: number; handle?: ScrollHandle }
  | { kind: 'exit'; area: number; number: number }
  | { kind: 'effect' };

export interface RoomEditorUiState {
  zoom: number;
  /** Hovered block, or undefined when the pointer is outside the room. */
  cursor: { x: number; y: number } | undefined;
  /** Right-drag selection in the room (blocks). */
  selection: BlockRect | undefined;
  selected: SelectedObject | undefined;
  /** Which sprite list (spriteset slot 0-2) is shown and edited. */
  spriteSet: number;
}

const ZOOMS = [0.5, 1, 2, 3, 4, 6, 8];

/**
 * State and behavior of one open room: rendering, undo, hit-testing and
 * block/object editing operations. Contains no DOM code — the RoomEditor
 * component translates pointer input into calls on this model.
 */
export class RoomEditorModel {
  room: Room;
  renderer: RoomRenderer;
  readonly ui: Store<RoomEditorUiState>;
  readonly undo: UndoStack<RoomEditTarget>;

  /** Fired with the block region whose pixels changed (undefined = everything). */
  private readonly _onDidRender = new Emitter<BlockRect | undefined>();
  readonly onDidRender = this._onDidRender.event;
  /** Fired when overlay data (objects, clipdata visualization) changed. */
  private readonly _onDidChangeObjects = new Emitter<void>();
  readonly onDidChangeObjects = this._onDidChangeObjects.event;
  /** Fired when the room was reloaded (size or tileset may have changed). */
  private readonly _onDidReload = new Emitter<void>();
  readonly onDidReload = this._onDidReload.event;

  constructor(
    readonly project: Project,
    readonly area: number,
    readonly roomId: number,
    undo: UndoStack<RoomEditTarget>,
    private readonly tools: RoomToolsService,
    initialZoom: number,
    private readonly backdrop: () => number,
    /** Tells other editors that this room's asset changed. */
    private readonly notifyChanged: (path: string) => void,
  ) {
    this.room = project.loadRoom(area, roomId);
    this.renderer = this.createRenderer();
    this.undo = undo;
    this.ui = new Store<RoomEditorUiState>({ zoom: initialZoom, cursor: undefined, selection: undefined, selected: undefined, spriteSet: 0 });
  }

  private createRenderer(): RoomRenderer {
    const v = this.tools.get().view;
    return new RoomRenderer(this.room, { animatedPalette: v.animatedPalette, motherShipHatches: v.motherShipHatches });
  }

  get target(): RoomEditTarget {
    return { room: this.room, doors: this.project.doors };
  }

  get rom() {
    return this.project.rom;
  }

  get asset() {
    return this.room.asset;
  }

  /** Whether a change to the asset at `path` affects how this room looks. */
  dependsOn(path: string): boolean {
    if (path === this.asset.path) return true;
    const p = this.project;
    const h = this.room.header;
    const tileset = p.tilesetAsset(h.tileset);
    if (tileset && (tileset.path === path || assetReferences(tileset).includes(path))) return true;
    if (assetReferences(this.asset).includes(path)) return true;
    for (const n of [h.spriteset0, h.spriteset1, h.spriteset2]) {
      const set = p.spritesetAsset(n);
      if (!set) continue;
      if (set.path === path) return true;
      for (const e of set.entries) {
        const s = p.sprite(e.spriteId);
        if (s && (s.path === path || assetReferences(s).includes(path))) return true;
      }
    }
    return Object.values(p.manifest.common).includes(path);
  }

  /** Doors may have been changed by another editor. */
  objectsChanged(): void {
    this._onDidChangeObjects.fire();
  }

  viewOptions(view = this.tools.get().view): RoomViewOptions {
    return { showLayer: view.layers, showSprites: view.sprites, spriteSet: this.ui.get().spriteSet, backdrop: this.backdrop() };
  }

  /** Re-renders pixels (all, or a block region) and notifies the view. */
  render(region?: BlockRect): void {
    this.renderer.render(this.viewOptions(), region);
    this._onDidRender.fire(region);
  }

  /** Reloads room data from the session (after header, tileset or size changes). */
  reload(): void {
    this.room = this.project.loadRoom(this.area, this.roomId);
    this.renderer = this.createRenderer();
    const ui = this.ui.get();
    if (ui.spriteSet && !this.room.spriteLists[ui.spriteSet]) this.ui.update({ spriteSet: 0 });
    this._onDidReload.fire();
    this.render();
    this._onDidChangeObjects.fire();
  }

  /** Rebuilds graphics after VRAM-affecting option changes. */
  refreshGraphics(): void {
    const v = this.tools.get().view;
    this.renderer.invalidateGraphics({ animatedPalette: v.animatedPalette, motherShipHatches: v.motherShipHatches });
    this.render();
  }

  // ------------------------------------------------------------- actions

  perform(action: RoomAction, continuous = false): void {
    this.undo.perform(this.target, action, continuous);
    this.afterChange(action);
  }

  endGesture(): void {
    this.undo.endGesture();
  }

  undoLast(): void {
    const a = this.undo.undo(this.target) as RoomAction | undefined;
    if (a) this.afterChange(a);
  }

  redoLast(): void {
    const a = this.undo.redo(this.target) as RoomAction | undefined;
    if (a) this.afterChange(a);
  }

  private afterChange(a: RoomAction): void {
    const c = a.change;
    if (c.kind === 'blocks') {
      // Sprites may straddle edited blocks; widen a little.
      this.render({ x: c.rect.x - 1, y: c.rect.y - 1, w: c.rect.w + 2, h: c.rect.h + 2 });
      this._onDidChangeObjects.fire();
    } else if (c.kind === 'sprites') {
      this.renderer.invalidateSprites();
      this.render();
      this._onDidChangeObjects.fire();
    } else if (c.kind === 'all') {
      this.reload();
    } else if (c.kind === 'header') {
      this.render();
      this._onDidChangeObjects.fire();
    } else {
      this._onDidChangeObjects.fire();
    }
    this.project.markDirty(this.asset);
    if (c.kind === 'header' || c.kind === 'doors') this.notifyChanged(this.asset.path);
  }

  // ------------------------------------------------------------ zooming

  zoomBy(direction: 1 | -1): void {
    const z = this.ui.get().zoom;
    const i = ZOOMS.findIndex((v) => v >= z);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.length - 1 : i) + direction))];
    this.ui.update({ zoom: next });
  }

  setZoom(z: number): void {
    this.ui.update({ zoom: z });
  }

  // ------------------------------------------------------- block editing

  /** Builds the stamp for the current tools and writes it at (x, y). */
  paint(x: number, y: number, continuous: boolean): void {
    const t = this.tools.get();
    const plan = this.stampFor(t);
    if (!plan) return;
    const action = new EditBlocksAction(this.target, plan.blocks, x, y, plan.mask);
    if (!action.isEmpty) this.perform(action, continuous);
  }

  private stampFor(t: ToolState): { blocks: Block[][]; mask: LayerMask } | undefined {
    const mask: LayerMask = { clip: t.editClip };
    if (t.bgLayer) mask[t.bgLayer] = true;
    if (!t.bgLayer && !t.editClip) return undefined;
    const onlyClip = !t.bgLayer && t.editClip;
    let blocks = t.brush?.blocks;
    if (!blocks) {
      if (!onlyClip) return undefined;
      blocks = [[{ bg0: EMPTY, bg1: EMPTY, bg2: EMPTY, clip: t.clipValue }]];
    }
    const useClipValue = t.brush?.source === 'tileset' || t.forceClip || onlyClip;
    if (t.editClip && useClipValue) blocks = blocks.map((row) => row.map((b) => ({ ...b, clip: t.clipValue })));
    return { blocks, mask };
  }

  fill(x: number, y: number): void {
    const t = this.tools.get();
    const plan = this.stampFor(t);
    if (!plan) return;
    const pool = plan.blocks.flat();
    const matchLayer = t.bgLayer ?? 'clip';
    const result = floodFill(this.room, x, y, matchLayer, pool, t.fillDiagonal);
    if (!result) return;
    const action = new EditBlocksAction(this.target, result.blocks, result.x, result.y, plan.mask, 'Fill blocks');
    if (!action.isEmpty) this.perform(action);
  }

  /** Copies the room selection into the brush. */
  copySelection(rect: BlockRect): void {
    const blocks: Block[][] = [];
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      const row: Block[] = [];
      for (let x = rect.x; x < rect.x + rect.w; x++) row.push(this.room.getBlock(x, y));
      blocks.push(row);
    }
    this.tools.update({ brush: { blocks, source: 'room' }, tilesetSelection: undefined });
  }

  // --------------------------------------------------------- hit testing

  get activeSpriteList() {
    return this.room.spriteLists[this.ui.get().spriteSet];
  }

  /** Pixel bounds of a placed sprite (graphic plus its 16×16 anchor block). */
  spriteBounds(list: number, index: number): BlockRect {
    const s = this.room.spriteLists[list]!.sprites[index];
    const base = { x: s.x * 16, y: s.y * 16, w: 16, h: 16 };
    const entry = this.room.spritesets[list]?.spriteInSlot(spriteSlot(s));
    if (!entry || s.properties < 0x10) return base;
    const frame = this.renderer.objVram(list).firstFrame(this.rom.game.primarySpriteOam.get(entry.spriteId));
    if (!frame || frame.parts.length === 0) return base;
    const b = frameBounds(frame);
    const adj = this.rom.game.spritePositions.get(entry.spriteId) ?? { x: 0, y: 0 };
    const x0 = s.x * 16 + 8 + adj.x + b.x, y0 = s.y * 16 + 16 + adj.y + b.y;
    const x = Math.min(base.x, x0), y = Math.min(base.y, y0);
    return { x, y, w: Math.max(base.x + 16, x0 + b.width) - x, h: Math.max(base.y + 16, y0 + b.height) - y };
  }

  /** Finds the object under a pixel position, in priority order. */
  hitTest(px: number, py: number): SelectedObject | undefined {
    const bx = Math.floor(px / 16), by = Math.floor(py / 16);
    const view = this.tools.get().view;
    if (view.doors) {
      for (const d of this.room.doors) {
        const e = doorExitPoint(d);
        if (Math.abs(px - e.x) <= 4 && Math.abs(py - e.y) <= 4) return { kind: 'exit', area: d.area, number: d.number };
      }
    }
    const set = this.ui.get().spriteSet;
    const list = this.room.spriteLists[set];
    if (list && (view.sprites || view.spriteOutlines)) {
      const i = list.find(bx, by);
      if (i >= 0) return { kind: 'sprite', list: set, index: i };
    }
    if (view.doors) {
      const d = this.room.doors.find((d) => doorContains(d, bx, by));
      if (d) return { kind: 'door', area: d.area, number: d.number };
    }
    if (view.scrolls) {
      const h = findScrollHandle(this.room.scrolls, bx, by);
      if (h) return { kind: 'scroll', index: h.index, handle: h.handle };
    }
    if (view.effect && this.room.header.effectY !== 0xff && by === this.room.header.effectY) return { kind: 'effect' };
    return undefined;
  }

  doorOf(sel: { area: number; number: number }): Door | undefined {
    return this.project.doors.get(sel.area, sel.number);
  }

  /** Used by the minimap / tooltips: what's at a block. */
  describeBlock(x: number, y: number): string {
    if (!this.room.inBounds(x, y)) return '';
    const b = this.room.getBlock(x, y);
    const hex = (v: number) => (v === EMPTY ? '—' : v.toString(16).toUpperCase().padStart(2, '0'));
    return `BG0 ${hex(b.bg0)} · BG1 ${hex(b.bg1)} · BG2 ${hex(b.bg2)} · Clip ${hex(b.clip)}`;
  }
}

