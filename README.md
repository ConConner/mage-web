# MAGE Web

A cross-platform rewrite of [MAGE Themes](https://github.com/ConConner/MAGE-Themes), the Metroid Advance Game Editor
for **Metroid Fusion (AMTE)** and **Metroid Zero Mission (BMXE)**, built with web technologies in the style of VS Code:
an Electron shell around a TypeScript/React workbench. The same workbench also runs in a plain browser.

```
npm install
npm run dev        # Electron app with hot reload
npm run dev:web    # browser-only build at http://localhost:5199
npm run build      # production Electron bundles in out/
npm run dist       # installers via electron-builder
npm test           # unit tests (set MAGE_TEST_ROM=/path/to/rom.gba for ROM integration tests)
npm run typecheck
node scripts/generate-rom-map.mjs <mf-zm-info checkout>   # regenerate src/core/game/map/*.json
```

## Projects and assets

MAGE Web never edits a ROM directly. **New Project from ROM…** extracts everything editable into a project folder,
one file per asset, and **Build ROM** (<kbd>Ctrl/⌘ Shift B</kbd>) produces a new ROM from the untouched base ROM plus
the assets. Projects are plain folders that work well with git.

```
MyHack/
  project.mageproj               manifest: game, base ROM CRC32, build output, common asset roles
  baserom.gba                    copy of the original ROM (gitignored; checked by CRC32 on open)
  .gitignore                     *.gba, build/
  rooms/0_Brinstar/
    Brinstar.area.json           area: name, door slots not placed in any room
    Brinstar_00.room.json        room (composite): header values, BG0-2 + clipdata block maps,
                                 3 sprite lists, scrolls, doors; references tilemaps/tileset/spritesets
  backgrounds/*.tilemap.json     LZ77 backgrounds (BG3, LZ77 BG0), shared by rooms
  tilesets/Tileset_08.tileset.json   tileset entry: references graphics, palette, tile table
  tilesets/graphics/*.gfx        4bpp tiles, raw and uncompressed (opens in tile editors)
  tilesets/palettes/*.palette.json
  tilesets/tiletables/*.tiletable.json
  spritesets/Spriteset_1A.spriteset.json
  sprites/12_Zoomer.sprite.json  sprite graphics + palette references; sprites/graphics, sprites/palettes
  common/                        generic BG/sprite graphics and palettes
  build/MyHack.gba               build output (gitignored)
```

Assets are stored decoded (JSON grids are one hex row per line, so diffs are readable); compression happens only when
building. Asset names come from the decompilation symbols in the ROM map. The **Explorer** is a file tree of the
project; opening a file opens its editor.

Building copies the base ROM and compares every asset with what the base ROM holds at the same place. Unchanged data
is not touched, so a project without edits builds a byte-identical ROM. Changed data is written in place when it fits
and nothing else shares it, otherwise into free space with its pointers updated.

## Architecture

Layers depend only downward; `core` has no DOM or Node dependencies.

| Layer | Path | Responsibility |
| --- | --- | --- |
| **core** | `src/core` | Byte I/O, LZ77/RLE codecs, MAGE-compatible free-space allocator, game constants and the ROM map (`game/RomMap.ts`), pure data models, VRAM reconstruction and room rendering into RGBA buffers, undoable edit actions. `project/`: asset types and file formats, extraction (ROM → assets), `Project` (open/save, lookups, runtime composition), and the builder (assets → ROM). |
| **platform** | `src/platform` | `PlatformApi` contract between UI and host; Electron implementation (via preload bridge; project folder access over IPC, limited to folders the user opened) and browser implementation (File System Access API directory handles, in-memory fallback, localStorage). |
| **main / preload** | `src/main`, `src/preload` | Electron process: window, native menu (built from `src/shared/menus.ts`), file/folder dialogs, sandboxed project file access, settings & recent projects. No editor logic. |
| **renderer** | `src/renderer/src` | The workbench. `services/` (commands, keybindings, themes, settings, editors, layout, dialogs, notifications, project), `workbench/` (shell, menus, path → editor mapping), `views/` (asset browser, tileset/clipdata picker, properties), `editors/` (room, room properties, tileset, palette, graphics, tile table, tilemap, spriteset, sprite, area door table, project overview). |

Room editing is split into `RoomEditorModel` (state, rendering, hit-testing, edit operations — no DOM),
`useRoomInteraction` (pointer input → model calls), `RoomOverlayPainter` (doors, sprites, scrolls, clipdata overlays)
and the `RoomEditor` component.

Every user action is a command (`workbench/commands.ts`), so menus, keyboard shortcuts and the command palette
(<kbd>Ctrl/⌘ Shift P</kbd>) stay consistent.

## Themes

A theme is five base colors; all UI colors derive from them in CSS. Themes exported from MAGE Themes
(`{"Colors": {"BackgroundColor": …}}`) can be imported via *Preferences → Color Theme → Import Theme…*.

## Status

Implemented: projects (extract, save, build), asset browser, room viewing/editing (blocks, clipdata, fill, copy from
room, sprites, doors incl. exit positions, scrolls, effect line, resize), collision/breakable/value overlays,
go-through-door, room properties/tileset/palette/graphics/tile table/spriteset/sprite/door table editors, tilemap
preview, PNG export, LZ77 tools.

Not yet assets: animated tilesets/graphics/palettes, OAM, sprite AI/stats, area connections, minimap, text, demos,
credits, physics, weapons (read from the base ROM where needed). Adding new rooms, tilesets or spritesets (growing the
tables) isn't supported yet. Not yet ported from MAGE Themes: text, demo, credits, physics, weapon, minimap/connection,
animation and OAM editors; test room; patches/tweaks; bookmarks.

See `docs/IMPLEMENTATION_NOTES.md` for ROM format findings, design decisions and known gaps.

The original MAGE resource lists (`src/core/game/data`) are used as game data. The ROM map (`src/core/game/map`) is
generated from [mf-zm-info](https://github.com/biosp4rk/mf-zm-info), which is extracted from the
[mf](https://github.com/metroidret/mf) and [mzm](https://github.com/metroidret/mzm) decompilation projects.
