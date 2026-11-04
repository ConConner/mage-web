import { useMemo, useState } from 'react';
import { BgVram } from '@core/gfx/BgVram';
import { PixelCanvas } from '../components/PixelCanvas';
import { Field, Select, hex } from '../components/controls';
import { UsedBy, assetTitle, useAsset } from './assetHooks';

/** Preview of an LZ77 background tilemap, drawn with the tileset of a room that uses it. */
export function TilemapEditor({ path }: { path: string }) {
  const { project, asset, version } = useAsset(path, 'tilemap', true);
  const tilesets = useMemo(() => [...new Set(project.referencesTo(path).flatMap((a) => (a.kind === 'room' ? [a.props.tileset] : [])))].sort((a, b) => a - b), [project, path]);
  const [tileset, setTileset] = useState(tilesets[0] ?? 0);
  const [zoom, setZoom] = useState(2);
  const image = useMemo(() => {
    if (!asset || !project.tilesetAsset(tileset)) return undefined;
    return new BgVram(project, project.tileset(tileset)).renderTileMap(asset.entries, asset.size & 3);
  }, [project, asset, tileset, version]);
  if (!asset) return <div className="view-empty">{path} is not a tilemap in this project.</div>;
  const layout = ['32×32', '64×32', '32×64'][asset.size & 3] ?? '?';
  return (
    <div className="form-editor">
      <h2 className="editor-title">
        Tilemap — {assetTitle(path)} <span className="muted">{layout} tiles · {asset.entries.length} entries</span>
      </h2>
      <UsedBy project={project} path={path} />
      <div className="toolbar">
        <Field label="Draw with tileset">
          <Select value={tileset} options={project.ofKind('tileset').map((t) => ({ value: t.index, label: `${hex(t.index)}${tilesets.includes(t.index) ? ' (used)' : ''}` }))} onChange={setTileset} />
        </Field>
        <Field label="Zoom">
          <Select value={zoom} options={[1, 2, 3].map((z) => ({ value: z, label: `${z}×` }))} onChange={setZoom} />
        </Field>
      </div>
      <div className="graphics-canvas-scroll">
        <PixelCanvas image={image} zoom={zoom} className="checker" />
      </div>
      <p className="form-note">Tilemap editing isn't available yet; the file can be edited by hand (one row of 32 entries per line).</p>
    </div>
  );
}
