/** Small inline SVG icon set (stroke icons on a 16×16 grid). */
const PATHS: Record<string, string> = {
  files: 'M3 1.5h6l3.5 3.5v9.5h-9.5zM9 1.5V5h3.5',
  grid: 'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z',
  properties: 'M2 4h12M2 8h12M2 12h12M5 2.5v3M10 6.5v3M7 10.5v3',
  search: 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.5 10.5 14 14',
  gear: 'M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5 13 13M3 13l1.5-1.5M11.5 4.5 13 3',
  brush: 'M10 2l4 4-6 6-4-4zM4 8l-2 6 6-2',
  cursor: 'M3 2l9 5-4 1.5L6.5 13z',
  bucket: 'M3 7l5-5 5 5-5 5zM13 9c0 1.5 1 2.5 1 3.5a1 1 0 0 1-2 0c0-1 1-2 1-3.5z',
  undo: 'M5 3L2 6l3 3M2 6h7a4 4 0 0 1 0 8H6',
  redo: 'M11 3l3 3-3 3M14 6H7a4 4 0 0 0 0 8h3',
  zoomIn: 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.5 10.5 14 14M5 7h4M7 5v4',
  zoomOut: 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.5 10.5 14 14M5 7h4',
  close: 'M4 4l8 8M12 4l-8 8',
  chevronRight: 'M6 3l5 5-5 5',
  chevronDown: 'M3 6l5 5 5-5',
  room: 'M2 3h12v10H2zM2 6h12M6 6v7',
  palette: 'M8 2a6 6 0 1 0 0 12c1 0 1-1 .5-1.8-.5-.8 0-1.7 1-1.7H11a3 3 0 0 0 3-3C14 4.5 11.3 2 8 2zM5 7h.01M7 4.5h.01M10.5 5h.01',
  image: 'M2 3h12v10H2zM2 11l4-4 3 3 2-2 3 3M10.5 5.5h.01',
  table: 'M2 3h12v10H2zM2 7h12M2 10h12M6 3v10M10 3v10',
  header: 'M3 3h10M3 6.5h10M3 10h6M3 13.5h8',
  sprite: 'M5 3h6v2h2v6h-2v2H5v-2H3V5h2zM6 7h1M9 7h1',
  door: 'M4 2h8v12H4zM10 8h.01',
  info: 'M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2zM8 7v4M8 5h.01',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  layers: 'M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3',
  output: 'M2 3h12v10H2zM4 6l2 2-2 2M8 10h4',
  warning: 'M8 2l6.5 11.5h-13zM8 6.5v3M8 11.5h.01',
  folder: 'M1.5 3.5h5l1.5 1.5h6.5v8h-13z',
  file: 'M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3',
  hammer: 'M2 5l4-3 3 3-1.5 1.5L14 13l-1 1-6.5-6.5L5 9z',
  map: 'M1.5 3.5l4-1.5 5 2 4-1.5v10l-4 1.5-5-2-4 1.5zM5.5 2v10M10.5 4v10',
  tilemap: 'M2 2h12v12H2zM2 6h12M2 10h12M6 2v12M10 2v12',
  save: 'M2.5 2.5h9l2 2v9h-11zM5 2.5v3.5h5V2.5M5 13.5V9h6v4.5',
  keyboard: 'M1.5 4h13v8h-13zM4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6',
};

export function Icon({ name, size = 16, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}
