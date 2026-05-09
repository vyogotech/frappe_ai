/** Content block types — mirrors mcp_server/blocks/models.py */

export interface TextBlock {
  type: "text";
  content: string;
}

export interface Dataset {
  name: string;
  values: (number | string)[];
}

export interface ChartData {
  labels: string[];
  datasets: Dataset[];
  yLabels?: string[];
}

export interface ChartOptions {
  stacked?: boolean;
  currency?: string;
}

export type ChartType = "bar" | "line" | "pie" | "funnel" | "heatmap" | "calendar";

export interface ChartBlock {
  type: "chart";
  chart_type: ChartType;
  data: ChartData;
  options?: ChartOptions;
  title?: string;
}

export interface Column {
  label: string;
  key: string;
  format?: string;
}

export interface DocRoute {
  doctype: string;
  name: string;
}

export interface TableRow {
  values: Record<string, unknown>;
  route?: DocRoute;
}

export interface TableBlock {
  type: "table";
  columns: Column[];
  rows: TableRow[];
  title?: string;
}

export type TrendDirection = "up" | "down" | "flat";

export interface KPIMetric {
  label: string;
  value: number | string;
  format?: string;
  trend?: TrendDirection;
  trend_value?: string;
}

export interface KPIBlock {
  type: "kpi";
  metrics: KPIMetric[];
}

export type StatusColor = "green" | "red" | "yellow" | "blue" | "gray";

export interface StatusItem {
  label: string;
  status: string;
  color: StatusColor;
  route?: DocRoute;
}

export interface StatusListBlock {
  type: "status_list";
  title?: string;
  items: StatusItem[];
}

export type ContentBlock =
  | TextBlock
  | ChartBlock
  | TableBlock
  | KPIBlock
  | StatusListBlock;

export type BlockType = ContentBlock["type"];
