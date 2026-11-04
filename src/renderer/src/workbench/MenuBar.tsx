import { useEffect, useState } from 'react';
import { APP_MENU, type MenuItemSpec } from '@shared/menus';
import { useServices } from '../services/Services';
import { useEvent } from '../services/store';
import { formatKeybinding } from '../services/KeybindingService';

/** In-window menu bar used when the host has no native menu (browser build). */
export function MenuBar() {
  const { commands } = useServices();
  const [open, setOpen] = useState<number | undefined>();
  useEvent(commands.onDidChangeState);

  useEffect(() => {
    if (open === undefined) return;
    const close = () => setOpen(undefined);
    const timer = setTimeout(() => window.addEventListener('mousedown', close));
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', close);
    };
  }, [open]);

  const renderItems = (items: MenuItemSpec[]) =>
    items.map((item, i) => {
      if ('separator' in item) return <div key={i} className="menu-separator" />;
      if ('role' in item) return null;
      if ('submenu' in item)
        return (
          <div key={i} className="menu-submenu">
            <div className="menu-item">
              <span className="menu-check" />
              <span className="menu-label">{item.submenu}</span>
              <span className="menu-accel">›</span>
            </div>
            <div className="menu-dropdown nested">{renderItems(item.items)}</div>
          </div>
        );
      const cmd = commands.get(item.command);
      return (
        <button
          key={i}
          className="menu-item"
          disabled={!cmd || !commands.isEnabled(item.command)}
          onClick={() => {
            setOpen(undefined);
            void commands.execute(item.command);
          }}
        >
          <span className="menu-check">{item.checkable && commands.isChecked(item.command) ? '✓' : ''}</span>
          <span className="menu-label">{item.label}</span>
          {item.accelerator && <span className="menu-accel">{formatKeybinding(item.accelerator)}</span>}
        </button>
      );
    });

  return (
    <nav className="menubar" onMouseDown={(e) => e.stopPropagation()}>
      {APP_MENU.map((m, i) => (
        <div key={m.label} className="menubar-entry">
          <button
            className={`menubar-button ${open === i ? 'open' : ''}`}
            onClick={() => setOpen(open === i ? undefined : i)}
            onMouseEnter={() => open !== undefined && setOpen(i)}
          >
            {m.label}
          </button>
          {open === i && <div className="menu-dropdown">{renderItems(m.items)}</div>}
        </div>
      ))}
    </nav>
  );
}
