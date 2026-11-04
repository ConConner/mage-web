import { createContext, useContext } from 'react';
import type { PlatformApi } from '@platform/api';
import { CommandService } from './CommandService';
import { KeybindingService } from './KeybindingService';
import { SettingsService } from './SettingsService';
import { ThemeService } from './ThemeService';
import { EditorService } from './EditorService';
import { LayoutService } from './LayoutService';
import { NotificationService } from './NotificationService';
import { DialogService } from './DialogService';
import { ProjectService } from './ProjectService';
import { RoomToolsService } from '../editors/room/RoomTools';
import { RoomEditorService } from '../editors/room/RoomEditorService';

/** The service container: one instance of each service for the app's lifetime. */
export class Services {
  readonly commands = new CommandService();
  readonly keybindings = new KeybindingService(this.commands);
  readonly settings: SettingsService;
  readonly theme: ThemeService;
  readonly editors = new EditorService();
  readonly layout: LayoutService;
  readonly notifications = new NotificationService();
  readonly dialogs = new DialogService();
  readonly project: ProjectService;
  readonly roomTools: RoomToolsService;
  readonly rooms: RoomEditorService;

  private constructor(readonly platform: PlatformApi, settings: SettingsService) {
    this.settings = settings;
    this.theme = new ThemeService(settings);
    this.layout = new LayoutService(settings);
    this.project = new ProjectService(platform, this.notifications);
    this.roomTools = new RoomToolsService(settings);
    this.rooms = new RoomEditorService(this.editors, this.project, this.roomTools, settings, this.notifications);
  }

  static async create(platform: PlatformApi): Promise<Services> {
    const settings = new SettingsService(platform);
    await settings.load();
    return new Services(platform, settings);
  }
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('Services not provided');
  return s;
}
