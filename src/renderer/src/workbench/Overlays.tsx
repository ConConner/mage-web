import { useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../services/Services';
import { useStore } from '../services/store';
import { Icon } from '../components/Icon';

/** Command palette style quick pick. */
export function QuickPick() {
  const { dialogs } = useServices();
  const req = useStore(dialogs.quickPick);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery('');
    setActive(req?.activeIndex ?? 0);
  }, [req]);

  const items = useMemo(() => {
    if (!req) return [];
    const q = query.trim().toLowerCase();
    if (!q) return req.items;
    const words = q.split(/\s+/);
    return req.items.filter((i) => {
      const hay = `${i.label} ${i.description ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [req, query]);

  useEffect(() => {
    req?.onHighlight?.(items[active]);
    listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [active, items, req]);

  if (!req) return null;
  const accept = (i: number) => req.resolve(items[i]);

  return (
    <div className="quick-pick-backdrop" onMouseDown={() => req.resolve(undefined)}>
      <div className="quick-pick" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={req.placeholder}>
        <input
          autoFocus
          className="input quick-pick-input"
          placeholder={req.placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') accept(active);
            else if (e.key === 'Escape') req.resolve(undefined);
          }}
        />
        <div className="quick-pick-list" ref={listRef} role="listbox">
          {items.length === 0 && <div className="quick-pick-empty">No matching items</div>}
          {items.map((item, i) => (
            <div
              key={i}
              role="option"
              aria-selected={i === active}
              className={`quick-pick-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => accept(i)}
            >
              <span className="qp-label">{item.label}</span>
              {item.description && <span className="qp-description">{item.description}</span>}
              {item.detail && <span className="qp-detail">{item.detail}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Dialogs() {
  const { dialogs } = useServices();
  const list = useStore(dialogs.dialogs);
  return (
    <>
      {list.map((d) => (
        <div key={d.id} className="modal-backdrop" onMouseDown={() => d.resolve(undefined)}>
          <div
            className="modal"
            role="dialog"
            aria-modal
            aria-label={d.title}
            style={{ width: d.width ?? 420 }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && d.resolve(undefined)}
          >
            <header className="modal-header">
              <span>{d.title}</span>
              <button className="icon-button" aria-label="Close" onClick={() => d.resolve(undefined)}>
                <Icon name="close" />
              </button>
            </header>
            <div className="modal-body">{d.render(d.resolve)}</div>
          </div>
        </div>
      ))}
    </>
  );
}

export function ContextMenu() {
  const { dialogs } = useServices();
  const menu = useStore(dialogs.contextMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!menu) return;
    const close = () => dialogs.contextMenu.set(undefined);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    // Register after the opening event has finished propagating.
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', close);
      window.addEventListener('blur', close);
      window.addEventListener('keydown', onKey);
    });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, dialogs]);

  useEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 4), y: Math.min(menu.y, window.innerHeight - r.height - 4) });
  }, [menu]);

  if (!menu) return null;
  return (
    <div className="context-menu" ref={ref} style={{ left: pos.x, top: pos.y }} onMouseDown={(e) => e.stopPropagation()} role="menu">
      {menu.items.map((item, i) =>
        'separator' in item ? (
          i > 0 && i < menu.items.length - 1 && !('separator' in menu.items[i - 1]) ? <div key={i} className="menu-separator" /> : null
        ) : (
          <button
            key={i}
            role="menuitem"
            className="menu-item"
            disabled={item.disabled}
            onClick={() => {
              dialogs.contextMenu.set(undefined);
              item.run();
            }}
          >
            <span className="menu-check" />
            <span className="menu-label">{item.label}</span>
            {item.hint && <span className="menu-accel">{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}

export function Toasts() {
  const { notifications } = useServices();
  const toasts = useStore(notifications.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.severity}`}>
          <Icon name={t.severity === 'error' || t.severity === 'warning' ? 'warning' : 'info'} />
          <span>{t.message}</span>
          <button className="icon-button" aria-label="Dismiss" onClick={() => notifications.dismiss(t.id)}>
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
