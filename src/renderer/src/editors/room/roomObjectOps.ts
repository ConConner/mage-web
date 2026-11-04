import { DoorKind, type Door } from '@core/model/Doors';
import { newScroll } from '@core/model/Scrolls';
import {
  addScroll,
  addSprite,
  createDoor,
  editDoor,
  HeaderFieldAction,
  removeDoor,
  removeScroll,
  removeSprite,
  setSprite,
} from '@core/editing/roomActions';
import type { RoomEditorModel, SelectedObject } from './RoomEditorModel';

/**
 * Object editing operations shared by the context menu, keyboard commands
 * and the properties view. Each turns a user intent into an undoable action.
 */

export function addSpriteAt(m: RoomEditorModel, x: number, y: number): void {
  const list = m.ui.get().spriteSet;
  const sprites = m.room.spriteLists[list];
  if (!sprites || sprites.sprites.length >= 24) return;
  m.perform(addSprite(list, { x, y, properties: 0x21 }));
  m.ui.update({ selected: { kind: 'sprite', list, index: sprites.sprites.length - 1 } });
}

export function addDoorAt(m: RoomEditorModel, x: number, y: number): boolean {
  if (!m.project.doors.canAdd(m.area)) return false;
  m.perform(createDoor(m.area, m.roomId, x, y));
  const d = m.room.doors.find((d) => d.xStart === x && d.yStart === y);
  if (d) m.ui.update({ selected: { kind: 'door', area: d.area, number: d.number } });
  return true;
}

export function addScrollAt(m: RoomEditorModel, x: number, y: number): void {
  m.perform(addScroll(newScroll(x, y)));
  m.ui.update({ selected: { kind: 'scroll', index: m.room.scrolls.length - 1 } });
}

export function removeObject(m: RoomEditorModel, sel: SelectedObject | undefined): void {
  if (!sel) return;
  if (sel.kind === 'sprite') m.perform(removeSprite(sel.list, sel.index));
  else if (sel.kind === 'door' || sel.kind === 'exit') {
    const d = m.doorOf(sel);
    if (d) m.perform(removeDoor(d));
  } else if (sel.kind === 'scroll') m.perform(removeScroll(sel.index));
  else if (sel.kind === 'effect') setEffectY(m, 0xff);
  m.ui.update({ selected: undefined });
}

export function setEffectY(m: RoomEditorModel, y: number, continuous = false): void {
  m.perform(new HeaderFieldAction('Set effect position', 'effectY', y, continuous), continuous);
}

/** W/A/S/D: shrink/grow a door from its bottom-right corner. */
export function resizeDoor(m: RoomEditorModel, door: Door, dx: number, dy: number): void {
  const next = { ...door, xEnd: door.xEnd + dx, yEnd: door.yEnd + dy };
  if (next.xEnd < next.xStart || next.yEnd < next.yStart) return;
  if (next.xEnd >= m.room.width || next.yEnd >= m.room.height) return;
  m.perform(editDoor(next));
}

/** [ / ]: cycle the spriteset slot (low nibble of the properties). */
export function cycleSpriteSlot(m: RoomEditorModel, list: number, index: number, delta: 1 | -1): void {
  const s = m.room.spriteLists[list]?.sprites[index];
  if (!s) return;
  const slot = s.properties & 0xf;
  const next = slot + delta;
  if (next < 1 || next > 0xf) return;
  m.perform(setSprite(list, index, { ...s, properties: (s.properties & 0xf0) | next }));
}

/** Returns the area and room a door leads to, if resolvable. */
export function doorDestination(m: RoomEditorModel, door: Door): { area: number; room: number; door: Door } | undefined {
  const dst = m.project.doors.destinationOf(door);
  if (!dst || !m.project.room(dst.area, dst.room)) return undefined;
  return { area: dst.area, room: dst.room, door: dst };
}

export const isAreaConnection = (d: Door) => (d.type & 0xf) === DoorKind.AreaConnection;
