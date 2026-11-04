import type { ReactNode } from 'react';
import { useServices } from '../services/Services';
import { useStore } from '../services/store';
import type { EditorInput } from '../services/EditorService';
import { Icon } from '../components/Icon';
import { RoomEditor } from '../editors/room/RoomEditor';
import { WelcomeEditor } from '../editors/WelcomeEditor';
import { RoomPropertiesEditor } from '../editors/RoomPropertiesEditor';
import { PaletteEditor } from '../editors/PaletteEditor';
import { GraphicsEditor } from '../editors/GraphicsEditor';
import { TileTableEditor } from '../editors/TileTableEditor';
import { TilesetEditor } from '../editors/TilesetEditor';
import { TilemapEditor } from '../editors/TilemapEditor';
import { SpritesetEditor } from '../editors/SpritesetEditor';
import { SpriteEditor } from '../editors/SpriteEditor';
import { AreaEditor } from '../editors/AreaEditor';
import { ProjectEditor } from '../editors/ProjectEditor';
import { KeybindingsEditor } from '../editors/KeybindingsEditor';

export const EDITOR_ICONS: Record<EditorInput['kind'], string> = {
  welcome: 'info',
  room: 'room',
  roomProperties: 'header',
  palette: 'palette',
  graphics: 'image',
  tileTable: 'table',
  tileset: 'grid',
  tilemap: 'tilemap',
  spriteset: 'layers',
  sprite: 'sprite',
  area: 'map',
  project: 'info',
  keybindings: 'keyboard',
};

/** Maps an editor input to its editor component. */
function renderEditor(input: EditorInput): ReactNode {
  const p = input.params;
  switch (input.kind) {
    case 'welcome':
      return <WelcomeEditor />;
    case 'room':
      return <RoomEditor key={input.id} area={Number(p.area)} room={Number(p.room)} />;
    case 'roomProperties':
      return <RoomPropertiesEditor key={input.id} path={String(p.path)} />;
    case 'palette':
      return <PaletteEditor key={input.id} path={String(p.path)} />;
    case 'graphics':
      return <GraphicsEditor key={input.id} path={String(p.path)} />;
    case 'tileTable':
      return <TileTableEditor key={input.id} path={String(p.path)} />;
    case 'tileset':
      return <TilesetEditor key={input.id} path={String(p.path)} />;
    case 'tilemap':
      return <TilemapEditor key={input.id} path={String(p.path)} />;
    case 'spriteset':
      return <SpritesetEditor key={input.id} path={String(p.path)} />;
    case 'sprite':
      return <SpriteEditor key={input.id} path={String(p.path)} />;
    case 'area':
      return <AreaEditor key={input.id} path={String(p.path)} />;
    case 'project':
      return <ProjectEditor key={input.id} />;
    case 'keybindings':
      return <KeybindingsEditor />;
  }
}

export function EditorArea() {
  const { editors, project } = useServices();
  const state = useStore(editors.state);
  const dirty = useStore(project.state, (s) => s.dirty);
  const active = state.tabs.find((t) => t.id === state.activeId);

  return (
    <div className="editor-area">
      {state.tabs.length > 0 && (
        <div className="tabs" role="tablist">
          {state.tabs.map((t) => (
            <div
              key={t.id}
              role="tab"
              aria-selected={t.id === state.activeId}
              className={`tab ${t.id === state.activeId ? 'active' : ''} ${t.id === state.previewId ? 'preview' : ''}`}
              title={t.description ?? t.title}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  editors.close(t.id);
                } else editors.activate(t.id);
              }}
              onDoubleClick={() => editors.pin(t.id)}
            >
              <Icon name={EDITOR_ICONS[t.kind]} size={14} />
              <span className="tab-label">{t.title}</span>
              {t.description && <span className="tab-description">{t.description}</span>}
              <button
                className="tab-close"
                aria-label={`Close ${t.title}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => editors.close(t.id)}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
          <div className="tabs-filler">{dirty && <span className="dirty-hint">Unsaved changes</span>}</div>
        </div>
      )}
      <div className="editor-container">
        {/* Room editors stay mounted to keep scroll position; others re-mount. */}
        {state.tabs
          .filter((t) => t.kind === 'room')
          .map((t) => (
            <div key={t.id} className="editor-slot" hidden={t.id !== state.activeId}>
              {renderEditor(t)}
            </div>
          ))}
        {active && active.kind !== 'room' && <div className="editor-slot">{renderEditor(active)}</div>}
        {!active && <WelcomeEditor />}
      </div>
    </div>
  );
}
