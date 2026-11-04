import { Rom } from '../rom/Rom';
import type { GameInfo } from '../game/GameInfo';
import type { RomMap } from '../game/RomMap';
import type { GraphicsSource } from '../gfx/GraphicsSource';
import { Gfx } from '../model/Gfx';
import { Palette } from '../model/Palette';
import { Tileset } from '../model/Tileset';
import { AnimPalette, AnimTileset } from '../model/Animation';
import { Room, type RoomSpriteset } from '../model/Room';
import { Emitter } from '../util/Emitter';
import { crc32Hex } from '../util/crc32';
import {
  assetReferences,
  type Asset,
  type AssetKind,
  type AssetOfKind,
  type AreaAsset,
  type RoomAsset,
  type SpriteAsset,
  type SpritesetAsset,
  type TilesetAsset,
} from './assets';
import {
  AssetFormatError,
  BASE_ROM_FILE,
  MANIFEST_FILE,
  parseAsset,
  parseManifest,
  serializeAsset,
  serializeManifest,
  type CommonRole,
  type ProjectManifest,
} from './codec';
import { extractProject, type Baseline } from './extract';
import { readFiles, textEncoder, writeFiles, type WorkspaceFs } from './fs';
import { ProjectDoors } from './ProjectDoors';
import { buildRom, type BuildResult } from './build';

export type ProjectErrorCode = 'noManifest' | 'missingBaseRom' | 'baseRomMismatch' | 'invalid';

export class ProjectError extends Error {
  constructor(
    readonly code: ProjectErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ProgressReporter {
  (message: string, done?: number, total?: number): void;
}

export type ProjectChange = { kind: 'dirty' } | { kind: 'saved' } | { kind: 'files' };

const PROJECT_GITIGNORE = '# Never commit ROMs\n*.gba\nbuild/\n';

/**
 * An open project folder: the manifest, the read-only base ROM, and every
 * asset loaded into memory. Editors change asset objects in place and mark
 * them dirty; `save()` writes dirty assets back to their files and
 * `build()` produces a ROM.
 */
export class Project implements GraphicsSource {
  readonly assets = new Map<string, Asset>();
  /** Every file in the project folder, including non-assets. */
  files: string[];
  readonly doors: ProjectDoors;
  readonly loadErrors: string[];

  private readonly dirty = new Set<string>();
  private index?: { byKind: Map<AssetKind, Asset[]>; rooms: Map<string, RoomAsset>; numbered: Map<string, Asset> };
  private manifestDirty = false;
  private baselineCache?: Baseline;
  private readonly _onDidChange = new Emitter<ProjectChange>();
  readonly onDidChange = this._onDidChange.event;

  private constructor(
    readonly fs: WorkspaceFs,
    public manifest: ProjectManifest,
    readonly baseRom: Rom,
    readonly baseRomBytes: Uint8Array,
    assets: Asset[],
    files: string[],
    loadErrors: string[],
  ) {
    for (const a of assets) this.assets.set(a.path, a);
    this.files = files;
    this.loadErrors = loadErrors;
    this.doors = new ProjectDoors(this);
  }

  // ------------------------------------------------------------- lifecycle

  /** Extracts every asset from `romFile` into the (empty) folder and opens it. */
  static async create(fs: WorkspaceFs, romFile: Uint8Array, name: string, progress: ProgressReporter = () => {}): Promise<Project> {
    progress('Reading ROM');
    const rom = Rom.load(romFile);
    progress('Extracting assets');
    const { manifest, assets } = extractProject(rom, name);
    manifest.baseRom = { file: BASE_ROM_FILE, crc32: crc32Hex(romFile), size: romFile.length };
    const files: [string, Uint8Array][] = [
      [MANIFEST_FILE, serializeManifest(manifest)],
      ['.gitignore', textEncoder.encode(PROJECT_GITIGNORE)],
      [BASE_ROM_FILE, romFile],
      ...assets.map((a): [string, Uint8Array] => [a.path, serializeAsset(a)]),
    ];
    await writeFiles(fs, files, (done) => progress('Writing files', done, files.length));
    return Project.open(fs, progress);
  }

  static async open(fs: WorkspaceFs, progress: ProgressReporter = () => {}): Promise<Project> {
    progress('Reading project');
    const manifestBytes = await fs.read(MANIFEST_FILE);
    if (!manifestBytes) throw new ProjectError('noManifest', `This folder has no ${MANIFEST_FILE}.`);
    const manifest = parseManifest(manifestBytes);
    const romBytes = await fs.read(manifest.baseRom.file || BASE_ROM_FILE);
    if (!romBytes) throw new ProjectError('missingBaseRom', `The base ROM (${manifest.baseRom.file}) is missing from the project folder.`);
    if (crc32Hex(romBytes) !== manifest.baseRom.crc32)
      throw new ProjectError('baseRomMismatch', `${manifest.baseRom.file} is not the ROM this project was created from (CRC32 ${crc32Hex(romBytes)}, expected ${manifest.baseRom.crc32}).`);
    const rom = Rom.load(romBytes);
    if (rom.game.kind !== manifest.game) throw new ProjectError('invalid', `The base ROM is ${rom.game.gameName}, but the project is for ${manifest.game}.`);

    const files = await fs.list();
    const assetFiles = files.filter((f) => !f.startsWith('build/'));
    const contents = await readFiles(fs, assetFiles);
    const assets: Asset[] = [];
    const errors: string[] = [];
    assetFiles.forEach((path, i) => {
      progress('Loading assets', i, assetFiles.length);
      const bytes = contents[i];
      if (!bytes) return;
      try {
        const a = parseAsset(path, bytes);
        if (a) assets.push(a);
      } catch (e) {
        errors.push(e instanceof AssetFormatError ? e.message : `${path}: ${(e as Error).message}`);
      }
    });
    return new Project(fs, manifest, rom, romBytes, assets, files, errors);
  }

  /** Puts a copy of the base ROM into the project after checking it's the right one. */
  static async provideBaseRom(fs: WorkspaceFs, romFile: Uint8Array): Promise<void> {
    const manifestBytes = await fs.read(MANIFEST_FILE);
    if (!manifestBytes) throw new ProjectError('noManifest', `This folder has no ${MANIFEST_FILE}.`);
    const m = parseManifest(manifestBytes);
    if (crc32Hex(romFile) !== m.baseRom.crc32) throw new ProjectError('baseRomMismatch', `That ROM's CRC32 is ${crc32Hex(romFile)}; the project needs ${m.baseRom.crc32}.`);
    await fs.write(m.baseRom.file || BASE_ROM_FILE, romFile);
  }

  get name(): string {
    return this.manifest.name;
  }

  get rom(): Rom {
    return this.baseRom;
  }

  get game(): GameInfo {
    return this.baseRom.game;
  }

  get map(): RomMap {
    return this.baseRom.map;
  }

  /** The base ROM extracted as assets, with data locations. Computed once. */
  baseline(): Baseline {
    return (this.baselineCache ??= extractProject(this.baseRom, this.name).baseline);
  }

  // --------------------------------------------------------------- lookups

  get<K extends AssetKind>(path: string | null | undefined, kind: K): AssetOfKind<K> | undefined {
    if (!path) return undefined;
    const a = this.assets.get(path);
    return a && a.kind === kind ? (a as AssetOfKind<K>) : undefined;
  }

  private lookup() {
    if (this.index) return this.index;
    const byKind = new Map<AssetKind, Asset[]>();
    const rooms = new Map<string, RoomAsset>();
    const numbered = new Map<string, Asset>();
    for (const a of [...this.assets.values()].sort((x, y) => x.path.localeCompare(y.path))) {
      let list = byKind.get(a.kind);
      if (!list) byKind.set(a.kind, (list = []));
      list.push(a);
      if (a.kind === 'room') rooms.set(`${a.area}:${a.index}`, a);
      else if (a.kind === 'tileset' || a.kind === 'spriteset' || a.kind === 'area') numbered.set(`${a.kind}:${a.index}`, a);
      else if (a.kind === 'sprite') numbered.set(`sprite:${a.id}`, a);
    }
    return (this.index = { byKind, rooms, numbered });
  }

  /** Call after changing an asset's table index (tileset/spriteset/sprite numbers). */
  invalidateIndex(): void {
    this.index = undefined;
  }

  ofKind<K extends AssetKind>(kind: K): AssetOfKind<K>[] {
    return [...((this.lookup().byKind.get(kind) ?? []) as AssetOfKind<K>[])];
  }

  areas(): AreaAsset[] {
    return this.ofKind('area').sort((a, b) => a.index - b.index);
  }

  area(index: number): AreaAsset | undefined {
    return this.lookup().numbered.get(`area:${index}`) as AreaAsset | undefined;
  }

  areaName(index: number): string {
    return this.area(index)?.name ?? this.game.areaNames[index] ?? `Area ${index}`;
  }

  room(area: number, index: number): RoomAsset | undefined {
    return this.lookup().rooms.get(`${area}:${index}`);
  }

  rooms(area: number): RoomAsset[] {
    return this.ofKind('room')
      .filter((r) => r.area === area)
      .sort((a, b) => a.index - b.index);
  }

  tilesetAsset(index: number): TilesetAsset | undefined {
    return this.lookup().numbered.get(`tileset:${index}`) as TilesetAsset | undefined;
  }

  spritesetAsset(index: number): SpritesetAsset | undefined {
    return this.lookup().numbered.get(`spriteset:${index}`) as SpritesetAsset | undefined;
  }

  sprite(id: number): SpriteAsset | undefined {
    return this.lookup().numbered.get(`sprite:${id}`) as SpriteAsset | undefined;
  }

  /** Assets that reference `path`. */
  referencesTo(path: string): Asset[] {
    return [...this.assets.values()].filter((a) => assetReferences(a).includes(path));
  }

  /** Paths referenced by assets that don't exist in the project. */
  missingReferences(): { from: string; to: string }[] {
    const out: { from: string; to: string }[] = [];
    for (const a of this.assets.values()) for (const r of assetReferences(a)) if (!this.assets.has(r)) out.push({ from: a.path, to: r });
    return out;
  }

  // ---------------------------------------------------- graphics source

  private common(role: CommonRole): Asset | undefined {
    return this.assets.get(this.manifest.common[role] ?? '');
  }

  commonBgGfx(motherShip: boolean): Gfx {
    const a = this.common('bgGfx');
    if (!motherShip && a?.kind === 'graphics') return a.gfx;
    return Gfx.readRaw(this.rom.data, this.game.offsets.genericBgGfx + (motherShip ? 0x1000 : 0), 32, 4);
  }

  commonBgPalette(motherShip: boolean): Palette {
    const a = this.common('bgPalette');
    if (!motherShip && a?.kind === 'palette') return a.palette;
    return Palette.read(this.rom.data, this.game.offsets.genericBgPalette + (motherShip ? 0x200 : 0), 3);
  }

  commonSpriteGfx(): Gfx {
    const a = this.common('spriteGfx');
    return a?.kind === 'graphics' ? a.gfx : Gfx.readRaw(this.rom.data, this.game.offsets.genericSpriteGfx, 32, 14);
  }

  commonSpritePalette(): Palette {
    const a = this.common('spritePalette');
    return a?.kind === 'palette' ? a.palette : Palette.read(this.rom.data, this.game.offsets.genericSpritePalette, 6);
  }

  spriteGraphics(spriteId: number): { gfx: Gfx; palette: Palette } | undefined {
    const s = this.sprite(spriteId);
    const gfx = this.get(s?.graphics, 'graphics');
    const palette = this.get(s?.palette, 'palette');
    return gfx && palette ? { gfx: gfx.gfx, palette: palette.palette } : undefined;
  }

  // ------------------------------------------------------------- runtime

  /** A tileset composed from its assets, for rendering. */
  tileset(index: number): Tileset {
    const t = this.tilesetAsset(index);
    if (!t) throw new Error(`Tileset ${index.toString(16).toUpperCase()} does not exist in the project.`);
    const gfx = this.get(t.graphics, 'graphics')?.gfx ?? new Gfx(new Uint8Array(0));
    const bg = this.get(t.backgroundGraphics, 'graphics')?.gfx ?? new Gfx(new Uint8Array(0));
    const pal = this.get(t.palette, 'palette')?.palette ?? new Palette(14);
    const tt = this.get(t.tileTable, 'tiletable')?.entries ?? new Uint16Array(0x40 * 4);
    return new Tileset(index, gfx, pal, bg, tt, AnimTileset.read(this.rom, t.animatedTileset), AnimPalette.read(this.rom, t.animatedPalette));
  }

  private runtimeSpriteset(index: number): RoomSpriteset | undefined {
    const s = this.spritesetAsset(index);
    if (!s) return undefined;
    return { number: index, get entries() { return s.entries; }, spriteInSlot: (slot) => s.entries[slot] };
  }

  /** Builds the editable room composite. */
  loadRoom(area: number, index: number): Room {
    const asset = this.room(area, index);
    if (!asset) throw new Error(`Room ${area}-${index.toString(16).toUpperCase()} does not exist in the project.`);
    if (!asset.clipdata) throw new Error('The room has no clipdata layer.');
    const h = asset.props;
    const tm = (p: string | null) => {
      const t = this.get(p, 'tilemap');
      return t ? { size: t.size, entries: t.entries } : undefined;
    };
    return new Room(asset, this, {
      tileset: this.tileset(h.tileset),
      spritesets: [h.spriteset0, h.spriteset1, h.spriteset2].map((n) => this.runtimeSpriteset(n)),
      tilemaps: { bg0: tm(asset.bg0Tilemap), bg3: tm(asset.bg3Tilemap) },
    });
  }

  // ------------------------------------------------------------ editing

  markDirty(asset: Asset | string): void {
    this.dirty.add(typeof asset === 'string' ? asset : asset.path);
    this._onDidChange.fire({ kind: 'dirty' });
  }

  markManifestDirty(): void {
    this.manifestDirty = true;
    this._onDidChange.fire({ kind: 'dirty' });
  }

  isDirty(path?: string): boolean {
    return path ? this.dirty.has(path) : this.dirty.size > 0 || this.manifestDirty;
  }

  dirtyPaths(): string[] {
    return [...this.dirty];
  }

  /** Adds a new asset (marked dirty so it's written on save). */
  addAsset(asset: Asset): void {
    if (this.assets.has(asset.path)) throw new Error(`${asset.path} already exists.`);
    this.assets.set(asset.path, asset);
    this.index = undefined;
    if (!this.files.includes(asset.path)) this.files = [...this.files, asset.path].sort();
    this.markDirty(asset);
    this._onDidChange.fire({ kind: 'files' });
  }

  /** Writes every dirty asset to its file. */
  async save(): Promise<number> {
    const files: [string, Uint8Array][] = [];
    for (const path of this.dirty) {
      const a = this.assets.get(path);
      if (a) files.push([path, serializeAsset(a)]);
    }
    if (this.manifestDirty) files.push([MANIFEST_FILE, serializeManifest(this.manifest)]);
    await writeFiles(this.fs, files);
    this.dirty.clear();
    this.manifestDirty = false;
    this._onDidChange.fire({ kind: 'saved' });
    return files.length;
  }

  /** Builds the ROM from the base ROM and the current (possibly unsaved) assets. */
  build(): BuildResult {
    return buildRom(this);
  }

  /** Builds and writes the ROM to the manifest's output path inside the project. */
  async buildToProject(): Promise<BuildResult & { path: string }> {
    const result = this.build();
    const path = this.manifest.build.output;
    await this.fs.write(path, result.rom);
    if (!this.files.includes(path)) {
      this.files = [...this.files, path].sort();
      this._onDidChange.fire({ kind: 'files' });
    }
    return { ...result, path };
  }
}
