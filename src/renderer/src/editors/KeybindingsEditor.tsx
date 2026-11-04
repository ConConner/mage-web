import { useServices } from '../services/Services';
import { formatKeybinding } from '../services/KeybindingService';

export function KeybindingsEditor() {
  const { commands } = useServices();
  const list = commands
    .list()
    .filter((c) => !c.hidden)
    .sort((a, b) => `${a.category}${a.title}`.localeCompare(`${b.category}${b.title}`));
  return (
    <div className="form-editor">
      <h2 className="editor-title">Keyboard Shortcuts</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Keybinding</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td>
                {c.category ? `${c.category}: ` : ''}
                {c.title}
              </td>
              <td>{c.keybinding ? <kbd>{formatKeybinding(c.keybinding)}</kbd> : <span className="muted">—</span>}</td>
              <td className="mono muted">{c.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
