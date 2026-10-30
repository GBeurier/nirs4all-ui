import type { ReactNode } from "react";
import { buildPresetCardModel, type PipelinePreset, type PipelinePresetVariantId } from "../pipelines/index.js";

export interface PipelinePresetCardProps {
  preset: PipelinePreset;
  templateIcon?: ReactNode;
  complexityBadge?: ReactNode;
  complexityHint?: ReactNode;
  complexityIcon?: ReactNode;
  previewIcons?: Partial<Record<"step" | "model" | "branch" | "generator", ReactNode>>;
  labels?: Partial<Record<"template" | "ops" | "models" | "branches" | "variants", string>>;
  moreSteps?: (count: number) => ReactNode;
  renderVariant: (variant: PipelinePresetVariantId) => ReactNode;
}

/** Studio preset presentation, shared with the server-rendered repository catalogue. */
export function PipelinePresetCard({
  preset, templateIcon, complexityBadge, complexityHint, complexityIcon, previewIcons,
  labels = {}, moreSteps = (count) => `+${count} more steps`, renderVariant,
}: PipelinePresetCardProps) {
  const card = buildPresetCardModel(preset);
  const stats = [
    [labels.ops ?? "Ops", card.operatorCount],
    [labels.models ?? "Models", card.stats.models],
    [labels.branches ?? "Branches", card.stats.branches],
    [labels.variants ?? "Variants", card.variantCount],
  ] as const;
  return (
    <article className="n4-preset-card">
      <div className="n4-preset-header">
        <span className="n4-preset-template">{templateIcon}{labels.template ?? "Template"}</span>
        {complexityBadge ?? <span className={`n4-preset-complexity n4-preset-${card.complexityMeta.key}`}>
          {card.complexity}/10 <span>{card.complexityMeta.key}</span>
        </span>}
      </div>
      <h3 className="n4-preset-name" title={preset.name}>{preset.name}</h3>
      {preset.description && <p className="n4-preset-description">{preset.description}</p>}
      <div className="n4-preset-hint">{complexityHint ?? <>{complexityIcon}{PRESET_COMPLEXITY_HINTS[card.complexityMeta.key]}</>}</div>
      <dl className="n4-preset-stats">
        {stats.map(([label, value], index) => (
          <div key={label}>
            <dd className={index === 3 && card.stats.hasGenerators ? "n4-preset-emphasize" : undefined}>{value}</dd>
            <dt>{label}</dt>
          </div>
        ))}
      </dl>
      {card.preview.nodes.length > 0 && <ul className="n4-preset-preview">
        {card.preview.nodes.map((node) => <li key={node.id} style={{ paddingLeft: `${node.depth * 12}px` }}>
          {previewIcons?.[node.kind]}
          <span title={node.label}>{node.label}</span>
          {node.hasGenerator && previewIcons?.generator}
        </li>)}
        {card.preview.truncated && <li className="n4-preset-more">{moreSteps(card.preview.totalSteps - card.preview.nodes.length)}</li>}
      </ul>}
      <div className="n4-preset-actions">{card.variants.map((variant) => <div key={variant}>{renderVariant(variant)}</div>)}</div>
    </article>
  );
}

const PRESET_COMPLEXITY_HINTS = {
  starter: "Fast baseline",
  quick: "Compact screening",
  balanced: "Broader search",
  heavy: "Wide benchmark",
  exhaustive: "Long exploration",
};
