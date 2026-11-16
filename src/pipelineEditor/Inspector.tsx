/**
 * The device strip: parameters and actions of the selected step, group or lane.
 * Stateless apart from text drafts; every change is an `EditResult` handed back
 * to the editor shell.
 */

import { useEffect, useState, type ReactNode } from "react";

import { cx } from "./_cx.js";
import {
  DraftField,
  IconButton,
  INVALID,
  controlKind,
  inferParameter,
  parseJson,
  parseLoose,
  parseNumber,
  parseValueList,
  valueListText,
  valueText,
} from "./controls.js";
import {
  addLane,
  dissolveFork,
  duplicateItem,
  moveLane,
  nudgeItem,
  removeItem,
  removeLane,
  renameLane,
  replaceItemValue,
  setBypassed,
  setModifier,
  setParam,
  setStepName,
  setSweep,
  setTuning,
  setTuningOption,
  wrapItem,
  type SweepDraft,
} from "./edit.js";
import { CHAIN_GROUP_COLORS, CHAIN_ROLE_COLORS, ChainGlyph, type ChainGlyphKind } from "./glyphs.js";
import { getAt, isRecord } from "./json.js";
import type { PipelineChainLabels } from "./locale.js";
import { stepLines } from "./ChainCanvas.js";
import { formatCount, formatNumber, formatValue, itemVariants } from "./summary.js";
import type {
  ChainItem,
  ChainModel,
  EditResult,
  ForkNode,
  FrameNode,
  LaneNode,
  PipelineCatalog,
  PipelineChainDocument,
  PipelineOperatorParameter,
  StepNode,
  SweepView,
  TunedParamView,
} from "./types.js";

export interface InspectorContext {
  document: PipelineChainDocument;
  model: ChainModel;
  catalog: PipelineCatalog;
  labels: PipelineChainLabels;
  readOnly: boolean;
  commit: (result: EditResult) => void;
  /** Open the operator browser to add after the given item or into a lane. */
  requestAdd: (target: { kind: "after"; id: string } | { kind: "lane"; id: string } | { kind: "newLane"; fork: string }) => void;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function JsonEditor({ value, onApply, labels, readOnly }: { value: unknown; onApply: (next: unknown) => void; labels: PipelineChainLabels; readOnly: boolean }) {
  const text = JSON.stringify(value, null, 2) ?? "null";
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const parsed = parseJson(draft);
  const invalid = parsed === INVALID;
  return (
    <div className="n4rack__json">
      <textarea
        className="n4rack__json-text"
        aria-label={labels.json}
        aria-invalid={invalid || undefined}
        value={draft}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(event) => setDraft(event.currentTarget.value)}
      />
      <div className="n4rack__json-actions">
        <button type="button" className="n4rack__btn n4rack__btn--text n4rack__btn--primary" disabled={readOnly || invalid || draft === text} onClick={() => onApply(parsed)}>
          {labels.apply}
        </button>
        <button type="button" className="n4rack__btn n4rack__btn--text" disabled={draft === text} onClick={() => setDraft(text)}>
          {labels.revert}
        </button>
        {invalid ? <span className="n4rack__error" role="alert">{labels.invalidJson}</span> : null}
      </div>
    </div>
  );
}

function Identity({ glyph, color, title, subtitle, note, children }: { glyph: ChainGlyphKind; color: string; title: string; subtitle?: string | null; note?: ReactNode; children?: ReactNode }) {
  return (
    <div className="n4rack__identity" style={{ ["--n4rack-accent" as string]: color }}>
      <div className="n4rack__identity-title">
        <span className="n4rack__identity-glyph"><ChainGlyph kind={glyph} size={16} /></span>
        <strong>{title}</strong>
      </div>
      {subtitle ? <code className="n4rack__identity-path" title={subtitle}>{subtitle}</code> : null}
      {note ? <p className="n4rack__identity-note">{note}</p> : null}
      {children}
    </div>
  );
}

function ItemActions({ ctx, item, jsonOpen, onToggleJson, extra }: { ctx: InspectorContext; item: ChainItem; jsonOpen: boolean; onToggleJson: () => void; extra?: ReactNode }) {
  const { document, labels, commit, readOnly } = ctx;
  const lane = ctx.model.lanes.get(ctx.model.chains.get(item.chain)?.owner ?? "");
  const bypassed = item.bypassed || (lane?.bypassed ?? false);
  return (
    <div className="n4rack__actions" role="toolbar" aria-label={labels.role[item.kind === "step" ? item.role : "operator"]}>
      <button
        type="button"
        className="n4rack__power"
        aria-pressed={!bypassed}
        disabled={readOnly}
        onClick={() => commit(setBypassed(document, { kind: "item", id: item.id }, !bypassed))}
      >
        <span className="n4rack__power-led" aria-hidden="true" />
        {bypassed ? labels.bypassed : labels.active}
      </button>
      <span className="n4rack__actions-group">
        <IconButton icon="left" label={labels.moveLeft} disabled={readOnly} onClick={() => commit(nudgeItem(document, item.id, -1))} />
        <IconButton icon="right" label={labels.moveRight} disabled={readOnly} onClick={() => commit(nudgeItem(document, item.id, 1))} />
        <IconButton icon="copy" label={labels.duplicate} disabled={readOnly} onClick={() => commit(duplicateItem(document, item.id))} />
        <IconButton icon="plus" label={labels.addStep} disabled={readOnly} onClick={() => ctx.requestAdd({ kind: "after", id: item.id })} />
      </span>
      <span className="n4rack__actions-group">
        {extra}
        <IconButton icon="code" label={labels.json} pressed={jsonOpen} onClick={onToggleJson} />
        <IconButton icon="trash" label={labels.remove} tone="danger" disabled={readOnly} onClick={() => commit(removeItem(document, item.id))} />
      </span>
    </div>
  );
}

function WrapButtons({ ctx, item }: { ctx: InspectorContext; item: ChainItem }) {
  const { document, labels, commit, readOnly } = ctx;
  return (
    <div className="n4rack__wrap-actions">
      <button type="button" className="n4rack__btn n4rack__btn--text" disabled={readOnly} onClick={() => commit(wrapItem(document, item.id, "branch"))}>
        <ChainGlyph kind="branch" />
        {labels.wrapBranch}
      </button>
      <button type="button" className="n4rack__btn n4rack__btn--text" disabled={readOnly} onClick={() => commit(wrapItem(document, item.id, "choice"))}>
        <ChainGlyph kind="choice" />
        {labels.wrapChoice}
      </button>
    </div>
  );
}

function Tile({ title, tag, mode, head, children, wide }: { title: string; tag?: string | undefined; mode?: string; head?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cx("n4rack__tile", wide ? "n4rack__tile--wide" : undefined)} data-mode={mode} role="group" aria-label={title}>
      <div className="n4rack__tile-head">
        <span className="n4rack__tile-title" title={title}>{title}</span>
        {tag ? <span className="n4rack__tile-tag">{tag}</span> : null}
        {head}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step parameters
// ---------------------------------------------------------------------------

function numericSeed(param: PipelineOperatorParameter, value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof param.default === "number") return param.default;
  return param.min ?? 1;
}

function seedSweep(param: PipelineOperatorParameter, value: unknown): SweepDraft {
  const kind = controlKind(param, value);
  if (kind === "int") {
    const from = numericSeed(param, value);
    const step = param.step ?? 1;
    return { kind: "range", from, to: from + 4 * step, step };
  }
  if (kind === "bool") return { kind: "values", values: [true, false] };
  if (kind === "select") return { kind: "values", values: (param.options ?? []).map((option) => option.value) };
  const seed = value ?? param.default;
  return { kind: "values", values: seed === undefined ? [] : [seed] };
}

function seedTuning(param: PipelineOperatorParameter, value: unknown): unknown {
  const kind = controlKind(param, value);
  if (kind === "int" || kind === "float") {
    const base = numericSeed(param, value);
    return [kind, param.min ?? base, param.max ?? base];
  }
  if (kind === "bool") return ["categorical", [true, false]];
  if (kind === "select") return ["categorical", (param.options ?? []).map((option) => option.value)];
  const seed = value ?? param.default;
  return ["categorical", seed === undefined ? [] : [seed]];
}

function sweepTriple(sweep: SweepView): [number, number, number] {
  const spec = sweep.spec;
  const fallback = sweep.kind === "log_range" ? 5 : 1;
  if (Array.isArray(spec)) return [Number(spec[0] ?? 0), Number(spec[1] ?? 0), Number(spec[2] ?? fallback)];
  if (isRecord(spec)) return [Number(spec.from ?? 0), Number(spec.to ?? 0), Number(spec[sweep.kind === "log_range" ? "num" : "step"] ?? fallback)];
  return [0, 0, fallback];
}

function sweepFixedValue(sweep: SweepView): unknown {
  if (sweep.kind === "values" && Array.isArray(sweep.spec)) return sweep.spec[0];
  if (sweep.kind === "range" || sweep.kind === "log_range") return sweepTriple(sweep)[0];
  return undefined;
}

function FixedControl({ ctx, step, param, value }: { ctx: InspectorContext; step: StepNode; param: PipelineOperatorParameter; value: unknown }) {
  const { document, labels, commit, readOnly } = ctx;
  const kind = controlKind(param, value);
  const label = param.label ?? param.name;
  const set = (next: unknown) => commit(setParam(document, step.id, param.name, next));
  const placeholder = param.default !== undefined ? `${labels.defaultValue} ${formatValue(param.default, 14)}` : labels.unset;
  if (kind === "bool" || kind === "select") {
    const options = kind === "bool" ? [{ value: true, label: "true" }, { value: false, label: "false" }] : param.options ?? [];
    const index = options.findIndex((option) => option.value === value);
    return (
      <select
        className="n4rack__input"
        aria-label={label}
        value={index}
        disabled={readOnly}
        onChange={(event) => {
          const next = options[Number(event.currentTarget.value)];
          set(next ? next.value : undefined);
        }}
      >
        <option value={-1}>{placeholder}</option>
        {options.map((option, optionIndex) => (
          <option key={String(option.value)} value={optionIndex}>{option.label}</option>
        ))}
      </select>
    );
  }
  const parse = (draft: string): unknown => {
    if (draft.trim() === "") return undefined;
    if (kind === "int" || kind === "float") return parseNumber(draft, kind === "int");
    if (kind === "string") return draft;
    return parseJson(draft);
  };
  return (
    <DraftField
      text={valueText(value)}
      parse={parse}
      onCommit={set}
      label={label}
      placeholder={placeholder}
      inputMode={kind === "int" ? "numeric" : kind === "float" ? "decimal" : "text"}
      disabled={readOnly}
    />
  );
}

function SweepControl({ ctx, step, param, sweep }: { ctx: InspectorContext; step: StepNode; param: PipelineOperatorParameter; sweep: SweepView }) {
  const { document, labels, commit, readOnly } = ctx;
  const write = (draft: SweepDraft) => commit(setSweep(document, step.id, param.name, draft));
  if (sweep.kind !== "values" && sweep.kind !== "range" && sweep.kind !== "log_range") {
    return <p className="n4rack__tile-text">{sweep.text}</p>;
  }
  const [from, to, third] = sweepTriple(sweep);
  const values = Array.isArray(sweep.spec) ? sweep.spec : [];
  const changeKind = (kind: string) => {
    if (kind === sweep.kind) return;
    const numbers = values.filter((item): item is number => typeof item === "number");
    const low = sweep.kind === "values" ? (numbers.length ? Math.min(...numbers) : 1) : from;
    const high = sweep.kind === "values" ? (numbers.length ? Math.max(...numbers) : low) : to;
    if (kind === "values") write({ kind: "values", values: [low, high] });
    else if (kind === "range") write({ kind: "range", from: low, to: high, step: param.step ?? 1 });
    else write({ kind: "log_range", from: low, to: high, num: 5 });
  };
  const number = (draft: string) => parseNumber(draft, false);
  return (
    <>
      <select className="n4rack__input n4rack__input--kind" aria-label={labels.sweep} value={sweep.kind} disabled={readOnly} onChange={(event) => changeKind(event.currentTarget.value)}>
        <option value="values">{labels.values}</option>
        <option value="range">{labels.range}</option>
        <option value="log_range">{labels.logRange}</option>
      </select>
      {sweep.kind === "values" ? (
        <DraftField text={valueListText(values)} parse={parseValueList} onCommit={(next) => write({ kind: "values", values: next as unknown[] })} label={`${param.name} ${labels.values}`} disabled={readOnly} />
      ) : (
        <div className="n4rack__triple">
          <DraftField caption={labels.from} text={formatNumber(from)} parse={number} label={`${param.name} ${labels.from}`} disabled={readOnly}
            onCommit={(next) => write(sweep.kind === "range" ? { kind: "range", from: next as number, to, step: third } : { kind: "log_range", from: next as number, to, num: third })} />
          <DraftField caption={labels.to} text={formatNumber(to)} parse={number} label={`${param.name} ${labels.to}`} disabled={readOnly}
            onCommit={(next) => write(sweep.kind === "range" ? { kind: "range", from, to: next as number, step: third } : { kind: "log_range", from, to: next as number, num: third })} />
          <DraftField caption={sweep.kind === "range" ? labels.step : labels.points} text={formatNumber(third)} parse={number} label={`${param.name} ${sweep.kind === "range" ? labels.step : labels.points}`} disabled={readOnly}
            onCommit={(next) => write(sweep.kind === "range" ? { kind: "range", from, to, step: next as number } : { kind: "log_range", from, to, num: next as number })} />
        </div>
      )}
      <p className="n4rack__tile-foot">{sweep.count === null ? sweep.text : `${formatCount(sweep.count)} ${labels.values.toLowerCase()}`}</p>
    </>
  );
}

const TUNE_TYPES = ["int", "float", "log_float", "categorical"] as const;

function TuneControl({ ctx, step, param, tuned }: { ctx: InspectorContext; step: StepNode; param: PipelineOperatorParameter; tuned: TunedParamView }) {
  const { document, labels, commit, readOnly } = ctx;
  const write = (spec: unknown) => commit(setTuning(document, step.id, param.name, spec));
  if (tuned.type === "raw") return <p className="n4rack__tile-text">{tuned.text}</p>;
  const low = tuned.low ?? numericSeed(param, undefined);
  const high = tuned.high ?? low;
  const choices = tuned.choices ?? [];
  // A plain list is already a categorical space: keep that form when only its choices change.
  const plainList = Array.isArray(tuned.spec) && tuned.spec[0] !== "categorical" && tuned.type === "categorical";
  const number = (draft: string) => parseNumber(draft, tuned.type === "int");
  return (
    <>
      <select
        className="n4rack__input n4rack__input--kind"
        aria-label={labels.tune}
        value={tuned.type}
        disabled={readOnly}
        onChange={(event) => {
          const type = event.currentTarget.value;
          write(type === "categorical" ? ["categorical", choices.length ? choices : [low, high]] : [type, low, high]);
        }}
      >
        {TUNE_TYPES.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}
      </select>
      {tuned.type === "categorical" ? (
        <DraftField text={valueListText(choices)} parse={parseValueList} label={`${param.name} ${labels.choices}`} disabled={readOnly}
          onCommit={(next) => write(plainList ? next : ["categorical", next])} />
      ) : (
        <div className="n4rack__triple n4rack__triple--pair">
          <DraftField caption={labels.low} text={formatNumber(low)} parse={number} label={`${param.name} ${labels.low}`} disabled={readOnly} onCommit={(next) => write([tuned.type, next, high])} />
          <DraftField caption={labels.high} text={formatNumber(high)} parse={number} label={`${param.name} ${labels.high}`} disabled={readOnly} onCommit={(next) => write([tuned.type, low, next])} />
        </div>
      )}
    </>
  );
}

function ParamTile({ ctx, step, param, listed }: { ctx: InspectorContext; step: StepNode; param: PipelineOperatorParameter; listed: boolean }) {
  const { document, labels, commit, readOnly } = ctx;
  const value = step.params[param.name];
  const sweep = step.sweeps.find((candidate) => candidate.param === param.name);
  const tuned = step.tuning?.params.find((candidate) => candidate.name === param.name);
  const mode = sweep ? "sweep" : tuned ? "tune" : "fixed";
  const canTune = step.keyword === "model";
  const fixedValue = sweep?.location === "param" ? undefined : value;

  const switchMode = (next: "fixed" | "sweep" | "tune") => {
    if (next === mode) return;
    let base = document;
    if (tuned) base = setTuning(base, step.id, param.name, null).document;
    if (sweep) base = setSweep(base, step.id, param.name, null, sweepFixedValue(sweep)).document;
    if (next === "sweep") commit(setSweep(base, step.id, param.name, seedSweep(param, fixedValue)));
    else if (next === "tune") commit(setTuning(base, step.id, param.name, seedTuning(param, fixedValue)));
    else commit({ document: base });
  };
  const outside = typeof fixedValue === "number"
    && ((param.min !== undefined && fixedValue < param.min) || (param.max !== undefined && fixedValue > param.max));

  const modes = (
    <span className="n4rack__modes" role="group" aria-label={param.label ?? param.name}>
      <button type="button" className="n4rack__mode" aria-pressed={mode === "fixed"} aria-label={labels.fixed} title={labels.fixed} disabled={readOnly} onClick={() => switchMode("fixed")}>=</button>
      <button type="button" className="n4rack__mode" data-kind="sweep" aria-pressed={mode === "sweep"} aria-label={labels.sweep} title={labels.sweep} disabled={readOnly} onClick={() => switchMode("sweep")}>
        <ChainGlyph kind="sweep" size={12} />
      </button>
      {canTune ? (
        <button type="button" className="n4rack__mode" data-kind="tune" aria-pressed={mode === "tune"} aria-label={labels.tune} title={labels.tune} disabled={readOnly} onClick={() => switchMode("tune")}>
          <ChainGlyph kind="tune" size={12} />
        </button>
      ) : null}
    </span>
  );

  return (
    <Tile title={param.label ?? param.name} tag={param.unit} mode={mode} head={modes}>
      {mode === "sweep" && sweep ? (
        <SweepControl ctx={ctx} step={step} param={param} sweep={sweep} />
      ) : mode === "tune" && tuned ? (
        <TuneControl ctx={ctx} step={step} param={param} tuned={tuned} />
      ) : (
        <>
          <FixedControl ctx={ctx} step={step} param={param} value={fixedValue} />
          <p className="n4rack__tile-foot">
            {outside ? <span className="n4rack__warn">{labels.outside} {param.min ?? "−∞"} … {param.max ?? "∞"}</span> : null}
            {!outside && !listed ? <span>{labels.notInCatalog}</span> : null}
            {!outside && listed && param.description ? <span title={param.description}>{param.description}</span> : null}
            {fixedValue !== undefined ? (
              <button type="button" className="n4rack__reset" title={labels.reset} aria-label={`${labels.reset}: ${param.name}`} disabled={readOnly} onClick={() => commit(setParam(document, step.id, param.name, undefined))}>
                ×
              </button>
            ) : null}
          </p>
        </>
      )}
    </Tile>
  );
}

function AddParameterTile({ ctx, step }: { ctx: InspectorContext; step: StepNode }) {
  const { document, labels, commit, readOnly } = ctx;
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const ready = name.trim() !== "" && value.trim() !== "";
  const submit = () => {
    if (!ready) return;
    commit(setParam(document, step.id, name.trim(), parseLoose(value)));
    setName("");
    setValue("");
  };
  return (
    <Tile title={labels.addParameter} mode="add">
      <input className="n4rack__input" aria-label={labels.parameterName} placeholder={labels.parameterName} value={name} disabled={readOnly} spellCheck={false} onChange={(event) => setName(event.currentTarget.value)} />
      <div className="n4rack__triple n4rack__triple--add">
        <input className="n4rack__input" aria-label={labels.parameterValue} placeholder={labels.parameterValue} value={value} disabled={readOnly} spellCheck={false}
          onChange={(event) => setValue(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} />
        <button type="button" className="n4rack__btn n4rack__btn--text" disabled={readOnly || !ready} onClick={submit}>{labels.add}</button>
      </div>
    </Tile>
  );
}

function StepInspector({ ctx, step }: { ctx: InspectorContext; step: StepNode }) {
  const { document, labels, commit, readOnly } = ctx;
  const [jsonOpen, setJsonOpen] = useState(false);
  const listed = step.definition?.parameters ?? [];
  const known = new Set(listed.map((param) => param.name));
  const extraNames = new Set<string>();
  for (const name of Object.keys(step.params)) if (!known.has(name)) extraNames.add(name);
  for (const sweep of step.sweeps) if (sweep.param && !known.has(sweep.param)) extraNames.add(sweep.param);
  for (const tuned of step.tuning?.params ?? []) if (!known.has(tuned.name)) extraNames.add(tuned.name);
  const otherGenerators = step.sweeps.filter((sweep) => sweep.param === null);
  const stepValue = getAt(document, step.valuePath);
  const finetune = isRecord(stepValue) && isRecord(stepValue.finetune_params) ? stepValue.finetune_params : null;
  const finetuneExtras = finetune ? Object.keys(finetune).filter((key) => !["n_trials", "sampler", "model_params"].includes(key)) : [];

  return (
    <div className="n4rack__inspector">
      <Identity
        glyph={step.role}
        color={CHAIN_ROLE_COLORS[step.role]}
        title={step.label}
        subtitle={step.classPath}
        note={step.definition ? step.definition.description : labels.notInCatalog}
      >
        <ItemActions ctx={ctx} item={step} jsonOpen={jsonOpen} onToggleJson={() => setJsonOpen((open) => !open)} />
        <WrapButtons ctx={ctx} item={step} />
      </Identity>
      {jsonOpen ? (
        <JsonEditor value={stepValue} labels={labels} readOnly={readOnly} onApply={(next) => commit(replaceItemValue(document, step.id, next))} />
      ) : (
        <div className="n4rack__tiles">
          {step.keyword ? (
            <Tile title={labels.stepLabel}>
              <DraftField text={step.customName ?? ""} parse={(draft) => draft.trim()} label={labels.stepLabel} placeholder={labels.stepLabelHint} disabled={readOnly}
                onCommit={(next) => commit(setStepName(document, step.id, next as string))} />
            </Tile>
          ) : null}
          {listed.map((param) => <ParamTile key={param.name} ctx={ctx} step={step} param={param} listed />)}
          {[...extraNames].map((name) => (
            <ParamTile key={name} ctx={ctx} step={step} param={inferParameter(name, step.params[name])} listed={false} />
          ))}
          {otherGenerators.map((sweep, index) => (
            <Tile key={`generator-${index}`} title={sweep.kind} mode="sweep">
              <p className="n4rack__tile-text">{sweep.text}</p>
              <p className="n4rack__tile-foot">{sweep.count === null ? "" : `${formatCount(sweep.count)} ${labels.values.toLowerCase()}`}</p>
            </Tile>
          ))}
          {finetune ? (
            <Tile title={labels.tuning} mode="tune">
              <div className="n4rack__triple n4rack__triple--pair">
                <DraftField caption={labels.trials} text={valueText(finetune.n_trials)} label={labels.trials} disabled={readOnly}
                  parse={(draft) => (draft.trim() === "" ? undefined : parseNumber(draft, true))}
                  onCommit={(next) => commit(setTuningOption(document, step.id, "n_trials", next))} />
                <DraftField caption={labels.sampler} text={valueText(finetune.sampler)} label={labels.sampler} disabled={readOnly}
                  parse={(draft) => (draft.trim() === "" ? undefined : draft.trim())}
                  onCommit={(next) => commit(setTuningOption(document, step.id, "sampler", next))} />
              </div>
              <p className="n4rack__tile-foot">{finetuneExtras.length > 0 ? finetuneExtras.join(", ") : ""}</p>
            </Tile>
          ) : null}
          {listed.length === 0 && extraNames.size === 0 ? <p className="n4rack__tiles-empty">{labels.noParameters}</p> : null}
          <AddParameterTile ctx={ctx} step={step} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Groups, lanes and other cells
// ---------------------------------------------------------------------------

function LaneRow({ ctx, lane, fork }: { ctx: InspectorContext; lane: LaneNode; fork: ForkNode }) {
  const { document, labels, commit, readOnly } = ctx;
  const summary = lane.items.length === 0
    ? (fork.mode === "choice" ? labels.skipOption : labels.emptyLane)
    : lane.items.map((item) => (item.kind === "step" ? [item.customName ?? item.label, stepLines(item).map((line) => line.text).join(", ")].filter(Boolean).join(" ") : item.kind === "fork" ? labels.fork[item.mode] : item.kind === "frame" ? labels.frame[item.mode] : item.kind === "note" ? labels.noteText : item.label)).join(" → ");
  return (
    <li className="n4rack__lane-row" data-bypassed={lane.bypassed || undefined}>
      <button type="button" className="n4rack__led n4rack__led--inline" aria-pressed={!lane.bypassed} aria-label={`${lane.bypassed ? labels.enable : labels.bypass}: ${lane.label}`} disabled={readOnly}
        onClick={() => commit(setBypassed(document, { kind: "lane", id: lane.id }, !lane.bypassed))} />
      {fork.named ? (
        <DraftField className="n4rack__input--lane" text={String(lane.key)} parse={(draft) => draft.trim() || INVALID} label={labels.laneName} disabled={readOnly}
          onCommit={(next) => commit(renameLane(document, lane.id, next as string))} />
      ) : (
        <span className="n4rack__lane-index">{lane.label}</span>
      )}
      <span className="n4rack__lane-summary" title={summary}>{summary}</span>
      <IconButton icon="up" label={`${labels.moveUp}: ${lane.label}`} disabled={readOnly || lane.index === 0} onClick={() => commit(moveLane(document, lane.id, -1))} />
      <IconButton icon="down" label={`${labels.moveDown}: ${lane.label}`} disabled={readOnly || lane.index === fork.lanes.length - 1} onClick={() => commit(moveLane(document, lane.id, 1))} />
      <IconButton icon="trash" label={`${labels.remove}: ${lane.label}`} tone="danger" disabled={readOnly} onClick={() => commit(removeLane(document, lane.id))} />
    </li>
  );
}

function ModifierTiles({ ctx, item, primary }: { ctx: InspectorContext; item: ForkNode | FrameNode; primary: readonly string[] }) {
  const { document, labels, commit, readOnly } = ctx;
  const names = [...new Set([...primary, ...Object.keys(item.modifiers)])];
  return (
    <>
      {names.map((name) => (
        <Tile key={name} title={name}>
          <DraftField
            text={valueText(item.modifiers[name])}
            parse={(draft) => (draft.trim() === "" ? undefined : parseLoose(draft))}
            label={name}
            placeholder={labels.unset}
            disabled={readOnly}
            onCommit={(next) => commit(setModifier(document, item.id, name, next))}
          />
        </Tile>
      ))}
    </>
  );
}

function GroupInspector({ ctx, item }: { ctx: InspectorContext; item: ForkNode | FrameNode }) {
  const { document, labels, commit, readOnly } = ctx;
  const [jsonOpen, setJsonOpen] = useState(false);
  const title = item.kind === "fork" ? labels.fork[item.mode] : labels.frame[item.mode];
  const hint = item.kind === "fork" ? labels.forkHint[item.mode] : labels.frameHint[item.mode];
  const variants = itemVariants(item);
  const primary = item.kind === "fork" ? (item.mode === "choice" ? ["count", "pick"] : item.mode === "augment" ? ["action"] : []) : item.mode === "cartesian" ? ["count"] : [];
  return (
    <div className="n4rack__inspector">
      <Identity glyph={item.mode} color={CHAIN_GROUP_COLORS[item.mode]} title={title} subtitle={item.kind === "fork" ? item.keyword : item.mode === "cartesian" ? "_cartesian_" : null}
        note={<>{hint}{variants !== null && variants > 1 ? <> <strong>{formatCount(variants)} {labels.variants}</strong></> : null}</>}>
        <ItemActions ctx={ctx} item={item} jsonOpen={jsonOpen} onToggleJson={() => setJsonOpen((open) => !open)} />
      </Identity>
      {jsonOpen ? (
        <JsonEditor value={getAt(document, item.valuePath)} labels={labels} readOnly={readOnly} onApply={(next) => commit(replaceItemValue(document, item.id, next))} />
      ) : (
        <div className="n4rack__tiles">
          {item.kind === "fork" ? (
            <Tile title={item.mode === "choice" ? labels.options : labels.lanes} wide>
              <ul className="n4rack__lane-list">
                {item.lanes.map((lane) => <LaneRow key={lane.id} ctx={ctx} lane={lane} fork={item} />)}
              </ul>
              <div className="n4rack__wrap-actions">
                <button type="button" className="n4rack__btn n4rack__btn--text" disabled={readOnly} onClick={() => commit(addLane(document, item.id))}>
                  {item.mode === "choice" ? labels.addOption : labels.addLane}
                </button>
                {item.lanes.length > 0 ? (
                  <button type="button" className="n4rack__btn n4rack__btn--text" disabled={readOnly} onClick={() => commit(dissolveFork(document, item.id, 0))}>
                    {labels.dissolve}
                  </button>
                ) : null}
              </div>
            </Tile>
          ) : null}
          <ModifierTiles ctx={ctx} item={item} primary={primary} />
        </div>
      )}
    </div>
  );
}

function LaneInspector({ ctx, lane }: { ctx: InspectorContext; lane: LaneNode }) {
  const { labels } = ctx;
  const fork = ctx.model.items.get(lane.fork);
  if (fork?.kind !== "fork") return null;
  return (
    <div className="n4rack__inspector">
      <Identity glyph={fork.mode} color={CHAIN_GROUP_COLORS[fork.mode]} title={`${labels.fork[fork.mode]} · ${lane.label}`} note={labels.forkHint[fork.mode]}>
        <div className="n4rack__wrap-actions">
          <button type="button" className="n4rack__btn n4rack__btn--text n4rack__btn--primary" disabled={ctx.readOnly} onClick={() => ctx.requestAdd({ kind: "lane", id: lane.id })}>
            {labels.addStep}
          </button>
        </div>
      </Identity>
      <div className="n4rack__tiles">
        <Tile title={fork.mode === "choice" ? labels.options : labels.lanes} wide>
          <ul className="n4rack__lane-list">
            <LaneRow ctx={ctx} lane={lane} fork={fork} />
          </ul>
        </Tile>
      </div>
    </div>
  );
}

function LeafInspector({ ctx, item }: { ctx: InspectorContext; item: Exclude<ChainItem, StepNode | ForkNode | FrameNode> }) {
  const { document, labels, commit, readOnly, catalog } = ctx;
  const [jsonOpen, setJsonOpen] = useState(item.kind === "raw");
  const value = getAt(document, item.valuePath);
  const title = item.kind === "merge" ? labels.role.merge : item.kind === "note" ? labels.role.note : item.label;
  const strategies = catalog.mergeStrategies ?? [];
  return (
    <div className="n4rack__inspector">
      <Identity glyph={item.role} color={CHAIN_ROLE_COLORS[item.role]} title={title} subtitle={item.kind === "merge" ? "merge" : item.kind === "note" ? "_comment" : null}
        note={item.kind === "raw" ? labels.role.raw : null}>
        <ItemActions ctx={ctx} item={item} jsonOpen={jsonOpen} onToggleJson={() => setJsonOpen((open) => !open)} />
        {item.kind !== "note" ? <WrapButtons ctx={ctx} item={item} /> : null}
      </Identity>
      {jsonOpen || item.kind === "raw" ? (
        <JsonEditor value={value} labels={labels} readOnly={readOnly} onApply={(next) => commit(replaceItemValue(document, item.id, next))} />
      ) : (
        <div className="n4rack__tiles">
          {item.kind === "merge" ? (
            <Tile title={labels.strategy} wide={typeof item.value !== "string"}>
              {typeof item.value === "string" && strategies.length > 0 ? (
                <select className="n4rack__input" aria-label={labels.strategy} value={item.value} disabled={readOnly}
                  onChange={(event) => commit(replaceItemValue(document, item.id, { merge: strategies.find((option) => String(option.value) === event.currentTarget.value)?.value ?? event.currentTarget.value }))}>
                  {strategies.some((option) => option.value === item.value) ? null : <option value={item.value}>{item.value}</option>}
                  {strategies.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
                </select>
              ) : (
                <DraftField text={valueText(item.value)} parse={parseLoose} label={labels.strategy} disabled={readOnly} onCommit={(next) => commit(replaceItemValue(document, item.id, { merge: next }))} />
              )}
              <p className="n4rack__tile-foot">
                {typeof item.value === "string" ? strategies.find((option) => option.value === item.value)?.description ?? "" : ""}
              </p>
            </Tile>
          ) : null}
          {item.kind === "note" ? (
            <Tile title={labels.noteText} wide>
              <textarea className="n4rack__json-text n4rack__note-text" aria-label={labels.noteText} defaultValue={item.text} key={item.text} readOnly={readOnly}
                onBlur={(event) => { if (event.currentTarget.value !== item.text) commit(replaceItemValue(document, item.id, { _comment: event.currentTarget.value })); }} />
            </Tile>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Inspector for the current item or lane selection. */
export function SelectionInspector({ ctx, selection }: { ctx: InspectorContext; selection: { kind: "item" | "lane"; id: string } }) {
  if (selection.kind === "lane") {
    const lane = ctx.model.lanes.get(selection.id);
    return lane ? <LaneInspector ctx={ctx} lane={lane} /> : null;
  }
  const item = ctx.model.items.get(selection.id);
  if (!item) return null;
  if (item.kind === "step") return <StepInspector key={item.id} ctx={ctx} step={item} />;
  if (item.kind === "fork" || item.kind === "frame") return <GroupInspector key={item.id} ctx={ctx} item={item} />;
  return <LeafInspector key={item.id} ctx={ctx} item={item} />;
}
