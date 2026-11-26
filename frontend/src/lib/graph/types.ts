import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3';

export type RelationPlaneKey =
  | 'deduction'
  | 'structure'
  | 'problem_solving'
  | 'pedagogy'
  | 'enrichment'
  | 'context';

export type LayoutMode = 'force' | 'dag';

export interface SitemapEntry {
  title?: string;
  exists?: boolean;
  external?: boolean;
  links?: string[];
  backlinks?: string[];
  rels?: Record<string, string[]>;
  tags?: string[];
  kind?: string;
  subtype?: string;
  level?: string;
  slogan?: string;
  uid?: string;
}

export interface GraphConfig {
  depth: number;
  prefetchPages: boolean;
  renderExternal: boolean;
  renderLabels: boolean;
  renderArrows: boolean;
  typedOnly: boolean;
  layoutMode: LayoutMode;
  labelFontSize: number;
  linkDistance: number;
  repelForce: number;
  centerForce: number;
  colliderPadding: number;
  alphaDecay: number;
  scale: number;
  minZoom: number;
  maxZoom: number;
}

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  shortTitle: string;
  fullShortTitle: string;
  kind: string;
  kindLabel: string;
  level: string;
  slogan: string;
  tags: string[];
  isCurrent: boolean;
  degree: number;
  outCount: number;
  inCount: number;
  radius: number;
  lightColor: string;
  darkColor: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  labelAlpha: number;
  hoverScale: number;
  dagRank?: number;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  id: string;
  source: GraphNode;
  target: GraphNode;
  relations: string[];
  primaryRel: string;
  plane: RelationPlaneKey;
  isTyped: boolean;
  isDag: boolean;
  bidirectional: boolean;
  curveOffset: number;
  lightColor: string;
  darkColor: string;
  dash: 'solid' | 'dashed' | 'dotted';
  shortLabel: string;
}

export interface RelationVisualMeta {
  key: string;
  plane: RelationPlaneKey;
  short: string;
  forward: string;
  reverse: string;
  icon: string;
  dag: boolean;
  symmetric: boolean;
  light: string;
  dark: string;
  dash: 'solid' | 'dashed' | 'dotted';
  priority: number;
}

export interface KindVisual {
  label: string;
  light: string;
  dark: string;
  sizeBoost: number;
}

export interface GraphStats {
  nodeCount: number;
  linkCount: number;
  typedLinkCount: number;
}

export type HoverTarget =
  | {
      type: 'node';
      node: GraphNode;
      screenX: number;
      screenY: number;
      directRelation: string | null;
    }
  | {
      type: 'link';
      link: GraphLink;
      screenX: number;
      screenY: number;
    }
  | null;

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  depth: 1,
  prefetchPages: false,
  renderExternal: false,
  renderLabels: true,
  renderArrows: true,
  typedOnly: false,
  layoutMode: 'force',
  labelFontSize: 12,
  linkDistance: 120,
  repelForce: 150,
  centerForce: 0.12,
  colliderPadding: 24,
  alphaDecay: 0.028,
  scale: 1,
  minZoom: 0.08,
  maxZoom: 4.5,
};
