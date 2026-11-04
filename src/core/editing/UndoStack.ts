import { Emitter } from '../util/Emitter';

/**
 * A reversible edit applied to a target (e.g. a Room).
 * `merge` lets continuous gestures (drawing, dragging) collapse into one step.
 */
export interface EditAction<T> {
  readonly label: string;
  apply(target: T): void;
  revert(target: T): void;
  /** Absorb a newer action of the same gesture. Return false if not mergeable. */
  merge?(next: EditAction<T>): boolean;
}

const LIMIT = 200;

export class UndoStack<T> {
  private done: EditAction<T>[] = [];
  private undone: EditAction<T>[] = [];
  /** While true, new actions may merge into the last one. */
  private gestureOpen = false;

  private readonly _onDidChange = new Emitter<void>();
  readonly onDidChange = this._onDidChange.event;

  get canUndo(): boolean {
    return this.done.length > 0;
  }
  get canRedo(): boolean {
    return this.undone.length > 0;
  }
  get undoLabel(): string | undefined {
    return this.done.at(-1)?.label;
  }
  get redoLabel(): string | undefined {
    return this.undone.at(-1)?.label;
  }
  get history(): readonly EditAction<T>[] {
    return this.done;
  }

  /** Applies an action and records it. Pass `continuous` while a gesture is in progress. */
  perform(target: T, action: EditAction<T>, continuous = false): void {
    action.apply(target);
    const last = this.done.at(-1);
    if (continuous && this.gestureOpen && last?.merge?.(action)) {
      // merged
    } else {
      this.done.push(action);
      if (this.done.length > LIMIT) this.done.shift();
    }
    this.gestureOpen = continuous;
    this.undone = [];
    this._onDidChange.fire();
  }

  /** Ends the current gesture so the next action starts a new undo step. */
  endGesture(): void {
    this.gestureOpen = false;
  }

  undo(target: T): EditAction<T> | undefined {
    const a = this.done.pop();
    if (!a) return undefined;
    a.revert(target);
    this.undone.push(a);
    this.gestureOpen = false;
    this._onDidChange.fire();
    return a;
  }

  redo(target: T): EditAction<T> | undefined {
    const a = this.undone.pop();
    if (!a) return undefined;
    a.apply(target);
    this.done.push(a);
    this._onDidChange.fire();
    return a;
  }

  clear(): void {
    this.done = [];
    this.undone = [];
    this._onDidChange.fire();
  }
}
