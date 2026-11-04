import type { WorkspaceFs } from '@core/project/fs';

/**
 * The contract between the UI and the host it runs in (Electron or a plain
 * browser). The renderer only talks to the host through this interface, so
 * the workbench is identical in both environments.
 */

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenedFile {
  /** Display name (file name without directories). */
  name: string;
  /** Opaque handle the host can later write back to (a path in Electron). */
  handle: FileHandle;
  data: Uint8Array;
}

/** Host specific reference to a file (path string, or a browser FileSystemFileHandle). */
export type FileHandle = { kind: 'path'; path: string } | { kind: 'browser'; ref: unknown } | { kind: 'none' };

export interface RecentFile {
  name: string;
  path: string;
}

/** A folder the user opened, with file access scoped to it. */
export interface OpenedFolder {
  name: string;
  /** Absolute path where the host has one (Electron). */
  path?: string;
  fs: WorkspaceFs;
}

/** Commands raised by native menus that the workbench should execute. */
export type HostCommandListener = (commandId: string) => void;

export interface PlatformApi {
  readonly kind: 'electron' | 'browser';
  readonly os: 'mac' | 'windows' | 'linux' | 'web';
  /** True if the host renders its own (native) application menu. */
  readonly nativeMenu: boolean;

  openFile(filters: FileFilter[]): Promise<OpenedFile | undefined>;
  /**
   * Lets the user pick a folder (creating it if needed). Returns undefined
   * if cancelled. Hosts without folder access return an in-memory folder
   * and set `persistentFolders` to false.
   */
  pickFolder(title: string): Promise<OpenedFolder | undefined>;
  /** Reopens a folder by path (recent projects). */
  openFolderPath(path: string): Promise<OpenedFolder | undefined>;
  /** False if project folders can't be written to disk (e.g. Firefox). */
  readonly persistentFolders: boolean;
  /** Writes to an existing handle. Returns false if the host can't write there. */
  writeFile(handle: FileHandle, data: Uint8Array): Promise<boolean>;
  /** Asks for a location and writes. Returns the new handle, or undefined if cancelled. */
  saveFileAs(suggestedName: string, data: Uint8Array, filters: FileFilter[]): Promise<{ name: string; handle: FileHandle } | undefined>;
  recentFiles(): Promise<RecentFile[]>;
  addRecentFile(file: RecentFile): Promise<void>;
  clearRecentFiles(): Promise<void>;

  loadSettings(): Promise<Record<string, unknown>>;
  saveSettings(settings: Record<string, unknown>): Promise<void>;

  setTitle(title: string): void;
  setDocumentEdited(edited: boolean): void;
  onHostCommand(listener: HostCommandListener): void;
  /** Registered by the workbench; asked before the window closes. Return true to allow. */
  setCloseGuard(guard: () => Promise<boolean>): void;
  openExternal(url: string): void;
}
