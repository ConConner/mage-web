import { useEffect, useRef } from 'react';
import { useServices } from '../services/Services';
import { useStore } from '../services/store';

export function OutputPanel() {
  const { notifications } = useServices();
  const log = useStore(notifications.log);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [log]);
  return (
    <div className="output" role="log">
      {log.length === 0 && <div className="output-line muted">Nothing logged yet.</div>}
      {log.map((l, i) => (
        <div key={i} className={`output-line ${l.severity}`}>
          <span className="output-time">{l.time.toLocaleTimeString()}</span> [{l.severity}] {l.message}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
