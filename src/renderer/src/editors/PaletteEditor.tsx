import { useMemo, useState } from 'react';
import { gbaToHex, gbaToRgb, hexToGba } from '@core/gfx/color';
import { Button, Field, Section, hex } from '../components/controls';
import { UsedBy, assetTitle, useAsset } from './assetHooks';

/** Edits a palette asset. Every tileset or sprite using it sees the change. */
export function PaletteEditor({ path }: { path: string }) {
  const { project, asset, changed } = useAsset(path, 'palette');
  const [sel, setSel] = useState({ row: 0, col: 1 });
  const [history, setHistory] = useState<Uint16Array[]>([]);
  const [, force] = useState(0);
  const color = asset?.palette.get(sel.row, sel.col) ?? 0;
  const preview = useMemo(() => gbaToRgb(color), [color]);
  if (!asset) return <div className="view-empty">{path} is not a palette in this project.</div>;
  const pal = asset.palette;
  const rgb5 = { r: color & 0x1f, g: (color >> 5) & 0x1f, b: (color >> 10) & 0x1f };
  const isTileset = project.referencesTo(path).some((a) => a.kind === 'tileset');

  const commit = (next: number) => {
    if (next === color) return;
    setHistory((h) => [...h.slice(-99), pal.colors.slice()]);
    pal.set(sel.row, sel.col, next);
    changed();
    force((v) => v + 1);
  };

  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    pal.colors.set(prev);
    setHistory((h) => h.slice(0, -1));
    changed();
    force((v) => v + 1);
  };

  const channel = (k: 'r' | 'g' | 'b', v: number) => {
    const c = { ...rgb5, [k]: v };
    commit(c.r | (c.g << 5) | (c.b << 10));
  };
  const rowLabel = (r: number) => hex(isTileset ? r + 2 : r, 1);

  return (
    <div className="form-editor palette-editor">
      <h2 className="editor-title">
        Palette — {assetTitle(path)} <span className="muted">{pal.rows} rows</span>
      </h2>
      <UsedBy project={project} path={path} />
      <div className="palette-layout">
        <Section title={isTileset ? 'Rows (tileset row n is VRAM row n+2; row 0 unused)' : 'Rows'}>
          <div className="palette-grid" role="grid">
            {Array.from({ length: pal.rows }, (_, r) => (
              <div className="palette-row" role="row" key={r}>
                <span className="palette-row-label">{rowLabel(r)}</span>
                {Array.from({ length: 16 }, (_, c) => (
                  <button
                    key={c}
                    role="gridcell"
                    className={`swatch ${sel.row === r && sel.col === c ? 'selected' : ''} ${c === 0 ? 'transparent-index' : ''}`}
                    style={{ background: gbaToHex(pal.get(r, c)) }}
                    title={`Row ${rowLabel(r)}, color ${hex(c, 1)}: ${hex(pal.get(r, c), 4)}`}
                    onClick={() => setSel({ row: r, col: c })}
                  />
                ))}
              </div>
            ))}
          </div>
        </Section>
        <Section title={`Color ${rowLabel(sel.row)}:${hex(sel.col, 1)}`}>
          <div className="form">
            <div className="color-preview" style={{ background: `rgb(${preview.r},${preview.g},${preview.b})` }} />
            {(['r', 'g', 'b'] as const).map((k) => (
              <Field key={k} label={k.toUpperCase()}>
                <input type="range" min={0} max={31} value={rgb5[k]} onChange={(e) => channel(k, Number(e.target.value))} />
                <span className="mono">{rgb5[k]}</span>
              </Field>
            ))}
            <Field label="Hex (RGB)">
              <input
                key={color}
                className="input mono"
                defaultValue={gbaToHex(color)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const v = hexToGba(e.currentTarget.value);
                  if (v !== undefined) commit(v);
                }}
                onBlur={(e) => {
                  const v = hexToGba(e.currentTarget.value);
                  if (v !== undefined) commit(v);
                }}
              />
            </Field>
            <Field label="Picker">
              <input type="color" value={gbaToHex(color)} onChange={(e) => commit(hexToGba(e.target.value) ?? color)} />
            </Field>
            <Field label="GBA value">
              <span className="mono">{hex(color, 4)}</span>
            </Field>
            <div className="form-actions">
              <Button onClick={undo} disabled={history.length === 0}>
                Undo color change
              </Button>
            </div>
            <p className="form-note">Index 0 of each row is transparent in-game.</p>
          </div>
        </Section>
      </div>
    </div>
  );
}
