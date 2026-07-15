import { useMemo, useState } from "react";

import { round } from "../viz/geometry.js";
import { cx } from "./_cx.js";
import { nodeNeighbors } from "./analysis.js";
import { effectColor, effectTextColor, roleColor } from "./colors.js";
import type { ChainEffectAnalysis, ChainStepRole, NeighborLink } from "./types.js";
import { CHAIN_LENS_LABELS, CHAIN_ROLE_LABELS } from "./types.js";

export interface ChainNodeOrbitProps {
  analysis: ChainEffectAnalysis;
  /** Starting focus node; defaults to the highest-coverage node (the hub). */
  defaultFocusToken?: string;
  /** Neighbour roles to orbit. Default: every role present. */
  roles?: readonly ChainStepRole[];
  /** Keep the top-N neighbours by shared-chain count. Default `9`. */
  maxNeighbors?: number;
  /** Minimum shared chains for a neighbour wedge. Default `2`. */
  minCount?: number;
  size?: number;
  /** Notified whenever the focus changes (navigation). */
  onFocusChange?: (token: string) => void;
  title?: string;
  className?: string;
  roleColors?: Partial<Record<ChainStepRole, string>> | undefined;
}

const TAU = Math.PI * 2;

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(2);
}

function fmtDelta(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${fmt(Math.abs(value))}`;
}

function polar(cx0: number, cy0: number, r: number, angle: number): [number, number] {
  return [cx0 + r * Math.cos(angle), cy0 + r * Math.sin(angle)];
}

/** Donut segment path between two radii and two angles (clockwise). */
function annularSector(cx0: number, cy0: number, rInner: number, rOuter: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0o, y0o] = polar(cx0, cy0, rOuter, a0);
  const [x1o, y1o] = polar(cx0, cy0, rOuter, a1);
  const [x1i, y1i] = polar(cx0, cy0, rInner, a1);
  const [x0i, y0i] = polar(cx0, cy0, rInner, a0);
  return [
    `M${round(x0o)} ${round(y0o)}`,
    `A${round(rOuter)} ${round(rOuter)} 0 ${large} 1 ${round(x1o)} ${round(y1o)}`,
    `L${round(x1i)} ${round(y1i)}`,
    `A${round(rInner)} ${round(rInner)} 0 ${large} 0 ${round(x0i)} ${round(y0i)}`,
    "Z",
  ].join(" ");
}

/**
 * Radial node navigator — a foldable "orbit" view. A focus node sits at the
 * centre; every node that shares a chain with it orbits as a wedge, its arc
 * sized by the number of shared chains and colored by the goodness of those
 * shared chains (teal = better combo, amber = worse). Click a wedge to re-centre
 * on that node and unfold *its* neighbourhood; the breadcrumb walks back. Lets
 * you traverse the pipeline-node graph node by node. Local UI state only.
 */
export function ChainNodeOrbit({
  analysis,
  defaultFocusToken,
  roles,
  maxNeighbors = 9,
  minCount = 2,
  size = 460,
  onFocusChange,
  title = "Node orbit",
  className,
  roleColors,
}: ChainNodeOrbitProps) {
  const hub = defaultFocusToken ?? analysis.tokens[0]?.token ?? "";
  const [path, setPath] = useState<string[]>(hub ? [hub] : []);
  const focusToken = path[path.length - 1] ?? hub;

  const neighborhood = useMemo(
    () => (focusToken ? nodeNeighbors(analysis, focusToken, { roles, maxNeighbors, minCount }) : null),
    [analysis, focusToken, roles, maxNeighbors, minCount],
  );

  const navigate = (token: string) => {
    setPath((prev) => [...prev, token]);
    onFocusChange?.(token);
  };
  const jumpTo = (index: number) => {
    setPath((prev) => {
      const next = prev.slice(0, index + 1);
      onFocusChange?.(next[next.length - 1] ?? hub);
      return next;
    });
  };
  const back = () => {
    if (path.length > 1) jumpTo(path.length - 2);
  };

  if (!neighborhood) {
    return (
      <div className={cx("n4chains-orbit", className)} style={{ width: size }}>
        <div className="n4chains-empty">No node to orbit.</div>
      </div>
    );
  }

  const cx0 = size / 2;
  const cy0 = size / 2;
  const rCenter = Math.round(size * 0.11);
  const rInner = rCenter + 10;
  const rOuter = Math.round(size / 2 - 46);
  const halfRange =
    Math.max(
      Math.abs(neighborhood.goodnessExtent.max - neighborhood.baseline),
      Math.abs(neighborhood.baseline - neighborhood.goodnessExtent.min),
    ) || 1;

  const slices: Array<{ link: NeighborLink | null; weight: number }> = neighborhood.neighbors.map((link) => ({
    link,
    weight: link.count,
  }));
  if (neighborhood.otherCount > 0) slices.push({ link: null, weight: neighborhood.otherWeight });
  const total = slices.reduce((sum, slice) => sum + slice.weight, 0);
  const pad = slices.length > 1 ? 0.018 : 0;
  const available = TAU - pad * slices.length;

  let cursor = -Math.PI / 2 + pad / 2;
  const wedges = slices.map((slice, index) => {
    const sweep = total > 0 ? (slice.weight / total) * available : available / slices.length;
    const a0 = cursor;
    const a1 = cursor + sweep;
    cursor = a1 + pad;
    return { slice, a0, a1, mid: (a0 + a1) / 2, sweep, index };
  });

  return (
    <div className={cx("n4chains-orbit", className)} style={{ width: size }}>
      <header className="n4chains-orbit-head">
        <nav className="n4chains-orbit-crumbs" aria-label="Navigation path">
          {path.map((token, index) => {
            const ref = analysis.tokens.find((entry) => entry.token === token);
            const isLast = index === path.length - 1;
            return (
              <span key={`${token}-${index}`} className="n4chains-crumb-wrap">
                {index > 0 ? <span className="n4chains-crumb-sep">›</span> : null}
                <button
                  type="button"
                  className={cx("n4chains-crumb", isLast && "is-current")}
                  onClick={() => jumpTo(index)}
                  disabled={isLast}
                >
                  {ref?.label ?? token}
                </button>
              </span>
            );
          })}
        </nav>
        <span className="n4chains-orbit-caption">{CHAIN_LENS_LABELS[analysis.lens]}</span>
      </header>

      <svg
        className={cx("n4chains", "n4chains-orbit-svg")}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={title}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{`${neighborhood.label} — ${neighborhood.neighbors.length} connected nodes`}</title>

        {wedges.map(({ slice, a0, a1, mid, sweep, index }) => {
          const isOther = slice.link === null;
          const median = isOther ? neighborhood.baseline : slice.link!.stat.median;
          const fill = isOther ? "var(--n4-color-border, #e2e8f0)" : effectColor(median, neighborhood.baseline, halfRange);
          const [lx, ly] = polar(cx0, cy0, rOuter + 15, mid);
          const anchor = Math.cos(mid) > 0.2 ? "start" : Math.cos(mid) < -0.2 ? "end" : "middle";
          const [vx, vy] = polar(cx0, cy0, (rInner + rOuter) / 2, mid);
          const interactive = !isOther;
          return (
            <g
              key={isOther ? "others" : slice.link!.token}
              className={cx("n4chains-wedge", interactive && "is-interactive", isOther && "is-other")}
              data-role={isOther ? "other" : slice.link!.role}
              onClick={interactive ? () => navigate(slice.link!.token) : undefined}
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? "button" : undefined}
              onKeyDown={
                interactive
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(slice.link!.token);
                      }
                    }
                  : undefined
              }
            >
              {!isOther ? (
                <title>{`${neighborhood.label} + ${slice.link!.label} — median ${fmt(median)}, ${slice.link!.count} shared chains`}</title>
              ) : (
                <title>{`${neighborhood.otherCount} more connected nodes`}</title>
              )}
              <path className="n4chains-wedge-arc" d={annularSector(cx0, cy0, rInner, rOuter, a0, a1)} fill={fill} />
              {sweep > 0.34 && !isOther ? (
                <text
                  className="n4chains-wedge-value"
                  x={round(vx)}
                  y={round(vy + 3)}
                  textAnchor="middle"
                  fill={effectTextColor(median, neighborhood.baseline, halfRange)}
                >
                  {fmt(median)}
                </text>
              ) : null}
              <text
                className={cx("n4chains-wedge-label", isOther && "is-other")}
                x={round(lx)}
                y={round(ly + 3)}
                textAnchor={anchor}
              >
                {isOther ? `+${neighborhood.otherCount}` : slice.link!.label}
              </text>
              {!isOther ? (
                <circle
                  className="n4chains-wedge-dot"
                  cx={round(anchor === "start" ? lx - 8 : anchor === "end" ? lx + 8 : lx)}
                  cy={round(anchor === "middle" ? ly - 10 : ly)}
                  r={3}
                  fill={roleColor(slice.link!.role, roleColors)}
                />
              ) : null}
            </g>
          );
        })}

        <circle
          className={cx("n4chains-orbit-center", path.length > 1 && "is-interactive")}
          cx={cx0}
          cy={cy0}
          r={rCenter}
          fill={effectColor(neighborhood.self.median, neighborhood.baseline, halfRange)}
          onClick={path.length > 1 ? back : undefined}
          tabIndex={path.length > 1 ? 0 : undefined}
          role={path.length > 1 ? "button" : undefined}
        >
          <title>{path.length > 1 ? "Back to previous node" : neighborhood.label}</title>
        </circle>
        <text
          className="n4chains-center-label"
          x={cx0}
          y={cy0 - 2}
          textAnchor="middle"
          fill={effectTextColor(neighborhood.self.median, neighborhood.baseline, halfRange)}
        >
          {neighborhood.label}
        </text>
        <text
          className="n4chains-center-value"
          x={cx0}
          y={cy0 + 12}
          textAnchor="middle"
          fill={effectTextColor(neighborhood.self.median, neighborhood.baseline, halfRange)}
        >
          {fmt(neighborhood.self.median)}
        </text>
      </svg>

      <footer className="n4chains-orbit-foot">
        <span className="n4chains-orbit-role">
          <span className="n4chains-chip-dom" style={{ background: roleColor(neighborhood.role, roleColors) }} />
          {CHAIN_ROLE_LABELS[neighborhood.role]}
        </span>
        <span className="n4chains-orbit-legend" aria-hidden="true">
          <span style={{ color: "#0f766e" }}>better</span>
          <span className="n4chains-orbit-ramp" />
          <span style={{ color: "#b45309" }}>worse</span>
        </span>
        <span className="n4chains-orbit-note">wedge = shared chains</span>
      </footer>
    </div>
  );
}
