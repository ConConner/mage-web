import { breakableIcon, clipValueTint, collisionCategory, slopeSegment } from '@core/game/clipdataVisuals';
import { genericBgGfx, genericBgPalette } from '@core/gfx/BgVram';
import { renderGfxSheet } from '@core/gfx/PixelBuffer';
import { doorExitPoint, DoorKind } from '@core/model/Doors';
import { NONE, scrollExtensionRect } from '@core/model/Scrolls';
import { SCREEN_H, SCREEN_W } from '@core/model/Room';
import type { RoomEditorModel, SelectedObject } from './RoomEditorModel';
import type { ViewToggles } from './RoomTools';
import { drawPixelText, hex2, pixelTextWidth } from './pixelFont';

const COLORS = {
  solid: '#ff3030',
  slope: '#ff3030',
  door: '#00e5ff',
  item: '#ff40ff',
  samus: '#98fb98',
  enemy: '#ff8c00',
  sprite: '#32ff32',
  doorNormal: '#3060ff',
  doorArea: '#00ffff',
  scroll: '#ffff00',
  scrollExt: '#ffa500',
  effect: '#ff0084',
  screen: 'rgba(255,255,255,0.85)',
  selection: '#ffffff',
};

/**
 * Paints the editor overlays (objects and clipdata visualizations) onto a
 * canvas at 1:1 room pixel scale. Purely presentational: it reads the model
 * and never changes it.
 */
export class RoomOverlayPainter {
  private iconSheet?: HTMLCanvasElement;
  private iconKey = '';

  constructor(private readonly model: RoomEditorModel) {}

  private icons(): HTMLCanvasElement {
    const v = this.model.room;
    const key = `${v.rom.gameCode}`;
    if (this.iconSheet && this.iconKey === key) return this.iconSheet;
    const src = this.model.project;
    const gfx = genericBgGfx(src);
    const pal = genericBgPalette(src).toRgba();
    const sheet = renderGfxSheet(gfx.data, 32, pal, 0, false);
    const c = document.createElement('canvas');
    c.width = sheet.width;
    c.height = sheet.height;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(sheet.bytes), sheet.width, sheet.height), 0, 0);
    this.iconSheet = c;
    this.iconKey = key;
    return c;
  }

  paint(ctx: CanvasRenderingContext2D, view: ViewToggles, selected: SelectedObject | undefined): void {
    const room = this.model.room;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.imageSmoothingEnabled = false;
    if (view.values) this.paintValues(ctx);
    if (view.breakable) this.paintBreakable(ctx);
    if (view.collision) this.paintCollision(ctx);
    if (view.spriteOutlines) this.paintSprites(ctx, selected);
    if (view.doors) this.paintDoors(ctx, selected);
    if (view.scrolls) this.paintScrolls(ctx, selected);
    if (view.effect && room.header.effectY !== 0xff) this.paintEffect(ctx);
    if (view.screens) this.paintScreens(ctx);
  }

  private paintValues(ctx: CanvasRenderingContext2D): void {
    const clip = this.model.room.clip;
    for (let y = 0; y < clip.height; y++) {
      for (let x = 0; x < clip.width; x++) {
        const v = clip.get(x, y);
        const [r, g, b, a] = clipValueTint(v);
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
        ctx.fillRect(x * 16, y * 16, 16, 16);
        drawPixelText(ctx, hex2(v & 0xff), x * 16 + 4, y * 16 + 6, '#ffffff');
      }
    }
  }

  private paintBreakable(ctx: CanvasRenderingContext2D): void {
    const clip = this.model.room.clip;
    const game = this.model.rom.game.kind;
    const sheet = this.icons();
    for (let y = 0; y < clip.height; y++) {
      for (let x = 0; x < clip.width; x++) {
        const icon = breakableIcon(game, clip.get(x, y));
        if (!icon) continue;
        let dy = 0;
        for (const p of icon.parts) {
          ctx.drawImage(sheet, p.sx, p.sy, p.w, p.h, x * 16, y * 16 + dy, p.w, p.h);
          dy += p.h;
        }
      }
    }
  }

  private paintCollision(ctx: CanvasRenderingContext2D): void {
    const room = this.model.room;
    const w = room.width, h = room.height;
    const types = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) types[y * w + x] = room.collisionType(x, y);
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0xff : types[y * w + x]);
    const solidish = (t: number) => t >= 1 && t <= 7;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = types[y * w + x];
        const cat = collisionCategory(t);
        if (cat === 'air') continue;
        const px = x * 16, py = y * 16;
        ctx.fillStyle = COLORS[cat];
        const seg = slopeSegment(t);
        if (seg) {
          ctx.strokeStyle = COLORS.slope;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + seg[0] + 0.5, py + seg[1] + 0.5);
          ctx.lineTo(px + seg[2] + 0.5, py + seg[3] + 0.5);
          ctx.stroke();
          continue;
        }
        // Outline only the edges facing a different kind of block.
        const same = (nt: number) => (t === 1 ? solidish(nt) : nt === t);
        if (!same(at(x - 1, y))) ctx.fillRect(px, py, 2, 16);
        if (!same(at(x + 1, y))) ctx.fillRect(px + 14, py, 2, 16);
        if (!same(at(x, y - 1))) ctx.fillRect(px, py, 16, 2);
        if (!same(at(x, y + 1))) ctx.fillRect(px, py + 14, 16, 2);
        if (same(at(x - 1, y)) && same(at(x, y - 1)) && !same(at(x - 1, y - 1))) ctx.fillRect(px, py, 2, 2);
        if (same(at(x + 1, y)) && same(at(x, y - 1)) && !same(at(x + 1, y - 1))) ctx.fillRect(px + 14, py, 2, 2);
        if (same(at(x - 1, y)) && same(at(x, y + 1)) && !same(at(x - 1, y + 1))) ctx.fillRect(px, py + 14, 2, 2);
        if (same(at(x + 1, y)) && same(at(x, y + 1)) && !same(at(x + 1, y + 1))) ctx.fillRect(px + 14, py + 14, 2, 2);
      }
    }
  }

  private paintSprites(ctx: CanvasRenderingContext2D, selected: SelectedObject | undefined): void {
    const set = this.model.ui.get().spriteSet;
    const list = this.model.room.spriteLists[set];
    if (!list) return;
    list.sprites.forEach((s, i) => {
      const isSel = selected?.kind === 'sprite' && selected.list === set && selected.index === i;
      ctx.strokeStyle = isSel ? COLORS.selection : COLORS.sprite;
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x * 16 + 1, s.y * 16 + 1, 14, 14);
      drawPixelText(ctx, hex2(s.properties), s.x * 16 + 4, s.y * 16 + 6, isSel ? COLORS.selection : COLORS.sprite);
      if (isSel) {
        const b = this.model.spriteBounds(set, i);
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
        ctx.setLineDash([]);
      }
    });
  }

  private paintDoors(ctx: CanvasRenderingContext2D, selected: SelectedObject | undefined): void {
    for (const d of this.model.room.doors) {
      const isSel = (selected?.kind === 'door' || selected?.kind === 'exit') && selected.number === d.number && selected.area === d.area;
      const color = isSel ? COLORS.selection : (d.type & 0xf) === DoorKind.AreaConnection ? COLORS.doorArea : COLORS.doorNormal;
      const x = d.xStart * 16, y = d.yStart * 16;
      const w = (d.xEnd - d.xStart + 1) * 16, h = (d.yEnd - d.yStart + 1) * 16;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      drawPixelText(ctx, hex2(d.number), x + 8 - Math.floor(pixelTextWidth('00') / 2), y + 6, color);
      if (h >= 48) drawPixelText(ctx, hex2(d.destination), x + 4, y + h - 10, '#ffd24d');
      else if (w >= 48) drawPixelText(ctx, hex2(d.destination), x + w - 12, y + 6, '#ffd24d');
      // Exit point
      const e = doorExitPoint(d);
      ctx.strokeStyle = isSel ? COLORS.selection : '#ff2020';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x - 3, e.y - 3);
      ctx.lineTo(e.x + 3, e.y + 3);
      ctx.moveTo(e.x - 3, e.y + 3);
      ctx.lineTo(e.x + 3, e.y - 3);
      ctx.stroke();
    }
  }

  private paintScrolls(ctx: CanvasRenderingContext2D, selected: SelectedObject | undefined): void {
    this.model.room.scrolls.forEach((s, i) => {
      const isSel = selected?.kind === 'scroll' && selected.index === i;
      const ext = scrollExtensionRect(s);
      if (ext) {
        ctx.strokeStyle = COLORS.scrollExt;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeRect(ext.x * 16 + 0.5, ext.y * 16 + 0.5, ext.w * 16 - 1, ext.h * 16 - 1);
        ctx.setLineDash([]);
        if (s.xBreak !== NONE) {
          ctx.lineWidth = 2;
          ctx.strokeRect(s.xBreak * 16 + 1, s.yBreak * 16 + 1, 14, 14);
        }
      }
      const color = isSel ? COLORS.selection : COLORS.scroll;
      const x0 = s.xStart * 16, y0 = s.yStart * 16, x1 = s.xEnd * 16 + 16, y1 = s.yEnd * 16 + 16;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      ctx.fillStyle = color;
      // Corner handles
      ctx.fillRect(x0, y0, 14, 3); ctx.fillRect(x0, y0, 3, 14);
      ctx.fillRect(x1 - 14, y0, 14, 3); ctx.fillRect(x1 - 3, y0, 3, 14);
      ctx.fillRect(x0, y1 - 3, 14, 3); ctx.fillRect(x0, y1 - 14, 3, 14);
      ctx.fillRect(x1 - 14, y1 - 3, 14, 3); ctx.fillRect(x1 - 3, y1 - 14, 3, 14);
      drawPixelText(ctx, String(i), x0 + 6, y0 + 6, color);
    });
  }

  private paintEffect(ctx: CanvasRenderingContext2D): void {
    const room = this.model.room;
    const y = room.header.effectY * 16;
    ctx.fillStyle = COLORS.effect;
    ctx.fillRect(0, y, room.width * 16, 1);
    for (const x of [0, room.width * 16 - 16]) {
      ctx.fillRect(x + 4, y + 14, 8, 2);
      drawPixelText(ctx, hex2(room.header.effectY), x + 4, y + 5, COLORS.effect);
    }
  }

  private paintScreens(ctx: CanvasRenderingContext2D): void {
    const room = this.model.room;
    const w = room.width * 16, h = room.height * 16;
    ctx.fillStyle = COLORS.screen;
    for (let x = 32; x <= w; x += SCREEN_W * 16) ctx.fillRect(x - 1, 0, 2, h);
    for (let y = 32; y <= h; y += SCREEN_H * 16) ctx.fillRect(0, y - 1, w, 2);
  }
}
