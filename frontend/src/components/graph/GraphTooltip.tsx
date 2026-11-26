import type { CSSProperties } from 'react';
import {
  classifyRelation,
  formatLevelLabel,
  getPlaneLabel,
  stripRawLatexForTooltip,
  toPersianDigits,
} from '../../lib/graph/schema.ts';
import type { HoverTarget } from '../../lib/graph/types.ts';

interface GraphTooltipProps {
  hover: HoverTarget;
  isDark: boolean;
  isFullscreen: boolean;
  containerRect: DOMRect | null;
  hidden?: boolean;
}

export function GraphTooltip({
  hover,
  isDark,
  isFullscreen,
  containerRect,
  hidden = false,
}: GraphTooltipProps) {
  if (!hover || hidden) return null;

  const width = containerRect?.width || 360;
  const height = containerRect?.height || 256;
  const estW = Math.min(290, Math.max(180, width - 20));
  const estH = hover.type === 'link' ? 124 : isFullscreen && hover.node.slogan ? 128 : 96;

  let left = hover.screenX + 14;
  if (left + estW > width - 8) {
    left = hover.screenX - estW - 14;
  }
  left = Math.max(8, Math.min(width - estW - 8, left));

  let top = hover.screenY - estH - 12;
  if (top < 8) {
    top = hover.screenY + 16;
  }
  top = Math.max(8, Math.min(height - estH - 8, top));

  const style: CSSProperties = {
    transform: `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`,
  };

  if (hover.type === 'node') {
    const { node, directRelation } = hover;
    const accent = isDark ? node.darkColor : node.lightColor;
    const levelLabel = formatLevelLabel(node.level);
    const cleanSlogan = stripRawLatexForTooltip(node.slogan);

    return (
      <div
        className="kg-tooltip"
        role="tooltip"
        data-tooltip-type="node"
        style={{ ...style, '--kind-c': accent } as CSSProperties}
      >
        <div className="kg-tooltip-top">
          <span className="kg-tooltip-kind">
            <span className="kg-dot" aria-hidden="true" />
            {node.kindLabel}
          </span>
          <span className="kg-tooltip-meta">
            {toPersianDigits(node.degree)} پیوند
            {levelLabel ? ` · ${levelLabel}` : ''}
          </span>
        </div>
        <div className="kg-tooltip-title">{node.title}</div>
        {directRelation && <div className="kg-tooltip-rel">{directRelation}</div>}
        {isFullscreen && cleanSlogan && <div className="kg-tooltip-slogan">{cleanSlogan}</div>}
      </div>
    );
  }

  const { link } = hover;
  const edgeAccent = isDark ? link.darkColor : link.lightColor;
  const planeLabel = getPlaneLabel(link.plane);

  return (
    <div
      className="kg-tooltip"
      role="tooltip"
      data-tooltip-type="link"
      style={
        {
          ...style,
          '--plane-c': edgeAccent,
          '--edge-c': edgeAccent,
        } as CSSProperties
      }
    >
      <div className="kg-tooltip-top">
        <span className="kg-tooltip-kind" style={{ color: edgeAccent }}>
          <span className={`kg-line-sample kg-line-${link.dash}`} aria-hidden="true" />
          {planeLabel}
        </span>
      </div>
      <div className="kg-edge-pills">
        {link.relations.map((relKey) => {
          const meta = classifyRelation(relKey);
          const color = isDark ? meta.dark : meta.light;
          return (
            <span
              key={relKey}
              className="kg-edge-pill"
              style={{ '--edge-c': color } as CSSProperties}
            >
              <span>{meta.icon}</span>
              <span>{meta.short}</span>
            </span>
          );
        })}
      </div>
      <div className="kg-edge-endpoints">
        <span>{link.source.title}</span>
        <span className="kg-edge-arrow" aria-hidden="true">
          {link.bidirectional ? '↔' : '←'}
        </span>
        <span>{link.target.title}</span>
      </div>
    </div>
  );
}
