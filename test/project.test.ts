import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Rom } from '../src/core/rom/Rom';
import { MemoryFs } from '../src/core/project/fs';
import { Project } from '../src/core/project/Project';
import { extractProject } from '../src/core/project/extract';
import { parseAsset, serializeAsset } from '../src/core/project/codec';
import { sameContent, type RoomAsset } from '../src/core/project/assets';
import { RoomRenderer, DEFAULT_VIEW_OPTIONS } from '../src/core/gfx/RoomRenderer';
import { EditBlocksAction, addSprite, editDoor, addScroll } from '../src/core/editing/roomActions';
import { newScroll } from '../src/core/model/Scrolls';
import { encodePng } from './helpers/png';

/**
 * Integration tests against a real ROM. Set MAGE_TEST_ROM to a Zero Mission
 * or Fusion (U) ROM; skipped otherwise. ROMs are never committed.
 */
const romPath = process.env.MAGE_TEST_ROM ?? '';
const enabled = romPath !== '' && existsSync(romPath);
const outDir = 'test/fixtures/out';

describe.skipIf(!enabled)('project from a real ROM', () => {
  const romFile = () => new Uint8Array(readFileSync(romPath));
  let cached: Promise<{ fs: MemoryFs; project: Project }> | undefined;
  const create = () =>
    (cached ??= (async () => {
      const fs = new MemoryFs('test');
      const project = await Project.create(fs, romFile(), 'Test Hack');
      return { fs, project };
    })());

  it('maps the ROM consistently with the original MAGE constants', () => {
    const rom = Rom.load(romFile());
    const m = rom.map;
    const p = rom.game.pointers;
    expect(m.table('areaRoomEntries').pools[0]).toBe(p.areaHeader);
    expect(m.table('tilesets').pools[0]).toBe(p.tileset);
    expect(m.table('spritesets').pools[0]).toBe(p.spriteset);
    expect(m.table('doors').pools[0]).toBe(p.doors);
    expect(m.table('scrolls').pools[0]).toBe(p.scrolls);
    expect(m.table('tilesets').count).toBe(rom.game.numOfTilesets);
  });

  it('extracts every asset and opens the project from files', async () => {
    const { fs, project } = await create();
    expect(project.loadErrors).toEqual([]);
    expect(project.missingReferences()).toEqual([]);
    expect(project.ofKind('room').length).toBeGreaterThan(300);
    expect(project.ofKind('tileset').length).toBe(project.game.numOfTilesets);
    expect(fs.files.has('baserom.gba')).toBe(true);
    // Names come from the map.
    expect(project.assets.has('rooms/0_Brinstar/Brinstar_00.room.json')).toBe(true);
    expect([...project.assets.keys()].some((p) => p.startsWith('tilesets/graphics/Tileset_'))).toBe(true);
    console.log(`${project.assets.size} assets, ${fs.files.size} files, ${(([...fs.files.values()].reduce((n, f) => n + f.length, 0)) / 1e6).toFixed(1)} MB`);
  });

  it('serializes every asset losslessly', async () => {
    const { project } = await create();
    for (const a of project.assets.values()) {
      const back = parseAsset(a.path, serializeAsset(a))!;
      expect(serializeAsset(back)).toEqual(serializeAsset(a));
      if (a.kind !== 'room' && a.kind !== 'area') expect(sameContent(a, back)).toBe(true);
    }
  });

  it('loads and renders every room', async () => {
    const { project } = await create();
    const failures: string[] = [];
    for (const r of project.ofKind('room')) {
      try {
        new RoomRenderer(project.loadRoom(r.area, r.index)).render(DEFAULT_VIEW_OPTIONS);
      } catch (e) {
        failures.push(`${r.path}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
    mkdirSync(outDir, { recursive: true });
    for (const [a, r] of [[0, 0], [0, 1], [1, 4], [2, 3], [5, 0]]) {
      const ren = new RoomRenderer(project.loadRoom(a, r));
      writeFileSync(`${outDir}/room_${a}_${r}.png`, encodePng(ren.render(DEFAULT_VIEW_OPTIONS)));
    }
  });

  it('builds a byte-identical ROM when nothing changed', async () => {
    const { project } = await create();
    const t = performance.now();
    const result = project.build();
    console.log(`unchanged build: ${(performance.now() - t).toFixed(0)} ms`, result.stats);
    expect(result.stats.relocated + result.stats.inPlace).toBe(0);
    expect(Buffer.compare(Buffer.from(result.rom), Buffer.from(Rom.load(romFile()).data.bytes))).toBe(0);
  });

  it('builds edits into the ROM and keeps everything else intact', async () => {
    const fs = new MemoryFs('edit');
    const project = await Project.create(fs, romFile(), 'Edit');
    const room = project.loadRoom(0, 1);
    const target = { room, doors: project.doors };
    const b = room.getBlock(5, 5);
    new EditBlocksAction(target, [[{ ...b, bg1: 0x42, clip: 0x10 }]], 5, 5, { bg1: true, clip: true }).apply(target);
    addSprite(0, { x: 7, y: 8, properties: 0x11 }).apply(target);
    addScroll(newScroll(3, 3)).apply(target);
    const door = room.doors[0];
    editDoor({ ...door, exitX: 0x10 }).apply(target);
    // Grow a room so its clipdata must move.
    const big = project.loadRoom(1, 2);
    big.resize(big.width + 10, big.height);
    // A palette shared by tilesets.
    const pal = project.get(project.tilesetAsset(room.header.tileset)!.palette, 'palette')!;
    pal.palette.set(1, 1, 0x1234);
    // Sprite graphics (ZM: recompressed, likely relocated).
    const zoomer = project.ofKind('sprite').find((s) => s.graphics)!;
    project.get(zoomer.graphics, 'graphics')!.gfx.data[3] ^= 0xff;
    for (const a of [room.asset, big.asset, pal, project.get(zoomer.graphics, 'graphics')!]) project.markDirty(a);

    const t = performance.now();
    const result = project.build();
    console.log(`edited build: ${(performance.now() - t).toFixed(0)} ms`, result.stats);
    expect(result.stats.relocated + result.stats.inPlace).toBeGreaterThan(0);

    // Re-extract the built ROM and compare it with the edited project.
    const rebuilt = extractProject(Rom.load(result.rom), 'check');
    const rooms = new Map<string, RoomAsset>();
    for (const a of rebuilt.assets) if (a.kind === 'room') rooms.set(`${a.area}:${a.index}`, a);
    let compared = 0;
    for (const r of project.ofKind('room')) {
      const o = rooms.get(`${r.area}:${r.index}`)!;
      expect(o, r.path).toBeDefined();
      for (const k of ['bg0', 'bg1', 'bg2', 'clipdata'] as const) {
        if (r[k]) expect(o[k]?.equals(r[k]!), `${r.path} ${k}`).toBe(true);
      }
      r.spriteLists.forEach((l, i) => l && expect(o.spriteLists[i]?.equals(l), `${r.path} sprites ${i}`).toBe(true));
      expect(o.scrolls, `${r.path} scrolls`).toEqual(r.scrolls);
      expect(o.doors.map((d) => ({ ...d }))).toEqual(r.doors.map((d) => ({ ...d })));
      expect(o.props).toEqual(r.props);
      compared++;
    }
    expect(compared).toBeGreaterThan(300);
    const o = rooms.get('0:1')!;
    expect(o.clipdata!.get(5, 5)).toBe(0x10);
    const built = Rom.load(result.rom);
    const builtTs = rebuilt.assets.find((a) => a.kind === 'tileset' && a.index === room.header.tileset)!;
    const builtPal = rebuilt.assets.find((a) => a.path === (builtTs as { palette: string }).palette)!;
    expect(builtPal.kind === 'palette' && builtPal.palette.get(1, 1)).toBe(0x1234);
    const builtSprite = rebuilt.assets.find((a) => a.kind === 'sprite' && a.id === zoomer.id)!;
    const g = rebuilt.assets.find((a) => a.path === (builtSprite as { graphics: string }).graphics)!;
    expect(g.kind === 'graphics' && sameContent(g, project.get(zoomer.graphics, 'graphics')!)).toBe(true);
    expect(built.data.length).toBeGreaterThanOrEqual(Rom.load(romFile()).data.length);

    // Saving writes only what changed, and the saved project opens again.
    const written = await project.save();
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(20);
    const reopened = await Project.open(fs);
    expect(reopened.room(0, 1)!.clipdata!.get(5, 5)).toBe(0x10);
    expect(Buffer.compare(Buffer.from(reopened.build().rom), Buffer.from(result.rom))).toBe(0);
  });
});
