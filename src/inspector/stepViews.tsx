/**
 * Step-level views of the Inspector, built on the `chains` domain: the node
 * influence forest with the focused step's with / without distribution and
 * best contexts, the orbit / hub flow navigator, and the position × order
 * matrices. They share one focused step and feed the chain selection.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { positionMatrix, sequenceMatrix, tokenContexts } from "../chains/analysis.js";
import { ChainNodeHub } from "../chains/ChainNodeHub.js";
import { ChainNodeOrbit } from "../chains/ChainNodeOrbit.js";
import { ChainScoreBeeswarm } from "../chains/ChainScoreBeeswarm.js";
import { effectColor, roleColor } from "../chains/colors.js";
import { NodeEffectForest, type ForestSort } from "../chains/NodeEffectForest.js";
import { PositionEffectHeatmap } from "../chains/PositionEffectHeatmap.js";
import { SequenceEffectHeatmap } from "../chains/SequenceEffectHeatmap.js";
import type { ChainEffectAnalysis, ContextRow, PositionMode } from "../chains/types.js";
import { CHAIN_ROLE_LABELS } from "../chains/types.js";
import { cx } from "../workbench/_cx.js";
import { Button } from "../workbench/controls.js";
import { formatPercent, formatSigned, formatValue } from "../workbench/format.js";
import { useElementSize } from "../workbench/hooks.js";
import type { InspectorViewContext } from "./views.js";

/** The focused step, falling back to the strongest one. */
export function resolveFocus(analysis: ChainEffectAnalysis | null, token: string | null): string | null {
  if (!analysis) return null;
  if (token && analysis.tokens.some((t) => t.token === token)) return token;
  return analysis.tokens[0]?.token ?? null;
}

function SelectWithButton({ ctx, token, label }: { ctx: InspectorViewContext; token: string; label: string }) {
  const rows = useMemo(() => ctx.chains.flatMap((chain, row) => (chain.steps.some((s) => s.token === token) ? [row] : [])), [ctx.chains, token]);
  return (
    <Button variant="outline" disabled={rows.length === 0} onClick={() => ctx.setSelected(rows)}>
      {ctx.strings.selectWith(label, rows.length)}
    </Button>
  );
}

function Contexts({ rows, verb, analysis, empty }: { rows: readonly ContextRow[]; verb: string; analysis: ChainEffectAnalysis; empty: string }) {
  if (rows.length === 0) return <p className="n4chains-ctx-empty">{empty}</p>;
  const { min, max } = analysis.goodnessExtent;
  const half = Math.max(Math.abs(max - analysis.baseline), Math.abs(analysis.baseline - min)) || 1;
  return (
    <ul className="n4chains-ctx-list">
      {rows.slice(0, 5).map((row) => (
        <li key={row.token} className="n4chains-ctx-row">
          <span className="n4chains-ctx-name">
            <span className="n4chains-chip-dom" style={{ background: roleColor(row.role) }} />
            {verb} {row.label}
          </span>
          <span className="n4chains-ctx-bar">
            <span className="n4chains-ctx-fill" style={{ width: `${(((row.stat.median - min) / (max - min || 1)) * 100).toFixed(1)}%`, background: effectColor(row.stat.median, analysis.baseline, half) }} />
          </span>
          <span className={cx("n4chains-ctx-delta", row.delta >= 0 ? "is-up" : "is-down")}>{formatSigned(row.delta, 2)}</span>
          <span className="n4chains-ctx-n">n={row.stat.n}</span>
        </li>
      ))}
    </ul>
  );
}

export function StepEffectsBody({ ctx, sortBy }: { ctx: InspectorViewContext; sortBy: ForestSort }) {
  const [boxRef, size] = useElementSize<HTMLDivElement>({ width: 820, height: 520 });
  const analysis = ctx.stepAnalysis;
  const focus = resolveFocus(analysis, ctx.focusToken);
  const contexts = useMemo(() => (analysis && focus ? tokenContexts(analysis, focus, { minCount: 3 }) : null), [analysis, focus]);
  if (!analysis || !focus) return null;
  const effect = analysis.tokens.find((t) => t.token === focus)!;
  const wide = size.width >= 760;
  const forestWidth = Math.max(300, Math.round(wide ? size.width * 0.5 : size.width - 16));
  const detailWidth = Math.max(300, Math.round(wide ? size.width - forestWidth - 36 : size.width - 16));
  return (
    <div className="n4ins-stepview" ref={boxRef}>
      <div className={cx("n4ins-effects", wide && "is-wide")}>
        <div className="n4ins-effects-forest">
          <NodeEffectForest analysis={analysis} sortBy={sortBy} maxRows={28} selectedToken={focus} onSelectToken={ctx.setFocusToken} width={forestWidth} hideTitle />
        </div>
        <div className="n4ins-effects-detail">
          <div className="n4ins-focus-head">
            <span className="n4chains-chip-dom" style={{ background: roleColor(effect.role) }} />
            <strong>{effect.label}</strong>
            <span className="n4wb-muted">{CHAIN_ROLE_LABELS[effect.role]}</span>
            <span className={cx("n4ins-focus-delta", effect.delta >= 0 ? "is-up" : "is-down")}>Δ {formatSigned(effect.delta, 2)}</span>
            <span className="n4wb-muted">{formatPercent(effect.coverage, 0)} · n={effect.n}</span>
          </div>
          <ChainScoreBeeswarm analysis={analysis} focusToken={focus} width={detailWidth} height={176} maxPoints={600} title="" />
          <div className="n4ins-contexts">
            <div>
              <span className="n4chains-ctx-title">{ctx.strings.bestAfter}</span>
              {contexts ? <Contexts rows={contexts.predecessors} verb="↳" analysis={analysis} empty={ctx.strings.notEnough} /> : null}
            </div>
            <div>
              <span className="n4chains-ctx-title">{ctx.strings.bestBefore}</span>
              {contexts ? <Contexts rows={contexts.successors} verb="→" analysis={analysis} empty={ctx.strings.notEnough} /> : null}
            </div>
          </div>
          <SelectWithButton ctx={ctx} token={focus} label={effect.label} />
        </div>
      </div>
    </div>
  );
}

export function StepFlowBody({ ctx, style, depth }: { ctx: InspectorViewContext; style: "orbit" | "hub"; depth: number }) {
  const [boxRef, size] = useElementSize<HTMLDivElement>({ width: 520, height: 520 });
  const analysis = ctx.stepAnalysis;
  const focus = resolveFocus(analysis, ctx.focusToken);
  // Re-root the navigator only when the focus changes from outside it.
  const internal = useRef<string | null>(null);
  const [root, setRoot] = useState(focus);
  useEffect(() => {
    if (focus && focus !== internal.current) setRoot(focus);
  }, [focus]);
  if (!analysis || !root) return null;
  const side = Math.max(280, Math.min(size.width - 24, size.height - 86, 720));
  const props = {
    analysis,
    defaultFocusToken: root,
    depth,
    size: side,
    onFocusChange: (token: string) => {
      internal.current = token;
      ctx.setFocusToken(token);
    },
  };
  const label = analysis.tokens.find((t) => t.token === focus)?.label ?? focus ?? "";
  return (
    <div className="n4ins-stepview n4ins-flow" ref={boxRef}>
      {style === "orbit" ? <ChainNodeOrbit key={`orbit:${root}:${depth}`} {...props} /> : <ChainNodeHub key={`hub:${root}:${depth}`} {...props} />}
      {focus ? (
        <div className="n4ins-flow-actions">
          <SelectWithButton ctx={ctx} token={focus} label={label} />
        </div>
      ) : null}
    </div>
  );
}

export function StepOrderBody({ ctx, mode, adjacentOnly }: { ctx: InspectorViewContext; mode: PositionMode; adjacentOnly: boolean }) {
  const [boxRef, size] = useElementSize<HTMLDivElement>({ width: 820, height: 480 });
  const analysis = ctx.stepAnalysis;
  const focus = resolveFocus(analysis, ctx.focusToken);
  const position = useMemo(() => (analysis ? positionMatrix(analysis, { mode, minCount: 3 }) : null), [analysis, mode]);
  const sequence = useMemo(() => (analysis ? sequenceMatrix(analysis, { minCount: 3, maxTokens: 8, adjacentOnly }) : null), [analysis, adjacentOnly]);
  if (!analysis || !position || !sequence) return null;
  const wide = size.width >= 760;
  const width = Math.max(300, Math.round(wide ? (size.width - 40) / 2 : size.width - 16));
  return (
    <div className="n4ins-stepview" ref={boxRef}>
      <div className={cx("n4ins-order", wide && "is-wide")}>
        <section>
          <h5 className="n4ins-sub">{ctx.strings.effectByPosition}</h5>
          {position.rows.length ? <PositionEffectHeatmap matrix={position} width={width} selectedToken={focus} onSelectToken={ctx.setFocusToken} hideTitle /> : <p className="n4wb-muted">{ctx.strings.notEnough}</p>}
        </section>
        <section>
          <h5 className="n4ins-sub">{ctx.strings.effectByOrder}</h5>
          {sequence.tokens.length >= 2 ? <SequenceEffectHeatmap matrix={sequence} width={width} hideTitle /> : <p className="n4wb-muted">{ctx.strings.notEnough}</p>}
        </section>
      </div>
      <p className="n4wb-muted n4ins-footnote">
        {analysis.metric.label} · {analysis.total} {ctx.strings.chains.toLowerCase()}
      </p>
    </div>
  );
}
