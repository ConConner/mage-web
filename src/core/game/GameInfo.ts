/**
 * Static, per-game knowledge: table locations, counts, names and lookup
 * lists. Values come from the text resources shipped with the original
 * MAGE (see ./data), parsed at runtime.
 */
import mfConstants from './data/MF/MF_constants.txt?raw';
import zmConstants from './data/ZM/ZM_constants.txt?raw';
import mfClipdata from './data/MF/MF_clipdata.txt?raw';
import zmClipdata from './data/ZM/ZM_clipdata.txt?raw';
import mfTileTables from './data/MF/MF_U_tileTables.txt?raw';
import zmTileTables from './data/ZM/ZM_U_tileTables.txt?raw';
import mfPSpriteOam from './data/MF/MF_U_pSpriteOAM.txt?raw';
import zmPSpriteOam from './data/ZM/ZM_U_pSpriteOAM.txt?raw';
import mfSSpriteOam from './data/MF/MF_U_sSpriteOAM.txt?raw';
import zmSSpriteOam from './data/ZM/ZM_U_sSpriteOAM.txt?raw';
import mfSpritePositions from './data/MF/MF_spritePositions.txt?raw';
import zmSpritePositions from './data/ZM/ZM_spritePositions.txt?raw';
import { MF_GENERIC_TILE_TABLE, ZM_GENERIC_TILE_TABLE } from './genericTileTables';

export type GameKind = 'MF' | 'ZM';

export const SUPPORTED_GAME_CODES: Record<string, GameKind> = {
  AMTE: 'MF',
  BMXE: 'ZM',
};

export function detectGame(gameCode: string): GameKind | undefined {
  return SUPPORTED_GAME_CODES[gameCode];
}

/** Locations that are themselves pointers in the game code (dereferenced at use). */
export interface PointerTable {
  areaHeader: number;
  tileset: number;
  animTileset: number;
  animGfx: number;
  animPalette: number;
  spriteGfxRows: number;
  spriteGfx: number;
  spritePalette: number;
  spriteStats1: number;
  spriteStats2: number;
  spriteset: number;
  doors: number;
  areaConnections: number;
  doorEvents: number;
  locationNames: number;
  hatchLockEvents: number;
  scrolls: number;
  clipdataType: number;
  minimapGfx: number;
  minimapData: number;
  textGfx: number;
  characterWidths: number;
  demoInput: number;
  demoRam: number;
  credits: number;
}

/** Fixed data offsets. */
export interface OffsetTable {
  tankGfx: number;
  genericBgGfx: number;
  genericBgPalette: number;
  genericSpriteGfx: number;
  genericSpritePalette: number;
  minimapPalette: number;
  textPalette: number;
  numOfDoorEvents: number;
  numOfHatchLockEvents: number;
}

export interface ClipdataInfo {
  value: number;
  /** Single character hint from the original list (`@` solid, `/` slope, ...). */
  symbol: string;
  name: string;
  label: string;
}

export interface GameInfo {
  kind: GameKind;
  isMF: boolean;
  gameCode: string;
  gameName: string;
  areaNames: string[];
  roomsPerArea: number[];
  numOfTilesets: number;
  numOfAnimTilesets: number;
  numOfAnimGfx: number;
  numOfAnimPalettes: number;
  numOfSprites1: number;
  numOfSprites2: number;
  numOfSpritesets: number;
  numOfMinimaps: number;
  numOfDemos: number;
  metroidOffset?: number;
  languages: string[];
  pointers: PointerTable;
  offsets: OffsetTable;
  clipdata: ClipdataInfo[];
  /** Tile table offset → row count, for tilesets that don't store it. */
  tileTableRows: Map<number, number>;
  primarySpriteOam: Map<number, number>;
  secondarySpriteOam: Map<number, { owner: number; oam: number }>;
  spritePositions: Map<number, { x: number; y: number }>;
  genericTileTable: Uint16Array;
}

type Section = Map<string, string>;

/** Parses the INI-like constants file into a global section and per-region sections. */
function parseConstants(text: string): { global: Section; regions: Map<string, Section> } {
  const global: Section = new Map();
  const regions = new Map<string, Section>();
  let current = global;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const header = /^\[(\w+)\]$/.exec(line);
    if (header) {
      current = new Map();
      regions.set(header[1], current);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq > 0) current.set(line.slice(0, eq), line.slice(eq + 1));
  }
  return { global, regions };
}

const hex = (s: string | undefined, fallback = 0) => (s === undefined || s === '' ? fallback : parseInt(s, 16));

function parseKeyValueHex(text: string): Map<number, number> {
  const map = new Map<number, number>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([0-9A-Fa-f]+)\s*=\s*([0-9A-Fa-f]+)/.exec(line);
    if (m) map.set(parseInt(m[1], 16), parseInt(m[2], 16));
  }
  return map;
}

function parseSecondary(text: string): Map<number, { owner: number; oam: number }> {
  const map = new Map<number, { owner: number; oam: number }>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([0-9A-Fa-f]+)\s*=\s*([0-9A-Fa-f]+)\s*,\s*([0-9A-Fa-f]+)/.exec(line);
    if (m) map.set(parseInt(m[1], 16), { owner: parseInt(m[2], 16), oam: parseInt(m[3], 16) });
  }
  return map;
}

function parsePositions(text: string): Map<number, { x: number; y: number }> {
  const map = new Map<number, { x: number; y: number }>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([0-9A-Fa-f]+)\s*=\s*(-?\d+)\s*,\s*(-?\d+)/.exec(line);
    if (m) map.set(parseInt(m[1], 16), { x: parseInt(m[2], 10), y: parseInt(m[3], 10) });
  }
  return map;
}

function parseClipdata(text: string): ClipdataInfo[] {
  const list: ClipdataInfo[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9A-Fa-f]{2})(?:\s+(\S)?\s*(.*))?$/.exec(line.trimEnd());
    if (!m) continue;
    const value = parseInt(m[1], 16);
    let symbol = m[2] ?? '';
    let name = (m[3] ?? '').trim();
    // Lines like "00    Air" have no symbol; the regex then captures the first letter.
    if (symbol && /[A-Za-z0-9(]/.test(symbol)) {
      name = (symbol + name).trim();
      symbol = '';
    }
    list[value] = { value, symbol, name, label: `${m[1].toUpperCase()} ${name}`.trim() };
  }
  for (let i = 0; i < 256; i++) {
    if (!list[i]) {
      const h = i.toString(16).toUpperCase().padStart(2, '0');
      list[i] = { value: i, symbol: '', name: '', label: h };
    }
  }
  return list;
}

export function loadGameInfo(gameCode: string): GameInfo {
  const kind = detectGame(gameCode);
  if (!kind) throw new Error(`Unsupported game code ${gameCode}`);
  const isMF = kind === 'MF';
  const { global, regions } = parseConstants(isMF ? mfConstants : zmConstants);
  const region = regions.get(gameCode);
  if (!region) throw new Error(`No constants for ${gameCode}`);
  const g = (k: string) => region.get(k) ?? global.get(k);

  const pointers: PointerTable = {
    areaHeader: hex(g('AreaHeaderPtr')),
    tileset: hex(g('TilesetPtr')),
    animTileset: hex(g('AnimTilesetPtr')),
    animGfx: hex(g('AnimGfxPtr')),
    animPalette: hex(g('AnimPalettePtr')),
    spriteGfxRows: hex(g('SpriteGfxRowsPtr')),
    spriteGfx: hex(g('SpriteGfxPtr')),
    spritePalette: hex(g('SpritePalettePtr')),
    spriteStats1: hex(g('SpriteStats1Ptr')),
    spriteStats2: hex(g('SpriteStats2Ptr')),
    spriteset: hex(g('SpritesetPtr')),
    doors: hex(g('DoorsPtr')),
    areaConnections: hex(g('AreaConnectionsPtr')),
    doorEvents: hex(g('DoorEventsPtr')),
    locationNames: hex(g('LocationNamesPtr')),
    hatchLockEvents: hex(g('HatchLockEventsPtr')),
    scrolls: hex(g('ScrollsPtr')),
    clipdataType: hex(g('ClipdataTypePtr')),
    minimapGfx: hex(g('MinimapGfxPtr')),
    minimapData: hex(g('MinimapDataPtr')),
    textGfx: hex(g('TextGfxPtr')),
    characterWidths: hex(g('CharacterWidthsPtr')),
    demoInput: hex(g('DemoInputPtr')),
    demoRam: hex(g('DemoRamPtr')),
    credits: hex(g('CreditsPtr')),
  };
  const offsets: OffsetTable = {
    tankGfx: hex(g('TankGfxOffset')),
    genericBgGfx: hex(g('GenericBgGfxOffset')),
    genericBgPalette: hex(g('GenericBgPaletteOffset')),
    genericSpriteGfx: hex(g('GenericSpriteGfxOffset')),
    genericSpritePalette: hex(g('GenericSpritePaletteOffset')),
    minimapPalette: hex(g('MinimapPaletteOffset')),
    textPalette: hex(g('TextPaletteOffset')),
    numOfDoorEvents: hex(g('NumOfDoorEventsOffset')),
    numOfHatchLockEvents: hex(g('NumOfHatchLockEventsOffset')),
  };

  const metroid = g('MetroidOffset');
  return {
    kind,
    isMF,
    gameCode,
    gameName: isMF ? 'Metroid Fusion' : 'Metroid Zero Mission',
    areaNames: (g('AreaNames') ?? '').split(','),
    roomsPerArea: (g('RoomsPerArea') ?? '').split(',').map((s) => hex(s)),
    numOfTilesets: hex(g('NumOfTilesets')),
    numOfAnimTilesets: hex(g('NumOfAnimTilesets')),
    numOfAnimGfx: hex(g('NumOfAnimGfx')),
    numOfAnimPalettes: hex(g('NumOfAnimPalettes')),
    numOfSprites1: hex(g('NumOfSprites1')),
    numOfSprites2: hex(g('NumOfSprites2')),
    numOfSpritesets: hex(g('NumOfSpritesets')),
    numOfMinimaps: hex(g('NumOfMinimaps')),
    numOfDemos: hex(g('NumOfDemos')),
    metroidOffset: metroid ? hex(metroid) : undefined,
    languages: (g('Languages') ?? '').split(','),
    pointers,
    offsets,
    clipdata: parseClipdata(isMF ? mfClipdata : zmClipdata),
    tileTableRows: parseKeyValueHex(isMF ? mfTileTables : zmTileTables),
    primarySpriteOam: parseKeyValueHex(isMF ? mfPSpriteOam : zmPSpriteOam),
    secondarySpriteOam: parseSecondary(isMF ? mfSSpriteOam : zmSSpriteOam),
    spritePositions: parsePositions(isMF ? mfSpritePositions : zmSpritePositions),
    genericTileTable: isMF ? MF_GENERIC_TILE_TABLE : ZM_GENERIC_TILE_TABLE,
  };
}
