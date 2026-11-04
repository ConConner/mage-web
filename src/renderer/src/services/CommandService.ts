import { Emitter } from '@core/util/Emitter';

export interface Command {
  id: string;
  title: string;
  category?: string;
  /** Default keybinding, e.g. "CmdOrCtrl+Shift+P" or a chord "CmdOrCtrl+K CmdOrCtrl+T". */
  keybinding?: string;
  run: (...args: unknown[]) => unknown;
  isEnabled?: () => boolean;
  isChecked?: () => boolean;
  /** Hidden commands don't appear in the command palette. */
  hidden?: boolean;
}

/** Central registry of every user-invocable action. Menus, keybindings and the palette all go through it. */
export class CommandService {
  private readonly commands = new Map<string, Command>();
  private readonly _onDidChangeState = new Emitter<void>();
  readonly onDidChangeState = this._onDidChangeState.event;
  private readonly _onDidRegister = new Emitter<void>();
  readonly onDidRegister = this._onDidRegister.event;

  register(cmd: Command): () => void {
    this.commands.set(cmd.id, cmd);
    this._onDidRegister.fire();
    return () => this.commands.delete(cmd.id);
  }

  registerAll(cmds: Command[]): void {
    for (const c of cmds) this.commands.set(c.id, c);
    this._onDidRegister.fire();
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  list(): Command[] {
    return [...this.commands.values()];
  }

  isEnabled(id: string): boolean {
    const c = this.commands.get(id);
    return !!c && (c.isEnabled?.() ?? true);
  }

  isChecked(id: string): boolean {
    return this.commands.get(id)?.isChecked?.() ?? false;
  }

  async execute(id: string, ...args: unknown[]): Promise<unknown> {
    const c = this.commands.get(id);
    if (!c) {
      console.warn(`Unknown command ${id}`);
      return undefined;
    }
    if (c.isEnabled && !c.isEnabled()) return undefined;
    try {
      return await c.run(...args);
    } finally {
      this._onDidChangeState.fire();
    }
  }

  /** Notify that enablement/checked state may have changed. */
  refresh(): void {
    this._onDidChangeState.fire();
  }
}
