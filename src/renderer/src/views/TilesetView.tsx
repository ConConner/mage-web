import { useRef, useState } from 'react';
import { EMPTY, type Block } from '@core/model/Room';
import { useServices } from '../services/Services';
import { useEvent, useStore } from '../services/store';
import { PixelCanvas, canvasPoint } from '../components/PixelCanvas';
import { Checkbox, Section, ToolButton, hex } from '../components/controls';

/** Block picker for the active room's tileset plus clipdata selection. */
export function TilesetView() {
  const { rooms, roomTools, settings } = useServices();
  const model = useStore(rooms.last);
  const tools = useStore(roomTools.state);
  useEvent(model?.onDidReload);
  const [zoom, setZoom] = useState(settings.get('tileset.zoom'));
  const pivot = useRef<{ x: number; y: number } | undefined>(undefined);
  const [hover, setHover] = useState<{ x: number; y: number }>();

  if (!model) return <div className="view-empty">Open a room to pick blocks.</div>;
  const sheet = model.renderer.blocks;
  const rows = sheet.height / 16;
  const game = model.rom.game;
  const sel = tools.tilesetSelection;

  const selectRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x) + 1, h = Math.abs(a.y - b.y) + 1;
    const blocks: Block[][] = [];
    for (let yy = y; yy < y + h; yy++) {
      const row: Block[] = [];
      for (let xx = x; xx < x + w; xx++) {
        const n = yy * 16 + xx;
        row.push({ bg0: n, bg1: n, bg2: n, clip: EMPTY });
      }
      blocks.push(row);
    }
    roomTools.update({ tilesetSelection: { x, y, w, h }, brush: { blocks, source: 'tileset' }, mode: 'blocks' });
    model.ui.update({ selection: undefined });
  };
  const cell = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = canvasPoint(e, zoom);
    return { x: Math.max(0, Math.min(15, Math.floor(p.x / 16))), y: Math.max(0, Math.min(rows - 1, Math.floor(p.y / 16))) };
  };
  const hoverBlock = hover ? hover.y * 16 + hover.x : undefined;

  return (
    <div className="tileset-view">
      <Section
        title={`Tileset ${hex(model.room.tileset.number)}`}
        actions={
          <span className="inline-actions">
            <ToolButton icon="zoomOut" label="Zoom out" onClick={() => { setZoom(1); settings.set('tileset.zoom', 1); }} />
            <ToolButton icon="zoomIn" label="Zoom in" onClick={() => { setZoom(2); settings.set('tileset.zoom', 2); }} />
          </span>
        }
      >
        <div className="tileset-scroll">
          <div className="tileset-stage" style={{ width: 256 * zoom, height: sheet.height * zoom }}>
            <PixelCanvas
              image={sheet}
              zoom={zoom}
              className="checker"
              onMouseDown={(e) => {
                const c = cell(e);
                pivot.current = c;
                selectRect(c, c);
              }}
              onMouseMove={(e) => {
                const c = cell(e);
                setHover(c);
                if (pivot.current && e.buttons) selectRect(pivot.current, c);
              }}
              onMouseUp={() => (pivot.current = undefined)}
              onMouseLeave={() => setHover(undefined)}
            />
            {sel && (
              <div className="tileset-selection" style={{ left: sel.x * 16 * zoom, top: sel.y * 16 * zoom, width: sel.w * 16 * zoom, height: sel.h * 16 * zoom }} />
            )}
          </div>
        </div>
        <div className="view-footer">
          {hoverBlock !== undefined ? `Block ${hex(hoverBlock, 3)}` : sel ? `Selected ${hex(sel.w)} × ${hex(sel.h)}` : `${hex(model.room.tileset.blockCount, 3)} blocks`}
        </div>
      </Section>
      <Section title="Clipdata">
        <div className="clip-picker">
          <input
            className="input"
            placeholder="Filter clipdata…"
            onChange={(e) => {
              const q = e.target.value.toLowerCase();
              const list = e.currentTarget.parentElement!.querySelector('.clip-list')!;
              list.querySelectorAll<HTMLElement>('[data-label]').forEach((el) => (el.style.display = el.dataset.label!.includes(q) ? '' : 'none'));
            }}
          />
          <div className="clip-list" role="listbox">
            {game.clipdata
              .filter((c) => c.name || c.value === tools.clipValue)
              .map((c) => (
                <div
                  key={c.value}
                  role="option"
                  aria-selected={c.value === tools.clipValue}
                  data-label={c.label.toLowerCase()}
                  className={`clip-item ${c.value === tools.clipValue ? 'selected' : ''}`}
                  onClick={() => roomTools.update({ clipValue: c.value, editClip: true })}
                >
                  <span className="clip-value">{hex(c.value)}</span>
                  <span className="clip-symbol">{c.symbol}</span>
                  <span className="clip-name">{c.name}</span>
                </div>
              ))}
          </div>
          <Checkbox checked={tools.forceClip} onChange={(v) => roomTools.update({ forceClip: v })} label="Always use selected clipdata" />
          <Checkbox checked={tools.fillDiagonal} onChange={(v) => roomTools.update({ fillDiagonal: v })} label="Fill includes diagonal neighbours" />
        </div>
      </Section>
    </div>
  );
}
