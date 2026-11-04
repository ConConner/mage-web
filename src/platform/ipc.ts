/** IPC channel names shared by the Electron main process and preload script. */
export const IPC = {
  openFile: 'mage:open-file',
  openPath: 'mage:open-path',
  writeFile: 'mage:write-file',
  saveFileAs: 'mage:save-file-as',
  pickFolder: 'mage:pick-folder',
  folderExists: 'mage:folder-exists',
  fsList: 'mage:fs-list',
  fsRead: 'mage:fs-read',
  fsReadMany: 'mage:fs-read-many',
  fsWrite: 'mage:fs-write',
  fsWriteMany: 'mage:fs-write-many',
  fsRemove: 'mage:fs-remove',
  recentFiles: 'mage:recent-files',
  addRecent: 'mage:add-recent',
  clearRecent: 'mage:clear-recent',
  loadSettings: 'mage:load-settings',
  saveSettings: 'mage:save-settings',
  setTitle: 'mage:set-title',
  setEdited: 'mage:set-edited',
  hostCommand: 'mage:host-command',
  closeRequest: 'mage:close-request',
  closeResponse: 'mage:close-response',
  openExternal: 'mage:open-external',
  updateMenuState: 'mage:update-menu-state',
} as const;

/** What the preload exposes on `window.mageHost`. */
export interface ElectronBridge {
  platform: NodeJS.Platform;
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (...args: unknown[]) => void): void;
  /** Absolute path of a dropped file (Electron removed `File.path`). */
  pathForFile(file: File): string;
}
