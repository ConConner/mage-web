import { useMemo, useState } from 'react';
import { ObjVram } from '@core/gfx/ObjVram';
import { renderGfxSheet } from '@core/gfx/PixelBuffer';
import { MAX_SPRITESET_ENTRIES, spriteGfxRows, type SpritesetEntry } from '@core/model/Sprites';
import { useServices } from '../services/Services';
import { PixelCanvas } from '../components/PixelCanvas';
import { Button, HexInput, Section, Select, hex } from '../components/controls';
import { AssetLink, assetTitle, useAsset } from './assetHooks';

/** Edits which sprites a spriteset loads and into which graphics rows. */
export function SpritesetEditor({ path }: { path: string }) {
  const { notifications } = useServices();
  const { project, asset, changed, version } = useAsset(path, 'spriteset', true);
  const [entries, setEntries] = useState<SpritesetEntry[]>(() => asset?.entries.map((e) => ({ ...e })) ?? []);
  const preview = useMemo(() => {
    const vram = new ObjVram(project, entries);
    // Each graphics row uses its own palette row.
    return Array.from({ length: 8 }, (_, r) => renderGfxSheet(vram.tiles.subarray(0x4000 + r * 0x800, 0x4800 + r * 0x800), 32, vram.lut, 8 + r, true));
  }, [project, entries, version]);
  if (!asset) return <div className="view-empty">{path} is not a spriteset in this project.</div>;
  const changedLocally = JSON.stringify(entries) !== JSON.stringify(asset.entries);
  const update = (i: number, p: Partial<SpritesetEntry>) => setEntries(entries.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const rooms = project.ofKind('room').filter((r) => [r.props.spriteset0, r.props.spriteset1, r.props.spriteset2].includes(asset.index));
  const spriteOptions = project.ofKind('sprite').map((s) => ({ value: s.id, label: `${hex(s.id)} ${s.name}` }));

  return (
    <div className="form-editor">
      <h2 className="editor-title">
        {assetTitle(path)} <span className="muted">spriteset {hex(asset.index)} · used by {rooms.length} rooms</span>
      </h2>
      <div className="spriteset-layout">
        <Section title="Entries">
          <table className="data-table">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Sprite</th>
                <th>Gfx row</th>
                <th>Rows used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const sprite = project.sprite(e.spriteId);
                const gfx = project.spriteGraphics(e.spriteId);
                return (
                  <tr key={i}>
                    <td className="mono">{hex(i + 1, 1)}</td>
                    <td>
                      {spriteOptions.length > 0 ? (
                        <Select value={e.spriteId} options={spriteOptions.some((o) => o.value === e.spriteId) ? spriteOptions : [{ value: e.spriteId, label: hex(e.spriteId) }, ...spriteOptions]} onChange={(v) => update(i, { spriteId: v })} />
                      ) : (
                        <HexInput value={e.spriteId} min={0x10} onChange={(v) => update(i, { spriteId: v })} />
                      )}{' '}
                      {sprite && <AssetLink path={sprite.path} label="Open" />}
                    </td>
                    <td>
                      <Select value={e.gfxRow} options={Array.from({ length: 8 }, (_, r) => ({ value: r, label: String(r) }))} onChange={(v) => update(i, { gfxRow: v })} />
                    </td>
                    <td className="muted">{gfx ? spriteGfxRows(gfx.gfx.data.length) : '—'}</td>
                    <td>
                      <button className="icon-button" aria-label="Remove entry" onClick={() => setEntries(entries.filter((_, j) => j !== i))}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="form-actions">
            <Button disabled={entries.length >= MAX_SPRITESET_ENTRIES} onClick={() => setEntries([...entries, { spriteId: 0x10, gfxRow: 0 }])}>
              Add entry
            </Button>
            <span className="spacer" />
            <Button disabled={!changedLocally} onClick={() => setEntries(asset.entries.map((e) => ({ ...e })))}>
              Revert
            </Button>
            <Button
              primary
              disabled={!changedLocally}
              onClick={() => {
                asset.entries = entries.map((e) => ({ ...e }));
                changed();
                notifications.info(`Spriteset ${hex(asset.index)} updated.`);
              }}
            >
              Apply
            </Button>
          </div>
        </Section>
        <Section title="Sprite graphics in VRAM">
          <div className="vram-rows">
            {preview.map((img, r) => (
              <div key={r} className="vram-row">
                <span className="muted mono">{r}</span>
                <PixelCanvas image={img} zoom={2} />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
