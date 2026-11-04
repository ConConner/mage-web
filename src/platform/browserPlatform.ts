import { MemoryFs, normalizePath, type WorkspaceFs } from '@core/project/fs';
import type { FileFilter, FileHandle, OpenedFile, OpenedFolder, PlatformApi, RecentFile } from './api';

/**
 * PlatformApi for running the workbench in a regular browser. Uses the File
 * System Access API where available (Chromium) and falls back to file
 * inputs and downloads elsewhere. Settings live in localStorage.
 */
type FsHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: BufferSource): Promise<void>; close(): Promise<void> }>;
};
type DirHandle = {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FsHandle>;
  removeEntry(name: string): Promise<void>;
  entries(): AsyncIterable<[string, (FsHandle & { kind: 'file' }) | DirHandle]>;
};
type FsWindow = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<FsHandle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<FsHandle>;
  showDirectoryPicker?: (o: unknown) => Promise<DirHandle>;
};

/** Project folder access through a File System Access directory handle. */
function directoryFs(root: DirHandle): WorkspaceFs {
  const dirOf = async (path: string, create: boolean) => {
    const parts = normalizePath(path).split('/');
    const file = parts.pop()!;
    let dir = root;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
    return { dir, file };
  };
  return {
    name: root.name,
    async list() {
      const out: string[] = [];
      const walk = async (dir: DirHandle, prefix: string) => {
        for await (const [name, h] of dir.entries()) {
          if (name === '.git' || name === 'node_modules') continue;
          if (h.kind === 'directory') await walk(h, prefix + name + '/');
          else out.push(prefix + name);
        }
      };
      await walk(root, '');
      return out.sort();
    },
    async read(path) {
      try {
        const { dir, file } = await dirOf(path, false);
        const f = await (await dir.getFileHandle(file)).getFile();
        return new Uint8Array(await f.arrayBuffer());
      } catch {
        return undefined;
      }
    },
    async write(path, data) {
      const { dir, file } = await dirOf(path, true);
      const w = await (await dir.getFileHandle(file, { create: true })).createWritable();
      await w.write(data as BufferSource);
      await w.close();
    },
    async remove(path) {
      try {
        const { dir, file } = await dirOf(path, false);
        await dir.removeEntry(file);
      } catch {
        /* already gone */
      }
    },
  };
}

const SETTINGS_KEY = 'mage.settings';
const RECENT_KEY = 'mage.recent';

const accept = (filters: FileFilter[]) =>
  filters.map((f) => ({ description: f.name, accept: { 'application/octet-stream': f.extensions.map((e) => '.' + e) } }));

function pickWithInput(filters: FileFilter[]): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters.flatMap((f) => f.extensions.map((e) => '.' + e)).join(',');
    input.onchange = () => resolve(input.files?.[0] ?? undefined);
    input.addEventListener('cancel', () => resolve(undefined));
    input.click();
  });
}

function download(name: string, data: Uint8Array | string) {
  const blob = new Blob([data as BlobPart]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}


export function createBrowserPlatform(): PlatformApi {
  const w = window as FsWindow;
  const ua = navigator.userAgent;
  let closeGuardDirty = false;
  window.addEventListener('beforeunload', (e) => {
    if (closeGuardDirty) e.preventDefault();
  });

  return {
    kind: 'browser',
    os: /Mac/.test(ua) ? 'mac' : 'web',
    nativeMenu: false,
    async openFile(filters): Promise<OpenedFile | undefined> {
      if (w.showOpenFilePicker) {
        try {
          const [h] = await w.showOpenFilePicker({ types: accept(filters) });
          const f = await h.getFile();
          return { name: f.name, handle: { kind: 'browser', ref: h }, data: new Uint8Array(await f.arrayBuffer()) };
        } catch {
          return undefined;
        }
      }
      const f = await pickWithInput(filters);
      return f ? { name: f.name, handle: { kind: 'none' }, data: new Uint8Array(await f.arrayBuffer()) } : undefined;
    },
    persistentFolders: !!w.showDirectoryPicker,
    async pickFolder(title): Promise<OpenedFolder | undefined> {
      if (!w.showDirectoryPicker) {
        // No folder access (e.g. Firefox/Safari): work in memory, export the build as a download.
        const name = prompt(`${title}\n\nThis browser can't write folders, so the project lives in memory only. Project name:`, 'project');
        return name ? { name, fs: new MemoryFs(name) } : undefined;
      }
      try {
        const dir = await w.showDirectoryPicker({ id: 'mage-project', mode: 'readwrite' });
        return { name: dir.name, fs: directoryFs(dir) };
      } catch {
        return undefined;
      }
    },
    async openFolderPath() {
      return undefined;
    },
    async writeFile(handle, data) {
      if (handle.kind !== 'browser') return false;
      const writable = await (handle.ref as FsHandle).createWritable();
      await writable.write(data as BufferSource);
      await writable.close();
      return true;
    },
    async saveFileAs(name, data, filters) {
      if (w.showSaveFilePicker) {
        try {
          const h = await w.showSaveFilePicker({ suggestedName: name, types: accept(filters) });
          const handle: FileHandle = { kind: 'browser', ref: h };
          await this.writeFile(handle, data);
          return { name: h.name, handle };
        } catch {
          return undefined;
        }
      }
      download(name, data);
      return { name, handle: { kind: 'none' } };
    },
    async recentFiles(): Promise<RecentFile[]> {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    },
    async addRecentFile() {
      /* browser files can't be reopened by path */
    },
    async clearRecentFiles() {
      localStorage.removeItem(RECENT_KEY);
    },
    async loadSettings() {
      try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
      } catch {
        return {};
      }
    },
    async saveSettings(s) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    },
    setTitle(t) {
      document.title = t;
    },
    setDocumentEdited(e) {
      closeGuardDirty = e;
    },
    onHostCommand() {
      /* no native menu in the browser */
    },
    setCloseGuard() {
      /* handled with beforeunload */
    },
    openExternal(url) {
      window.open(url, '_blank', 'noopener');
    },
  };
}
