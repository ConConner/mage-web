import { useState } from 'react';
import { Background, BgProp, Layer } from '@core/model/Background';
import { RoomSpriteList } from '@core/model/Sprites';
import { ROOM_PROP_FIELDS, type RoomPropName, type RoomProps } from '@core/model/RoomHeader';
import { useServices } from '../services/Services';
import { Button, Field, HexInput, Section, Select, hex } from '../components/controls';
import { AssetLink, AssetSelect, assetTitle, useAsset } from './assetHooks';

const TRANSPARENCY_HINT = '0-3 normal; 4-7 change layer priority; 8+ alpha blends BG0 (see MAGE docs).';

interface FieldDef {
  name: RoomPropName;
  label: string;
  digits?: number;
  max?: number;
  hint?: string;
}

const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Graphics',
    fields: [
      { name: 'tileset', label: 'Tileset' },
      { name: 'bg3Scroll', label: 'BG3 scroll', hint: 'Parallax/scrolling behavior of BG3' },
      { name: 'transparency', label: 'Transparency', hint: TRANSPARENCY_HINT },
    ],
  },
  {
    title: 'Sprites',
    fields: [
      { name: 'spriteset0', label: 'Spriteset 0' },
      { name: 'spriteset1Event', label: 'Event for set 1', hint: '0 disables the second sprite list' },
      { name: 'spriteset1', label: 'Spriteset 1' },
      { name: 'spriteset2Event', label: 'Event for set 2', hint: '0 disables the third sprite list' },
      { name: 'spriteset2', label: 'Spriteset 2' },
    ],
  },
  {
    title: 'Map, effects & music',
    fields: [
      { name: 'mapX', label: 'Map X' },
      { name: 'mapY', label: 'Map Y' },
      { name: 'effect', label: 'Effect' },
      { name: 'effectY', label: 'Effect Y', hint: 'FF = none' },
      { name: 'music', label: 'Music', digits: 4, max: 0xffff },
    ],
  },
];

type Bg0Format = 'none' | 'rle' | 'lz77';

/** Edits a room asset's header values and which data its layers use. */
export function RoomPropertiesEditor({ path }: { path: string }) {
  const { notifications } = useServices();
  const { project, asset, changed } = useAsset(path, 'room');
  const [data, setData] = useState<RoomProps | undefined>(() => asset && { ...asset.props });
  const [bg3, setBg3] = useState(asset?.bg3Tilemap ?? null);
  const [bg0Tilemap, setBg0Tilemap] = useState(asset?.bg0Tilemap ?? null);
  if (!asset || !data) return <div className="view-empty">{path} is not a room in this project.</div>;
  const original = asset.props;
  const set = (name: RoomPropName, v: number) => setData({ ...data, [name]: v });
  const bg0Format: Bg0Format = data.bg0Prop & BgProp.LZ77 ? 'lz77' : data.bg0Prop & BgProp.RLE ? 'rle' : 'none';
  const dirty = ROOM_PROP_FIELDS.some((k) => data[k] !== original[k]) || bg3 !== asset.bg3Tilemap || bg0Tilemap !== asset.bg0Tilemap;

  const apply = () => {
    if (!project.tilesetAsset(data.tileset)) return notifications.error(`Tileset ${hex(data.tileset)} does not exist.`);
    for (const k of ['spriteset0', 'spriteset1', 'spriteset2'] as const) {
      if (!project.spritesetAsset(data[k])) return notifications.error(`Spriteset ${hex(data[k])} does not exist.`);
    }
    const w = asset.clipdata?.width ?? 0;
    const h = asset.clipdata?.height ?? 0;
    // Create or drop block layers to match their formats.
    const layer = (key: 'bg0' | 'bg1' | 'bg2', l: Layer, wantBlocks: boolean) => {
      if (wantBlocks && !asset[key]) asset[key] = Background.blockMap(l, w, h);
      if (!wantBlocks) asset[key] = null;
    };
    layer('bg0', Layer.BG0, bg0Format === 'rle');
    layer('bg1', Layer.BG1, (data.bg1Prop & BgProp.RLE) !== 0);
    layer('bg2', Layer.BG2, (data.bg2Prop & BgProp.RLE) !== 0);
    asset.bg0Tilemap = bg0Format === 'lz77' ? bg0Tilemap : null;
    asset.bg3Tilemap = bg3;
    // Enabling an event-based sprite list needs a list to edit.
    if (data.spriteset1Event && !asset.spriteLists[1]) asset.spriteLists[1] = new RoomSpriteList();
    if (data.spriteset2Event && !asset.spriteLists[2]) asset.spriteLists[2] = new RoomSpriteList();
    asset.props = { ...data };
    changed();
    notifications.info(`${assetTitle(path)} updated.`);
  };

  const setBg0Format = (f: Bg0Format) => {
    const keep = data.bg0Prop & ~(BgProp.RLE | BgProp.LZ77);
    setData({ ...data, bg0Prop: keep | (f === 'rle' ? BgProp.RLE : f === 'lz77' ? BgProp.LZ77 : 0) });
  };
  const setRle = (k: 'bg1Prop' | 'bg2Prop', on: boolean) => set(k, (data[k] & ~BgProp.RLE) | (on ? BgProp.RLE : 0));

  return (
    <div className="form-editor">
      <h2 className="editor-title">
        Room properties — {assetTitle(path)}
      </h2>
      <Section title="Layers">
        <div className="form grid-2">
          <Field label="BG0">
            <Select<Bg0Format>
              value={bg0Format}
              options={[
                { value: 'none', label: 'None' },
                { value: 'rle', label: 'Blocks (RLE)' },
                { value: 'lz77', label: 'Tilemap (LZ77)' },
              ]}
              onChange={setBg0Format}
            />
            <HexInput value={data.bg0Prop} onChange={(v) => set('bg0Prop', v)} />
          </Field>
          {bg0Format === 'lz77' && (
            <Field label="BG0 tilemap">
              <AssetSelect project={project} kind="tilemap" value={bg0Tilemap} onChange={setBg0Tilemap} />
            </Field>
          )}
          {(['bg1Prop', 'bg2Prop'] as const).map((k, i) => (
            <Field key={k} label={`BG${i + 1}`}>
              <Select value={data[k] & BgProp.RLE ? 1 : 0} options={[{ value: 0, label: 'None' }, { value: 1, label: 'Blocks (RLE)' }]} onChange={(v) => setRle(k, v === 1)} />
              <HexInput value={data[k]} onChange={(v) => set(k, v)} />
            </Field>
          ))}
          <Field label="BG3 tilemap">
            <AssetSelect project={project} kind="tilemap" value={bg3} onChange={setBg3} />
            <AssetLink path={bg3} label="View" />
          </Field>
          <Field label="BG3 property">
            <HexInput value={data.bg3Prop} onChange={(v) => set('bg3Prop', v)} />
          </Field>
        </div>
      </Section>
      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          <div className="form grid-2">
            {g.fields.map((f) => (
              <Field key={f.name} label={f.label} hint={f.hint}>
                <HexInput value={data[f.name]} digits={f.digits ?? 2} max={f.max ?? 0xff} onChange={(v) => set(f.name, v)} />
                {f.name === 'tileset' && <AssetLink path={project.tilesetAsset(data.tileset)?.path} />}
                {f.name.startsWith('spriteset') && !f.name.endsWith('Event') && <AssetLink path={project.spritesetAsset(data[f.name])?.path} />}
                {f.name.endsWith('Event') && <span className="muted">{project.map.eventName(data[f.name]) ?? ''}</span>}
              </Field>
            ))}
          </div>
        </Section>
      ))}
      <div className="form-actions sticky">
        <Button
          onClick={() => {
            setData({ ...asset.props });
            setBg3(asset.bg3Tilemap);
            setBg0Tilemap(asset.bg0Tilemap);
          }}
          disabled={!dirty}
        >
          Revert
        </Button>
        <Button primary onClick={apply} disabled={!dirty}>
          Apply
        </Button>
      </div>
    </div>
  );
}
