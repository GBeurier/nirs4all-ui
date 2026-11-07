// SPDX-License-Identifier: CeCILL-2.1 OR AGPL-3.0-or-later
//
// Controlled, presentational list of owner (IO) dataset proposals. The host keeps the
// original owner proposal objects and every value; this component only shows the
// host-projected labels and reports opaque ids back. It never sorts, ranks, filters,
// thresholds or interprets scores, statuses or value labels.
import type { ChangeEvent } from "react";

import { cx } from "./_cx.js";

/** One alternative choice offered by the owner for a proposal. */
export interface OwnerProposalAlternative {
  /** Opaque host key, unique within its proposal; returned unchanged to `onAlternative`. */
  choiceId: string;
  label: string;
  /** Uncalibrated owner score; a missing score is shown as a dash, never as 0. */
  score?: number | null;
  /** Host-supplied presentation class for the score (no thresholds are derived here). */
  scoreClassName?: string;
}

/** One host-supplied override choice; `value` is returned to `onOverride` unchanged. */
export interface OwnerProposalOverrideChoice {
  choiceId: string;
  label: string;
  value: unknown;
}

/** Host projection of one owner proposal. */
export interface OwnerProposalDisplay {
  id: string;
  kind: string;
  target: string;
  valueLabel: string;
  kindLabel?: string;
  targetLabel?: string;
  evidence?: readonly string[];
  /** Uncalibrated owner score; a missing score is shown as a dash, never as 0. */
  score?: number | null;
  scoreClassName?: string;
  ambiguous?: boolean;
  /** Owner status text, shown verbatim. */
  status?: string | null;
  alternatives?: readonly OwnerProposalAlternative[];
  overrideChoices?: readonly OwnerProposalOverrideChoice[];
  confirmedLabel?: string | null;
  error?: string | null;
  /** Defaults to true when `onConfirm` is supplied. */
  canConfirm?: boolean;
  /** Defaults to false; the host sets it from its own confirmed state. */
  canUndo?: boolean;
}

export interface OwnerProposalListProps {
  /** Rendered in the supplied order, including kinds the host does not know. */
  proposals: readonly OwnerProposalDisplay[];
  title?: string;
  className?: string;
  /** Disables every action while the host runs an owner cycle. */
  busy?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onConfirm?: (id: string) => void;
  onAlternative?: (id: string, choiceId: string) => void;
  onOverride?: (id: string, value: unknown) => void;
  onUndo?: (kind: string, target: string) => void;
}

const MISSING = "—";

/** Display text for an uncalibrated score: two decimals, or a dash when absent. */
function formatOwnerProposalScore(score: number | null | undefined): string {
  return typeof score === "number" && Number.isFinite(score) ? score.toFixed(2) : MISSING;
}

function ScoreText({ score, className }: { score: number | null | undefined; className: string | undefined }) {
  const text = formatOwnerProposalScore(score);
  return (
    <span
      className={cx("n4ui-proposal-score", className)}
      data-missing={text === MISSING || undefined}
      title={text === MISSING ? "No score supplied" : `Uncalibrated score ${String(score)}`}
    >
      <span className="n4ui-proposal-score-label">Score (uncalibrated)</span> {text}
    </span>
  );
}

/**
 * Controlled owner proposal list. Actions appear only when their callback is supplied
 * and are disabled while `busy`. Alternatives report the opaque `choiceId`; overrides
 * report the exact host `choice.value`.
 */
export function OwnerProposalList({
  proposals,
  title,
  className,
  busy = false,
  error,
  emptyMessage = "No proposals.",
  onConfirm,
  onAlternative,
  onOverride,
  onUndo,
}: OwnerProposalListProps) {
  return (
    <section className={cx("n4ui-proposals", className)} aria-busy={busy || undefined}>
      {title ? <h3 className="n4ui-proposals-title">{title}</h3> : null}
      {error ? <p className="n4ui-proposals-error" role="alert">{error}</p> : null}
      {proposals.length === 0 ? (
        <p className="n4ui-proposals-empty">{emptyMessage}</p>
      ) : (
        <ol className="n4ui-proposals-list">
          {proposals.map((proposal) => {
            const kindText = proposal.kindLabel ?? proposal.kind;
            const targetText = proposal.targetLabel ?? proposal.target;
            const alternatives = proposal.alternatives ?? [];
            const overrides = proposal.overrideChoices ?? [];
            const evidence = proposal.evidence ?? [];
            const showConfirm = onConfirm !== undefined && proposal.canConfirm !== false;
            const showUndo = onUndo !== undefined && proposal.canUndo === true;
            const showOverride = onOverride !== undefined && overrides.length > 0;
            const onOverrideChange = (event: ChangeEvent<HTMLSelectElement>) => {
              const choice = overrides.find((c) => c.choiceId === event.target.value);
              if (choice && !busy) onOverride?.(proposal.id, choice.value);
            };
            return (
              <li
                key={proposal.id}
                className="n4ui-proposal"
                data-kind={proposal.kind}
                data-ambiguous={proposal.ambiguous || undefined}
                data-error={proposal.error ? true : undefined}
              >
                <div className="n4ui-proposal-head">
                  <span className="n4ui-proposal-kind">{kindText}</span>
                  <span className="n4ui-proposal-target">{targetText}</span>
                </div>
                <div className="n4ui-proposal-body">
                  <strong className="n4ui-proposal-value">{proposal.valueLabel}</strong>
                  <ScoreText score={proposal.score} className={proposal.scoreClassName} />
                  {proposal.ambiguous ? <span className="n4ui-proposal-flag">Ambiguous</span> : null}
                  {proposal.status ? <span className="n4ui-proposal-status">Status: {proposal.status}</span> : null}
                  {proposal.confirmedLabel ? (
                    <span className="n4ui-proposal-confirmed">Confirmed: {proposal.confirmedLabel}</span>
                  ) : null}
                </div>
                {evidence.length > 0 ? (
                  <ul className="n4ui-proposal-evidence" aria-label="Evidence">
                    {evidence.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                ) : null}
                {proposal.error ? <p className="n4ui-proposal-error">{proposal.error}</p> : null}
                {alternatives.length > 0 ? (
                  <div className="n4ui-proposal-alternatives">
                    <span className="n4ui-proposal-section-label">Alternatives</span>
                    <ul>
                      {alternatives.map((alt) => (
                        <li key={alt.choiceId}>
                          {onAlternative ? (
                            <button
                              type="button"
                              className="n4ui-proposal-alternative"
                              disabled={busy}
                              aria-label={`Use alternative ${alt.label} for ${kindText} ${targetText}`}
                              onClick={() => onAlternative(proposal.id, alt.choiceId)}
                            >
                              {alt.label}
                            </button>
                          ) : (
                            <span className="n4ui-proposal-alternative">{alt.label}</span>
                          )}{" "}
                          <ScoreText score={alt.score} className={alt.scoreClassName} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {showConfirm || showUndo || showOverride ? (
                  <div className="n4ui-proposal-actions">
                    {showConfirm ? (
                      <button
                        type="button"
                        className="n4ui-proposal-confirm"
                        disabled={busy}
                        aria-label={`Confirm ${kindText} ${targetText}`}
                        onClick={() => onConfirm?.(proposal.id)}
                      >
                        Confirm
                      </button>
                    ) : null}
                    {showOverride ? (
                      <label className="n4ui-proposal-override">
                        <span>Override</span>
                        <select value="" disabled={busy} onChange={onOverrideChange}>
                          <option value="">Choose a value</option>
                          {overrides.map((choice) => (
                            <option key={choice.choiceId} value={choice.choiceId}>{choice.label}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {showUndo ? (
                      <button
                        type="button"
                        className="n4ui-proposal-undo"
                        disabled={busy}
                        aria-label={`Undo ${kindText} ${targetText}`}
                        onClick={() => onUndo?.(proposal.kind, proposal.target)}
                      >
                        Undo
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
