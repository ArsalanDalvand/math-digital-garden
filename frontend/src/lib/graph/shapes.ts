import type { NodeShape } from './types.ts';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Computes regular polygon vertices for Canvas and SVG node glyphs so shape
 * geometry stays deterministic and unit-testable outside the browser DOM.
 */
export function getPolygonVertices(shape: NodeShape, cx: number, cy: number, r: number): Point2D[] {
  if (shape === 'diamond') {
    const d = r * 1.2;
    return [
      { x: cx, y: cy - d },
      { x: cx + d, y: cy },
      { x: cx, y: cy + d },
      { x: cx - d, y: cy },
    ];
  }

  let sides = 0;
  let radius = r;
  let rotation = -Math.PI / 2;

  if (shape === 'triangle') {
    sides = 3;
    radius = r * 1.24;
  } else if (shape === 'hexagon') {
    sides = 6;
    radius = r * 1.1;
  } else if (shape === 'octagon') {
    sides = 8;
    radius = r * 1.08;
    rotation = Math.PI / 8;
  } else if (shape === 'square') {
    const s = r * 0.94;
    return [
      { x: cx - s, y: cy - s },
      { x: cx + s, y: cy - s },
      { x: cx + s, y: cy + s },
      { x: cx - s, y: cy + s },
    ];
  }

  if (!sides) return [];

  const points: Point2D[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * Math.PI * 2) / sides;
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }
  return points;
}

/** Traces the outer path of a UMKO node shape onto a Canvas 2D context. */
export function traceNodeShapePath(
  ctx: CanvasRenderingContext2D,
  shape: NodeShape,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.beginPath();
  if (shape === 'circle' || shape === 'double-circle') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    return;
  }

  if (shape === 'square') {
    const half = r * 0.94;
    const size = half * 2;
    const corner = Math.max(2, half * 0.36);
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(cx - half, cy - half, size, size, corner);
      return;
    }
    const x0 = cx - half;
    const y0 = cy - half;
    ctx.moveTo(x0 + corner, y0);
    ctx.lineTo(x0 + size - corner, y0);
    ctx.quadraticCurveTo(x0 + size, y0, x0 + size, y0 + corner);
    ctx.lineTo(x0 + size, y0 + size - corner);
    ctx.quadraticCurveTo(x0 + size, y0 + size, x0 + size - corner, y0 + size);
    ctx.lineTo(x0 + corner, y0 + size);
    ctx.quadraticCurveTo(x0, y0 + size, x0, y0 + size - corner);
    ctx.lineTo(x0, y0 + corner);
    ctx.quadraticCurveTo(x0, y0, x0 + corner, y0);
    ctx.closePath();
    return;
  }

  const pts = getPolygonVertices(shape, cx, cy, r);
  if (!pts.length) {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    return;
  }
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
}

/** Renders the inner ring for double-circle kinds such as axioms and theories. */
export function strokeDoubleCircleInnerRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  strokeStyle: string,
  lineWidth: number,
): void {
  if (r < 4) return;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.5, r * 0.62), 0, Math.PI * 2);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}
