export interface Disposable {
  dispose(): void;
}

export type Event<T> = (listener: (e: T) => void) => Disposable;

/** Minimal typed event emitter (modelled on VS Code's `Emitter`). */
export class Emitter<T> {
  private listeners = new Set<(e: T) => void>();

  readonly event: Event<T> = (listener) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  fire(e: T): void {
    for (const l of [...this.listeners]) l(e);
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export class DisposableStore implements Disposable {
  private items: Disposable[] = [];
  add<T extends Disposable>(d: T): T {
    this.items.push(d);
    return d;
  }
  dispose(): void {
    for (const d of this.items.splice(0)) d.dispose();
  }
}
