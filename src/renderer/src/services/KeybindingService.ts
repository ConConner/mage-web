import type { CommandService } from './CommandService';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || navigator.userAgent);

/** Normalizes a KeyboardEvent to a string like "ctrl+shift+p". */
function eventToKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.metaKey) parts.push('meta');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  let key = e.key.toLowerCase();
  if (key === '+') key = '=';
  if (key === ' ') key = 'space';
  if (['control', 'meta', 'alt', 'shift'].includes(key)) return '';
  parts.push(key);
  return parts.join('+');
}

/** Converts "CmdOrCtrl+Shift+P" to the normalized form for this platform. */
function normalize(binding: string): string {
  const parts = binding.toLowerCase().split('+').map((p) => p.trim());
  const mods = new Set<string>();
  let key = '';
  for (const p of parts) {
    if (p === 'cmdorctrl') mods.add(isMac ? 'meta' : 'ctrl');
    else if (p === 'cmd' || p === 'meta') mods.add('meta');
    else if (p === 'ctrl') mods.add('ctrl');
    else if (p === 'alt' || p === 'option') mods.add('alt');
    else if (p === 'shift') mods.add('shift');
    else key = p === 'plus' ? '=' : p === 'delete' ? 'delete' : p;
  }
  return [...['ctrl', 'meta', 'alt', 'shift'].filter((m) => mods.has(m)), key].join('+');
}

/** Display label for a keybinding, e.g. "⌘⇧P" on macOS or "Ctrl+Shift+P" elsewhere. */
export function formatKeybinding(binding: string): string {
  return binding
    .split(' ')
    .map((chord) =>
      chord
        .split('+')
        .map((p) => {
          const l = p.toLowerCase();
          if (l === 'cmdorctrl') return isMac ? '⌘' : 'Ctrl';
          if (l === 'shift') return isMac ? '⇧' : 'Shift';
          if (l === 'alt') return isMac ? '⌥' : 'Alt';
          if (l === 'ctrl') return isMac ? '⌃' : 'Ctrl';
          return p.length === 1 ? p.toUpperCase() : p;
        })
        .join(isMac ? '' : '+'),
    )
    .join(' ');
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/**
 * Dispatches keyboard shortcuts to commands. Bindings without modifiers are
 * ignored while typing in form fields. Supports two-step chords.
 */
export class KeybindingService {
  private pendingChord: string | undefined;

  constructor(private readonly commands: CommandService) {}

  install(target: Window = window): () => void {
    const handler = (e: KeyboardEvent) => this.handle(e);
    target.addEventListener('keydown', handler, true);
    return () => target.removeEventListener('keydown', handler, true);
  }

  private handle(e: KeyboardEvent): void {
    const key = eventToKey(e);
    if (!key) return;
    const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
    const typing = isTyping(e.target);
    if (typing && (!hasModifier || /\+(z|y|a|c|v|x)$/.test(key))) return;
    if (document.querySelector('.modal-backdrop, .quick-pick-backdrop, .context-menu') && !hasModifier) return;

    const candidates = this.commands.list().filter((c) => c.keybinding);
    if (this.pendingChord) {
      const chord = `${this.pendingChord} ${key}`;
      this.pendingChord = undefined;
      const match = candidates.find((c) => c.keybinding!.split(' ').length === 2 && c.keybinding!.split(' ').map(normalize).join(' ') === chord);
      if (match) {
        e.preventDefault();
        void this.commands.execute(match.id);
      }
      return;
    }
    for (const c of candidates) {
      const chords = c.keybinding!.split(' ').map(normalize);
      if (chords[0] !== key) continue;
      if (chords.length === 2) {
        this.pendingChord = key;
        e.preventDefault();
        return;
      }
      if (!this.commands.isEnabled(c.id)) continue;
      e.preventDefault();
      e.stopPropagation();
      void this.commands.execute(c.id);
      return;
    }
  }
}
