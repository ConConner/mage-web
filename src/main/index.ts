import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { readFile, writeFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { IPC } from '../platform/ipc';
import { APP_MENU, type MenuItemSpec } from '../shared/menus';

/**
 * Electron main process: window lifecycle, native menus, and file system /
 * settings access on behalf of the renderer. Contains no editor logic.
 */

const isMac = process.platform === 'darwin';
const settingsPath = () => join(app.getPath('userData'), 'settings.json');
const recentPath = () => join(app.getPath('userData'), 'recent.json');

let win: BrowserWindow | undefined;
let checked = new Set<string>();
let enabled = new Set<string>();
let allowClose = false;

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2));
}

interface Recent {
  name: string;
  path: string;
}

const sendCommand = (id: string) => win?.webContents.send(IPC.hostCommand, id);

function toNative(item: MenuItemSpec, recent: Recent[]): MenuItemConstructorOptions {
  if ('separator' in item) return { type: 'separator' };
  if ('role' in item) {
    return {
      label: 'Open Recent',
      submenu: [
        ...recent.map((r) => ({ label: `${r.name} — ${r.path}`, click: () => sendCommand(`file.openRecent:${r.path}`) })),
        ...(recent.length ? [{ type: 'separator' as const }] : []),
        { label: 'Clear Recent', enabled: recent.length > 0, click: () => sendCommand('file.clearRecent') },
      ],
    };
  }
  if ('submenu' in item) return { label: item.submenu, submenu: item.items.map((i) => toNative(i, recent)) };
  // Keyboard shortcuts are handled by the renderer's keybinding service, so
  // accelerators are only displayed, never registered natively.
  const accel = item.accelerator && !item.accelerator.includes(' ') ? item.accelerator : undefined;
  return {
    label: item.label,
    type: item.checkable ? 'checkbox' : 'normal',
    checked: checked.has(item.command),
    enabled: enabled.size === 0 || enabled.has(item.command) || item.command.startsWith('file.') || item.command.startsWith('build.') || item.command.startsWith('help.') || item.command.startsWith('workbench.') || item.command.startsWith('tools.'),
    accelerator: accel,
    registerAccelerator: false,
    click: () => sendCommand(item.command),
  };
}

async function buildMenu() {
  const recent = await readJson<Recent[]>(recentPath(), []);
  const template: MenuItemConstructorOptions[] = [];
  if (isMac) template.push({ role: 'appMenu' });
  for (const m of APP_MENU) {
    const items = m.items.map((i) => toNative(i, recent));
    if (m.label === 'Edit') {
      // Native clipboard roles keep text fields working.
      items.push({ type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    }
    if (m.label === 'View') items.push({ type: 'separator' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' });
    template.push({ label: m.label, submenu: items });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    title: 'MAGE Web',
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    win?.webContents.send(IPC.closeRequest);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

/** Folders the user picked or reopened; workspace file access is limited to these. */
const allowedRoots = new Set<string>();

/** Resolves a project-relative path, refusing anything outside the project folder. */
function inside(root: string, path: string): string {
  const base = resolve(root);
  if (!allowedRoots.has(base)) throw new Error(`Folder was not opened by the user: ${root}`);
  const full = resolve(base, path);
  if (full !== base && !full.startsWith(base + sep)) throw new Error(`Path escapes the project folder: ${path}`);
  return full;
}

async function readOrNull(path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    return null;
  }
}

async function writeInside(root: string, path: string, data: Uint8Array): Promise<void> {
  const full = inside(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.DS_Store']);

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) out.push(relative(root, full).split(sep).join('/'));
    }
  };
  await walk(resolve(root));
  return out.sort();
}

async function readOpened(path: string) {
  const data = await readFile(path);
  return { name: basename(path), path, data: new Uint8Array(data) };
}

function registerIpc() {
  ipcMain.handle(IPC.openFile, async (_e, filters) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters });
    return r.canceled || !r.filePaths[0] ? null : readOpened(r.filePaths[0]);
  });
  ipcMain.handle(IPC.openPath, async (_e, path: string) => {
    try {
      return await readOpened(path);
    } catch {
      return null;
    }
  });
  ipcMain.handle(IPC.writeFile, async (_e, path: string, data: Uint8Array) => {
    await writeFile(path, data);
    return true;
  });
  ipcMain.handle(IPC.saveFileAs, async (_e, name: string, data: Uint8Array, filters) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: name, filters });
    if (r.canceled || !r.filePath) return null;
    await writeFile(r.filePath, data);
    return { name: basename(r.filePath), path: r.filePath };
  });
  ipcMain.handle(IPC.pickFolder, async (_e, title: string) => {
    const r = await dialog.showOpenDialog(win!, { title, buttonLabel: 'Select Folder', properties: ['openDirectory', 'createDirectory', 'promptToCreate'] });
    if (r.canceled || !r.filePaths[0]) return null;
    await mkdir(r.filePaths[0], { recursive: true });
    allowedRoots.add(resolve(r.filePaths[0]));
    return r.filePaths[0];
  });
  ipcMain.handle(IPC.folderExists, async (_e, path: string) => {
    try {
      // Only folders from the recent list can be reopened without a dialog.
      const recent = await readJson<Recent[]>(recentPath(), []);
      if (!recent.some((r) => resolve(r.path) === resolve(path))) return false;
      const ok = (await stat(path)).isDirectory();
      if (ok) allowedRoots.add(resolve(path));
      return ok;
    } catch {
      return false;
    }
  });
  ipcMain.handle(IPC.fsList, (_e, root: string) => listFiles(inside(root, '.')));
  ipcMain.handle(IPC.fsRead, (_e, root: string, path: string) => readOrNull(inside(root, path)));
  ipcMain.handle(IPC.fsReadMany, (_e, root: string, paths: string[]) => Promise.all(paths.map((p) => readOrNull(inside(root, p)))));
  ipcMain.handle(IPC.fsWrite, (_e, root: string, path: string, data: Uint8Array) => writeInside(root, path, data));
  ipcMain.handle(IPC.fsWriteMany, async (_e, root: string, files: [string, Uint8Array][]) => {
    for (const [p, d] of files) await writeInside(root, p, d);
  });
  ipcMain.handle(IPC.fsRemove, (_e, root: string, path: string) => rm(inside(root, path), { force: true }));
  ipcMain.handle(IPC.recentFiles, () => readJson<Recent[]>(recentPath(), []));
  ipcMain.handle(IPC.addRecent, async (_e, file: Recent) => {
    const list = (await readJson<Recent[]>(recentPath(), [])).filter((r) => r.path !== file.path);
    await writeJson(recentPath(), [file, ...list].slice(0, 10));
    app.addRecentDocument(file.path);
    await buildMenu();
  });
  ipcMain.handle(IPC.clearRecent, async () => {
    await writeJson(recentPath(), []);
    app.clearRecentDocuments();
    await buildMenu();
  });
  ipcMain.handle(IPC.loadSettings, () => readJson<Record<string, unknown>>(settingsPath(), {}));
  ipcMain.handle(IPC.saveSettings, (_e, s) => writeJson(settingsPath(), s));
  ipcMain.on(IPC.setTitle, (_e, title: string) => win?.setTitle(title));
  ipcMain.on(IPC.setEdited, (_e, edited: boolean) => win?.setDocumentEdited(edited));
  ipcMain.on(IPC.openExternal, (_e, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  ipcMain.on(IPC.closeResponse, (_e, ok: boolean) => {
    if (!ok) return;
    allowClose = true;
    win?.close();
  });
  ipcMain.on(IPC.updateMenuState, (_e, state: { checked: string[]; enabled: string[] }) => {
    checked = new Set(state.checked);
    enabled = new Set(state.enabled);
    void buildMenu();
  });
}

app.whenReady().then(async () => {
  registerIpc();
  await buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      allowClose = false;
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
