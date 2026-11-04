import { useServices } from '../../services/Services';
import { useEvent, useStore } from '../../services/store';
import { Select, ToolButton } from '../../components/controls';
import type { RoomEditorModel } from './RoomEditorModel';
import type { BgLayerKey } from './RoomTools';

const EVENT_LABEL = ['Default', 'Event 1', 'Event 2'];

/** Per-editor toolbar: tools, edited layers, view toggles, sprite set and zoom. */
export function RoomToolbar({ model }: { model: RoomEditorModel }) {
  const { roomTools, commands } = useServices();
  const t = useStore(roomTools.state);
  const ui = useStore(model.ui);
  useEvent(model.undo.onDidChange);
  useEvent(model.onDidReload);
  const room = model.room;
  const bgEditable = (k: BgLayerKey) => room.layers[{ bg0: 0, bg1: 1, bg2: 2 }[k]].isRle;
  const sets = room.spriteSetIndices;

  return (
    <div className="toolbar room-toolbar">
      <div className="toolbar-group">
        <ToolButton icon="brush" label="Block editing (B)" active={t.mode === 'blocks'} onClick={() => roomTools.setMode('blocks')} />
        <ToolButton icon="cursor" label="Object editing (O)" active={t.mode === 'objects'} onClick={() => roomTools.setMode('objects')} />
        <ToolButton icon="bucket" label="Fill tool (F)" active={t.fill} disabled={t.mode !== 'blocks'} onClick={() => roomTools.update({ fill: !t.fill })} />
      </div>
      <div className="toolbar-group" title="Layers written by the brush">
        <span className="toolbar-label">Edit</span>
        {(['bg0', 'bg1', 'bg2'] as BgLayerKey[]).map((k, i) => (
          <ToolButton key={k} label={`Edit BG ${i}`} active={t.bgLayer === k} disabled={!bgEditable(k)} onClick={() => roomTools.setBgLayer(k)}>
            <span className="tool-text">{i}</span>
          </ToolButton>
        ))}
        <ToolButton label="Edit clipdata" active={t.editClip} onClick={() => roomTools.update({ editClip: !t.editClip })}>
          <span className="tool-text">Clip</span>
        </ToolButton>
      </div>
      <div className="toolbar-group" title="Visible layers">
        <span className="toolbar-label">View</span>
        {[0, 1, 2, 3].map((i) => (
          <ToolButton key={i} label={`Show BG ${i}`} active={t.view.layers[i]} disabled={!room.layers[i].exists} onClick={() => roomTools.toggleLayerView(i)}>
            <span className="tool-text">{i}</span>
          </ToolButton>
        ))}
        <ToolButton label="Sprites" active={t.view.sprites} onClick={() => roomTools.toggleView('sprites')}>
          <span className="tool-text">Spr</span>
        </ToolButton>
        <ToolButton label="Doors" active={t.view.doors} onClick={() => roomTools.toggleView('doors')}>
          <span className="tool-text">Door</span>
        </ToolButton>
        <ToolButton label="Scrolls" active={t.view.scrolls} onClick={() => roomTools.toggleView('scrolls')}>
          <span className="tool-text">Scr</span>
        </ToolButton>
        <ToolButton label="Collision" active={t.view.collision} onClick={() => roomTools.toggleView('collision')}>
          <span className="tool-text">Col</span>
        </ToolButton>
        <ToolButton label="Breakable blocks" active={t.view.breakable} onClick={() => roomTools.toggleView('breakable')}>
          <span className="tool-text">Brk</span>
        </ToolButton>
        <ToolButton label="Clipdata values" active={t.view.values} onClick={() => roomTools.toggleView('values')}>
          <span className="tool-text">Val</span>
        </ToolButton>
      </div>
      <div className="toolbar-group">
        <span className="toolbar-label">Sprites</span>
        <Select
          value={ui.spriteSet}
          disabled={sets.length < 2}
          options={sets.map((i) => ({ value: i, label: `${EVENT_LABEL[i]} (set ${(room.spritesets[i]?.number ?? 0).toString(16).toUpperCase()})` }))}
          onChange={(v) => model.ui.update({ spriteSet: v, selected: undefined })}
        />
      </div>
      <span className="spacer" />
      <div className="toolbar-group">
        <ToolButton icon="undo" label={`Undo ${model.undo.undoLabel ?? ''}`} disabled={!model.undo.canUndo} onClick={() => commands.execute('edit.undo')} />
        <ToolButton icon="redo" label={`Redo ${model.undo.redoLabel ?? ''}`} disabled={!model.undo.canRedo} onClick={() => commands.execute('edit.redo')} />
        <ToolButton icon="zoomOut" label="Zoom out" onClick={() => model.zoomBy(-1)} />
        <span className="toolbar-zoom">{Math.round(ui.zoom * 100)}%</span>
        <ToolButton icon="zoomIn" label="Zoom in" onClick={() => model.zoomBy(1)} />
      </div>
    </div>
  );
}
