import { useLayoutEffect, useRef, type CSSProperties, type MouseEventHandler } from 'react';
import type { PixelBuffer } from '@core/gfx/PixelBuffer';

/** Displays a core PixelBuffer, scaled with nearest-neighbour filtering. */
export function PixelCanvas({
  image,
  zoom = 1,
  style,
  className,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  version,
}: {
  image: PixelBuffer | undefined;
  zoom?: number;
  style?: CSSProperties;
  className?: string;
  onMouseDown?: MouseEventHandler<HTMLCanvasElement>;
  onMouseMove?: MouseEventHandler<HTMLCanvasElement>;
  onMouseUp?: MouseEventHandler<HTMLCanvasElement>;
  onMouseLeave?: MouseEventHandler<HTMLCanvasElement>;
  /** Bump to force a redraw when the buffer was mutated in place. */
  version?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !image || image.width === 0 || image.height === 0) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.bytes), image.width, image.height), 0, 0);
  }, [image, version]);
  return (
    <canvas
      ref={ref}
      className={`pixelated ${className ?? ''}`}
      style={{ width: (image?.width ?? 0) * zoom, height: (image?.height ?? 0) * zoom, ...style }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

/** Converts a mouse event to integer image coordinates for a zoomed canvas. */
export function canvasPoint(e: { clientX: number; clientY: number; currentTarget: Element }, zoom: number) {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left) / zoom), y: Math.floor((e.clientY - r.top) / zoom) };
}
