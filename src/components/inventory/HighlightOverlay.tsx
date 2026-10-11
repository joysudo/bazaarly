import { useEffect, useRef } from 'react';
import type { Highlight } from '../../lib/types';

interface Props {
  highlight: Highlight | null;
  width: number;
  height: number;
}

export function HighlightOverlay({ highlight, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, width, height);
    if (!highlight) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) ctx.clearRect(0, 0, width, height);
    }, 3000);

    const drawOutline = () => {
      if (!highlight.outline.length) return;
      ctx.beginPath();
      highlight.outline.forEach(([x, y], i) =>
        i ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height)
      );
      ctx.closePath();
      ctx.strokeStyle = 'rgb(0, 200, 120)';
      ctx.lineWidth = Math.max(3, width / 200);
      ctx.stroke();
    };

    if (highlight.mask_png) {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.globalAlpha = 1;
        drawOutline();
      };
      img.src = `data:image/png;base64,${highlight.mask_png}`;
    } else {
      drawOutline();
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [highlight, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
