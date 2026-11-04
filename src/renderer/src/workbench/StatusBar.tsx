import { useServices } from '../services/Services';
import { useStore } from '../services/store';
import { hex } from '../components/controls';
import type { RoomEditorModel } from '../editors/room/RoomEditorModel';

export function StatusBar() {
  const { project, rooms, theme, commands } = useServices();
  const s = useStore(project.state);
  const model = useStore(rooms.active);
  const th = useStore(theme.current);

  return (
    <footer className={`statusbar ${s.project ? '' : 'no-rom'}`}>
      {s.project ? (
        <>
          <span className="status-item" title={s.project.game.gameName}>
            {s.project.game.gameCode}
          </span>
          <button className="status-item status-button" title="Project overview" onClick={() => commands.execute('editor.project')}>
            {s.project.name}
            {s.dirty ? ` • ${s.project.dirtyPaths().length} unsaved` : ''}
          </button>
        </>
      ) : (
        <span className="status-item">No project open</span>
      )}
      {s.busy && <span className="status-item">{s.busy}</span>}
      {model && <RoomStatus model={model} />}
      <span className="spacer" />
      {model && <ZoomStatus model={model} onClick={() => commands.execute('room.zoomReset')} />}
      <button className="status-item status-button" onClick={() => commands.execute('workbench.selectTheme')}>
        {th.name}
      </button>
    </footer>
  );
}

function RoomStatus({ model }: { model: RoomEditorModel }) {
  const { roomTools } = useServices();
  const ui = useStore(model.ui);
  const t = useStore(roomTools.state);
  const game = model.rom.game;
  const block = ui.cursor && model.room.inBounds(ui.cursor.x, ui.cursor.y) ? model.room.getBlock(ui.cursor.x, ui.cursor.y) : undefined;
  const brush = t.brush ? `${hex(t.brush.blocks[0]?.length ?? 0)}×${hex(t.brush.blocks.length)}` : '—';
  return (
    <>
      <span className="status-item">{t.mode === 'blocks' ? (t.fill ? 'Fill' : 'Blocks') : 'Objects'}</span>
      {ui.cursor && (
        <span className="status-item">
          ({hex(ui.cursor.x)}, {hex(ui.cursor.y)})
        </span>
      )}
      {block && (
        <span className="status-item" title="Clipdata under the cursor">
          Clip {hex(block.clip & 0xff)} {game.clipdata[block.clip & 0xff]?.name}
        </span>
      )}
      <span className="status-item">Brush {brush}</span>
      <span className="status-item">Paint clip {hex(t.clipValue)}</span>
    </>
  );
}

function ZoomStatus({ model, onClick }: { model: RoomEditorModel; onClick: () => void }) {
  const zoom = useStore(model.ui, (u) => u.zoom);
  return (
    <button className="status-item status-button" onClick={onClick}>
      {Math.round(zoom * 100)}%
    </button>
  );
}
