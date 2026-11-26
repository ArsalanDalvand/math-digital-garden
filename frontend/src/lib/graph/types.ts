import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3';

export type RelationPlaneKey =
  | 'deduction'
  | 'structure'
  | 'problem_solving'
  | 'pedagogy'
  | 'enrichment'
  | 'context';

export type LayoutMode = 'force' | 'dag';

export type NodeShape =
  | 'circle'
  | 'double-circle'
  | 'hexagon'
  | 'square'
  | 'diamond'
  | 'triangle'
  | 'octagon';

export type ColorByMode = 'kind' | 'level' | 'chapter';

export type PathTraceMode = 'off' | 'prerequisites' | 'impact';

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
  book_slug?: string;
  chapter_slug?: string;
}

export interface GraphConfig {
  depth: number;
  prefetchPages: boolean;
  renderExternal: boolean;
  showHubsAndRaw: boolean;
  renderLabels: boolean;
  renderArrows: boolean;
  typedOnly: boolean;
  layoutMode: LayoutMode;
  colorBy: ColorByMode;
  pathTraceMode: PathTraceMode;
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
  shape: NodeShape;
  level: string;
  bookSlug: string;
  chapterSlug: string;
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
  shape: NodeShape;
}

export interface GraphStats {
  nodeCount: number;
  linkCount: number;
  typedLinkCount: number;
  hiddenHubCount: number;
}

export interface BuildGraphOptions {
  renderExternal?: boolean;
  showHubsAndRaw?: boolean;
}

export interface PathTraceStep {
  nodeId: string;
  title: string;
  kind: string;
  kindLabel: string;
  lightColor: string;
  darkColor: string;
  shape: NodeShape;
  hop: number;
  viaRelation: string;
}

export interface PathTraceResult {
  mode: PathTraceMode;
  startId: string;
  nodeHops: Map<string, number>;
  highlightedLinkKeys: Set<string>;
  orderedSteps: PathTraceStep[];
}

export interface NeighborSummary {
  prereqCount: number;
  dependentCount: number;
  exerciseCount: number;
  hiddenHubCount: number;
}

export interface ColorLegendItem {
  id: string;
  label: string;
  color: string;
  shape: NodeShape;
  count?: number;
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
  showHubsAndRaw: false,
  renderLabels: true,
  renderArrows: true,
  typedOnly: false,
  layoutMode: 'force',
  colorBy: 'kind',
  pathTraceMode: 'off',
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
