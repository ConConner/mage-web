import { compressLz77, decompressLz77 } from '@core/compression/lz77';
import { ResizeRoomAction } from '@core/editing/roomActions';
import type { PixelBuffer } from '@core/gfx/PixelBuffer';
import type { Services } from '../services/Services';
import { parseThemeJson } from '../services/ThemeService';
import { formatKeybinding } from '../services/KeybindingService';
import { hex } from '../components/controls';
import type { SelectedObject } from '../editors/room/RoomEditorModel';
import { cycleSpriteSlot, doorDestination, removeObject, resizeDoor } from '../editors/room/roomObjectOps';
import { aboutDialog, confirmDialog, inputDialog, resizeDialog } from './dialogs';
import { editorInputFor, roomPropertiesInput } from './assetEditors';

async function pngBytes(img: PixelBuffer): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.bytes), img.width, img.height), 0, 0);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Registers every workbench command. Keeping them in one place documents what the app can do. */
export function registerCommands(s: Services): void {
  const { commands, project: projects, editors, layout, rooms, roomTools, dialogs, notifications, platform, theme } = s;
  const hasProject = () => !!projects.project;
  const room = () => rooms.active.get();
  const hasRoom = () => !!room();
  const roomOrLast = () => rooms.active.get() ?? rooms.last.get();
  const tools = () => roomTools.get();

  /** Applies an operation to the hovered/selected object of the active room. */
  const targetObject = (): SelectedObject | undefined => {
    const m = room();
    if (!m) return undefined;
    const sel = m.ui.get().selected;
    if (sel) return sel;
    const c = m.ui.get().cursor;
    return c ? m.hitTest(c.x * 16 + 8, c.y * 16 + 8) : undefined;
  };

  const openAsset = (path: string, preview = false): boolean => {
    const p = projects.project;
    if (!p) return false;
    const input = editorInputFor(p, path);
    if (!input) {
      notifications.warn(`There is no editor for ${path}.`);
      return false;
    }
    editors.open(input, { preview });
    return true;
  };

  const openRoom = (area: number, r: number, preview = false) => {
    const asset = projects.project?.room(area, r);
    if (asset) openAsset(asset.path, preview);
    else notifications.warn(`Room ${area}-${hex(r)} does not exist in this project.`);
  };

  /** Opens an asset of the last focused room's tileset. */
  const tilesetPart = (key: 'graphics' | 'palette' | 'backgroundGraphics' | 'tileTable' | null) => () => {
    const p = projects.project;
    const m = roomOrLast();
    const t = m && p?.tilesetAsset(m.room.header.tileset);
    if (!t) return notifications.warn('Open a room first to edit its tileset.');
    const path = key ? t[key] : t.path;
    if (path) openAsset(path);
  };

  const export_ = async (name: string, img: PixelBuffer) => {
    const r = await platform.saveFileAs(name, await pngBytes(img), [{ name: 'PNG image', extensions: ['png'] }]);
    if (r) notifications.info(`Exported ${r.name}`);
  };

  const viewToggle = (id: string, key: Parameters<typeof roomTools.toggleView>[0], title: string) => ({
    id: `room.view.${id}`,
    title,
    category: 'View',
    run: () => roomTools.toggleView(key),
    isChecked: () => !!tools().view[key],
  });

  projects.prompts = {
    confirmDiscard: async () => {
      const p = projects.project;
      if (!p || !projects.state.get().dirty) return true;
      const r = await confirmDialog(s, 'Unsaved Changes', `Do you want to save the changes to ${p.dirtyPaths().length} files in ${p.name}?`, [
        { label: "Don't Save", value: 'discard' },
        { label: 'Cancel', value: 'cancel' },
        { label: 'Save', value: 'save', primary: true },
      ]);
      if (r === 'save') return projects.save();
      return r === 'discard';
    },
    confirm: async (title, message, ok) =>
      (await confirmDialog(s, title, message, [
        { label: 'Cancel', value: 'cancel' },
        { label: ok, value: 'ok', primary: true },
      ])) === 'ok',
    input: (title, label, value) => inputDialog(s, title, label, value),
  };

  commands.registerAll([
    // ------------------------------------------------------------ file
    { id: 'file.newProject', title: 'New Project from ROM…', category: 'File', keybinding: 'CmdOrCtrl+Alt+N', run: () => projects.newProject() },
    { id: 'file.openProject', title: 'Open Project…', category: 'File', keybinding: 'CmdOrCtrl+O', run: () => projects.openDialog() },
    { id: 'file.save', title: 'Save All', category: 'File', keybinding: 'CmdOrCtrl+S', isEnabled: hasProject, run: () => projects.save() },
    { id: 'file.closeProject', title: 'Close Project', category: 'File', isEnabled: hasProject, run: () => projects.close() },
    { id: 'file.clearRecent', title: 'Clear Recently Opened', category: 'File', run: () => platform.clearRecentFiles() },
    { id: 'build.rom', title: 'Build ROM', category: 'Build', keybinding: 'CmdOrCtrl+Shift+B', isEnabled: hasProject, run: () => projects.build() },
    { id: 'build.romAs', title: 'Build ROM As…', category: 'Build', isEnabled: hasProject, run: () => projects.buildAs() },
    { id: 'asset.open', title: 'Open Asset', hidden: true, run: (path, preview) => openAsset(String(path), Boolean(preview)) },
    {
      id: 'asset.goTo',
      title: 'Go to Asset…',
      category: 'File',
      keybinding: 'CmdOrCtrl+Shift+O',
      isEnabled: hasProject,
      run: async () => {
        const p = projects.project!;
        const items = [...p.assets.keys()].sort().map((path) => ({ label: path.slice(path.lastIndexOf('/') + 1), description: path, value: path }));
        const pick = await dialogs.pick('Go to asset (type part of a file name)', items);
        if (pick) openAsset(pick.value);
      },
    },

    // ------------------------------------------------------------ edit
    {
      id: 'edit.undo',
      title: 'Undo',
      category: 'Edit',
      keybinding: 'CmdOrCtrl+Z',
      isEnabled: () => !!room()?.undo.canUndo,
      run: () => room()?.undoLast(),
    },
    {
      id: 'edit.redo',
      title: 'Redo',
      category: 'Edit',
      keybinding: 'CmdOrCtrl+Y',
      isEnabled: () => !!room()?.undo.canRedo,
      run: () => room()?.redoLast(),
    },
    { id: 'edit.redoAlt', title: 'Redo', hidden: true, keybinding: 'CmdOrCtrl+Shift+Z', isEnabled: () => !!room()?.undo.canRedo, run: () => room()?.redoLast() },

    // --------------------------------------------------------- workbench
    {
      id: 'workbench.commandPalette',
      title: 'Show All Commands',
      category: 'View',
      keybinding: 'CmdOrCtrl+Shift+P',
      run: async () => {
        const items = commands
          .list()
          .filter((c) => !c.hidden && commands.isEnabled(c.id))
          .sort((a, b) => `${a.category}${a.title}`.localeCompare(`${b.category}${b.title}`))
          .map((c) => ({ label: `${c.category ? c.category + ': ' : ''}${c.title}`, description: c.keybinding ? formatKeybinding(c.keybinding) : undefined, value: c.id }));
        const pick = await dialogs.pick('Type the name of a command to run', items);
        if (pick) await commands.execute(pick.value);
      },
    },
    { id: 'workbench.toggleSidebar', title: 'Toggle Primary Side Bar', category: 'View', keybinding: 'CmdOrCtrl+B', run: () => layout.toggleSidebar() },
    { id: 'workbench.togglePanel', title: 'Toggle Panel', category: 'View', keybinding: 'CmdOrCtrl+J', run: () => layout.togglePanel() },
    { id: 'workbench.toggleAux', title: 'Toggle Room Tools Side Bar', category: 'View', keybinding: 'CmdOrCtrl+Alt+B', run: () => layout.state.update({ auxVisible: !layout.state.get().auxVisible }) },
    { id: 'workbench.showExplorer', title: 'Show Explorer', category: 'View', keybinding: 'CmdOrCtrl+Shift+E', run: () => layout.state.update({ activeContainer: 'explorer', sidebarVisible: true }) },
    {
      id: 'workbench.showProperties',
      title: 'Show Properties',
      category: 'View',
      run: () => {
        if (!layout.state.get().auxVisible || layout.state.get().activeContainer === 'tileset') layout.state.update({ activeContainer: 'properties', sidebarVisible: true });
      },
    },
    {
      id: 'workbench.selectTheme',
      title: 'Color Theme',
      category: 'Preferences',
      keybinding: 'CmdOrCtrl+K CmdOrCtrl+T',
      run: async () => {
        const all = theme.all();
        const currentId = theme.current.get().id;
        const items = [
          ...all.map((t) => ({ label: t.name, description: t.builtin ? `${t.kind} theme` : 'custom', value: t.id })),
          { label: 'Import Theme…', description: 'MAGE Themes .json or MAGE Web theme', value: '__import' },
        ];
        const pick = await dialogs.pick('Select Color Theme (Up/Down to preview)', items, {
          activeIndex: Math.max(0, all.findIndex((t) => t.id === currentId)),
          onHighlight: (i) => i && i.value !== '__import' && theme.preview(i.value),
        });
        if (!pick) return theme.restore();
        if (pick.value === '__import') {
          theme.restore();
          const f = await platform.openFile([{ name: 'Theme', extensions: ['json'] }]);
          if (!f) return;
          try {
            theme.addCustom(parseThemeJson(new TextDecoder().decode(f.data), f.name.replace(/\.json$/i, '')));
          } catch (e) {
            notifications.error(`Could not import theme: ${(e as Error).message}`);
          }
          return;
        }
        theme.select(pick.value);
      },
    },
    {
      id: 'workbench.keyboardShortcuts',
      title: 'Keyboard Shortcuts',
      category: 'Preferences',
      run: () => editors.open({ id: 'keybindings', kind: 'keybindings', title: 'Keyboard Shortcuts', params: {} }),
    },
    {
      id: 'room.setBackdrop',
      title: 'Set Backdrop Color Behind BG3…',
      category: 'Room',
      run: async () => {
        const items = ['#000000', '#202020', '#ff00ff', '#3060a0', '#ffffff'].map((c) => ({ label: c, value: c }));
        const pick = await dialogs.pick('Backdrop color', items);
        if (!pick) return;
        s.settings.set('room.backdropColor', pick.value);
        rooms.all().forEach((m) => m.render());
      },
    },

    // ------------------------------------------------------------- rooms
    { id: 'room.open', title: 'Open Room', hidden: true, run: (a, r, p) => openRoom(Number(a), Number(r), Boolean(p)) },
    {
      id: 'room.goTo',
      title: 'Go to Room…',
      category: 'Room',
      keybinding: 'CmdOrCtrl+P',
      isEnabled: hasProject,
      run: async () => {
        const p = projects.project!;
        const items = p.ofKind('room').map((r) => ({ label: `${p.areaName(r.area)} ${hex(r.index)}`, description: r.path, value: [r.area, r.index] as const }));
        const pick = await dialogs.pick('Go to room (type area name and/or room number)', items);
        if (pick) openRoom(pick.value[0], pick.value[1]);
      },
    },
    { id: 'room.mode.blocks', title: 'Block Editing Mode', category: 'Room', keybinding: 'B', isEnabled: hasRoom, isChecked: () => tools().mode === 'blocks', run: () => roomTools.setMode('blocks') },
    { id: 'room.mode.objects', title: 'Object Editing Mode', category: 'Room', keybinding: 'O', isEnabled: hasRoom, isChecked: () => tools().mode === 'objects', run: () => roomTools.setMode('objects') },
    { id: 'room.toggleMode', title: 'Toggle Editing Mode', category: 'Room', isEnabled: hasRoom, run: () => roomTools.toggleMode() },
    { id: 'room.toggleFill', title: 'Toggle Fill Tool', category: 'Room', keybinding: 'F', isEnabled: hasRoom, isChecked: () => tools().fill, run: () => roomTools.update({ fill: !tools().fill, mode: 'blocks' }) },
    ...(['bg0', 'bg1', 'bg2'] as const).map((k, i) => ({
      id: `room.edit.${k}`,
      title: `Edit BG ${i}`,
      category: 'Room',
      keybinding: String(i + 1),
      isEnabled: () => !!roomOrLast()?.room.layers[i].isRle,
      isChecked: () => tools().bgLayer === k,
      run: () => roomTools.setBgLayer(k),
    })),
    { id: 'room.edit.clip', title: 'Edit Clipdata', category: 'Room', keybinding: '4', isChecked: () => tools().editClip, run: () => roomTools.update({ editClip: !tools().editClip }) },
    ...[0, 1, 2, 3].map((i) => ({
      id: `room.view.bg${i}`,
      title: `Show BG ${i}`,
      category: 'View',
      isChecked: () => tools().view.layers[i],
      run: () => roomTools.toggleLayerView(i),
    })),
    viewToggle('collision', 'collision', 'Show Clipdata Collision'),
    viewToggle('breakable', 'breakable', 'Show Breakable Blocks'),
    viewToggle('values', 'values', 'Show Clipdata Values'),
    viewToggle('sprites', 'sprites', 'Show Sprites'),
    viewToggle('spriteOutlines', 'spriteOutlines', 'Show Sprite Outlines'),
    viewToggle('doors', 'doors', 'Show Doors'),
    viewToggle('scrolls', 'scrolls', 'Show Scrolls'),
    viewToggle('effect', 'effect', 'Show Effect Position'),
    viewToggle('screens', 'screens', 'Show Screen Outlines'),
    {
      ...viewToggle('animPalette', 'animatedPalette', 'Use Animated Palette'),
      run: () => {
        roomTools.toggleView('animatedPalette');
        s.settings.set('room.animatedPalette', tools().view.animatedPalette);
      },
    },
    viewToggle('motherShip', 'motherShipHatches', 'Use Mother Ship Hatches'),
    { id: 'room.zoomIn', title: 'Zoom In', category: 'Room', keybinding: 'CmdOrCtrl+=', isEnabled: hasRoom, run: () => room()?.zoomBy(1) },
    { id: 'room.zoomOut', title: 'Zoom Out', category: 'Room', keybinding: 'CmdOrCtrl+-', isEnabled: hasRoom, run: () => room()?.zoomBy(-1) },
    { id: 'room.zoomReset', title: 'Reset Zoom', category: 'Room', keybinding: 'CmdOrCtrl+0', isEnabled: hasRoom, run: () => room()?.setZoom(1) },
    {
      id: 'room.goThroughDoor',
      title: 'Go Through Door',
      category: 'Room',
      keybinding: 'G',
      isEnabled: hasRoom,
      run: (arg) => {
        const m = room();
        if (!m) return;
        const sel = (arg as SelectedObject | undefined) ?? targetObject();
        if (!sel || (sel.kind !== 'door' && sel.kind !== 'exit')) return;
        const d = m.doorOf(sel);
        const dst = d && doorDestination(m, d);
        if (!dst) return notifications.warn('This door has no valid destination.');
        openRoom(dst.area, dst.room);
        const target = rooms.model(dst.area, dst.room);
        target?.ui.update({ selected: { kind: 'door', area: dst.door.area, number: dst.door.number } });
      },
    },
    {
      id: 'room.deleteObject',
      title: 'Delete Selected Object',
      category: 'Room',
      keybinding: 'Delete',
      isEnabled: () => hasRoom() && tools().mode === 'objects',
      run: () => {
        const m = room();
        if (m) removeObject(m, targetObject());
      },
    },
    { id: 'room.deleteObjectAlt', title: 'Delete Selected Object', hidden: true, keybinding: 'Backspace', isEnabled: () => hasRoom() && tools().mode === 'objects', run: () => commands.execute('room.deleteObject') },
    ...([
      ['[', -1, 'Previous'],
      [']', 1, 'Next'],
    ] as const).map(([key, delta, label]) => ({
      id: `room.spriteSlot${label}`,
      title: `${label} Sprite Slot`,
      category: 'Room',
      keybinding: key,
      isEnabled: hasRoom,
      run: () => {
        const m = room();
        const t = targetObject();
        if (m && t?.kind === 'sprite') cycleSpriteSlot(m, t.list, t.index, delta);
      },
    })),
    ...([
      ['W', 0, -1],
      ['A', -1, 0],
      ['S', 0, 1],
      ['D', 1, 0],
    ] as const).map(([key, dx, dy]) => ({
      id: `room.resizeDoor${key}`,
      title: `Resize Door (${key})`,
      category: 'Room',
      hidden: true,
      keybinding: key,
      isEnabled: hasRoom,
      run: () => {
        const m = room();
        const t = targetObject();
        if (!m || !t || (t.kind !== 'door' && t.kind !== 'exit')) return;
        const d = m.doorOf(t);
        if (d) resizeDoor(m, d, dx, dy);
      },
    })),
    {
      id: 'room.clearSelection',
      title: 'Clear Selection',
      hidden: true,
      keybinding: 'Escape',
      isEnabled: hasRoom,
      run: () => {
        room()?.ui.update({ selected: undefined, selection: undefined });
        roomTools.update({ brush: undefined, tilesetSelection: undefined });
      },
    },
    {
      id: 'room.options',
      title: 'Room Options (Resize)…',
      category: 'Room',
      isEnabled: hasRoom,
      run: async () => {
        const m = room()!;
        const r = await resizeDialog(s, m.room.width, m.room.height);
        if (r && (r.width !== m.room.width || r.height !== m.room.height)) m.perform(new ResizeRoomAction(r.width, r.height));
      },
    },
    {
      id: 'room.exportImage',
      title: 'Export Room Image…',
      category: 'Room',
      isEnabled: hasRoom,
      run: () => {
        const m = room()!;
        return export_(`room_${m.area}_${hex(m.roomId)}.png`, m.renderer.buffer);
      },
    },
    {
      id: 'room.exportTilesetImage',
      title: 'Export Tileset Image…',
      category: 'Room',
      isEnabled: () => !!roomOrLast(),
      run: () => {
        const m = roomOrLast()!;
        return export_(`tileset_${hex(m.room.tileset.number)}.png`, m.renderer.blocks);
      },
    },
    {
      id: 'room.headerEditor',
      title: 'Edit Room Header',
      hidden: true,
      run: () => commands.execute('editor.roomProperties'),
    },

    // ----------------------------------------------------------- editors
    {
      id: 'editor.roomProperties',
      title: 'Room Properties',
      category: 'Editors',
      isEnabled: () => !!roomOrLast(),
      run: () => editors.open(roomPropertiesInput(roomOrLast()!.asset.path)),
    },
    { id: 'editor.tileset', title: "Edit Room's Tileset", category: 'Editors', isEnabled: () => !!roomOrLast(), run: tilesetPart(null) },
    { id: 'editor.palette', title: "Edit Room's Palette", category: 'Editors', isEnabled: () => !!roomOrLast(), run: tilesetPart('palette') },
    { id: 'editor.graphics', title: "Edit Room's Graphics", category: 'Editors', isEnabled: () => !!roomOrLast(), run: tilesetPart('graphics') },
    { id: 'editor.tileTable', title: "Edit Room's Tile Table", category: 'Editors', isEnabled: () => !!roomOrLast(), run: tilesetPart('tileTable') },
    {
      id: 'editor.spriteset',
      title: "Edit Room's Spriteset",
      category: 'Editors',
      isEnabled: () => !!roomOrLast(),
      run: () => {
        const m = roomOrLast()!;
        const set = m.room.spritesets[m.ui.get().spriteSet];
        const path = set && projects.project?.spritesetAsset(set.number)?.path;
        if (path) openAsset(path);
      },
    },
    {
      id: 'editor.doors',
      title: "Area's Door Table",
      category: 'Editors',
      isEnabled: hasProject,
      run: () => {
        const p = projects.project!;
        const area = p.area(roomOrLast()?.area ?? 0) ?? p.areas()[0];
        if (area) openAsset(area.path);
      },
    },
    { id: 'editor.project', title: 'Project Overview', category: 'Editors', isEnabled: hasProject, run: () => openAsset('project.mageproj') },
    { id: 'editor.closeActive', title: 'Close Editor', category: 'View', keybinding: 'CmdOrCtrl+W', isEnabled: () => !!editors.active, run: () => editors.active && editors.close(editors.active.id) },

    // ------------------------------------------------------------- tools
    {
      id: 'tools.lz77Decompress',
      title: 'LZ77 Decompress File…',
      category: 'Tools',
      run: async () => {
        const f = await platform.openFile([{ name: 'Any file', extensions: ['*'] }]);
        if (!f) return;
        try {
          const out = decompressLz77(f.data, 0).data;
          await platform.saveFileAs(f.name + '.bin', out, [{ name: 'Binary', extensions: ['bin'] }]);
        } catch (e) {
          notifications.error(`Not LZ77 data: ${(e as Error).message}`);
        }
      },
    },
    {
      id: 'tools.lz77Compress',
      title: 'LZ77 Compress File…',
      category: 'Tools',
      run: async () => {
        const f = await platform.openFile([{ name: 'Any file', extensions: ['*'] }]);
        if (f) await platform.saveFileAs(f.name + '.lz', compressLz77(f.data), [{ name: 'LZ77', extensions: ['lz'] }]);
      },
    },

    // -------------------------------------------------------------- help
    { id: 'help.welcome', title: 'Welcome', category: 'Help', run: () => editors.open({ id: 'welcome', kind: 'welcome', title: 'Welcome', params: {} }) },
    { id: 'help.wiki', title: 'MAGE Themes Wiki', category: 'Help', run: () => platform.openExternal('https://github.com/ConConner/MAGE-Themes/wiki') },
    { id: 'help.about', title: 'About', category: 'Help', run: () => aboutDialog(s) },
  ]);

  // Native menu "Open Recent" entries carry their path in the command id.
  platform.onHostCommand((id) => {
    if (id.startsWith('file.openRecent:')) void projects.openRecent(id.slice('file.openRecent:'.length));
    else void commands.execute(id);
  });
}
