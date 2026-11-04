import type { Block } from '@core/model/Room';
import { Store } from '../../services/store';
import type { SettingsService } from '../../services/SettingsService';

export type EditMode = 'blocks' | 'objects';
export type BgLayerKey = 'bg0' | 'bg1' | 'bg2';

export interface ViewToggles {
  layers: [boolean, boolean, boolean, boolean];
  sprites: boolean;
  spriteOutlines: boolean;
  doors: boolean;
  scrolls: boolean;
  effect: boolean;
  screens: boolean;
  collision: boolean;
  breakable: boolean;
  values: boolean;
  animatedPalette: boolean;
  motherShipHatches: boolean;
}

/** A rectangle of blocks to stamp, copied from the tileset or the room. */
export interface Brush {
  blocks: Block[][];
  source: 'tileset' | 'room';
}

export interface ToolState {
  mode: EditMode;
  fill: boolean;
  fillDiagonal: boolean;
  /** The background layer edited by the brush (only one at a time), or none. */
  bgLayer: BgLayerKey | undefined;
  editClip: boolean;
  /** Clipdata value applied with tileset brushes. */
  clipValue: number;
  /** Always apply `clipValue`, even when the brush was copied from the room. */
  forceClip: boolean;
  brush: Brush | undefined;
  /** Selection rectangle in the tileset view (in blocks), for highlighting. */
  tilesetSelection: { x: number; y: number; w: number; h: number } | undefined;
  view: ViewToggles;
}

/**
 * Editing tools shared by all room editors, like the tool palette of a
 * paint program: switching rooms keeps the current brush and layer setup.
 */
export class RoomToolsService {
  readonly state: Store<ToolState>;

  constructor(settings: SettingsService) {
    const v = settings.get('room.defaultView');
    this.state = new Store<ToolState>({
      mode: 'blocks',
      fill: false,
      fillDiagonal: false,
      bgLayer: 'bg1',
      editClip: true,
      clipValue: 0x10,
      forceClip: false,
      brush: undefined,
      tilesetSelection: undefined,
      view: { layers: [true, true, true, true], ...v, animatedPalette: settings.get('room.animatedPalette'), motherShipHatches: false },
    });
  }

  get(): ToolState {
    return this.state.get();
  }

  update(p: Partial<ToolState>): void {
    this.state.update(p);
  }

  toggleView<K extends keyof ViewToggles>(key: K): void {
    const view = this.get().view;
    if (key === 'layers') return;
    this.update({ view: { ...view, [key]: !view[key] } });
  }

  toggleLayerView(i: number): void {
    const layers = [...this.get().view.layers] as ViewToggles['layers'];
    layers[i] = !layers[i];
    this.update({ view: { ...this.get().view, layers } });
  }

  setBgLayer(layer: BgLayerKey | undefined): void {
    this.update({ bgLayer: this.get().bgLayer === layer ? undefined : layer });
  }

  setMode(mode: EditMode): void {
    this.update({ mode });
  }

  toggleMode(): void {
    this.setMode(this.get().mode === 'blocks' ? 'objects' : 'blocks');
  }
}
