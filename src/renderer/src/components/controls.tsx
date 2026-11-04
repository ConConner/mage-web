import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export const hex = (v: number, digits = 2) => v.toString(16).toUpperCase().padStart(digits, '0');

/** Text field for hex numbers; commits on blur/Enter, rejects invalid input. */
export function HexInput({ value, onChange, digits = 2, max = 0xff, min = 0, disabled, width }: { value: number; onChange: (v: number) => void; digits?: number; max?: number; min?: number; disabled?: boolean; width?: number }) {
  const [text, setText] = useState(hex(value, digits));
  useEffect(() => setText(hex(value, digits)), [value, digits]);
  const commit = () => {
    const v = parseInt(text.replace(/^0x/i, ''), 16);
    if (Number.isNaN(v) || v < min || v > max) setText(hex(value, digits));
    else if (v !== value) onChange(v);
    else setText(hex(value, digits));
  };
  return (
    <input
      className="input hex-input"
      value={text}
      disabled={disabled}
      spellCheck={false}
      style={{ width: width ?? 12 + digits * 9 }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const v = Math.max(min, Math.min(max, value + (e.key === 'ArrowUp' ? 1 : -1)));
          onChange(v);
        }
      }}
    />
  );
}

/** Signed decimal input (e.g. exit distances). */
export function NumberInput({ value, onChange, min, max, width = 56 }: { value: number; onChange: (v: number) => void; min: number; max: number; width?: number }) {
  return (
    <input
      className="input"
      type="number"
      style={{ width }}
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
      }}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={`checkbox ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Select<T extends string | number>({ value, options, onChange, disabled, width }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean; width?: number }) {
  return (
    <select
      className="input select"
      value={String(value)}
      disabled={disabled}
      style={{ width }}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value) === e.target.value);
        if (opt) onChange(opt.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ToolButton({ icon, label, active, onClick, disabled, children }: { icon?: string; label: string; active?: boolean; onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <button className={`tool-button ${active ? 'active' : ''}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function Button({ children, onClick, primary, disabled, title }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button className={`button ${primary ? 'primary' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Section({ title, children, actions, defaultOpen = true }: { title: string; children: ReactNode; actions?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`view-section ${open ? 'open' : ''}`}>
      <header className="view-section-header" onClick={() => setOpen(!open)}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        <span>{title}</span>
        <span className="spacer" />
        <span onClick={(e) => e.stopPropagation()}>{actions}</span>
      </header>
      {open && <div className="view-section-body">{children}</div>}
    </section>
  );
}
