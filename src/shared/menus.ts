/**
 * Application menu definition, shared by the Electron main process (native
 * menu) and the renderer (in-window menu bar for the browser build).
 * Items reference command IDs registered in the renderer's CommandService.
 */
export type MenuItemSpec =
  | { command: string; label: string; accelerator?: string; checkable?: boolean }
  | { submenu: string; items: MenuItemSpec[] }
  | { separator: true }
  | { role: 'recent' };

export interface MenuSpec {
  label: string;
  items: MenuItemSpec[];
}

export const APP_MENU: MenuSpec[] = [
  {
    label: 'File',
    items: [
      { command: 'file.newProject', label: 'New Project from ROM…', accelerator: 'CmdOrCtrl+Alt+N' },
      { command: 'file.openProject', label: 'Open Project…', accelerator: 'CmdOrCtrl+O' },
      { role: 'recent' },
      { separator: true },
      { command: 'asset.goTo', label: 'Go to Asset…', accelerator: 'CmdOrCtrl+Shift+O' },
      { command: 'room.goTo', label: 'Go to Room…', accelerator: 'CmdOrCtrl+P' },
      { separator: true },
      { command: 'file.save', label: 'Save All', accelerator: 'CmdOrCtrl+S' },
      { separator: true },
      { command: 'file.closeProject', label: 'Close Project' },
    ],
  },
  {
    label: 'Edit',
    items: [
      { command: 'edit.undo', label: 'Undo', accelerator: 'CmdOrCtrl+Z' },
      { command: 'edit.redo', label: 'Redo', accelerator: 'CmdOrCtrl+Y' },
      { separator: true },
      { command: 'room.mode.blocks', label: 'Block Editing Mode', checkable: true, accelerator: 'B' },
      { command: 'room.mode.objects', label: 'Object Editing Mode', checkable: true, accelerator: 'O' },
      { command: 'room.toggleFill', label: 'Fill Tool', checkable: true, accelerator: 'F' },
      { separator: true },
      { command: 'room.edit.bg0', label: 'Edit BG 0', checkable: true },
      { command: 'room.edit.bg1', label: 'Edit BG 1', checkable: true },
      { command: 'room.edit.bg2', label: 'Edit BG 2', checkable: true },
      { command: 'room.edit.clip', label: 'Edit Clipdata', checkable: true },
    ],
  },
  {
    label: 'View',
    items: [
      { command: 'workbench.commandPalette', label: 'Command Palette…', accelerator: 'CmdOrCtrl+Shift+P' },
      { command: 'workbench.toggleSidebar', label: 'Toggle Side Bar', accelerator: 'CmdOrCtrl+B' },
      { command: 'workbench.togglePanel', label: 'Toggle Panel', accelerator: 'CmdOrCtrl+J' },
      { separator: true },
      {
        submenu: 'Layers',
        items: [
          { command: 'room.view.bg0', label: 'BG 0', checkable: true },
          { command: 'room.view.bg1', label: 'BG 1', checkable: true },
          { command: 'room.view.bg2', label: 'BG 2', checkable: true },
          { command: 'room.view.bg3', label: 'BG 3', checkable: true },
        ],
      },
      {
        submenu: 'Clipdata',
        items: [
          { command: 'room.view.collision', label: 'Collision', checkable: true },
          { command: 'room.view.breakable', label: 'Breakable', checkable: true },
          { command: 'room.view.values', label: 'Values', checkable: true },
        ],
      },
      { command: 'room.view.sprites', label: 'Sprites', checkable: true },
      { command: 'room.view.spriteOutlines', label: 'Sprite Outlines', checkable: true },
      { command: 'room.view.doors', label: 'Doors', checkable: true },
      { command: 'room.view.scrolls', label: 'Scrolls', checkable: true },
      { command: 'room.view.effect', label: 'Effect Position', checkable: true },
      { command: 'room.view.screens', label: 'Screen Outlines', checkable: true },
      { separator: true },
      { command: 'room.view.animPalette', label: 'Animated Palette', checkable: true },
      { command: 'room.view.motherShip', label: 'Mother Ship Hatches', checkable: true },
      { separator: true },
      { command: 'room.zoomIn', label: 'Zoom In', accelerator: 'CmdOrCtrl+=' },
      { command: 'room.zoomOut', label: 'Zoom Out', accelerator: 'CmdOrCtrl+-' },
      { command: 'room.zoomReset', label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0' },
    ],
  },
  {
    label: 'Editors',
    items: [
      { command: 'editor.roomProperties', label: 'Room Properties' },
      { command: 'editor.tileset', label: "Room's Tileset" },
      { command: 'editor.palette', label: "Room's Palette" },
      { command: 'editor.graphics', label: "Room's Graphics" },
      { command: 'editor.tileTable', label: "Room's Tile Table" },
      { command: 'editor.spriteset', label: "Room's Spriteset" },
      { command: 'editor.doors', label: "Area's Door Table" },
      { separator: true },
      { command: 'editor.project', label: 'Project Overview' },
    ],
  },
  {
    label: 'Build',
    items: [
      { command: 'build.rom', label: 'Build ROM', accelerator: 'CmdOrCtrl+Shift+B' },
      { command: 'build.romAs', label: 'Build ROM As…' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { command: 'room.options', label: 'Room Options…' },
      { command: 'room.exportImage', label: 'Export Room Image…' },
      { command: 'room.exportTilesetImage', label: 'Export Tileset Image…' },
      { separator: true },
      { command: 'tools.lz77Decompress', label: 'LZ77 Decompress File…' },
      { command: 'tools.lz77Compress', label: 'LZ77 Compress File…' },
    ],
  },
  {
    label: 'Preferences',
    items: [
      { command: 'workbench.selectTheme', label: 'Color Theme…', accelerator: 'CmdOrCtrl+K CmdOrCtrl+T' },
      { command: 'workbench.keyboardShortcuts', label: 'Keyboard Shortcuts' },
    ],
  },
  {
    label: 'Help',
    items: [
      { command: 'help.welcome', label: 'Welcome' },
      { command: 'help.wiki', label: 'MAGE Themes Wiki' },
      { command: 'help.about', label: 'About MAGE Web' },
    ],
  },
];
