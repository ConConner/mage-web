import { useCallback, useRef, type MouseEvent, type RefObject } from 'react';
import { moveScrollHandle } from '@core/model/Scrolls';
import { doorAnchor } from '@core/model/Doors';
import { editDoor, setScroll, setSprite } from '@core/editing/roomActions';
import { useServices } from '../../services/Services';
import type { RoomEditorModel, SelectedObject } from './RoomEditorModel';
import { addDoorAt, addScrollAt, addSpriteAt, doorDestination, removeObject, setEffectY } from './roomObjectOps';

interface Drag {
  button: number;
  startCell: { x: number; y: number };
  lastCell: { x: number; y: number };
  target?: SelectedObject;
}

const toSigned = (v: number) => (v + 0x100) & 0xff;

/**
 * Translates pointer input on the room stage into model operations.
 * Left paints (block mode) or drags objects; right copies a block
 * selection (block mode) or opens the context menu; middle toggles mode.
 */
export function useRoomInteraction(model: RoomEditorModel, scroller: RefObject<HTMLDivElement | null>) {
  const services = useServices();
  const drag = useRef<Drag | undefined>(undefined);
  const tools = services.roomTools;

  const locate = useCallback(
    (e: MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const z = model.ui.get().zoom;
      const px = Math.floor((e.clientX - rect.left) / z);
      const py = Math.floor((e.clientY - rect.top) / z);
      return { px, py, x: Math.floor(px / 16), y: Math.floor(py / 16) };
    },
    [model],
  );

  const openContextMenu = (e: MouseEvent, x: number, y: number, hit: SelectedObject | undefined) => {
    const run = (fn: () => void) => () => fn();
    const items = [] as Parameters<typeof services.dialogs.showContextMenu>[2];
    const set = model.room.spriteLists[model.ui.get().spriteSet];
    if (hit?.kind === 'sprite') {
      items.push({ label: 'Edit Sprite…', run: run(() => services.commands.execute('workbench.showProperties')) });
      items.push({ label: 'Remove Sprite', hint: 'Del', run: run(() => removeObject(model, hit)) });
    } else items.push({ label: 'Add Sprite', disabled: !set || set.sprites.length >= 24, run: run(() => addSpriteAt(model, x, y)) });
    items.push({ separator: true });
    if (hit?.kind === 'door' || hit?.kind === 'exit') {
      const door = model.doorOf(hit);
      items.push({ label: 'Edit Door…', run: run(() => services.commands.execute('workbench.showProperties')) });
      items.push({ label: 'Remove Door', run: run(() => removeObject(model, hit)) });
      items.push({ label: 'Go Through Door', hint: 'G', disabled: !door || !doorDestination(model, door), run: run(() => services.commands.execute('room.goThroughDoor', hit)) });
    } else {
      items.push({
        label: 'Add Door',
        run: run(() => {
          if (!addDoorAt(model, x, y)) services.notifications.warn('No more doors can be added to this area.');
        }),
      });
    }
    items.push({ separator: true });
    if (hit?.kind === 'scroll') {
      items.push({ label: 'Edit Scroll…', run: run(() => services.commands.execute('workbench.showProperties')) });
      items.push({ label: 'Remove Scroll', run: run(() => removeObject(model, hit)) });
    } else items.push({ label: 'Add Scroll', run: run(() => addScrollAt(model, x, y)) });
    items.push({ separator: true });
    items.push({ label: 'Set Effect Position Here', run: run(() => setEffectY(model, y)) });
    items.push({ label: 'Remove Effect Position', disabled: model.room.header.effectY === 0xff, run: run(() => setEffectY(model, 0xff)) });
    services.dialogs.showContextMenu(e.clientX, e.clientY, items);
  };

  const onMouseDown = (e: MouseEvent) => {
    scroller.current?.focus({ preventScroll: true });
    const { px, py, x, y } = locate(e);
    if (!model.room.inBounds(x, y)) return;
    const t = tools.get();
    if (e.button === 1) {
      e.preventDefault();
      tools.toggleMode();
      return;
    }
    drag.current = { button: e.button, startCell: { x, y }, lastCell: { x, y } };

    if (t.mode === 'blocks') {
      if (e.button === 0) {
        if (t.fill) model.fill(x, y);
        else model.paint(x, y, true);
      } else if (e.button === 2) {
        model.ui.update({ selection: { x, y, w: 1, h: 1 } });
      }
      return;
    }

    const hit = model.hitTest(px, py);
    model.ui.update({ selected: hit });
    drag.current.target = hit;
    if (e.button === 2) {
      drag.current = undefined;
      openContextMenu(e, x, y, hit);
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    const { px, py, x, y } = locate(e);
    const inside = model.room.inBounds(x, y);
    const cur = model.ui.get().cursor;
    if (!inside) {
      if (cur) model.ui.update({ cursor: undefined });
      return;
    }
    const d = drag.current;

    // Exit points move per pixel, everything else per block.
    if (d?.target?.kind === 'exit' && e.buttons & 1) {
      const door = model.doorOf(d.target);
      if (door) {
        const a = doorAnchor(door);
        let dx = px - a.x, dy = py - a.y;
        if (!e.shiftKey) {
          dx = Math.round(dx / 16) * 16;
          dy = Math.round(dy / 16) * 16;
        }
        dx = Math.max(-128, Math.min(127, dx));
        dy = Math.max(-128, Math.min(127, dy));
        if (toSigned(dx) !== door.exitX || toSigned(dy) !== door.exitY) model.perform(editDoor({ ...door, exitX: toSigned(dx), exitY: toSigned(dy) }, true), true);
      }
    }

    if (cur && cur.x === x && cur.y === y) return;
    model.ui.update({ cursor: { x, y } });
    if (!d) return;
    const t = tools.get();

    if (t.mode === 'blocks') {
      if (d.button === 0 && e.buttons & 1 && !t.fill) model.paint(x, y, true);
      if (d.button === 2 && e.buttons & 2) {
        const s = d.startCell;
        model.ui.update({ selection: { x: Math.min(s.x, x), y: Math.min(s.y, y), w: Math.abs(x - s.x) + 1, h: Math.abs(y - s.y) + 1 } });
      }
      return;
    }

    if (d.button !== 0 || !(e.buttons & 1) || !d.target) return;
    const dx = x - d.lastCell.x, dy = y - d.lastCell.y;
    d.lastCell = { x, y };
    const target = d.target;
    if (target.kind === 'sprite') {
      const s = model.room.spriteLists[target.list]?.sprites[target.index];
      if (s) model.perform(setSprite(target.list, target.index, { ...s, x: s.x + dx, y: s.y + dy }, true), true);
    } else if (target.kind === 'door') {
      const door = model.doorOf(target);
      if (door && door.xStart + dx >= 0 && door.yStart + dy >= 0 && door.xEnd + dx < model.room.width && door.yEnd + dy < model.room.height) {
        model.perform(editDoor({ ...door, xStart: door.xStart + dx, xEnd: door.xEnd + dx, yStart: door.yStart + dy, yEnd: door.yEnd + dy }, true), true);
      }
    } else if (target.kind === 'scroll' && target.handle) {
      const s = model.room.scrolls[target.index];
      if (s) {
        const next = moveScrollHandle(s, target.handle, x, y);
        if (next !== s) model.perform(setScroll(target.index, next, true), true);
      }
    } else if (target.kind === 'effect') {
      setEffectY(model, y, true);
    }
  };

  const onMouseUp = (e: MouseEvent) => {
    const d = drag.current;
    drag.current = undefined;
    model.endGesture();
    if (!d) return;
    if (tools.get().mode === 'blocks' && d.button === 2 && e.button === 2) {
      const sel = model.ui.get().selection;
      if (sel) model.copySelection(sel);
    }
  };

  const onMouseLeave = () => {
    model.ui.update({ cursor: undefined });
  };

  const onDoubleClick = (e: MouseEvent) => {
    if (tools.get().mode !== 'objects') return;
    const { px, py } = locate(e);
    const hit = model.hitTest(px, py);
    if (hit) {
      model.ui.update({ selected: hit });
      void services.commands.execute('workbench.showProperties');
    }
  };

  return { onMouseDown, onMouseMove, onMouseUp, onMouseLeave, onDoubleClick };
}
