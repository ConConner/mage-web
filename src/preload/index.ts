import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ElectronBridge } from '../platform/ipc';

/** Narrow, channel-agnostic bridge; the renderer wraps it in a typed PlatformApi. */
const bridge: ElectronBridge = {
  platform: process.platform,
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, listener) => {
    ipcRenderer.on(channel, (_event, ...args) => listener(...args));
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('mageHost', bridge);
