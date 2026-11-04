import { Store } from './store';
import type { SettingsService } from './SettingsService';

export type ViewContainerId = 'explorer' | 'tileset' | 'properties' | 'search';
export type PanelId = 'output' | 'problems';

export interface LayoutState {
  sidebarVisible: boolean;
  sidebarWidth: number;
  activeContainer: ViewContainerId;
  panelVisible: boolean;
  panelHeight: number;
  activePanel: PanelId;
  /** Secondary side bar (right) showing room tools: tileset + properties. */
  auxVisible: boolean;
  auxWidth: number;
}

export class LayoutService {
  readonly state: Store<LayoutState>;

  constructor(private readonly settings: SettingsService) {
    this.state = new Store<LayoutState>({
      sidebarVisible: settings.get('workbench.sidebarVisible'),
      sidebarWidth: settings.get('workbench.sidebarWidth'),
      activeContainer: 'explorer',
      panelVisible: settings.get('workbench.panelVisible'),
      panelHeight: settings.get('workbench.panelHeight'),
      activePanel: 'output',
      auxVisible: true,
      auxWidth: 300,
    });
    this.state.onDidChange((s) => {
      if (s.sidebarVisible !== settings.get('workbench.sidebarVisible')) settings.set('workbench.sidebarVisible', s.sidebarVisible);
      if (s.panelVisible !== settings.get('workbench.panelVisible')) settings.set('workbench.panelVisible', s.panelVisible);
    });
  }

  toggleSidebar(): void {
    this.state.update({ sidebarVisible: !this.state.get().sidebarVisible });
  }

  showContainer(id: ViewContainerId): void {
    const s = this.state.get();
    if (s.activeContainer === id && s.sidebarVisible) this.state.update({ sidebarVisible: false });
    else this.state.update({ activeContainer: id, sidebarVisible: true });
  }

  togglePanel(panel?: PanelId): void {
    const s = this.state.get();
    if (panel && panel !== s.activePanel) this.state.update({ activePanel: panel, panelVisible: true });
    else this.state.update({ panelVisible: !s.panelVisible });
  }

  setSidebarWidth(w: number): void {
    const width = Math.max(180, Math.min(600, w));
    this.state.update({ sidebarWidth: width });
    this.settings.set('workbench.sidebarWidth', width);
  }

  setPanelHeight(h: number): void {
    const height = Math.max(80, Math.min(600, h));
    this.state.update({ panelHeight: height });
    this.settings.set('workbench.panelHeight', height);
  }
}
