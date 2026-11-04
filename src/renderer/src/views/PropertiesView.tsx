import { DoorKind, toSigned8, type Door } from '@core/model/Doors';
import { NONE, type Scroll } from '@core/model/Scrolls';
import { spriteSlot, type RoomSprite } from '@core/model/Sprites';
import { editDoor, setScroll, setSprite } from '@core/editing/roomActions';
import { LAYER_NAMES } from '@core/model/Background';
import { useServices } from '../services/Services';
import { useEvent, useStore } from '../services/store';
import { Button, Field, HexInput, NumberInput, Section, Select, hex } from '../components/controls';
import type { RoomEditorModel } from '../editors/room/RoomEditorModel';
import { doorDestination } from '../editors/room/roomObjectOps';

/** Inspector for the selected room object, or room info when nothing is selected. */
export function PropertiesView() {
  const { rooms } = useServices();
  const model = useStore(rooms.last);
  if (!model) return <div className="view-empty">Open a room to see its properties.</div>;
  return <RoomProperties model={model} />;
}

function RoomProperties({ model }: { model: RoomEditorModel }) {
  const ui = useStore(model.ui);
  useEvent(model.onDidChangeObjects);
  useEvent(model.onDidReload);
  const sel = ui.selected;
  return (
    <div className="properties">
      {sel?.kind === 'sprite' && <SpriteProps model={model} list={sel.list} index={sel.index} />}
      {(sel?.kind === 'door' || sel?.kind === 'exit') && <DoorProps model={model} door={model.doorOf(sel)} />}
      {sel?.kind === 'scroll' && <ScrollProps model={model} index={sel.index} />}
      <RoomInfo model={model} />
    </div>
  );
}

function SpriteProps({ model, list, index }: { model: RoomEditorModel; list: number; index: number }) {
  const s = model.room.spriteLists[list]?.sprites[index];
  const set = model.room.spritesets[list];
  if (!s || !set) return null;
  const update = (p: Partial<RoomSprite>) => model.perform(setSprite(list, index, { ...s, ...p }));
  const slotOptions = Array.from({ length: 15 }, (_, i) => {
    const e = set.entries[i];
    return { value: i + 1, label: `${hex(i + 1, 1)} — ${e ? `Sprite ${hex(e.spriteId)} (row ${e.gfxRow})` : 'empty'}` };
  });
  const entry = set.spriteInSlot(spriteSlot(s));
  return (
    <Section title={`Sprite ${index}`}>
      <div className="form">
        <Field label="X">
          <HexInput value={s.x} onChange={(x) => update({ x })} max={model.room.width - 1} />
        </Field>
        <Field label="Y">
          <HexInput value={s.y} onChange={(y) => update({ y })} max={model.room.height - 1} />
        </Field>
        <Field label="Slot" hint="Spriteset slot (low nibble of the properties). [ and ] cycle it.">
          <Select value={s.properties & 0xf} options={slotOptions} onChange={(v) => update({ properties: (s.properties & 0xf0) | v })} />
        </Field>
        <Field label="Flags" hint="High nibble of the properties (sprite-specific; ≥ 1 makes the sprite visible in the editor).">
          <HexInput value={s.properties >> 4} digits={1} max={0xf} onChange={(v) => update({ properties: (v << 4) | (s.properties & 0xf) })} />
        </Field>
        <Field label="Raw">
          <HexInput value={s.properties} onChange={(v) => update({ properties: v })} />
        </Field>
        <div className="form-note">{entry ? `Sprite ID ${hex(entry.spriteId)}, graphics row ${entry.gfxRow}` : 'Slot is empty in this spriteset.'}</div>
      </div>
    </Section>
  );
}

const DOOR_KINDS = [
  { value: DoorKind.AreaConnection, label: '1 — Area connection' },
  { value: DoorKind.NoHatch, label: '2 — No hatch' },
  { value: DoorKind.OpenHatch, label: '3 — Open hatch' },
  { value: DoorKind.ClosedHatch, label: '4 — Closed hatch' },
  { value: DoorKind.RemoveMotherShip, label: '5 — Remove mother ship' },
  { value: DoorKind.SetMotherShip, label: '6 — Set mother ship' },
];

function DoorProps({ model, door }: { model: RoomEditorModel; door: Door | undefined }) {
  const { commands } = useServices();
  if (!door) return null;
  const update = (p: Partial<Door>) => model.perform(editDoor({ ...door, ...p }));
  const dst = doorDestination(model, door);
  const areaName = (a: number) => model.rom.game.areaNames[a] ?? `Area ${a}`;
  return (
    <Section title={`Door ${hex(door.number)}`}>
      <div className="form">
        <Field label="Kind">
          <Select value={door.type & 0xf} options={DOOR_KINDS} onChange={(v) => update({ type: (door.type & 0xf0) | v })} />
        </Field>
        <Field label="Flags" hint="High nibble of the type byte (0x10 = show location name, 0x20 = ...)">
          <HexInput value={door.type >> 4} digits={1} max={0xf} onChange={(v) => update({ type: (v << 4) | (door.type & 0xf) })} />
        </Field>
        <Field label="X start / end">
          <HexInput value={door.xStart} onChange={(v) => update({ xStart: v, xEnd: Math.max(v, door.xEnd) })} max={model.room.width - 1} />
          <HexInput value={door.xEnd} onChange={(v) => update({ xEnd: Math.max(v, door.xStart) })} max={model.room.width - 1} />
        </Field>
        <Field label="Y start / end">
          <HexInput value={door.yStart} onChange={(v) => update({ yStart: v, yEnd: Math.max(v, door.yEnd) })} max={model.room.height - 1} />
          <HexInput value={door.yEnd} onChange={(v) => update({ yEnd: Math.max(v, door.yStart) })} max={model.room.height - 1} />
        </Field>
        <Field label="Destination">
          <HexInput value={door.destination} onChange={(v) => update({ destination: v })} />
        </Field>
        <Field label="Exit X / Y" hint="Pixel offset of Samus' spawn point. Drag the red × in object mode; hold Shift for single pixels.">
          <NumberInput value={toSigned8(door.exitX)} min={-128} max={127} onChange={(v) => update({ exitX: (v + 256) & 0xff })} />
          <NumberInput value={toSigned8(door.exitY)} min={-128} max={127} onChange={(v) => update({ exitY: (v + 256) & 0xff })} />
        </Field>
        <div className="form-note">{dst ? `Leads to ${areaName(dst.area)} room ${hex(dst.room)} (door ${hex(dst.door.number)})` : 'Destination door does not exist.'}</div>
        <div className="form-actions">
          <Button disabled={!dst} onClick={() => commands.execute('room.goThroughDoor', { kind: 'door', area: door.area, number: door.number })}>
            Go Through Door
          </Button>
        </div>
      </div>
    </Section>
  );
}

const EXTEND = [
  { value: NONE, label: 'None' },
  { value: 0, label: 'Left' },
  { value: 1, label: 'Right' },
  { value: 2, label: 'Top' },
  { value: 3, label: 'Bottom' },
];

function ScrollProps({ model, index }: { model: RoomEditorModel; index: number }) {
  const s = model.room.scrolls[index];
  if (!s) return null;
  const update = (p: Partial<Scroll>) => model.perform(setScroll(index, { ...s, ...p }));
  return (
    <Section title={`Scroll ${index}`}>
      <div className="form">
        <Field label="X start / end">
          <HexInput value={s.xStart} onChange={(v) => update({ xStart: v })} />
          <HexInput value={s.xEnd} onChange={(v) => update({ xEnd: v })} />
        </Field>
        <Field label="Y start / end">
          <HexInput value={s.yStart} onChange={(v) => update({ yStart: v })} />
          <HexInput value={s.yEnd} onChange={(v) => update({ yEnd: v })} />
        </Field>
        <Field label="Extends" hint="Side moved when the breakable block is destroyed">
          <Select
            value={s.extend}
            options={EXTEND}
            onChange={(v) => {
              if (v === NONE) update({ extend: NONE, newBound: NONE, xBreak: NONE, yBreak: NONE });
              else {
                const nb = [s.xStart - 2, s.xEnd + 2, s.yStart - 2, s.yEnd + 2][v];
                update({ extend: v, newBound: Math.max(0, nb), xBreak: s.xBreak === NONE ? s.xStart : s.xBreak, yBreak: s.yBreak === NONE ? s.yStart : s.yBreak });
              }
            }}
          />
        </Field>
        {s.extend !== NONE && (
          <>
            <Field label="New bound">
              <HexInput value={s.newBound} onChange={(v) => update({ newBound: v })} />
            </Field>
            <Field label="Break block X / Y">
              <HexInput value={s.xBreak} onChange={(v) => update({ xBreak: v })} />
              <HexInput value={s.yBreak} onChange={(v) => update({ yBreak: v })} />
            </Field>
          </>
        )}
      </div>
    </Section>
  );
}

function RoomInfo({ model }: { model: RoomEditorModel }) {
  const ui = useStore(model.ui);
  const r = model.room;
  const h = r.header;
  return (
    <Section title={`Room ${model.rom.game.areaNames[r.area]} ${hex(r.id)}`}>
      <dl className="info-list">
        <dt>Size</dt>
        <dd>
          {hex(r.width)} × {hex(r.height)} blocks ({r.widthInScreens} × {r.heightInScreens} screens)
        </dd>
        <dt>Tileset</dt>
        <dd>{hex(h.tileset)}</dd>
        <dt>Layers</dt>
        <dd>{r.layers.map((l, i) => `${LAYER_NAMES[i]}: ${l.format === 'none' ? '—' : l.format.toUpperCase()}`).join(', ')}</dd>
        <dt>Spritesets</dt>
        <dd>
          {hex(h.spriteset0)}
          {h.spriteset1Event ? `, ${hex(h.spriteset1)} (event ${hex(h.spriteset1Event)})` : ''}
          {h.spriteset2Event ? `, ${hex(h.spriteset2)} (event ${hex(h.spriteset2Event)})` : ''}
        </dd>
        <dt>Doors / Scrolls</dt>
        <dd>
          {r.doors.length} / {r.scrolls.length}
        </dd>
        <dt>Map</dt>
        <dd>
          ({hex(h.mapX)}, {hex(h.mapY)}), music {hex(h.music, 4)}
        </dd>
        {ui.cursor && (
          <>
            <dt>Cursor</dt>
            <dd>
              ({hex(ui.cursor.x)}, {hex(ui.cursor.y)}) — {model.describeBlock(ui.cursor.x, ui.cursor.y)}
            </dd>
          </>
        )}
      </dl>
    </Section>
  );
}
