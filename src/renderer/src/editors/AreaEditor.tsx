import { NO_ROOM, toSigned8, type Door } from '@core/model/Doors';
import { useServices } from '../services/Services';
import { HexInput, hex } from '../components/controls';
import { AssetLink, useAsset } from './assetHooks';

/**
 * An area's door table as a spreadsheet. Doors are stored in the room
 * asset they're placed in; changing a door's room moves it there.
 */
export function AreaEditor({ path }: { path: string }) {
  const { project: projects } = useServices();
  const { project, asset } = useAsset(path, 'area', true);
  if (!asset) return <div className="view-empty">{path} is not an area in this project.</div>;
  const area = asset.index;
  const doors = project.doors.areaDoors(area);

  const update = (d: Door, p: Partial<Door>) => {
    project.doors.update({ ...d, ...p });
    projects.doorsChanged();
  };

  const cols: [keyof Door, string][] = [
    ['type', 'Type'],
    ['room', 'Room'],
    ['xStart', 'X1'],
    ['xEnd', 'X2'],
    ['yStart', 'Y1'],
    ['yEnd', 'Y2'],
    ['destination', 'Dest'],
  ];

  return (
    <div className="form-editor">
      <h2 className="editor-title">
        {asset.name} <span className="muted">area {area} · {project.rooms(area).length} rooms · {doors.length} doors</span>
      </h2>
      <table className="data-table doors">
        <thead>
          <tr>
            <th>#</th>
            {cols.map(([, l]) => (
              <th key={l}>{l}</th>
            ))}
            <th>Exit X</th>
            <th>Exit Y</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {doors.map((d) => {
            const room = d.room === NO_ROOM ? undefined : project.room(area, d.room);
            return (
              <tr key={d.number} className={room ? '' : 'muted'}>
                <td className="mono">{hex(d.number)}</td>
                {cols.map(([k]) => (
                  <td key={k}>
                    <HexInput value={d[k] as number} onChange={(v) => update(d, { [k]: v })} />
                  </td>
                ))}
                <td className="mono">{toSigned8(d.exitX)}</td>
                <td className="mono">{toSigned8(d.exitY)}</td>
                <td>{room ? <AssetLink path={room.path} label="Open room" /> : <span className="muted">unassigned</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
