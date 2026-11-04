import { useMemo } from 'react';
import { BgVram } from '@core/gfx/BgVram';
import { PixelCanvas } from '../components/PixelCanvas';
import { Field, HexInput, Section, hex } from '../components/controls';
import { AssetLink, AssetSelect, assetTitle, useAsset } from './assetHooks';

/** A tileset entry: which graphics, palette and tile table it combines. */
export function TilesetEditor({ path }: { path: string }) {
  const { project, asset, changed, version } = useAsset(path, 'tileset', true);
  const sheet = useMemo(() => {
    if (!asset) return undefined;
    try {
      return new BgVram(project, project.tileset(asset.index)).renderBlockSheet();
    } catch {
      return undefined;
    }
  }, [project, asset, version]);
  if (!asset) return <div className="view-empty">{path} is not a tileset in this project.</div>;
  const rooms = project.ofKind('room').filter((r) => r.props.tileset === asset.index);
  const set = (p: Partial<typeof asset>) => {
    Object.assign(asset, p);
    changed();
  };
  const ref = (label: string, key: 'graphics' | 'palette' | 'backgroundGraphics' | 'tileTable', kind: 'graphics' | 'palette' | 'tiletable') => (
    <Field label={label}>
      <AssetSelect project={project} kind={kind} value={asset[key]} onChange={(v) => set({ [key]: v })} />
      <AssetLink path={asset[key]} label="Edit" />
    </Field>
  );
  return (
    <div className="form-editor">
      <h2 className="editor-title">
        {assetTitle(path)} <span className="muted">tileset table entry {hex(asset.index)}</span>
      </h2>
      <div className="tileset-editor-layout">
        <Section title="Data">
          <div className="form">
            {ref('Level graphics', 'graphics', 'graphics')}
            {ref('Palette', 'palette', 'palette')}
            {ref('BG3 graphics', 'backgroundGraphics', 'graphics')}
            {ref('Tile table', 'tileTable', 'tiletable')}
            <Field label="Animated tileset" hint="Number in the animated tileset table (still read from the base ROM)">
              <HexInput value={asset.animatedTileset} max={project.map.table('animatedTilesets').count - 1} onChange={(v) => set({ animatedTileset: v })} />
            </Field>
            <Field label="Animated palette" hint="Number in the animated palette table (still read from the base ROM)">
              <HexInput value={asset.animatedPalette} max={project.map.table('animatedPalettes').count - 1} onChange={(v) => set({ animatedPalette: v })} />
            </Field>
          </div>
          <p className="form-note">Used by {rooms.length} rooms.</p>
          <div className="used-by">
            {rooms.slice(0, 60).map((r) => (
              <AssetLink key={r.path} path={r.path} />
            ))}
          </div>
        </Section>
        <Section title="Blocks">
          <div className="tileset-stage scroll-y">{sheet ? <PixelCanvas image={sheet} zoom={2} className="checker" /> : <p className="muted">Incomplete tileset.</p>}</div>
        </Section>
      </div>
    </div>
  );
}
