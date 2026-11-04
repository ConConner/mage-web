import { Emitter } from '@core/util/Emitter';
import type { PlatformApi } from '@platform/api';
import type { Theme } from './ThemeService';

/** All persisted user preferences with their defaults. */
export interface Settings {
  'workbench.colorTheme': string;
  'workbench.customThemes': Theme[];
  'workbench.sidebarWidth': number;
  'workbench.panelHeight': number;
  'workbench.sidebarVisible': boolean;
  'workbench.panelVisible': boolean;
  'room.defaultZoom': number;
  'room.backdropColor': string;
  'room.defaultView': {
    sprites: boolean;
    spriteOutlines: boolean;
    doors: boolean;
    scrolls: boolean;
    effect: boolean;
    screens: boolean;
    collision: boolean;
    breakable: boolean;
    values: boolean;
  };
  'room.animatedPalette': boolean;
  'tileset.zoom': number;
}

export const DEFAULT_SETTINGS: Settings = {
  'workbench.colorTheme': 'dark',
  'workbench.customThemes': [],
  'workbench.sidebarWidth': 300,
  'workbench.panelHeight': 180,
  'workbench.sidebarVisible': true,
  'workbench.panelVisible': false,
  'room.defaultZoom': 1,
  'room.backdropColor': '#000000',
  'room.defaultView': {
    sprites: true,
    spriteOutlines: true,
    doors: true,
    scrolls: false,
    effect: false,
    screens: false,
    collision: false,
    breakable: true,
    values: false,
  },
  'room.animatedPalette': true,
  'tileset.zoom': 1,
};

export type SettingKey = keyof Settings;

export class SettingsService {
  private values: Settings = { ...DEFAULT_SETTINGS };
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _onDidChange = new Emitter<SettingKey>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly platform: PlatformApi) {}

  async load(): Promise<void> {
    const stored = await this.platform.loadSettings();
    this.values = { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
  }

  get<K extends SettingKey>(key: K): Settings[K] {
    return this.values[key];
  }

  set<K extends SettingKey>(key: K, value: Settings[K]): void {
    this.values = { ...this.values, [key]: value };
    this._onDidChange.fire(key);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.platform.saveSettings(this.values as unknown as Record<string, unknown>), 300);
  }
}
