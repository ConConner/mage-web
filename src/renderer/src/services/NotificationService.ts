import { Store } from './store';

export type Severity = 'info' | 'warning' | 'error';

export interface Notification {
  id: number;
  severity: Severity;
  message: string;
}

export interface LogEntry {
  time: Date;
  severity: Severity;
  message: string;
}

/** Toast notifications plus an output log shown in the panel. */
export class NotificationService {
  readonly toasts = new Store<Notification[]>([]);
  readonly log = new Store<LogEntry[]>([]);
  private nextId = 1;

  notify(severity: Severity, message: string, timeout = severity === 'error' ? 8000 : 4000): void {
    const n = { id: this.nextId++, severity, message };
    this.toasts.set((t) => [...t, n]);
    this.append(severity, message);
    setTimeout(() => this.dismiss(n.id), timeout);
  }

  info = (m: string) => this.notify('info', m);
  warn = (m: string) => this.notify('warning', m);
  error = (m: string) => this.notify('error', m);

  append(severity: Severity, message: string): void {
    this.log.set((l) => [...l.slice(-499), { time: new Date(), severity, message }]);
  }

  dismiss(id: number): void {
    this.toasts.set((t) => t.filter((n) => n.id !== id));
  }
}
