import type { WorkspaceFs } from '@core/project/fs';
import type { FileFilter, FileHandle, OpenedFile, OpenedFolder, PlatformApi, RecentFile } from './api';
import { IPC, type ElectronBridge } from './ipc';

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** Workspace files through the main process; every path is resolved inside `root` there. */
function folderFs(bridge: ElectronBridge, root: string): WorkspaceFs {
  const bytes = (d: Uint8Array | null | undefined) => (d ? new Uint8Array(d) : undefined);
  return {
    name: baseName(root),
    location: root,
    list: () => bridge.invoke<string[]>(IPC.fsList, root),
    read: async (path) => bytes(await bridge.invoke<Uint8Array | null>(IPC.fsRead, root, path)),
    readMany: async (paths) => (await bridge.invoke<(Uint8Array | null)[]>(IPC.fsReadMany, root, paths)).map(bytes),
    write: (path, data) => bridge.invoke(IPC.fsWrite, root, path, data).then(() => undefined),
    writeMany: (files) => bridge.invoke(IPC.fsWriteMany, root, files).then(() => undefined),
    remove: (path) => bridge.invoke(IPC.fsRemove, root, path).then(() => undefined),
  };
}

interface WireFile {
  name: string;
  path: string;
  data: Uint8Array;
}

const toOpened = (f: WireFile | null | undefined): OpenedFile | undefined =>
  f ? { name: f.name, handle: { kind: 'path', path: f.path }, data: new Uint8Array(f.data) } : undefined;

const pathOf = (h: FileHandle) => (h.kind === 'path' ? h.path : undefined);

/** PlatformApi backed by the Electron main process through the preload bridge. */
export function createElectronPlatform(bridge: ElectronBridge): PlatformApi {
  let closeGuard: () => Promise<boolean> = async () => true;
  bridge.on(IPC.closeRequest, async () => {
    bridge.send(IPC.closeResponse, await closeGuard());
  });

  const os = bridge.platform === 'darwin' ? 'mac' : bridge.platform === 'win32' ? 'windows' : 'linux';
  return {
    kind: 'electron',
    os,
    nativeMenu: true,
    openFile: async (filters: FileFilter[]) => toOpened(await bridge.invoke<WireFile | null>(IPC.openFile, filters)),
    persistentFolders: true,
    pickFolder: async (title): Promise<OpenedFolder | undefined> => {
      const path = await bridge.invoke<string | null>(IPC.pickFolder, title);
      return path ? { name: baseName(path), path, fs: folderFs(bridge, path) } : undefined;
    },
    openFolderPath: async (path): Promise<OpenedFolder | undefined> =>
      (await bridge.invoke<boolean>(IPC.folderExists, path)) ? { name: baseName(path), path, fs: folderFs(bridge, path) } : undefined,
    writeFile: async (handle, data) => {
      const path = pathOf(handle);
      return path ? bridge.invoke<boolean>(IPC.writeFile, path, data) : false;
    },
    saveFileAs: async (suggestedName, data, filters) => {
      const r = await bridge.invoke<{ name: string; path: string } | null>(IPC.saveFileAs, suggestedName, data, filters);
      return r ? { name: r.name, handle: { kind: 'path', path: r.path } } : undefined;
    },
    recentFiles: () => bridge.invoke<RecentFile[]>(IPC.recentFiles),
    addRecentFile: (f) => bridge.invoke(IPC.addRecent, f).then(() => undefined),
    clearRecentFiles: () => bridge.invoke(IPC.clearRecent).then(() => undefined),
    loadSettings: () => bridge.invoke<Record<string, unknown>>(IPC.loadSettings),
    saveSettings: (s) => bridge.invoke(IPC.saveSettings, s).then(() => undefined),
    setTitle: (t) => bridge.send(IPC.setTitle, t),
    setDocumentEdited: (e) => bridge.send(IPC.setEdited, e),
    onHostCommand: (listener) => bridge.on(IPC.hostCommand, (id) => listener(id as string)),
    setCloseGuard: (g) => {
      closeGuard = g;
    },
    openExternal: (url) => bridge.send(IPC.openExternal, url),
  };
}
