import { createRoot } from 'react-dom/client';
import type { ElectronBridge } from '@platform/ipc';
import { createElectronPlatform } from '@platform/electronPlatform';
import { createBrowserPlatform } from '@platform/browserPlatform';
import { Services, ServicesContext } from './services/Services';
import { registerCommands } from './workbench/commands';
import { App } from './App';
import './styles/theme.css';
import './styles/workbench.css';

async function boot() {
  const bridge = (window as unknown as { mageHost?: ElectronBridge }).mageHost;
  const platform = bridge ? createElectronPlatform(bridge) : createBrowserPlatform();
  const services = await Services.create(platform);
  registerCommands(services);

  // Drop a ROM anywhere on the window to create a project from it.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file || !/\.gba$/i.test(file.name)) return;
    await services.project.newProject({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
  });

  createRoot(document.getElementById('root')!).render(
    <ServicesContext.Provider value={services}>
      <App />
    </ServicesContext.Provider>,
  );
  (window as unknown as { mage?: Services }).mage = services;
}

void boot();
