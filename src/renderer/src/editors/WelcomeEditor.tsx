import { useEffect, useState } from 'react';
import type { RecentFile } from '@platform/api';
import { useServices } from '../services/Services';
import { useStore } from '../services/store';
import { formatKeybinding } from '../services/KeybindingService';

export function WelcomeEditor() {
  const { platform, commands, project } = useServices();
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const s = useStore(project.state);
  useEffect(() => {
    void platform.recentFiles().then(setRecent);
  }, [platform, s.project]);

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>MAGE Web</h1>
        <p className="muted">Metroid Advance Game Editor — for Metroid Fusion and Metroid Zero Mission (U).</p>
        <div className="welcome-columns">
          <section>
            <h2>Start</h2>
            <button className="link" onClick={() => commands.execute('file.newProject')}>
              New Project from ROM…
            </button>
            <button className="link" onClick={() => commands.execute('file.openProject')}>
              Open Project…
            </button>
            {s.project && (
              <button className="link" onClick={() => commands.execute('room.goTo')}>
                Go to Room…
              </button>
            )}
            <button className="link" onClick={() => commands.execute('workbench.commandPalette')}>
              Show All Commands <kbd>{formatKeybinding('CmdOrCtrl+Shift+P')}</kbd>
            </button>
            <h2>Recent</h2>
            {recent.length === 0 && <p className="muted">{platform.kind === 'browser' ? 'Recent projects are available in the desktop app.' : 'No recent projects.'}</p>}
            {recent.map((r) => (
              <button key={r.path} className="link" title={r.path} onClick={() => project.openRecent(r.path)}>
                {r.name} <span className="muted">{r.path}</span>
              </button>
            ))}
          </section>
          <section>
            <h2>Editing basics</h2>
            <ul className="tips">
              <li>
                <b>Projects</b>: a new project extracts every room, tileset, palette, graphics and spriteset of a ROM into its own file. <b>Save All</b> writes changed
                files; <b>Build ROM</b> ({formatKeybinding('CmdOrCtrl+Shift+B')}) writes <code>build/*.gba</code>. The original ROM is never modified.
              </li>
              <li>
                <b>Block mode</b> (B): pick blocks in the tileset, left-click to paint, right-drag in the room to copy.
              </li>
              <li>
                <b>Object mode</b> (O): drag sprites, doors, scrolls and door exits; right-click for more.
              </li>
              <li>Middle-click toggles between the two modes. F toggles the fill tool.</li>
              <li>Ctrl/⌘ + mouse wheel zooms the room.</li>
              <li>G goes through the door under the cursor, Delete removes the selected object, [ and ] change a sprite's slot.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
