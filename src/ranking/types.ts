import type { ComponentType } from "react";

/** Serialized, authoritative ranking result supplied by the host. */
export interface RankingCandidate {
  id: string;
  label: string;
  index?: number;
  score: number | null;
  rank: number | null;
  uncertainty: number | null;
  average_rank: number | null;
  observations: number;
  matches: number;
  component: number;
  wins: number;
  ties: number;
  losses: number;
}

export interface QualityRanking {
  schema_version: "n4a.quality-ranking/1";
  request_id: string;
  request: Record<string, unknown>;
  state: "ready" | "unavailable";
  reason: string | null;
  dimension: string;
  method: string;
  metric: string;
  scope: string;
  partition: string;
  config: Record<string, unknown>;
  interpretation: "observed_performance" | "observed_component_performance";
  candidates: RankingCandidate[];
  coverage: { blocks: number; complete_blocks: number; paired_comparisons: number; connected_components: number } | null;
  inference: Record<string, unknown> | null;
  convergence: Record<string, unknown> | null;
  uncertainty_kind: "approximate_posterior_sd" | null;
  score_direction: "lower_is_better" | "higher_is_better" | null;
  provenance: {
    datasets: string[];
    matched_blocks: number;
    comparison_rows: number;
    source_observations: number;
    accepted_observations: number;
    excluded: Record<string, number>;
    aggregation: string;
    dataset_weighting: string;
    blocks: unknown[];
    comparisons: unknown[];
    candidate_universe?: { id: string; label: string; pipelines: string[] }[];
  };
  warnings: string[];
  capabilities: { methods: string[]; dimensions: string[]; deferred: Record<string, string> };
}

/** Plotly-compatible data are passed through to a renderer provided by the host. */
export interface RankingPlotProps {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
  config: Record<string, unknown>;
}
export type RankingPlotRenderer = ComponentType<RankingPlotProps>;
export interface RankingViewProps {
  ranking: QualityRanking;
  Plot?: RankingPlotRenderer;
  className?: string;
}
