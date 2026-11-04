import { Store } from './store';
import { Emitter } from '@core/util/Emitter';

/** Kinds of editors that can be opened as tabs. */
export type EditorKind =
  | 'welcome'
  | 'room'
  | 'roomProperties'
  | 'palette'
  | 'graphics'
  | 'tileTable'
  | 'tileset'
  | 'tilemap'
  | 'spriteset'
  | 'sprite'
  | 'area'
  | 'project'
  | 'keybindings';

export interface EditorInput {
  /** Unique key; opening an input with an existing id focuses that tab. */
  id: string;
  kind: EditorKind;
  title: string;
  /** Kind-specific parameters (asset `path`, or area/room for rooms). */
  params: Record<string, number | string>;
  /** Tooltip / description shown next to the title. */
  description?: string;
}

export interface EditorState {
  tabs: EditorInput[];
  activeId: string | undefined;
  /** A preview tab is replaced when another input is opened in preview mode. */
  previewId: string | undefined;
}

/** Manages the open editor tabs (one editor group). */
export class EditorService {
  readonly state = new Store<EditorState>({ tabs: [], activeId: undefined, previewId: undefined });
  private readonly _onWillClose = new Emitter<EditorInput>();
  readonly onWillClose = this._onWillClose.event;

  get active(): EditorInput | undefined {
    const s = this.state.get();
    return s.tabs.find((t) => t.id === s.activeId);
  }

  open(input: EditorInput, options: { preview?: boolean } = {}): void {
    this.state.set((s) => {
      if (s.tabs.some((t) => t.id === input.id)) {
        const previewId = !options.preview && s.previewId === input.id ? undefined : s.previewId;
        return { ...s, activeId: input.id, previewId };
      }
      let tabs = s.tabs;
      let insertAt = tabs.findIndex((t) => t.id === s.activeId) + 1 || tabs.length;
      if (options.preview && s.previewId) {
        const idx = tabs.findIndex((t) => t.id === s.previewId);
        if (idx >= 0) {
          const old = tabs[idx];
          this._onWillClose.fire(old);
          tabs = tabs.filter((t) => t.id !== s.previewId);
          insertAt = idx;
        }
      }
      tabs = [...tabs.slice(0, insertAt), input, ...tabs.slice(insertAt)];
      return { tabs, activeId: input.id, previewId: options.preview ? input.id : s.previewId };
    });
  }

  /** Turns the preview tab into a regular tab. */
  pin(id: string): void {
    this.state.set((s) => (s.previewId === id ? { ...s, previewId: undefined } : s));
  }

  activate(id: string): void {
    this.state.update({ activeId: id });
  }

  close(id: string): void {
    const s = this.state.get();
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    this._onWillClose.fire(s.tabs[idx]);
    const tabs = s.tabs.filter((t) => t.id !== id);
    const activeId = s.activeId === id ? (tabs[idx] ?? tabs[idx - 1])?.id : s.activeId;
    this.state.set({ tabs, activeId, previewId: s.previewId === id ? undefined : s.previewId });
  }

  closeWhere(pred: (t: EditorInput) => boolean): void {
    for (const t of this.state.get().tabs.filter(pred)) this.close(t.id);
  }

  closeAll(): void {
    this.closeWhere(() => true);
  }
}
