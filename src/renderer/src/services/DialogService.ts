import type { ReactNode } from 'react';
import { Store } from './store';

export interface DialogButton<T> {
  label: string;
  value: T;
  primary?: boolean;
}

export interface ActiveDialog {
  id: number;
  title: string;
  /** Renders the dialog body; call `close(value)` to resolve. */
  render: (close: (value: unknown) => void) => ReactNode;
  width?: number;
  resolve: (value: unknown) => void;
}

export interface QuickPickItem<T = unknown> {
  label: string;
  description?: string;
  detail?: string;
  value: T;
}

export interface QuickPickRequest<T = unknown> {
  placeholder: string;
  items: QuickPickItem<T>[];
  onHighlight?: (item: QuickPickItem<T> | undefined) => void;
  resolve: (item: QuickPickItem<T> | undefined) => void;
  /** Index initially highlighted. */
  activeIndex?: number;
}

export type ContextMenuItem = { label: string; run: () => void; disabled?: boolean; hint?: string } | { separator: true };

export interface ContextMenuRequest {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/** Modal dialogs, context menus and the quick pick (command palette style) overlay. */
export class DialogService {
  readonly dialogs = new Store<ActiveDialog[]>([]);
  readonly contextMenu = new Store<ContextMenuRequest | undefined>(undefined);

  showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
    this.contextMenu.set({ x, y, items });
  }

  readonly quickPick = new Store<QuickPickRequest | undefined>(undefined);
  private nextId = 1;

  show<T>(title: string, render: (close: (value: T | undefined) => void) => ReactNode, width?: number): Promise<T | undefined> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      const finish = (value: unknown) => {
        this.dialogs.set((d) => d.filter((x) => x.id !== id));
        resolve(value as T | undefined);
      };
      this.dialogs.set((d) => [...d, { id, title, width, render: render as ActiveDialog['render'], resolve: finish }]);
    });
  }

  pick<T>(placeholder: string, items: QuickPickItem<T>[], options: { onHighlight?: (i: QuickPickItem<T> | undefined) => void; activeIndex?: number } = {}): Promise<QuickPickItem<T> | undefined> {
    return new Promise((resolve) => {
      this.quickPick.set({
        placeholder,
        items,
        activeIndex: options.activeIndex,
        onHighlight: options.onHighlight as QuickPickRequest['onHighlight'],
        resolve: (item) => {
          this.quickPick.set(undefined);
          resolve(item as QuickPickItem<T> | undefined);
        },
      });
    });
  }
}
