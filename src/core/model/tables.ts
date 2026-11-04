import type { Rom } from '../rom/Rom';
import type { TableKey } from '../game/RomMap';

/**
 * Read-only lookups into game tables of the base ROM that are not (yet)
 * project assets. Locations come from the ROM map, following the code
 * pointers so repointed tables are honored.
 */
export const tableOffset = (rom: Rom, key: TableKey) => rom.map.tableOffset(rom.data, key);

export function clipdataTypeOf(rom: Rom, clip: number): number {
  return rom.data.u8(tableOffset(rom, 'clipdataCollisionTypes') + (clip & 0xff));
}
