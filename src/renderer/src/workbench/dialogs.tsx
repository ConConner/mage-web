import { useState } from 'react';
import type { Services } from '../services/Services';
import { Button, Field, HexInput, hex } from '../components/controls';
import { MAX_ROOM_AREA } from '@core/model/Background';

/** Yes/No/Cancel style confirmation. Resolves to the chosen button value. */
export function confirmDialog<T extends string>(s: Services, title: string, message: string, buttons: { label: string; value: T; primary?: boolean }[]): Promise<T | undefined> {
  return s.dialogs.show<T>(title, (close) => (
    <div className="confirm">
      <p>{message}</p>
      <div className="form-actions">
        {buttons.map((b) => (
          <Button key={b.value} primary={b.primary} onClick={() => close(b.value)}>
            {b.label}
          </Button>
        ))}
      </div>
    </div>
  ));
}

/** Single text field. Resolves to the entered text, or undefined if cancelled. */
export function inputDialog(s: Services, title: string, label: string, value: string): Promise<string | undefined> {
  return s.dialogs.show<string>(title, (close) => <InputForm label={label} value={value} close={close} />, 380);
}

function InputForm({ label, value, close }: { label: string; value: string; close: (v: string | undefined) => void }) {
  const [text, setText] = useState(value);
  const ok = text.trim().length > 0;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) close(text.trim());
      }}
    >
      <Field label={label}>
        <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} style={{ width: 220 }} />
      </Field>
      <div className="form-actions">
        <Button onClick={() => close(undefined)}>Cancel</Button>
        <Button primary disabled={!ok} onClick={() => ok && close(text.trim())}>
          OK
        </Button>
      </div>
    </form>
  );
}

export function resizeDialog(s: Services, width: number, height: number): Promise<{ width: number; height: number } | undefined> {
  return s.dialogs.show('Room Options', (close) => <ResizeForm width={width} height={height} close={close} />, 360);
}

function ResizeForm({ width, height, close }: { width: number; height: number; close: (v: { width: number; height: number } | undefined) => void }) {
  const [w, setW] = useState(width);
  const [h, setH] = useState(height);
  const screensW = Math.floor((w - 4) / 15), screensH = Math.floor((h - 4) / 10);
  const valid = w > 0 && h > 0 && w * h <= MAX_ROOM_AREA;
  return (
    <div className="form">
      <Field label="Width (blocks)">
        <HexInput value={w} min={1} onChange={setW} />
        <span className="muted">{screensW} screens</span>
      </Field>
      <Field label="Height (blocks)">
        <HexInput value={h} min={1} onChange={setH} />
        <span className="muted">{screensH} screens</span>
      </Field>
      <Field label="Screens (W × H)">
        <HexInput value={Math.max(1, screensW)} max={0x10} min={1} onChange={(v) => setW(v * 15 + 4)} />
        <HexInput value={Math.max(1, screensH)} max={0x18} min={1} onChange={(v) => setH(v * 10 + 4)} />
      </Field>
      {!valid && <p className="form-error">Width × height must be at most {hex(MAX_ROOM_AREA, 4)}.</p>}
      <div className="form-actions">
        <Button onClick={() => close(undefined)}>Cancel</Button>
        <Button primary disabled={!valid} onClick={() => close({ width: w, height: h })}>
          Resize
        </Button>
      </div>
    </div>
  );
}

export function aboutDialog(s: Services): void {
  void s.dialogs.show('About MAGE Web', () => (
    <div className="about">
      <h2>MAGE Web 0.1</h2>
      <p>A cross-platform editor for Metroid Fusion and Metroid Zero Mission, built with web technologies.</p>
      <p className="muted">
        Recreates MAGE (by biosp4rk) and MAGE Themes (by ConConner). Host: {s.platform.kind} ({s.platform.os}).
      </p>
    </div>
  ));
}
