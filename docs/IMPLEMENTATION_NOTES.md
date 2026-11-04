# Implementation notes

Reference for future work on MAGE Web: what was learned from the original MAGE Themes source, how this
rewrite maps to it, deliberate deviations, and known gaps. See `README.md` for the high-level architecture.

Original source studied: https://github.com/ConConner/MAGE-Themes (C#/.NET WinForms, ~50k lines; `mage/` folder).
Logic was re-implemented, not translated. Game data lists in `src/core/game/data` are copied from
`mage/Resources/Lists` (MIT licensed, see `LICENSE`).

## Projects (the asset model)

Since 2026-11-04 MAGE Web works on **projects**, not ROMs. Everything editable is an asset file in a project folder;
the base ROM is only read, and a ROM is a build artifact. See `README.md` for the folder layout.

Core pieces (`src/core/project/`):
- `assets.ts`: asset classes. Leaf assets mirror one ROM structure (palette, graphics, tile table, tilemap, spriteset,
  sprite, tileset entry). `RoomAsset` is a composite: header values (`RoomProps`, everything except pointers), RLE block
  layers (BG0-2, clipdata), LZ77 layer references (tilemap paths), 3 sprite lists (`null` = unused/inactive), scrolls,
  and the doors placed in the room. `AreaAsset` holds door slots that belong to no room.
- `codec.ts`: file formats. JSON assets carry `"$type"` and `"version"`; u16 grids are hex rows (one per line).
  Graphics are raw uncompressed 4bpp `.gfx`. The manifest is `project.mageproj`.
- `extract.ts`: ROM → assets, guided by the ROM map. Leaf data reached through several pointers becomes **one shared
  asset** (deduplicated by offset), mirroring ROM sharing; e.g. a palette used by 3 tilesets is one file. Room parts
  stay inline in the room even if shared in ROM. It also returns the **baseline**: origin offset/length/encoding of every
  piece of data and how many structural pointers reference each offset.
- `Project.ts`: loads every asset at open (eager; ~1200 files for ZM, ~250 ms), implements `GraphicsSource` for the
  renderers, composes runtime `Tileset`/`Room` objects whose data *are* the asset objects (edits are in place), tracks
  dirty paths, saves, builds. `ProjectDoors` presents per-area door tables over room assets (door numbers are kept;
  changing a door's room moves it between assets).
- `build.ts`: starts from a fresh copy of the base ROM and compares each asset with the baseline (by path for leaf
  assets, by area/index for rooms, by table index for spritesets):
  - unchanged → untouched (an unedited project builds byte-identical; tested);
  - changed, exclusive and fits → written in place, tail freed with a `"mage"` tag;
  - otherwise → allocated in free space. Leaf assets and door tables also repoint *every* aligned pointer to the old
    location (code literal pools; same heuristic as MAGE), room parts/spritesets only their structural pointer. Shared
    room parts (refcount > 1) are never overwritten.
  - Tables (tilesets, sprite gfx/palette pointers, spritesets, room headers) are written in place; their size can't
    grow yet, so new rooms/tilesets/spritesets are build errors.
  - Scroll lists are rebuilt per area only if a room's scrolls changed.
- `fs.ts`: `WorkspaceFs` abstraction. Electron goes through IPC (`src/main/index.ts`), which only serves folders the
  user picked or that are in the recent list, and rejects paths escaping the root. Browsers use File System Access
  directory handles; without them the project lives in a `MemoryFs` and builds are downloaded.

Not assets yet (read from the base ROM): animated tilesets/graphics/palettes (tilesets store their numbers), tank and
mother ship graphics, OAM, clipdata collision table, area connections, sprite AI/stats, everything non-room.

## ROM map (mf-zm-info)

`scripts/generate-rom-map.mjs` turns a checkout of https://github.com/biosp4rk/mf-zm-info (generated from the mf/mzm
decompilations) into `src/core/game/map/{ZM,MF}_U.json`: master tables (vanilla address, count, and the **code literal
pools that point at them**), the per-area room entry tables (for room counts and area names), ~7-8k symbols (asset
naming), and enums (sprite, event, area names). `RomMap.tableOffset` follows the first literal pool, so base ROMs with
repointed tables work. The first pool of every table equals the `*Ptr` constants of the original MAGE (tested).

- Room counts come from the map. ZM Chozodia has **99** rooms per the decomp; MAGE's constants say 0x73 because the
  16 test-area rooms that follow its table in ROM were counted as Chozodia rooms. They're not extracted.
- mf-zm-info has **no license file**; the generated JSON is derived from it. Clarify with its author before
  redistributing.
- Only U addresses are generated (other regions are in the source data if ever needed).

## ROM format findings

General
- Only North American ROMs: game code at 0xAC — `AMTE` (Fusion), `BMXE` (Zero Mission).
- ROM is padded with 0xFF to 8/16/32 MB on load (max 32 MB). GBA pointers = offset + 0x08000000.
- Per-game constants (`MF_constants.txt`, `ZM_constants.txt`): a global section, then `[GAMECODE]` sections.
  Keys ending in `Ptr` are locations *of pointers* to tables (dereferenced at use so repointed tables work);
  keys ending in `Offset` are fixed addresses.

Compression
- LZ77: GBA BIOS type 0x10. Our compressor never emits distance 1 (VRAM-safe).
- RLE (block maps): data split into low-byte and high-byte planes, compressed separately. Each plane starts
  with a byte giving the length-field width (1 or 2, big-endian). High bit set = run of one byte, else literals;
  0 ends the plane. Min run 3 (1-byte fields) / 4 (2-byte fields). Encoder picks the smaller width per plane.

Free space (compatible with original MAGE)
- Free regions are 0xFF filled and tagged `"mage"` + u16 length at a 4-aligned start. Allocation scans from
  0xA0000 to end of data for tags, else appends at end of data (growing ROM by doubling).
- ZM has a fixed data block near `MetroidOffset` (0x7D8000); appending must not cross it.
- Data that grows is relocated. Pointers are fixed either for the known structural pointer (`Writer.place` in `build.ts`) or by
  scanning the whole ROM for aligned words equal to the old pointer (`findPointers`). The scan is heuristic and can
  hit non-pointers. The original has the same behavior.
- The builder never overwrites data the baseline says is shared (refcount > 1); it writes a copy and repoints only the
  edited structure.

Room header (0x3C bytes, `areaHeaderTable[area] + room*0x3C`)
- 00 tileset, 01-04 BG0-3 props, 08/0C/10 BG0-2 ptr, 14 clip ptr, 18 BG3 ptr, 1C BG3 scroll, 1D transparency,
  20 sprites0 ptr, 24 spriteset0, 25 set1 event, 28 sprites1 ptr, 2C spriteset1, 2D set2 event, 30 sprites2 ptr,
  34 spriteset2, 35 mapX, 36 mapY, 37 effect, 38 effectY (FF = none), 3A music (u16).
- BG prop bit 0x10 = RLE block map, 0x40 = LZ77 tilemap. BG3 is always LZ77; BG0 may be either; clip is always RLE.
- RLE layer: u8 width, u8 height, RLE data (w*h u16). Max width*height = 0x1800.
- LZ77 layer: u32 size (0 = 32×32, 1 = 64×32, 2 = 32×64 tiles), then LZ77 tilemap. Tile numbers are offset by
  0x200 in BG VRAM. Screen blocks of 32×32 are stored one after another.
- Rooms have a 2-block border. A screen is 15×10 blocks, so screen lines are drawn at 32 + n*240 / 32 + n*160 px.

Tileset entry (0x14 bytes): level gfx ptr (LZ77), palette ptr (14 rows), BG3 gfx ptr (LZ77), tile table ptr
(u8 2, u8 rows, rows*64 u16; rows==0 → look up `*_tileTables.txt`, default 0x40), u8 anim tileset, u8 anim palette.

BG VRAM as MAGE builds it (`BgVram.ts`): 0xC000 bytes. 16 animated tile slots ×0x80 at 0, generic gfx (0x1000)
at 0x800, level gfx at 0x1800, BG3 gfx ending at 0xBDE0, then 0x600..0x800 copied to 0xBDE0.
Palette: rows 0-2 generic BG palette (row0 color0 forced 0), rows 3-15 = tileset palette rows 1-13,
row 15 replaced by the animated palette if its type ≠ 0. So tileset palette row r appears in VRAM row r+2.
Generic gfx gets real tank gfx patched in (MF: 3 tanks at 0x200; ZM: 4 tanks at 0x20).
Mother ship hatches (MF): generic gfx +0x1000, generic palette +0x200.

Layer order / transparency (`blendInfo`, `layerOrder` in `RoomRenderer.ts`)
- trans <4 or ≥0x34: BG0 above BG1. Otherwise trans%4 → layer under BG0 = [1,2,2,3].
- Alpha: trans 8..0x17 → eva = 7 + ((t-8)/4)*3, evb 16; 0x18..0x33 → evb from [0,3,6,9,11,13,16], eva = 16-evb.
- Draw order is BG3 → … → sprites always after BG1.
- LZ77 BG0 with effectY ≠ FF is a liquid: drawn from effectY downward, plus an 8px surface strip stored at v=504.
- BG3 tiles vertically shifted 32px.
- Deviation: LZ77 BG0 with transparency <8 is drawn opaque. The original computes eva=0 there, which makes it
  invisible.

Sprites
- Spriteset: up to 15 × {spriteId, gfxRow}, terminated by 0. Room sprite list: up to 24 × {y, x, props}, ends FF FF FF.
  props low nibble = slot+1, high nibble = flags; MAGE only draws graphics for props ≥ 0x10. MF props ≥ 0x90 are
  drawn semi-transparent.
- OBJ VRAM: generic sprite gfx (32×14 tiles) at 0x800, generic sprite palette rows 2-7; each spriteset entry's gfx at
  0x4000 + gfxRow*0x800, palette at row 8+gfxRow. MF gfx is uncompressed with row count in `SpriteGfxRows` table
  (bytes/0x800); ZM gfx is LZ77 (size in header).
- Preview OAM = first frame of the primary-sprite OAM from `*_pSpriteOAM.txt` (plus `*_spritePositions.txt`
  adjustment). Tile index += gfxRow*64, palette += gfxRow. Origin = (x*16+8, y*16+16).
- OAM animation: entries {ptr parts, u16 duration, u16}, ends at duration 0; parts = u16 count + count×3 u16 attrs.

Doors (12 bytes per door, per-area table ends at type 0)
- type, room, xStart, xEnd, yStart, yEnd, destination door, exitX (s8), exitY (s8), 3 pad. type&0xF == 1 is an area
  connection: resolve the destination area via the area-connection table (srcArea, srcDoor, dstArea; ends FF).
- Removed doors keep their slot with room = 0xFF. New padding slots must not have type 0, or they terminate the table.
- Exit point = (xStart*16+8 + exitX, (yEnd+1)*16 + exitY). The editor snaps exit drags to 16px; Shift = per pixel.

Scrolls: per area, a pointer list to entries {room, count, count×8 bytes}, terminated by a pointer to an entry with
room 0xFF. Scroll = xStart, xEnd, yStart, yEnd, xBreak, yBreak, extend (0 L,1 R,2 T,3 B, FF none), newBound.

Clipdata: value → collision type through the `ClipdataTypePtr` table (0 air, 1 solid, 2-7 slopes, 9 Samus,
A item, B door, 8/C enemy). Breakable/item icons come from fixed cells of the generic BG gfx sheet. The tables are
in `src/core/game/clipdataVisuals.ts` and differ between MF and ZM.

## Original editor behaviors reproduced

- Brush from tileset carries no clipdata, so the *selected* clipdata value is applied. A brush copied from the room
  keeps its own clipdata unless "Always use selected clipdata" is on. With only Clip being edited and no brush, a
  1×1 stamp of the selected value is used.
- Only one BG layer is edited at a time, plus optionally clipdata.
- Right-drag in block mode copies a room region; middle click toggles block/object mode.
- Keys: G go through door, Delete remove object, [ ] change sprite slot, W/A/S/D resize door, F fill.
- Drag gestures merge into one undo step (`UndoStack.perform(..., continuous)` + `endGesture`).
- All edits change asset objects in memory and mark them dirty; Save All writes the files, Build ROM writes the ROM.

## Code map (where things live)

- `src/core/rom/Rom.ts`, `FreeSpaceAllocator.ts`: loading, free space, pointer scan.
- `src/core/game/RomMap.ts` + `map/*.json`: table locations, symbols, enums (generated).
- `src/core/model/*`: pure data structures with decode/encode helpers. `src/core/gfx/*`: VRAM + rendering to
  `PixelBuffer` (0xAABBGGRR words); renderers take a `GraphicsSource` (the project).
- `src/core/project/*`: assets, formats, extraction, `Project`, builder (see above).
- `src/core/editing/roomActions.ts`: undoable room edits on a `{ room, doors }` target.
- `src/renderer/src/services/ProjectService.ts`: new/open/save/build. `workbench/assetEditors.ts`: file → editor tab.
  `editors/assetHooks.tsx`: `useAsset`, asset pickers/links, palette contexts for graphics previews.
- `src/renderer/src/editors/room/`: `RoomEditorModel` (no DOM), `useRoomInteraction`, `RoomOverlayPainter`,
  `RoomTools` (global tool state), `RoomEditorService` (one model per open room tab).
- `src/renderer/src/workbench/commands.ts`: every command and keybinding. `src/shared/menus.ts`: menu spec used by
  both the native Electron menu and the in-window browser menu bar.
- Native menu accelerators are display-only (`registerAccelerator: false`). All shortcuts go through the renderer's
  `KeybindingService`, which ignores modifier-less keys while typing in inputs.

## Testing

- `npm test` runs codec tests. `MAGE_TEST_ROM=/path/rom.gba npm test` also runs `test/project.test.ts` (map vs MAGE
  constants, extraction, lossless serialization of every asset, rendering every room, byte-identical unchanged build,
  edits → build → re-extract equals the edited project, save/reopen) and `test/workbench.test.ts` (renderer services
  and commands headlessly with a fake platform). Never commit ROMs (`*.gba` is gitignored).
- Verified on the US Zero Mission ROM. **Fusion has not been tested against a real ROM**, and built ROMs have not been
  run in an emulator yet (only re-extracted).
- The browser build (`npm run dev:web`) exposes `window.mage` (the services container), which is handy for scripted
  testing.

## Environment gotchas

- `Error: Electron uninstall` on `npm run dev`: the Electron binary wasn't downloaded. Run
  `node node_modules/electron/install.js`.
- `does not provide an export named 'BrowserWindow'`: `ELECTRON_RUN_AS_NODE=1` is set in the shell (some
  tool/agent shells do this). Run with `env -u ELECTRON_RUN_AS_NODE npm run dev`.
- Preload is emitted as `out/preload/index.mjs` (ESM package). `src/main/index.ts` references that name.
- Context menus/menus register their window "click-outside" listeners on the next tick. Otherwise the opening
  mousedown closes them immediately.

## Known gaps / ideas

Not yet ported: text, demo, credits, physics, weapon, minimap & connection, animation, OAM editors; import of
`.mgr` rooms / `.mgt` tilesets / images; test room (IPS patches in original `Resources/Misc`); patches/tweaks;
bookmarks; clipdata rule warnings; bulk/area image export; flip room; move blocks to another layer; secondary sprite
OAM previews.

Project model next steps: grow tables so rooms/tilesets/spritesets can be added (relocate the table and repoint its
literal pools from the map); turn animated graphics/palettes, OAM and sprite stats into assets; tilemap editing;
rename/move assets with reference updates; lazy asset loading for big projects; watch the folder for external edits.

Other known issues:
- Undo doesn't clear an asset's dirty flag (compare with the saved file to fix).
- Room Properties keeps its own form state; changes made meanwhile in the room editor (effect Y) are overwritten by Apply.
- Region re-renders draw whole sprites, so translucent sprites can double-blend at region edges.
- The renderer bundle includes both ROM maps (~670 KB); they could be loaded per game on demand.
