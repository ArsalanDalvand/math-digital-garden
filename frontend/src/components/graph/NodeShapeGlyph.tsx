import { getPolygonVertices } from '../../lib/graph/shapes.ts';
import type { NodeShape } from '../../lib/graph/types.ts';

interface NodeShapeGlyphProps {
  shape: NodeShape;
  color?: string;
  size?: number;
  className?: string;
}

/**
 * Renders an inline SVG geometric glyph synchronized with Canvas node shapes
 * so legends, study-path steps, and Quick Peek headers share one visual grammar.
 */
export function NodeShapeGlyph({
  shape,
  color = 'currentColor',
  size = 12,
  className = '',
}: NodeShapeGlyphProps) {
  const cx = 8;
  const cy = 8;
  const r = 5.4;

  const renderShape = () => {
    if (shape === 'circle') {
      return <circle cx={cx} cy={cy} r={r} fill={color} />;
    }
    if (shape === 'double-circle') {
      return (
        <>
          <circle cx={cx} cy={cy} r={5.8} fill={color} />
          <circle
            cx={cx}
            cy={cy}
            r={3.2}
            fill="none"
            stroke="var(--background, #ffffff)"
            strokeWidth={1.35}
          />
        </>
      );
    }
    if (shape === 'square') {
      return <rect x={2.6} y={2.6} width={10.8} height={10.8} rx={2.4} fill={color} />;
    }
    const pts = getPolygonVertices(shape, cx, cy, r);
    if (!pts.length) {
      return <circle cx={cx} cy={cy} r={r} fill={color} />;
    }
    const pointStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return <polygon points={pointStr} fill={color} />;
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className ? `kg-shape-glyph ${className}` : 'kg-shape-glyph'}
      aria-hidden="true"
    >
      {renderShape()}
    </svg>
  );
}
