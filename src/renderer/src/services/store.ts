import { useSyncExternalStore, useRef } from 'react';
import { Emitter, type Event } from '@core/util/Emitter';

/** A tiny observable value container for UI state. */
export class Store<T> {
  private value: T;
  private readonly emitter = new Emitter<T>();
  readonly onDidChange: Event<T> = this.emitter.event;

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T | ((prev: T) => T)): void {
    const v = typeof next === 'function' ? (next as (p: T) => T)(this.value) : next;
    if (Object.is(v, this.value)) return;
    this.value = v;
    this.emitter.fire(v);
  }

  update(partial: Partial<T>): void {
    this.set({ ...this.value, ...partial });
  }

  subscribe = (listener: () => void) => {
    const d = this.emitter.event(listener);
    return () => d.dispose();
  };
}

/** Subscribes a component to a store, optionally selecting a slice. */
export function useStore<T, S = T>(store: Store<T>, selector?: (v: T) => S): S {
  const sel = selector ?? ((v: T) => v as unknown as S);
  return useSyncExternalStore(store.subscribe, () => sel(store.get()));
}

/** Re-renders when any of the given events fire. Returns a counter. */
export function useEvent(event: Event<unknown> | undefined): number {
  const version = useRef(0);
  return useSyncExternalStore(
    (cb) => {
      if (!event) return () => {};
      const d = event(() => {
        version.current++;
        cb();
      });
      return () => d.dispose();
    },
    () => version.current,
  );
}
