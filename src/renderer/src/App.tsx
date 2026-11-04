import { useEffect } from 'react';
import { APP_MENU, type MenuItemSpec } from '@shared/menus';
import { IPC, type ElectronBridge } from '@platform/ipc';
import { useServices } from './services/Services';
import { useStore } from './services/store';
import { Workbench } from './workbench/Workbench';

function menuCommands(items: MenuItemSpec[]): string[] {
  return items.flatMap((i) => ('command' in i ? [i.command] : 'submenu' in i ? menuCommands(i.items) : []));
}
const ALL_MENU_COMMANDS = APP_MENU.flatMap((m) => menuCommands(m.items));

/** Root component: wires window-level concerns (title, close guard, native menu state). */
export function App() {
  const s = useServices();
  const state = useStore(s.project.state);

  useEffect(() => s.keybindings.install(), [s]);

  useEffect(() => {
    const name = state.project ? `${state.project.name}${state.dirty ? ' •' : ''} — MAGE Web` : 'MAGE Web';
    s.platform.setTitle(name);
    s.platform.setDocumentEdited(state.dirty);
  }, [s, state]);

  useEffect(() => {
    s.platform.setCloseGuard(() => s.project.prompts.confirmDiscard());
  }, [s]);

  // Keep native menu check marks and enablement in sync.
  useEffect(() => {
    const bridge = (window as unknown as { mageHost?: ElectronBridge }).mageHost;
    if (!bridge) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const push = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        bridge.send(IPC.updateMenuState, {
          checked: ALL_MENU_COMMANDS.filter((c) => s.commands.isChecked(c)),
          enabled: ALL_MENU_COMMANDS.filter((c) => s.commands.isEnabled(c)),
        });
      }, 50);
    };
    const subs = [
      s.commands.onDidChangeState(push),
      s.commands.onDidRegister(push),
      s.roomTools.state.onDidChange(push),
      s.project.state.onDidChange(push),
      s.editors.state.onDidChange(push),
    ];
    push();
    return () => subs.forEach((d) => d.dispose());
  }, [s]);

  return <Workbench />;
}
