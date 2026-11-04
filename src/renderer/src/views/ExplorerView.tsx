import { useMemo, useState } from 'react';
import type { Project } from '@core/project/Project';
import { assetKindOf, type AssetKind } from '@core/project/assets';
import { MANIFEST_FILE } from '@core/project/codec';
import { useServices } from '../services/Services';
import { useEvent, useStore } from '../services/store';
import { Icon } from '../components/Icon';
import { ToolButton, hex } from '../components/controls';
import { assetEditorId } from '../workbench/assetEditors';

const KIND_ICONS: Record<AssetKind, string> = {
  room: 'room',
  area: 'map',
  tileset: 'grid',
  tilemap: 'tilemap',
  tiletable: 'table',
  palette: 'palette',
  graphics: 'image',
  spriteset: 'layers',
  sprite: 'sprite',
};

interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  files: string[];
}

function buildTree(files: string[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], files: [] };
  for (const f of files) {
    const parts = f.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join('/');
      let next = node.folders.find((x) => x.path === path);
      if (!next) node.folders.push((next = { name: parts[i], path, folders: [], files: [] }));
      node = next;
    }
    node.files.push(f);
  }
  const collator = new Intl.Collator(undefined, { numeric: true });
  const sort = (n: FolderNode) => {
    n.folders.sort((a, b) => collator.compare(a.name, b.name));
    n.files.sort((a, b) => collator.compare(a, b));
    n.folders.forEach(sort);
  };
  sort(root);
  return root;
}

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Short detail shown right of a file (room size, table index…). */
function detailOf(project: Project, path: string): string | undefined {
  const a = project.assets.get(path);
  if (!a) return undefined;
  switch (a.kind) {
    case 'room':
      return a.clipdata ? `${hex(a.clipdata.width)}×${hex(a.clipdata.height)}` : undefined;
    case 'tileset':
    case 'spriteset':
      return `#${hex(a.index)}`;
    case 'sprite':
      return a.name;
    case 'palette':
      return `${a.palette.rows} rows`;
    case 'graphics':
      return `${hex(a.gfx.tileCount, 3)} tiles`;
    default:
      return undefined;
  }
}

/** The project's files as a tree; opening a file opens the asset's editor. */
export function ExplorerView() {
  const { project: projects, editors, commands, dialogs } = useServices();
  const s = useStore(projects.state);
  const activeId = useStore(editors.state, (e) => e.activeId);
  useEvent(projects.onDidChangeContent);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['rooms']));
  const [filter, setFilter] = useState('');
  const project = s.project;
  const files = project?.files;
  const tree = useMemo(() => buildTree(files ?? []), [files]);

  if (!project) {
    return (
      <div className="view-empty">
        <p>No project is open.</p>
        <button className="button primary" onClick={() => commands.execute('file.newProject')}>
          New Project from ROM…
        </button>
        <button className="button" onClick={() => commands.execute('file.openProject')}>
          Open Project…
        </button>
        {s.busy && <p className="muted">{s.busy}</p>}
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const matches = (path: string) => !q || path.toLowerCase().includes(q) || (detailOf(project, path) ?? '').toLowerCase().includes(q);
  const visibleFolder = (n: FolderNode): boolean => n.files.some(matches) || n.folders.some(visibleFolder);
  const toggle = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpanded(next);
  };

  const fileMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    const users = project.referencesTo(path);
    dialogs.showContextMenu(e.clientX, e.clientY, [
      { label: 'Open', run: () => commands.execute('asset.open', path, false), disabled: !assetKindOf(path) && path !== MANIFEST_FILE },
      { label: 'Copy Path', run: () => void navigator.clipboard?.writeText(path) },
      {
        label: `Find References (${users.length})`,
        disabled: users.length === 0,
        run: async () => {
          const pick = await dialogs.pick(`Assets referencing ${fileName(path)}`, users.map((u) => ({ label: fileName(u.path), description: u.path, value: u.path })));
          if (pick) void commands.execute('asset.open', pick.value, false);
        },
      },
    ]);
  };

  const renderFolder = (n: FolderNode, depth: number): React.ReactNode => {
    const open = expanded.has(n.path) || !!q;
    return (
      <div key={n.path} role="treeitem" aria-expanded={open}>
        <div className="tree-row tree-folder" style={{ paddingLeft: 10 + depth * 12 }} onClick={() => toggle(n.path)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
          <Icon name="folder" />
          <span className="tree-label">{n.name}</span>
        </div>
        {open && renderChildren(n, depth + 1)}
      </div>
    );
  };

  const renderChildren = (n: FolderNode, depth: number): React.ReactNode => (
    <>
      {n.folders.filter(visibleFolder).map((f) => renderFolder(f, depth))}
      {n.files.filter(matches).map((path) => {
        const kind = assetKindOf(path);
        const isManifest = path === MANIFEST_FILE;
        const openable = !!kind || isManifest;
        const id = assetEditorId(project, path);
        return (
          <div
            key={path}
            role="treeitem"
            className={`tree-row tree-file ${activeId && activeId === id ? 'active' : ''} ${openable ? '' : 'inert'}`}
            style={{ paddingLeft: 10 + depth * 12 + 17 }}
            title={path}
            onClick={() => openable && commands.execute('asset.open', path, true)}
            onDoubleClick={() => id && editors.pin(id)}
            onContextMenu={(e) => fileMenu(e, path)}
          >
            <Icon name={kind ? KIND_ICONS[kind] : isManifest ? 'info' : 'file'} />
            <span className="tree-label">{fileName(path)}</span>
            {project.isDirty(path) && <span className="tree-dirty" title="Unsaved changes" />}
            <span className="tree-detail">{detailOf(project, path)}</span>
          </div>
        );
      })}
    </>
  );

  return (
    <div className="explorer">
      <div className="view-filter">
        <input className="input" placeholder="Filter files (e.g. Brinstar_1A or Tileset_08)" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="explorer-header">
        <span className="explorer-title" title={project.fs.location ?? project.fs.name}>
          {project.name}
        </span>
        <span className="spacer" />
        <ToolButton icon="info" label="Project overview" onClick={() => commands.execute('asset.open', MANIFEST_FILE, false)} />
        <ToolButton icon="hammer" label="Build ROM" onClick={() => commands.execute('build.rom')} />
        <ToolButton icon="chevronRight" label="Collapse all folders" onClick={() => setExpanded(new Set())} />
      </div>
      <div className="tree" role="tree">
        {renderChildren(tree, 0)}
      </div>
    </div>
  );
}
