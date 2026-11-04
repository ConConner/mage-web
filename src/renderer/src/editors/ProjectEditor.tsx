import { ASSET_KIND_LABELS, type AssetKind } from '@core/project/assets';
import { useServices } from '../services/Services';
import { useStore } from '../services/store';
import { Button, Section, hex } from '../components/controls';

/** Overview of the open project: base ROM, build output, assets. */
export function ProjectEditor() {
  const { project: projects, commands } = useServices();
  const s = useStore(projects.state);
  const p = s.project;
  if (!p) return <div className="view-empty">No project is open.</div>;
  const m = p.manifest;
  const counts = new Map<AssetKind, number>();
  for (const a of p.assets.values()) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  const end = p.rom.allocator.endOfData();
  const size = p.rom.data.length;
  return (
    <div className="form-editor">
      <h2 className="editor-title">{m.name}</h2>
      <Section title="Project">
        <dl className="info-list">
          <dt>Game</dt>
          <dd>
            {p.game.gameName} ({m.gameCode})
          </dd>
          <dt>Folder</dt>
          <dd>{p.fs.location ?? p.fs.name}</dd>
          <dt>Base ROM</dt>
          <dd>
            {m.baseRom.file} — CRC32 {m.baseRom.crc32}, {(m.baseRom.size / 0x100000).toFixed(0)} MB; {hex(end, 7)} used, {(((size - end) / size) * 100).toFixed(1)}% free at the end
          </dd>
          <dt>Build output</dt>
          <dd>{m.build.output}</dd>
          <dt>ROM map</dt>
          <dd>
            {m.map.repo} @ {m.map.commit.slice(0, 7)}
          </dd>
          <dt>Unsaved assets</dt>
          <dd>{p.dirtyPaths().length}</dd>
        </dl>
        <div className="form-actions">
          <Button onClick={() => commands.execute('file.save')} disabled={!s.dirty}>
            Save All
          </Button>
          <Button primary onClick={() => commands.execute('build.rom')}>
            Build ROM
          </Button>
        </div>
      </Section>
      <Section title="Assets">
        <table className="data-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Files</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(ASSET_KIND_LABELS) as AssetKind[]).map((k) => (
              <tr key={k}>
                <td>{ASSET_KIND_LABELS[k]}</td>
                <td className="mono">{counts.get(k) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {p.loadErrors.length > 0 && (
        <Section title={`Files that could not be loaded (${p.loadErrors.length})`}>
          <ul className="error-list">
            {p.loadErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="How building works">
        <p className="form-note">
          The base ROM is never modified. Building copies it, then writes every asset that differs from the base ROM: in place when it fits, otherwise into free space with its pointers updated.
          Assets you haven't changed stay exactly where they were, so a project without changes builds an identical ROM.
        </p>
      </Section>
    </div>
  );
}
