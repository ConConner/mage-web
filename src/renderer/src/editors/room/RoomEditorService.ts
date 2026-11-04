import { Store } from '../../services/store';
import type { EditorService } from '../../services/EditorService';
import type { ProjectService } from '../../services/ProjectService';
import { UndoStack } from '@core/editing/UndoStack';
import type { RoomEditTarget } from '@core/editing/roomActions';
import type { SettingsService } from '../../services/SettingsService';
import type { NotificationService } from '../../services/NotificationService';
import { RoomEditorModel } from './RoomEditorModel';
import type { RoomToolsService } from './RoomTools';

export const roomEditorId = (area: number, room: number) => `room:${area}:${room}`;

/**
 * Creates and tracks RoomEditorModels for open room tabs and exposes the
 * one belonging to the active tab (used by side views and commands).
 */
export class RoomEditorService {
  private readonly models = new Map<string, RoomEditorModel>();
  /** Undo history per room; kept when a tab closes, dropped with the project. */
  private readonly undoStacks = new Map<string, UndoStack<RoomEditTarget>>();
  readonly active = new Store<RoomEditorModel | undefined>(undefined);
  /** The most recently focused room, even if a non-room tab is active now. */
  readonly last = new Store<RoomEditorModel | undefined>(undefined);

  constructor(
    private readonly editors: EditorService,
    private readonly projects: ProjectService,
    private readonly tools: RoomToolsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationService,
  ) {
    editors.state.onDidChange((s) => {
      const m = s.activeId ? this.models.get(s.activeId) : undefined;
      this.active.set(m);
      if (m) this.last.set(m);
    });
    editors.onWillClose((input) => {
      this.models.delete(input.id);
      if (this.last.get() && !this.models.has(roomEditorId(this.last.get()!.area, this.last.get()!.roomId))) this.last.set(undefined);
    });
    projects.onDidChangeContent((c) => {
      if (c.kind === 'all') {
        this.models.clear();
        this.undoStacks.clear();
        this.active.set(undefined);
        this.last.set(undefined);
        return;
      }
      for (const m of this.models.values()) {
        if (c.kind === 'doors') m.objectsChanged();
        else if (c.kind === 'asset' && m.dependsOn(c.path)) m.reload();
      }
    });
  }

  /** Returns the model for a room, creating it on first use. */
  model(area: number, room: number): RoomEditorModel | undefined {
    const id = roomEditorId(area, room);
    let m = this.models.get(id);
    if (!m) {
      const project = this.projects.project;
      if (!project) return undefined;
      let undo = this.undoStacks.get(id);
      if (!undo) {
        undo = new UndoStack<RoomEditTarget>();
        this.undoStacks.set(id, undo);
      }
      try {
        m = new RoomEditorModel(project, area, room, undo, this.tools, this.settings.get('room.defaultZoom'), () => this.backdrop(), (path) => this.projects.assetChanged(path, false));
      } catch (e) {
        this.notifications.error(`Room ${area}-${room.toString(16).toUpperCase()} could not be loaded: ${(e as Error).message}`);
        return undefined;
      }
      this.models.set(id, m);
      if (this.editors.state.get().activeId === id) {
        this.active.set(m);
        this.last.set(m);
      }
    }
    return m;
  }

  all(): RoomEditorModel[] {
    return [...this.models.values()];
  }

  backdrop(): number {
    const hex = this.settings.get('room.backdropColor');
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return 0xff000000;
    return (0xff000000 | (parseInt(m[3], 16) << 16) | (parseInt(m[2], 16) << 8) | parseInt(m[1], 16)) >>> 0;
  }
}
