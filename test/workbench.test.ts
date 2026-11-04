import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { MemoryFs } from '../src/core/project/fs';
import type { PlatformApi } from '../src/platform/api';
import { Rom } from '../src/core/rom/Rom';
import { extractProject } from '../src/core/project/extract';

/**
 * Drives the renderer's services and commands headlessly (no DOM rendering):
 * create a project, edit a room and a palette, save and build.
 */
const romPath = process.env.MAGE_TEST_ROM ?? '';
const enabled = romPath !== '' && existsSync(romPath);

// Just enough DOM for the theme service.
const style = { setProperty: () => {} };
(globalThis as unknown as { document: unknown }).document = { documentElement: { style, dataset: {} } };

function fakePlatform(folder: MemoryFs, rom: Uint8Array): PlatformApi & { saved: Uint8Array[] } {
  const saved: Uint8Array[] = [];
  return {
    saved,
    kind: 'browser',
    os: 'web',
    nativeMenu: false,
    persistentFolders: true,
    openFile: async () => ({ name: 'rom.gba', handle: { kind: 'none' }, data: rom }),
    pickFolder: async () => ({ name: folder.name, fs: folder }),
    openFolderPath: async () => undefined,
    writeFile: async () => true,
    saveFileAs: async (name, data) => {
      saved.push(data);
      return { name, handle: { kind: 'none' } };
    },
    recentFiles: async () => [],
    addRecentFile: async () => {},
    clearRecentFiles: async () => {},
    loadSettings: async () => ({}),
    saveSettings: async () => {},
    setTitle: () => {},
    setDocumentEdited: () => {},
    onHostCommand: () => {},
    setCloseGuard: () => {},
    openExternal: () => {},
  };
}

describe.skipIf(!enabled)('workbench with a project', () => {
  it('creates, edits, saves and builds through commands', async () => {
    const { Services } = await import('../src/renderer/src/services/Services');
    const { registerCommands } = await import('../src/renderer/src/workbench/commands');
    const rom = new Uint8Array(readFileSync(romPath));
    const folder = new MemoryFs('hack');
    const s = await Services.create(fakePlatform(folder, rom));
    registerCommands(s);
    s.project.prompts = { confirmDiscard: async () => true, confirm: async () => true, input: async (_t, _l, v) => v };

    await s.commands.execute('file.newProject');
    const project = s.project.project!;
    expect(project).toBeDefined();
    expect(folder.files.has('project.mageproj')).toBe(true);

    // Open a room from the asset browser path.
    const roomPath = project.room(0, 1)!.path;
    await s.commands.execute('asset.open', roomPath, true);
    expect(s.editors.active?.kind).toBe('room');
    const model = s.rooms.model(0, 1)!;
    expect(model).toBeDefined();
    expect(s.rooms.active.get()).toBe(model);

    // Paint a block on BG1 with a tileset brush.
    s.roomTools.update({ bgLayer: 'bg1', editClip: false, brush: { blocks: [[{ bg0: 0xffff, bg1: 0x33, bg2: 0xffff, clip: 0xffff }]], source: 'tileset' } });
    model.paint(6, 6, false);
    expect(project.room(0, 1)!.bg1!.get(6, 6)).toBe(0x33);
    expect(project.isDirty(roomPath)).toBe(true);
    expect(s.project.state.get().dirty).toBe(true);
    await s.commands.execute('edit.undo');
    expect(project.room(0, 1)!.bg1!.get(6, 6)).not.toBe(0x33);
    await s.commands.execute('edit.redo');
    expect(project.room(0, 1)!.bg1!.get(6, 6)).toBe(0x33);

    // Go through a door into another room.
    const door = model.room.doors.find((d) => project.doors.destinationOf(d));
    if (door) {
      await s.commands.execute('room.goThroughDoor', { kind: 'door', area: door.area, number: door.number });
      expect(s.editors.active?.id).not.toBe(`room:0:1`);
    }

    // Edit the room's palette through the editor command; rooms using it reload.
    await s.commands.execute('asset.open', roomPath);
    await s.commands.execute('editor.palette');
    expect(s.editors.active?.kind).toBe('palette');
    const palPath = String(s.editors.active!.params.path);
    project.get(palPath, 'palette')!.palette.set(2, 3, 0x7c00);
    s.project.assetChanged(palPath);
    expect(project.isDirty(palPath)).toBe(true);

    // Save writes only the changed files.
    await s.commands.execute('file.save');
    expect(s.project.state.get().dirty).toBe(false);
    expect(new TextDecoder().decode(folder.files.get(palPath)!)).toContain('7C00');

    // Build into the project folder, and re-extract to check the result.
    await s.commands.execute('build.rom');
    const out = folder.files.get(project.manifest.build.output)!;
    expect(out).toBeDefined();
    const rebuilt = extractProject(Rom.load(out), 'check');
    const room = rebuilt.assets.find((a) => a.kind === 'room' && a.area === 0 && a.index === 1);
    expect(room?.kind === 'room' && room.bg1!.get(6, 6)).toBe(0x33);
  });
});
