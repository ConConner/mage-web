import { MAX_DOORS_PER_AREA, NO_ROOM, decodeAreaConnections, DoorKind, type AreaConnection, type Door, type DoorStore } from '../model/Doors';
import type { Project } from './Project';

/**
 * The game's per-area door tables, as a view over room assets: each door is
 * stored in the room it's placed in, unassigned slots in the area asset.
 * Door numbers (the index in the area table) are kept, since destinations
 * refer to them.
 */
export class ProjectDoors implements DoorStore {
  private connections?: AreaConnection[];

  constructor(private readonly project: Project) {}

  private owners(area: number): { list: Door[]; path: string }[] {
    const p = this.project;
    const out = p.rooms(area).map((r) => ({ list: r.doors, path: r.path }));
    const a = p.area(area);
    if (a) out.push({ list: a.unassignedDoors, path: a.path });
    return out;
  }

  areaDoors(area: number): Door[] {
    return this.owners(area)
      .flatMap((o) => o.list)
      .sort((a, b) => a.number - b.number);
  }

  find(area: number, number: number): Door | undefined {
    for (const o of this.owners(area)) {
      const d = o.list.find((x) => x.number === number);
      if (d) return d;
    }
    return undefined;
  }

  get(area: number, number: number): Door | undefined {
    const d = this.find(area, number);
    return d && d.room !== NO_ROOM ? d : undefined;
  }

  roomDoors(area: number, room: number): Door[] {
    return this.project.room(area, room)?.doors ?? [];
  }

  /** The list a door with this room value belongs in. */
  private ownerFor(area: number, room: number): { list: Door[]; path: string } | undefined {
    const r = room === NO_ROOM ? undefined : this.project.room(area, room);
    if (r) return { list: r.doors, path: r.path };
    const a = this.project.area(area);
    return a ? { list: a.unassignedDoors, path: a.path } : undefined;
  }

  private detach(area: number, number: number): void {
    for (const o of this.owners(area)) {
      const i = o.list.findIndex((x) => x.number === number);
      if (i >= 0) {
        o.list.splice(i, 1);
        this.project.markDirty(o.path);
      }
    }
  }

  /** Replaces the door with the same area and number, moving it if its room changed. */
  update(door: Door): void {
    const owner = this.ownerFor(door.area, door.room);
    if (!owner) throw new Error(`Area ${door.area} has no area asset to hold door ${door.number}.`);
    const i = owner.list.findIndex((x) => x.number === door.number);
    if (i >= 0) owner.list[i] = { ...door };
    else {
      this.detach(door.area, door.number);
      owner.list.push({ ...door });
      owner.list.sort((a, b) => a.number - b.number);
    }
    this.project.markDirty(owner.path);
  }

  private freeNumber(area: number): number {
    const used = new Set(this.areaDoors(area).filter((d) => d.room !== NO_ROOM).map((d) => d.number));
    for (let n = 0; n < MAX_DOORS_PER_AREA; n++) if (!used.has(n)) return n;
    return -1;
  }

  canAdd(area: number): boolean {
    return this.freeNumber(area) >= 0;
  }

  add(area: number, room: number, x: number, y: number): Door {
    const number = this.freeNumber(area);
    if (number < 0) throw new Error('No more doors can be added to this area.');
    const door: Door = { area, number, type: 0x14, room, xStart: x, xEnd: x, yStart: y, yEnd: y + 3, destination: 0, exitX: 0, exitY: 0 };
    this.detach(area, number);
    this.update(door);
    return door;
  }

  remove(area: number, number: number): void {
    this.detach(area, number);
  }

  connectionArea(door: Door): number | undefined {
    const rom = this.project.rom;
    this.connections ??= decodeAreaConnections(rom.data, rom.map.tableOffset(rom.data, 'areaConnections'));
    return this.connections.find((c) => c.area === door.area && c.door === door.number)?.destinationArea;
  }

  destinationOf(door: Door): Door | undefined {
    let area = door.area;
    if ((door.type & 0xf) === DoorKind.AreaConnection) area = this.connectionArea(door) ?? door.area;
    return this.get(area, door.destination);
  }
}
