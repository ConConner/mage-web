import { useCallback, type ReactNode } from 'react';
import { useServices } from '../services/Services';
import { useEvent, useStore } from '../services/store';
import type { ViewContainerId } from '../services/LayoutService';
import { Icon } from '../components/Icon';
import { ExplorerView } from '../views/ExplorerView';
import { TilesetView } from '../views/TilesetView';
import { PropertiesView } from '../views/PropertiesView';
import { OutputPanel } from '../views/OutputPanel';
import { EditorArea } from './EditorArea';
import { StatusBar } from './StatusBar';
import { MenuBar } from './MenuBar';
import { ContextMenu, Dialogs, QuickPick, Toasts } from './Overlays';

/** Draggable splitter; reports the pointer delta while dragging. */
function Sash({ direction, onDrag }: { direction: 'vertical' | 'horizontal'; onDrag: (delta: number) => void }) {
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let last = direction === 'vertical' ? e.clientX : e.clientY;
      const move = (ev: MouseEvent) => {
        const pos = direction === 'vertical' ? ev.clientX : ev.clientY;
        onDrag(pos - last);
        last = pos;
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing');
      };
      document.body.classList.add('resizing');
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [direction, onDrag],
  );
  return <div className={`sash sash-${direction}`} onMouseDown={onMouseDown} />;
}

const CONTAINERS: { id: ViewContainerId; icon: string; title: string; render: () => ReactNode }[] = [
  { id: 'explorer', icon: 'files', title: 'Explorer', render: () => <ExplorerView /> },
  { id: 'tileset', icon: 'grid', title: 'Tileset & Clipdata', render: () => <TilesetView /> },
  { id: 'properties', icon: 'properties', title: 'Properties', render: () => <PropertiesView /> },
];

export function Workbench() {
  const services = useServices();
  const { layout, platform, commands } = services;
  const l = useStore(layout.state);
  const hasRoom = useStore(services.rooms.active) !== undefined;
  useEvent(commands.onDidChangeState);
  const container = CONTAINERS.find((c) => c.id === l.activeContainer) ?? CONTAINERS[0];
  const showAux = l.auxVisible && hasRoom;

  return (
    <div className={`workbench os-${platform.os}`}>
      {!platform.nativeMenu && (
        <div className="titlebar">
          <span className="titlebar-logo">MAGE</span>
          <MenuBar />
        </div>
      )}
      <div className="workbench-body">
        <nav className="activitybar" aria-label="Views">
          {CONTAINERS.map((c) => (
            <button
              key={c.id}
              className={`activity ${l.sidebarVisible && l.activeContainer === c.id ? 'active' : ''}`}
              title={c.title}
              aria-label={c.title}
              onClick={() => layout.showContainer(c.id)}
            >
              <Icon name={c.icon} size={22} />
            </button>
          ))}
          <span className="spacer" />
          <button className="activity" title="Output" aria-label="Toggle output panel" onClick={() => layout.togglePanel('output')}>
            <Icon name="output" size={22} />
          </button>
          <button className="activity" title="Color Theme" aria-label="Color theme" onClick={() => commands.execute('workbench.selectTheme')}>
            <Icon name="gear" size={22} />
          </button>
        </nav>
        {l.sidebarVisible && (
          <>
            <aside className="sidebar" style={{ width: l.sidebarWidth }}>
              <header className="sidebar-title">{container.title}</header>
              <div className="sidebar-content">{container.render()}</div>
            </aside>
            <Sash direction="vertical" onDrag={(d) => layout.setSidebarWidth(layout.state.get().sidebarWidth + d)} />
          </>
        )}
        <main className="main-column">
          <div className="editor-row">
            <EditorArea />
            {showAux && l.activeContainer !== 'tileset' && (
              <>
                <Sash direction="vertical" onDrag={(d) => layout.state.update({ auxWidth: Math.max(220, Math.min(560, layout.state.get().auxWidth - d)) })} />
                <aside className="auxbar" style={{ width: l.auxWidth }}>
                  <div className="auxbar-content">
                    <TilesetView />
                    <PropertiesView />
                  </div>
                </aside>
              </>
            )}
          </div>
          {l.panelVisible && (
            <>
              <Sash direction="horizontal" onDrag={(d) => layout.setPanelHeight(layout.state.get().panelHeight - d)} />
              <section className="panel" style={{ height: l.panelHeight }}>
                <header className="panel-header">
                  <span className="panel-tab active">Output</span>
                  <span className="spacer" />
                  <button className="icon-button" aria-label="Close panel" onClick={() => layout.togglePanel()}>
                    <Icon name="close" />
                  </button>
                </header>
                <OutputPanel />
              </section>
            </>
          )}
        </main>
      </div>
      <StatusBar />
      <QuickPick />
      <Dialogs />
      <ContextMenu />
      <Toasts />
    </div>
  );
}
