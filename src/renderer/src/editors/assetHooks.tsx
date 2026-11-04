import { useMemo } from 'react';
import type { Project } from '@core/project/Project';
import type { AssetKind, AssetOfKind } from '@core/project/assets';
import { ASSET_KIND_LABELS } from '@core/project/assets';
import { BgVram, genericBgPalette } from '@core/gfx/BgVram';
import { Palette } from '@core/model/Palette';
import { useServices } from '../services/Services';
import { useEvent } from '../services/store';
import { Select } from '../components/controls';
import { Icon } from '../components/Icon';

/**
 * The asset an editor works on. Re-renders when the asset (or anything,
 * for `refreshOnAny`) changes elsewhere. `changed()` marks it dirty and
 * notifies the rest of the workbench.
 */
export function useAsset<K extends AssetKind>(path: string, kind: K, refreshOnAny = false) {
  const { project: projects } = useServices();
  const project = projects.project!;
  const version = useEvent(
    useMemo(
      () => (listener: (e: unknown) => void) =>
        projects.onDidChangeContent((c) => {
          if (refreshOnAny || c.kind !== 'asset' || c.path === path) listener(c);
        }),
      [projects, path, refreshOnAny],
    ),
  );
  const asset = project.get(path, kind);
  return { project, asset, version, changed: () => asset && projects.assetChanged(asset) };
}

/** Last path segment without the asset extension. */
export const assetTitle = (path: string) => (path.split('/').pop() ?? path).replace(/\.(room|area|tileset|tilemap|tiletable|palette|spriteset|sprite)\.json$|\.gfx$/i, '');

/** Picks an asset of one kind (or none). */
export function AssetSelect<K extends AssetKind>({ project, kind, value, onChange, allowNone = true }: { project: Project; kind: K; value: string | null; onChange: (path: string | null) => void; allowNone?: boolean }) {
  const options = useMemo(() => {
    const list = project.ofKind(kind).map((a) => ({ value: a.path, label: a.path }));
    if (value && !list.some((o) => o.value === value)) list.unshift({ value, label: `${value} (missing)` });
    return allowNone ? [{ value: '', label: `— no ${ASSET_KIND_LABELS[kind].toLowerCase()} —` }, ...list] : list;
  }, [project, kind, value, allowNone]);
  return <Select value={value ?? ''} options={options} onChange={(v) => onChange(v === '' ? null : v)} />;
}

/** Link that opens an asset in its editor. */
export function AssetLink({ path, label }: { path: string | null | undefined; label?: string }) {
  const { commands } = useServices();
  if (!path) return <span className="muted">—</span>;
  return (
    <button className="link asset-link" title={path} onClick={() => commands.execute('asset.open', path)}>
      <Icon name="file" size={12} /> {label ?? assetTitle(path)}
    </button>
  );
}

/** Links to every asset that references `path`. */
export function UsedBy({ project, path }: { project: Project; path: string }) {
  const users = project.referencesTo(path);
  if (users.length === 0) return <p className="form-note">Not referenced by any asset.</p>;
  return (
    <div className="used-by">
      <span className="muted">Used by {users.length}: </span>
      {users.slice(0, 40).map((u) => (
        <AssetLink key={u.path} path={u.path} />
      ))}
      {users.length > 40 && <span className="muted"> and {users.length - 40} more</span>}
    </div>
  );
}

export interface PaletteContext {
  label: string;
  palette: Palette;
  /** Row to preselect. */
  row: number;
}

/**
 * Palettes graphics can be previewed with: the VRAM palette of each
 * tileset using them, the sprite palette of each sprite using them, or the
 * common palettes.
 */
export function paletteContexts(project: Project, gfxPath: string): PaletteContext[] {
  const out: PaletteContext[] = [];
  for (const a of project.referencesTo(gfxPath)) {
    if (a.kind === 'tileset') {
      try {
        const vram = new BgVram(project, project.tileset(a.index));
        out.push({ label: `Tileset ${a.index.toString(16).toUpperCase().padStart(2, '0')} (VRAM)`, palette: vram.palette, row: 3 });
      } catch {
        /* tileset incomplete */
      }
    } else if (a.kind === 'sprite') {
      const pal = project.get(a.palette, 'palette');
      if (pal) out.push({ label: `${a.name} palette`, palette: pal.palette, row: 0 });
    }
  }
  const common = project.manifest.common;
  if (gfxPath === common.bgGfx) out.push({ label: 'Common BG palette', palette: genericBgPalette(project), row: 0 });
  if (gfxPath === common.spriteGfx) out.push({ label: 'Common sprite palette', palette: project.commonSpritePalette(), row: 0 });
  for (const p of project.ofKind('palette')) out.push({ label: p.path, palette: p.palette, row: 0 });
  if (out.length === 0) out.push({ label: 'Grayscale', palette: grayscale(), row: 0 });
  return out;
}

function grayscale(): Palette {
  const p = new Palette(1);
  for (let i = 0; i < 16; i++) {
    const v = Math.round((i * 31) / 15);
    p.set(0, i, v | (v << 5) | (v << 10));
  }
  return p;
}

export type { AssetOfKind };
