/**
 * A 3×5 pixel font for hex digits, used to label blocks at 1:1 scale
 * (regular text would be blurry once the room is zoomed).
 */
const GLYPHS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001010010',
  '8': '111101111101111', '9': '111101111001111', A: '010101111101101', B: '110101110101110',
  C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  '-': '000000111000000',
};

/** Draws `text` with a 1px dark outline so it reads on any background. */
export function drawPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, outline = 'rgba(0,0,0,0.85)'): void {
  const paint = (ox: number, oy: number, c: string) => {
    ctx.fillStyle = c;
    [...text.toUpperCase()].forEach((ch, i) => {
      const g = GLYPHS[ch];
      if (!g) return;
      for (let p = 0; p < 15; p++) if (g[p] === '1') ctx.fillRect(x + ox + i * 4 + (p % 3), y + oy + Math.floor(p / 3), 1, 1);
    });
  };
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(dx, dy, outline);
  paint(0, 0, color);
}

export const pixelTextWidth = (text: string) => text.length * 4 - 1;

export const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');
