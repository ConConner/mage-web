import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useServices } from '../../services/Services';
import { useEvent, useStore } from '../../services/store';
import type { RoomEditorModel, SelectedObject } from './RoomEditorModel';
import { RoomOverlayPainter } from './RoomOverlayPainter';
import { useRoomInteraction } from './useRoomInteraction';
import { RoomToolbar } from './RoomToolbar';

/** Renders a room: pixel canvas, overlay canvas and DOM cursor/selection boxes. */
export function RoomEditor({ area, room }: { area: number; room: number }) {
  const services = useServices();
  const model = useMemo(() => services.rooms.model(area, room), [services, area, room]);
  if (!model) return <div className="editor-empty">This room could not be loaded. See the Output panel for details.</div>;
  return <RoomEditorView model={model} />;
}

function RoomEditorView({ model }: { model: RoomEditorModel }) {
  const services = useServices();
  const base = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const ui = useStore(model.ui);
  const tools = useStore(services.roomTools.state);
  const reloads = useEvent(model.onDidReload);
  const objectsVersion = useEvent(model.onDidChangeObjects);
  const painter = useMemo(() => new RoomOverlayPainter(model), [model]);
  const [size, setSize] = useState({ w: model.room.width * 16, h: model.room.height * 16 });

  // Pixel layer: full render on mount/reload; partial updates come through onDidRender.
  useLayoutEffect(() => {
    const canvas = base.current!;
    const w = model.room.width * 16, h = model.room.height * 16;
    canvas.width = w;
    canvas.height = h;
    overlay.current!.width = w;
    overlay.current!.height = h;
    setSize({ w, h });
    const ctx = canvas.getContext('2d')!;
    const blit = () => {
      const buf = model.renderer.buffer;
      if (buf.width !== canvas.width || buf.height !== canvas.height) return;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.bytes), buf.width, buf.height), 0, 0);
    };
    const d = model.onDidRender(blit);
    model.render();
    return () => d.dispose();
  }, [model, reloads]);

  // Re-render pixels when view options that affect them change.
  const viewKey = `${tools.view.layers.join()}|${tools.view.sprites}|${ui.spriteSet}`;
  const gfxKey = `${tools.view.animatedPalette}|${tools.view.motherShipHatches}`;
  const firstGfx = useRef(true);
  useEffect(() => {
    if (firstGfx.current) {
      firstGfx.current = false;
      return;
    }
    model.refreshGraphics();
  }, [gfxKey, model]);
  useEffect(() => model.render(), [viewKey, model]);

  // Overlay layer
  useEffect(() => {
    const ctx = overlay.current?.getContext('2d');
    if (ctx) painter.paint(ctx, tools.view, ui.selected);
  }, [painter, tools.view, ui.selected, ui.spriteSet, objectsVersion, reloads]);

  const interaction = useRoomInteraction(model, scroller);

  // Ctrl/Cmd + wheel zoom around the pointer.
  useEffect(() => {
    const el = scroller.current!;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      model.zoomBy(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [model]);

  const z = ui.zoom;
  const brush = tools.brush;
  const cursorSize =
    tools.mode === 'blocks' && !tools.fill && brush ? { w: brush.blocks[0]?.length ?? 1, h: brush.blocks.length } : { w: 1, h: 1 };

  return (
    <div className="room-editor">
      <RoomToolbar model={model} />
      <div className="room-scroller" ref={scroller} tabIndex={0} onContextMenu={(e) => e.preventDefault()}>
        <div
          className="room-stage"
          style={{ width: size.w * z, height: size.h * z }}
          onMouseDown={interaction.onMouseDown}
          onMouseMove={interaction.onMouseMove}
          onMouseUp={interaction.onMouseUp}
          onMouseLeave={interaction.onMouseLeave}
          onDoubleClick={interaction.onDoubleClick}
          onContextMenu={(e: ReactMouseEvent) => e.preventDefault()}
        >
          <canvas ref={base} className="pixelated" style={{ width: size.w * z, height: size.h * z }} />
          <canvas ref={overlay} className="pixelated overlay" style={{ width: size.w * z, height: size.h * z }} />
          {ui.selection && (
            <div
              className="room-selection"
              style={{ left: ui.selection.x * 16 * z, top: ui.selection.y * 16 * z, width: ui.selection.w * 16 * z, height: ui.selection.h * 16 * z }}
            />
          )}
          {ui.cursor && (
            <div
              className={`room-cursor mode-${tools.mode}`}
              style={{ left: ui.cursor.x * 16 * z, top: ui.cursor.y * 16 * z, width: cursorSize.w * 16 * z, height: cursorSize.h * 16 * z }}
            />
          )}
          <SelectionHighlight model={model} selected={ui.selected} zoom={z} version={objectsVersion} />
        </div>
      </div>
    </div>
  );
}

function SelectionHighlight({ model, selected, zoom, version }: { model: RoomEditorModel; selected: SelectedObject | undefined; zoom: number; version: number }) {
  void version;
  if (!selected || selected.kind !== 'door') return null;
  const d = model.doorOf(selected);
  if (!d) return null;
  return (
    <div
      className="room-object-highlight"
      style={{ left: d.xStart * 16 * zoom, top: d.yStart * 16 * zoom, width: (d.xEnd - d.xStart + 1) * 16 * zoom, height: (d.yEnd - d.yStart + 1) * 16 * zoom }}
    />
  );
}
