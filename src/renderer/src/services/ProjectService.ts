import { Project, ProjectError } from '@core/project/Project';
import { BuildError } from '@core/project/build';
import type { Asset } from '@core/project/assets';
import { BASE_ROM_FILE } from '@core/project/codec';
import { fileSafe } from '@core/game/RomMap';
import { Emitter } from '@core/util/Emitter';
import type { OpenedFolder, PlatformApi } from '@platform/api';
import { Store } from './store';
import type { NotificationService } from './NotificationService';

export const ROM_FILTERS = [{ name: 'GBA ROM', extensions: ['gba'] }];

export interface ProjectState {
  project: Project | undefined;
  dirty: boolean;
  /** Message of a long-running operation (create, open, build). */
  busy: string | undefined;
}

/** What changed so open editors can refresh. */
export type ContentChange =
  /** An asset's content changed. */
  | { kind: 'asset'; path: string }
  /** Doors of an area changed (they live in several room assets). */
  | { kind: 'doors' }
  /** Files were added or removed. */
  | { kind: 'files' }
  /** A different project (or none) is open. */
  | { kind: 'all' };

/** Questions the service asks the user; the workbench provides the UI. */
export interface ProjectPrompts {
  confirmDiscard(): Promise<boolean>;
  confirm(title: string, message: string, ok: string): Promise<boolean>;
  input(title: string, label: string, value: string): Promise<string | undefined>;
}

/** Owns the open project: creating, opening, saving, building. */
export class ProjectService {
  readonly state = new Store<ProjectState>({ project: undefined, dirty: false, busy: undefined });
  private readonly _onDidChangeContent = new Emitter<ContentChange>();
  readonly onDidChangeContent = this._onDidChangeContent.event;
  prompts: ProjectPrompts = {
    confirmDiscard: async () => true,
    confirm: async () => true,
    input: async (_t, _l, v) => v,
  };

  constructor(
    private readonly platform: PlatformApi,
    private readonly notifications: NotificationService,
  ) {}

  get project(): Project | undefined {
    return this.state.get().project;
  }

  /** Marks an asset as changed and tells editors to refresh. */
  assetChanged(asset: Asset | string, markDirty = true): void {
    const path = typeof asset === 'string' ? asset : asset.path;
    if (markDirty) this.project?.markDirty(path);
    this._onDidChangeContent.fire({ kind: 'asset', path });
  }

  doorsChanged(): void {
    this._onDidChangeContent.fire({ kind: 'doors' });
  }

  private async busy<T>(message: string, run: () => Promise<T>): Promise<T> {
    this.state.update({ busy: message });
    try {
      return await run();
    } finally {
      this.state.update({ busy: undefined });
    }
  }

  // ------------------------------------------------------------- lifecycle

  /** Creates a project from a ROM: asks for the ROM, then a folder. */
  async newProject(rom?: { name: string; data: Uint8Array }): Promise<boolean> {
    if (!(await this.prompts.confirmDiscard())) return false;
    const file = rom ?? (await this.platform.openFile(ROM_FILTERS));
    if (!file) return false;
    const folder = await this.platform.pickFolder('Choose an empty folder for the new project');
    if (!folder) return false;
    const existing = await folder.fs.list();
    if (existing.length > 0) {
      const ok = await this.prompts.confirm('Folder is not empty', `${folder.name} already contains ${existing.length} files. Asset files with the same names will be overwritten.`, 'Create Anyway');
      if (!ok) return false;
    }
    const name = await this.prompts.input('New Project', 'Project name', folder.name || file.name.replace(/\.gba$/i, ''));
    if (!name) return false;
    try {
      const project = await this.busy('Creating project…', () =>
        Project.create(folder.fs, file.data, name, (msg, done, total) => this.state.update({ busy: total ? `${msg} (${done}/${total})` : msg })),
      );
      await this.setProject(project, folder);
      this.notifications.info(`Created project ${name}: ${project.assets.size} assets extracted from ${file.name}.`);
      return true;
    } catch (e) {
      this.notifications.error(`Could not create the project: ${(e as Error).message}`);
      return false;
    }
  }

  async openDialog(): Promise<boolean> {
    if (!(await this.prompts.confirmDiscard())) return false;
    const folder = await this.platform.pickFolder('Open a project folder');
    return folder ? this.openFolder(folder) : false;
  }

  async openRecent(path: string): Promise<boolean> {
    if (!(await this.prompts.confirmDiscard())) return false;
    const folder = await this.platform.openFolderPath(path);
    if (!folder) {
      this.notifications.error(`Could not open ${path}`);
      return false;
    }
    return this.openFolder(folder);
  }

  private async openFolder(folder: OpenedFolder): Promise<boolean> {
    try {
      const project = await this.busy('Opening project…', () => Project.open(folder.fs, (msg, done, total) => this.state.update({ busy: total ? `${msg} (${done}/${total})` : msg })));
      await this.setProject(project, folder);
      return true;
    } catch (e) {
      if (e instanceof ProjectError && (e.code === 'missingBaseRom' || e.code === 'baseRomMismatch')) {
        const ok = await this.prompts.confirm('Base ROM needed', `${e.message} Select the original ROM to copy it into the project as ${BASE_ROM_FILE}.`, 'Select ROM…');
        const rom = ok ? await this.platform.openFile(ROM_FILTERS) : undefined;
        if (!rom) return false;
        try {
          await Project.provideBaseRom(folder.fs, rom.data);
        } catch (err) {
          this.notifications.error((err as Error).message);
          return false;
        }
        return this.openFolder(folder);
      }
      this.notifications.error(`Could not open ${folder.name}: ${(e as Error).message}`);
      return false;
    }
  }

  private async setProject(project: Project, folder: OpenedFolder): Promise<void> {
    project.onDidChange((c) => {
      this.state.update({ dirty: project.isDirty() });
      if (c.kind === 'files') this._onDidChangeContent.fire({ kind: 'files' });
    });
    this.state.set({ project, dirty: false, busy: undefined });
    if (folder.path) await this.platform.addRecentFile({ name: project.name, path: folder.path });
    this.notifications.append('info', `Opened ${project.name} (${project.game.gameName}, ${project.assets.size} assets)`);
    for (const err of project.loadErrors) this.notifications.append('error', err);
    if (project.loadErrors.length) this.notifications.warn(`${project.loadErrors.length} files could not be loaded; see the Output panel.`);
    for (const m of project.missingReferences()) this.notifications.append('warning', `${m.from} references missing ${m.to}`);
    if (!this.platform.persistentFolders) this.notifications.warn('This browser cannot write folders: the project lives in memory. Use Build ROM As… to download the result.');
    this._onDidChangeContent.fire({ kind: 'all' });
  }

  async save(): Promise<boolean> {
    const p = this.project;
    if (!p) return false;
    try {
      const n = await p.save();
      this.state.update({ dirty: false });
      this.notifications.info(n ? `Saved ${n} file${n === 1 ? '' : 's'}.` : 'Nothing to save.');
      return true;
    } catch (e) {
      this.notifications.error(`Save failed: ${(e as Error).message}`);
      return false;
    }
  }

  private reportBuild(r: { log: string[]; warnings: string[]; stats: { unchanged: number; inPlace: number; relocated: number } }): void {
    for (const l of r.log) this.notifications.append('info', `build: ${l}`);
    for (const w of r.warnings) this.notifications.append('warning', `build: ${w}`);
    if (r.warnings.length) this.notifications.warn(`Build finished with ${r.warnings.length} warnings; see the Output panel.`);
  }

  private buildFailed(e: unknown): void {
    if (e instanceof BuildError) for (const p of e.problems) this.notifications.append('error', `build: ${p}`);
    this.notifications.error(`Build failed: ${(e as Error).message.split('\n')[0]}`);
  }

  /** Builds into the project's build folder (or downloads it in memory-only browsers). */
  async build(): Promise<boolean> {
    const p = this.project;
    if (!p) return false;
    if (!this.platform.persistentFolders) return this.buildAs();
    try {
      const r = await this.busy('Building ROM…', () => p.buildToProject());
      this.reportBuild(r);
      this.notifications.info(`Built ${r.path}: ${r.stats.inPlace + r.stats.relocated} changed, ${r.stats.relocated} relocated.`);
      return true;
    } catch (e) {
      this.buildFailed(e);
      return false;
    }
  }

  async buildAs(): Promise<boolean> {
    const p = this.project;
    if (!p) return false;
    try {
      const r = p.build();
      this.reportBuild(r);
      const out = await this.platform.saveFileAs(`${fileSafe(p.name) || 'build'}.gba`, r.rom, ROM_FILTERS);
      if (out) this.notifications.info(`Built ${out.name}.`);
      return !!out;
    } catch (e) {
      this.buildFailed(e);
      return false;
    }
  }

  async close(): Promise<boolean> {
    if (!(await this.prompts.confirmDiscard())) return false;
    this.state.set({ project: undefined, dirty: false, busy: undefined });
    this._onDidChangeContent.fire({ kind: 'all' });
    return true;
  }
}
