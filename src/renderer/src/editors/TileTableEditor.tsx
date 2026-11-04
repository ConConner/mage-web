import { useMemo, useState } from 'react';
import { renderGfxSheet, PixelBuffer } from '@core/gfx/PixelBuffer';
import { BgVram } from '@core/gfx/BgVram';
import { PixelCanvas, canvasPoint } from '../components/PixelCanvas';
import { Checkbox, Field, Section, Select, hex } from '../components/controls';
import { UsedBy, assetTitle, useAsset } from './assetHooks';

const QUADRANTS = ['Top left', 'Top right', 'Bottom left', 'Bottom right'];

/**
 * Edits which 8×8 tiles (with palette and flips) make up each 16×16 block.
 * Tiles are shown as loaded in VRAM by a tileset that uses the table.
 */
export function TileTableEditor({ path }: { path: string }) {
  const { project, asset, changed, version: assetVersion } = useAsset(path, 'tiletable', true);
  const users = useMemo(() => project.referencesTo(path).filter((a) => a.kind === 'tileset'), [project, path]);
  const [userIndex, setUserIndex] = useState(0);
  const tilesetIndex = users[Math.min(userIndex, users.length - 1)]?.kind === 'tileset' ? (users[Math.min(userIndex, users.length - 1)] as { index: number }).index : undefined;
  const vram = useMemo(() => (tilesetIndex === undefined ? undefined : new BgVram(project, project.tileset(tilesetIndex))), [project, tilesetIndex, assetVersion]);
  const [block, setBlock] = useState(0);
  const [quad, setQuad] = useState(0);
  const [version, setVersion] = useState(0);
  const entries = asset?.entries;
  const entryIndex = block * 4 + quad;
  const entry = entries?.[entryIndex] ?? 0;
  const pal = entry >> 12;
  const blockCount = entries ? entries.length / 4 : 0;

  const blocks = useMemo(() => vram?.renderBlockSheet(), [vram, version]);
  const tiles = useMemo(() => vram && renderGfxSheet(vram.tiles, 32, vram.lut, pal, true), [vram, pal]);
  const preview = useMemo(() => {
    if (!vram) return undefined;
    const p = new PixelBuffer(16, 16);
    vram.drawBlock(p, block, 0, 0);
    return p;
  }, [vram, block, version]);

  if (!asset || !entries) return <div className="view-empty">{path} is not a tile table in this project.</div>;
  if (!vram || !blocks || !tiles) return <div className="view-empty">No tileset uses {path}, so there is no VRAM to show its tiles with.</div>;

  const setEntry = (value: number) => {
    entries[entryIndex] = value & 0xffff;
    changed();
    setVersion((v) => v + 1);
  };

  return (
    <div className="form-editor tiletable-editor">
      <h2 className="editor-title">
        Tile Table — {assetTitle(path)}{' '}
        {users.length > 1 && (
          <Select value={userIndex} options={users.map((u, i) => ({ value: i, label: `as in ${assetTitle(u.path)}` }))} onChange={setUserIndex} />
        )}
      </h2>
      <UsedBy project={project} path={path} />
      <div className="tiletable-layout">
        <Section title={`Blocks (${hex(blockCount, 3)})`}>
          <div className="tileset-stage scroll-y">
            <PixelCanvas
              image={blocks}
              zoom={2}
              version={version}
              className="checker"
              onMouseDown={(e) => {
                const p = canvasPoint(e, 2);
                setBlock(Math.min(blockCount - 1, Math.floor(p.y / 16) * 16 + Math.floor(p.x / 16)));
              }}
            />
            <div className="tileset-selection" style={{ left: (block % 16) * 32, top: Math.floor(block / 16) * 32, width: 32, height: 32 }} />
          </div>
        </Section>
        <Section title={`Block ${hex(block, 3)}`}>
          <div className="block-preview">
            <PixelCanvas
              image={preview}
              zoom={8}
              version={version}
              className="checker"
              onMouseDown={(e) => {
                const p = canvasPoint(e, 8);
                setQuad((p.y >= 8 ? 2 : 0) + (p.x >= 8 ? 1 : 0));
              }}
            />
            <div className="quad-highlight" style={{ left: (quad & 1) * 64, top: (quad >> 1) * 64 }} />
          </div>
          <div className="form">
            <Field label="Part">
              <Select value={quad} options={QUADRANTS.map((l, i) => ({ value: i, label: l }))} onChange={setQuad} />
            </Field>
            <Field label="Tile">
              <span className="mono">{hex(entry & 0x3ff, 3)}</span>
            </Field>
            <Field label="Palette row">
              <Select value={pal} options={Array.from({ length: 16 }, (_, i) => ({ value: i, label: hex(i, 1) }))} onChange={(v) => setEntry((entry & 0x0fff) | (v << 12))} />
            </Field>
            <Checkbox checked={(entry & 0x400) !== 0} onChange={(v) => setEntry(v ? entry | 0x400 : entry & ~0x400)} label="Flip horizontally" />
            <Checkbox checked={(entry & 0x800) !== 0} onChange={(v) => setEntry(v ? entry | 0x800 : entry & ~0x800)} label="Flip vertically" />
            <Field label="Raw entry">
              <span className="mono">{hex(entry, 4)}</span>
            </Field>
          </div>
        </Section>
        <Section title="VRAM tiles — click to assign">
          <div className="tileset-stage scroll-y">
            <PixelCanvas
              image={tiles}
              zoom={2}
              onMouseDown={(e) => {
                const p = canvasPoint(e, 2);
                const t = Math.floor(p.y / 8) * 32 + Math.floor(p.x / 8);
                setEntry((entry & 0xfc00) | (t & 0x3ff));
              }}
            />
            <div className="tileset-selection" style={{ left: ((entry & 0x3ff) % 32) * 16, top: Math.floor((entry & 0x3ff) / 32) * 16, width: 16, height: 16 }} />
          </div>
        </Section>
      </div>
    </div>
  );
}
