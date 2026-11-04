import { useMemo } from 'react';
import { renderGfxSheet } from '@core/gfx/PixelBuffer';
import { spriteGfxRows, SPRITE_GFX_ROW_BYTES } from '@core/model/Sprites';
import { PixelCanvas } from '../components/PixelCanvas';
import { Field, Section, hex } from '../components/controls';
import { AssetLink, AssetSelect, assetTitle, useAsset } from './assetHooks';

/** A primary sprite's graphics and palette. AI, stats and OAM stay in the base ROM for now. */
export function SpriteEditor({ path }: { path: string }) {
  const { project, asset, changed, version } = useAsset(path, 'sprite', true);
  const gfx = project.get(asset?.graphics, 'graphics');
  const pal = project.get(asset?.palette, 'palette');
  const rows = useMemo(() => {
    if (!gfx || !pal) return [];
    const lut = pal.palette.toRgba();
    const n = spriteGfxRows(gfx.gfx.data.length);
    return Array.from({ length: n }, (_, r) => renderGfxSheet(gfx.gfx.data.subarray(r * SPRITE_GFX_ROW_BYTES, (r + 1) * SPRITE_GFX_ROW_BYTES), 32, lut, Math.min(r, pal.palette.rows - 1), true));
  }, [gfx, pal, version]);
  if (!asset) return <div className="view-empty">{path} is not a sprite in this project.</div>;
  const spritesets = project.ofKind('spriteset').filter((s) => s.entries.some((e) => e.spriteId === asset.id));
  return (
    <div className="form-editor">
      <h2 className="editor-title">
        {asset.name || assetTitle(path)} <span className="muted">primary sprite {hex(asset.id)}</span>
      </h2>
      <Section title="Data">
        <div className="form">
          <Field label="Graphics">
            <AssetSelect project={project} kind="graphics" value={asset.graphics} onChange={(v) => ((asset.graphics = v), changed())} />
            <AssetLink path={asset.graphics} label="Edit" />
          </Field>
          <Field label="Palette">
            <AssetSelect project={project} kind="palette" value={asset.palette} onChange={(v) => ((asset.palette = v), changed())} />
            <AssetLink path={asset.palette} label="Edit" />
          </Field>
        </div>
        <p className="form-note">Loaded by {spritesets.length} spritesets:</p>
        <div className="used-by">
          {spritesets.map((s) => (
            <AssetLink key={s.path} path={s.path} />
          ))}
        </div>
      </Section>
      <Section title="Graphics (each VRAM row with its palette row)">
        <div className="vram-rows">
          {rows.map((img, r) => (
            <div key={r} className="vram-row">
              <span className="muted mono">{r}</span>
              <PixelCanvas image={img} zoom={2} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
