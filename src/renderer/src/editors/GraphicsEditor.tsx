import { useMemo, useRef, useState } from 'react';
import { renderGfxSheet } from '@core/gfx/PixelBuffer';
import { gbaToHex } from '@core/gfx/color';
import { PixelCanvas, canvasPoint } from '../components/PixelCanvas';
import { Button, Field, Section, Select, hex } from '../components/controls';
import { UsedBy, assetTitle, paletteContexts, useAsset } from './assetHooks';

/**
 * Pixel editor for a graphics asset. Edits go straight into the asset; each
 * stroke is one undo step and refreshes the rooms that use the graphics.
 */
export function GraphicsEditor({ path }: { path: string }) {
  const { project, asset, changed, version: assetVersion } = useAsset(path, 'graphics');
  const contexts = useMemo(() => paletteContexts(project, path), [project, path, assetVersion]);
  const [ctxIndex, setCtxIndex] = useState(0);
  const ctx = contexts[Math.min(ctxIndex, contexts.length - 1)];
  const [row, setRow] = useState(ctx.row);
  const [colorIndex, setColorIndex] = useState(1);
  const [zoom, setZoom] = useState(3);
  const [width, setWidth] = useState(32);
  const [version, setVersion] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number }>();
  const history = useRef<Uint8Array[]>([]);
  const stroke = useRef(false);

  const lut = useMemo(() => ctx.palette.toRgba(), [ctx, assetVersion]);
  const gfx = asset?.gfx;
  const image = useMemo(() => (gfx ? renderGfxSheet(gfx.data, width, lut, row, true) : undefined), [gfx, width, lut, row, version, assetVersion]);
  if (!asset || !gfx) return <div className="view-empty">{path} is not a graphics asset in this project.</div>;
  gfx.widthInTiles = width;

  const endStroke = () => {
    if (!stroke.current) return;
    stroke.current = false;
    changed();
  };

  const paint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = canvasPoint(e, zoom);
    setHover(p);
    if (!e.buttons) return endStroke();
    if (e.buttons & 2 || e.altKey) {
      const v = gfx.getPixel(p.x, p.y);
      if (v >= 0) setColorIndex(v);
      return;
    }
    if (gfx.getPixel(p.x, p.y) === colorIndex) return;
    if (!stroke.current) {
      stroke.current = true;
      history.current = [...history.current.slice(-49), gfx.data.slice()];
    }
    gfx.setPixel(p.x, p.y, colorIndex);
    setVersion((v) => v + 1);
  };

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    gfx.data.set(prev);
    changed();
    setVersion((v) => v + 1);
  };

  return (
    <div className="form-editor graphics-editor">
      <h2 className="editor-title">
        Graphics — {assetTitle(path)}{' '}
        <span className="muted">
          {hex(gfx.tileCount, 3)} tiles · {gfx.data.length} bytes
        </span>
      </h2>
      <UsedBy project={project} path={path} />
      <div className="toolbar">
        <Field label="Palette">
          <Select
            value={ctxIndex}
            options={contexts.map((c, i) => ({ value: i, label: c.label }))}
            onChange={(i) => {
              setCtxIndex(i);
              setRow(contexts[i].row);
            }}
          />
        </Field>
        <Field label="Row">
          <Select value={row} options={Array.from({ length: ctx.palette.rows }, (_, i) => ({ value: i, label: hex(i, 1) }))} onChange={setRow} />
        </Field>
        <Field label="Width">
          <Select value={width} options={[8, 16, 32].map((w) => ({ value: w, label: `${w} tiles` }))} onChange={setWidth} />
        </Field>
        <Field label="Zoom">
          <Select value={zoom} options={[1, 2, 3, 4, 6].map((z) => ({ value: z, label: `${z}×` }))} onChange={setZoom} />
        </Field>
        <span className="spacer" />
        <span className="muted">{hover ? `tile ${hex(Math.floor(hover.y / 8) * width + Math.floor(hover.x / 8), 3)}` : ''}</span>
        <Button disabled={history.current.length === 0} onClick={undo}>
          Undo
        </Button>
      </div>
      <div className="graphics-layout">
        <div className="graphics-canvas-scroll">
          <PixelCanvas image={image} zoom={zoom} version={version} onMouseDown={paint} onMouseMove={paint} onMouseUp={endStroke} onMouseLeave={() => (setHover(undefined), endStroke())} />
        </div>
        <Section title="Color">
          <div className="palette-row big">
            {Array.from({ length: 16 }, (_, c) => (
              <button
                key={c}
                className={`swatch ${c === colorIndex ? 'selected' : ''}`}
                style={{ background: gbaToHex(ctx.palette.get(row, c)) }}
                title={`Index ${hex(c, 1)}`}
                onClick={() => setColorIndex(c)}
              />
            ))}
          </div>
          <p className="form-note">Left-click draws, right-click (or Alt+click) picks a color. The palette only affects the preview.</p>
        </Section>
      </div>
    </div>
  );
}
