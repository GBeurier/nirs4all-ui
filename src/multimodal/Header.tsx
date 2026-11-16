import type { ReactNode } from "react";
import { MULTIMODAL_CASES } from "./catalog.js";
import type { MultimodalCaseId, MultimodalCaseInfo, MultimodalRuntimeStatus } from "./types.js";

export interface MultimodalHeaderProps {
  brand?: ReactNode;
  backHref: string;
  backLabel?: string;
  runtime: MultimodalRuntimeStatus;
}

const RUNTIME_TONE: Readonly<Record<MultimodalRuntimeStatus["state"], string>> = {
  loading: "warning",
  ready: "success",
  unavailable: "danger",
};

/** Laboratory header: host brand, title, back link, runtime readiness, local-data statement. */
export function MultimodalHeader({ brand, backHref, backLabel = "nirs4all Web workbench", runtime }: MultimodalHeaderProps) {
  return (
    <header className="n4mm-header">
      <div className="n4mm-header__brand">
        {brand}
        <div>
          <p className="n4mm-header__eyebrow">nirs4all Web · teaching laboratory</p>
          <h1 className="n4mm-header__title">Multisource and multimodal fusion</h1>
        </div>
      </div>
      <div className="n4mm-header__status">
        <a className="n4mm-header__back" href={backHref}>
          <span aria-hidden="true">←</span> {backLabel}
        </a>
        <span
          className="n4mm-pill"
          data-tone={RUNTIME_TONE[runtime.state]}
          role="status"
          title={runtime.detail}
        >
          <span className="n4mm-pill__dot" aria-hidden="true" />
          {runtime.label}
        </span>
        <span className="n4mm-pill" data-tone="local">
          Local only · data never leaves this browser
        </span>
      </div>
      <div className="n4mm-header__strip n4-spectrum-strip" aria-hidden="true" />
    </header>
  );
}

export interface CaseSelectorProps {
  caseId: MultimodalCaseId;
  cases?: readonly MultimodalCaseInfo[];
  onCaseChange: (caseId: MultimodalCaseId) => void;
  disabled?: boolean;
}

/** Three teaching cases as a labelled radio group with each case's goal. */
export function CaseSelector({ caseId, cases = MULTIMODAL_CASES, onCaseChange, disabled }: CaseSelectorProps) {
  return (
    <fieldset className="n4mm-cases" disabled={disabled}>
      <legend className="n4mm-sr-only">Teaching case</legend>
      {cases.map((info, index) => {
        const checked = info.id === caseId;
        return (
          <label key={info.id} className="n4mm-case" data-checked={checked || undefined}>
            <input
              type="radio"
              name="n4mm-case"
              value={info.id}
              checked={checked}
              onChange={() => onCaseChange(info.id)}
            />
            <span className="n4mm-case__index" aria-hidden="true">
              {index + 1}
            </span>
            <span className="n4mm-case__body">
              <span className="n4mm-case__title">{info.title}</span>
              <span className="n4mm-case__modalities">{info.modalities}</span>
              <span className="n4mm-case__goal">{info.goal}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export interface SectionProps {
  id: string;
  step: number;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/** Numbered workbench section with heading and a short lead. */
export function Section({ id, step, title, lead, actions, children }: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section className="n4mm-section" id={id} aria-labelledby={headingId}>
      <div className="n4mm-section__head">
        <h2 className="n4mm-section__title" id={headingId}>
          <span className="n4mm-section__step" aria-hidden="true">
            {step}
          </span>
          {title}
        </h2>
        {actions ? <div className="n4mm-section__actions">{actions}</div> : null}
      </div>
      {lead ? <p className="n4mm-section__lead">{lead}</p> : null}
      {children}
    </section>
  );
}
