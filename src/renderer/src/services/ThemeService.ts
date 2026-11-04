import { Store } from './store';
import type { SettingsService } from './SettingsService';

/**
 * A theme is a handful of base colors; every other UI color is derived from
 * them in CSS (see styles/theme.css). This keeps themes small and lets the
 * JSON themes of MAGE Themes (`{ "Colors": { "BackgroundColor": ... } }`)
 * be imported directly.
 */
export interface ThemeColors {
  background: string;
  foreground: string;
  primaryOutline: string;
  secondaryOutline: string;
  accent: string;
}

export interface Theme {
  id: string;
  name: string;
  kind: 'dark' | 'light';
  colors: ThemeColors;
  builtin?: boolean;
}

export const BUILTIN_THEMES: Theme[] = [
  { id: 'dark', name: 'MAGE Dark', kind: 'dark', builtin: true, colors: { background: '#1e1f22', foreground: '#d4d4d4', primaryOutline: '#3c3f45', secondaryOutline: '#2b2d31', accent: '#4c9aff' } },
  { id: 'light', name: 'MAGE Light', kind: 'light', builtin: true, colors: { background: '#f5f5f5', foreground: '#1f1f1f', primaryOutline: '#c8c8c8', secondaryOutline: '#e3e3e3', accent: '#0a64d6' } },
  { id: 'chozo', name: 'Chozo Ruins', kind: 'dark', builtin: true, colors: { background: '#211b14', foreground: '#ead9b8', primaryOutline: '#4d3f2c', secondaryOutline: '#2e261c', accent: '#e8a33c' } },
  { id: 'bsl', name: 'B.S.L. Station', kind: 'dark', builtin: true, colors: { background: '#151a24', foreground: '#cfe3f0', primaryOutline: '#2d3a50', secondaryOutline: '#1d2433', accent: '#6fe36f' } },
  { id: 'varia', name: 'Varia', kind: 'dark', builtin: true, colors: { background: '#1f1414', foreground: '#f0dcd0', primaryOutline: '#4a2d2a', secondaryOutline: '#2d1c1b', accent: '#ff7a2e' } },
  { id: 'hc', name: 'High Contrast', kind: 'dark', builtin: true, colors: { background: '#000000', foreground: '#ffffff', primaryOutline: '#6fc3df', secondaryOutline: '#1a1a1a', accent: '#f38518' } },
];

const luminance = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Converts any CSS color (names, #ARGB...) to #rrggbb using the browser. */
function toHex(color: string): string {
  const s = color.trim();
  // .NET writes 8-digit colors as #AARRGGBB.
  const argb = /^#([0-9a-f]{2})([0-9a-f]{6})$/i.exec(s);
  if (argb) return '#' + argb[2];
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillStyle = s;
  return ctx.fillStyle as string;
}

/** Parses either our theme format or a MAGE Themes JSON theme. */
export function parseThemeJson(text: string, fallbackName: string): Theme {
  const json = JSON.parse(text);
  if (json.Colors) {
    const c = json.Colors;
    const colors: ThemeColors = {
      background: toHex(c.BackgroundColor ?? '#1e1e1e'),
      foreground: toHex(c.TextColor ?? '#dddddd'),
      primaryOutline: toHex(c.PrimaryOutline ?? '#555555'),
      secondaryOutline: toHex(c.SecondaryOutline ?? '#333333'),
      accent: toHex(c.AccentColor ?? '#4c9aff'),
    };
    return { id: 'custom:' + fallbackName, name: fallbackName, kind: luminance(colors.background) < 0.5 ? 'dark' : 'light', colors };
  }
  if (json.colors) {
    const name = json.name ?? fallbackName;
    return { id: 'custom:' + name, name, kind: json.kind ?? (luminance(json.colors.background) < 0.5 ? 'dark' : 'light'), colors: json.colors };
  }
  throw new Error('Not a recognized theme file.');
}

export class ThemeService {
  readonly current: Store<Theme>;

  constructor(private readonly settings: SettingsService) {
    this.current = new Store(this.resolve(settings.get('workbench.colorTheme')));
    this.apply(this.current.get());
    settings.onDidChange((key) => {
      if (key === 'workbench.colorTheme' || key === 'workbench.customThemes') this.select(this.settings.get('workbench.colorTheme'), false);
    });
  }

  all(): Theme[] {
    return [...BUILTIN_THEMES, ...this.settings.get('workbench.customThemes')];
  }

  private resolve(id: string): Theme {
    return this.all().find((t) => t.id === id) ?? BUILTIN_THEMES[0];
  }

  select(id: string, persist = true): void {
    const theme = this.resolve(id);
    this.current.set(theme);
    this.apply(theme);
    if (persist) this.settings.set('workbench.colorTheme', theme.id);
  }

  /** Temporarily shows a theme (used while browsing the theme picker). */
  preview(id: string): void {
    this.apply(this.resolve(id));
  }

  restore(): void {
    this.apply(this.current.get());
  }

  addCustom(theme: Theme): void {
    const others = this.settings.get('workbench.customThemes').filter((t) => t.id !== theme.id);
    this.settings.set('workbench.customThemes', [...others, theme]);
    this.select(theme.id);
  }

  private apply(theme: Theme): void {
    const root = document.documentElement;
    const c = theme.colors;
    root.style.setProperty('--base-bg', c.background);
    root.style.setProperty('--base-fg', c.foreground);
    root.style.setProperty('--base-outline', c.primaryOutline);
    root.style.setProperty('--base-outline-2', c.secondaryOutline);
    root.style.setProperty('--base-accent', c.accent);
    root.style.setProperty('--accent-fg', luminance(c.accent) > 0.45 ? '#000000' : '#ffffff');
    root.dataset.themeKind = theme.kind;
    root.style.colorScheme = theme.kind;
  }
}
