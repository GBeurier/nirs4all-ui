import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { cx } from "./_cx.js";
import {
  FUSION_LEVEL_LABEL,
  MULTIMODAL_STEP_CATALOG,
  MULTIMODAL_STRATEGIES,
  NETWORK_BRANCH_LABEL,
  findStepOption,
  networkBranchKind,
  representationLabel,
  sourceTag,
  stepOptionsFor,
} from "./catalog.js";
import { shapeText } from "./data.js";
import { TextField } from "./fields.js";
import {
  MERGE_KIND_LABEL,
  MULTIMODAL_MODEL_CATALOG,
  addBranch,
  branchIdError,
  chainFor,
  combinationText,
  connectSource,
  copyChainToBranches,
  defaultStepParams,
  describePipelineDocument,
  disconnectSource,
  duplicateBranch,
  findBranch,
  findModelOption,
  headForModel,
  insertStep,
  mergeInputsText,
  modelParamSummary,
  modelSummary,
  moveBranch,
  moveStep,
  pipelineIssues,
  removeBranch,
  removeStep,
  resolveTarget,
  sameTarget,
  stepsFor,
  updateBranch,
  updateMerge,
  updateStep,
  withParam,
  type PipelineOwner,
} from "./pipelineModel.js";
import { ParamField } from "./RecipePanel.js";
import type {
  MultimodalModelOption,
  MultimodalModelParamSpec,
  MultimodalPipelineBranch,
  MultimodalPipelineDocument,
  MultimodalPipelineEditorProps,
  MultimodalPipelineIssue,
  MultimodalPipelineMergeKind,
  MultimodalPipelinePreset,
  MultimodalPipelineTarget,
  MultimodalSource,
  MultimodalStep,
  MultimodalStepOption,
} from "./types.js";

// ---------------------------------------------------------------------------
// Shared editor context
// ---------------------------------------------------------------------------

type Target = MultimodalPipelineTarget;

interface EditorContext {
  value: MultimodalPipelineDocument;
  sources: readonly MultimodalSource[];
  byId: ReadonlyMap<string, MultimodalSource>;
  indexOf: ReadonlyMap<string, number>;
  hostOrder: readonly string[];
  stepCatalog: readonly MultimodalStepOption[];
  modelCatalog: readonly MultimodalModelOption[];
  issues: readonly MultimodalPipelineIssue[];
  selection: Target;
  disabled: boolean;
  select: (target: Target, options?: { focusAdd?: boolean }) => void;
  edit: (next: MultimodalPipelineDocument) => void;
}

const MODE_CAPTION: Readonly<Record<MultimodalModelOption["inputMode"], string>> = {
  concatenated: "concatenated",
  blocks: "separate blocks",
  network: "one network branch per source",
};

const MERGE_KIND_TEXT: Readonly<Record<MultimodalPipelineMergeKind, string>> = {
  none: "The single branch's prediction is the pipeline output. Requires exactly one branch.",
  mean: "Unweighted mean of two or more branch predictions. Nothing is learned at the merge, so no out-of-fold training is needed.",
  model:
    "A PLS or Ridge meta-model learns how to combine two or more branches from nested out-of-fold predictions only. Optional raw source features make it a hybrid merge.",
};

function ownerLabel(ctx: EditorContext, owner: PipelineOwner): string {
  if (owner === null) return "meta-model features";
  return findBranch(ctx.value, owner)?.label || owner;
}

function sourceLabel(ctx: EditorContext, sourceId: string): string {
  const source = ctx.byId.get(sourceId);
  const index = ctx.indexOf.get(sourceId);
  return source && index !== undefined ? `${sourceTag(index)} ${source.label}` : `Unknown source ${sourceId}`;
}

function issuesWithin(issues: readonly MultimodalPipelineIssue[], predicate: (target: Target) => boolean): MultimodalPipelineIssue[] {
  return issues.filter((issue) => predicate(issue.target));
}

function belongsTo(target: Target, owner: PipelineOwner): boolean {
  if (owner === null) return target.kind === "merge" || ((target.kind === "source" || target.kind === "step") && target.branchId === null);
  return (
    ((target.kind === "branch" || target.kind === "model") && target.branchId === owner) ||
    ((target.kind === "source" || target.kind === "step") && target.branchId === owner)
  );
}

function strategyLevel(strategy: MultimodalPipelinePreset["strategy"]): string {
  const info = MULTIMODAL_STRATEGIES.find((candidate) => candidate.id === strategy);
  return info ? FUSION_LEVEL_LABEL[info.level] : strategy;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

/**
 * Controlled three-pane editor for a multimodal pipeline document: presets and
 * building blocks on the left, a selectable branch-and-merge canvas in the
 * centre, and a context inspector on the right. Every edit produces a new
 * document through `onChange`; the editor never executes, validates for the
 * host, or repairs a document on its own. Structural problems are listed and
 * attached to the cards they concern.
 */
export function MultimodalPipelineEditor({
  sources,
  value,
  onChange,
  presets,
  onLoadPreset,
  disabled = false,
  onExport,
  onImport,
  issues: hostIssues,
  stepCatalog = MULTIMODAL_STEP_CATALOG,
  modelCatalog = MULTIMODAL_MODEL_CATALOG,
  actions,
  className,
}: MultimodalPipelineEditorProps) {
  const [selection, setSelection] = useState<Target>({ kind: "document" });
  const [addRequest, setAddRequest] = useState(0);
  const newBranchRef = useRef<HTMLSelectElement>(null);

  const byId = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const indexOf = useMemo(() => new Map(sources.map((source, index) => [source.id, index])), [sources]);
  const hostOrder = useMemo(() => sources.map((source) => source.id), [sources]);
  const localIssues = useMemo(
    () => pipelineIssues(value, sources, { stepCatalog, modelCatalog }),
    [value, sources, stepCatalog, modelCatalog],
  );
  const issues = useMemo(() => (hostIssues && hostIssues.length > 0 ? [...localIssues, ...hostIssues] : localIssues), [localIssues, hostIssues]);
  const resolved = resolveTarget(value, selection);

  const ctx: EditorContext = {
    value,
    sources,
    byId,
    indexOf,
    hostOrder,
    stepCatalog,
    modelCatalog,
    issues,
    selection: resolved,
    disabled,
    select: (target, options) => {
      setSelection(target);
      setAddRequest(options?.focusAdd ? (count) => count + 1 : 0);
    },
    edit: (next) => {
      if (!disabled) onChange(next);
    },
  };

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;

  return (
    <div className={cx("n4mm-pe", className)} data-disabled={disabled || undefined}>
      <div className="n4mm-pe__bar">
        <div className="n4mm-pe__title">
          <span className="n4mm-pe__eyebrow">Pipeline</span>
          <strong>{value.label || "Untitled pipeline"}</strong>
          <span className="n4mm-muted">
            {value.branches.length} branch{value.branches.length === 1 ? "" : "es"} · {MERGE_KIND_LABEL[value.merge.kind]}
          </span>
          <span className="n4mm-pe__health" data-tone={errors > 0 ? "error" : warnings > 0 ? "warning" : "ok"} role="status">
            {errors > 0
              ? `${errors} error${errors === 1 ? "" : "s"}${warnings ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}`
              : warnings > 0
                ? `${warnings} warning${warnings === 1 ? "" : "s"}`
                : "No structural issue found"}
          </span>
        </div>
        {actions ? <div className="n4mm-pe__actions">{actions}</div> : null}
      </div>

      <div className="n4mm-pe__layout">
        <Palette
          ctx={ctx}
          presets={presets}
          onLoadPreset={onLoadPreset}
          newBranchRef={newBranchRef}
          {...(onExport ? { onExport } : {})}
          {...(onImport ? { onImport } : {})}
        />
        <section className="n4mm-pe__center" aria-label="Pipeline canvas">
          <IssueList ctx={ctx} />
          <Canvas ctx={ctx} onAddBranch={() => newBranchRef.current?.focus()} />
          <div className="n4mm-pe__outline">
            <h4 className="n4mm-pe__heading">Pipeline as text</h4>
            <Outline lines={describePipelineDocument(value, sources, { stepCatalog, modelCatalog })} />
          </div>
        </section>
        <aside className="n4mm-pe__inspector" aria-label="Inspector">
          <Inspector ctx={ctx} addRequest={addRequest} />
        </aside>
      </div>
    </div>
  );
}

/** Depth-0 lines as numbered items, their depth-1 lines as nested bullets. */
function Outline({ lines }: { lines: readonly { depth: number; text: string }[] }) {
  const groups: { text: string; children: string[] }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (line.depth > 0 && last) last.children.push(line.text);
    else groups.push({ text: line.text, children: [] });
  }
  return (
    <ol className="n4mm-pe-outline">
      {groups.map((group, index) => (
        <li key={index}>
          <span className="n4mm-pe-outline__head">{group.text}</span>
          {group.children.length > 0 ? (
            <ul>
              {group.children.map((child, childIndex) => (
                <li key={childIndex}>{child}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Left pane: presets, building blocks, file
// ---------------------------------------------------------------------------

function Palette({
  ctx,
  presets,
  onLoadPreset,
  onExport,
  onImport,
  newBranchRef,
}: {
  ctx: EditorContext;
  presets: readonly MultimodalPipelinePreset[];
  onLoadPreset: (presetId: string) => void;
  onExport?: () => void;
  onImport?: (file: File) => void;
  newBranchRef: RefObject<HTMLSelectElement | null>;
}) {
  const fusion = presets.filter((preset) => preset.strategy !== "single");
  const baselines = presets.filter((preset) => preset.strategy === "single");
  return (
    <aside className="n4mm-pe__palette" aria-label="Presets and building blocks">
      <details className="n4mm-pe__block" open>
        <summary className="n4mm-pe__heading">Presets ({presets.length})</summary>
        <p className="n4mm-pe__hint">Loading a preset replaces the current pipeline. The loaded data is kept.</p>
        {presets.length === 0 ? <p className="n4mm-pe__hint">No pipeline preset is available.</p> : null}
        <PresetGroup title="Fusion pipelines" presets={fusion} onLoadPreset={onLoadPreset} disabled={ctx.disabled} />
        <PresetGroup title="Single-source baselines" presets={baselines} onLoadPreset={onLoadPreset} disabled={ctx.disabled} />
      </details>

      <NewBranchForm ctx={ctx} selectRef={newBranchRef} />
      <StepPalette ctx={ctx} />

      {onImport || onExport ? (
        <div className="n4mm-pe__block">
          <h4 className="n4mm-pe__heading">Pipeline file</h4>
          <div className="n4mm-pe__file">
            {onImport ? (
              <label className="n4mm-file" data-disabled={ctx.disabled || undefined}>
                Import JSON…
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={ctx.disabled}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) onImport(file);
                  }}
                />
              </label>
            ) : null}
            {onExport ? (
              <button type="button" className="n4mm-button" data-variant="quiet" onClick={onExport}>
                Export JSON
              </button>
            ) : null}
          </div>
          {onImport ? (
            <p className="n4mm-pe__hint">Import a pipeline JSON file to replace the current draft.</p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function PresetGroup({
  title,
  presets,
  onLoadPreset,
  disabled,
}: {
  title: string;
  presets: readonly MultimodalPipelinePreset[];
  onLoadPreset: (presetId: string) => void;
  disabled: boolean;
}) {
  const baseId = useId();
  if (presets.length === 0) return null;
  return (
    <div className="n4mm-pe__presets">
      <p className="n4mm-pe__group">{title}</p>
      <ul>
        {presets.map((preset, index) => (
          <li key={preset.id}>
            <button
              type="button"
              className="n4mm-pe-preset"
              disabled={disabled}
              aria-describedby={`${baseId}-${index}`}
              onClick={() => onLoadPreset(preset.id)}
            >
              <span className="n4mm-pe-preset__name">{preset.label}</span>
              <span className="n4mm-pe-preset__level">{strategyLevel(preset.strategy)}</span>
            </button>
            <p id={`${baseId}-${index}`} className="n4mm-pe-preset__text">
              {preset.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewBranchForm({ ctx, selectRef }: { ctx: EditorContext; selectRef: RefObject<HTMLSelectElement | null> }) {
  const models = ctx.modelCatalog.filter((option) => option.roles.includes("branch"));
  const [modelId, setModelId] = useState(models[0]?.methodId ?? "");
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const chosen = ctx.sources.filter((source) => !excluded.has(source.id)).map((source) => source.id);
  const option = findModelOption(modelId, ctx.modelCatalog) ?? models[0];
  const add = () => {
    if (!option || chosen.length === 0) return;
    const result = addBranch(ctx.value, option, chosen);
    ctx.edit(result.document);
    ctx.select({ kind: "branch", branchId: result.branchId });
  };
  return (
    <fieldset className="n4mm-pe__block n4mm-pe__new" disabled={ctx.disabled}>
      <legend className="n4mm-pe__heading">New branch</legend>
      <label className="n4mm-field">
        <span className="n4mm-field__label">Model</span>
        <select ref={selectRef} value={option?.methodId ?? ""} onChange={(event) => setModelId(event.currentTarget.value)}>
          {models.map((model) => (
            <option key={model.methodId} value={model.methodId}>
              {model.label}
            </option>
          ))}
        </select>
      </label>
      <div className="n4mm-pe__sources" role="group" aria-label="Sources connected to the new branch">
        <span className="n4mm-field__label">Sources</span>
        {ctx.sources.map((source, index) => (
          <label key={source.id} className="n4mm-check">
            <input
              type="checkbox"
              checked={!excluded.has(source.id)}
              onChange={(event) => {
                const next = new Set(excluded);
                if (event.currentTarget.checked) next.delete(source.id);
                else next.add(source.id);
                setExcluded(next);
              }}
            />
            <SourceTag index={index} />
            {source.label}
          </label>
        ))}
      </div>
      <button type="button" className="n4mm-button" onClick={add} disabled={!option || chosen.length === 0}>
        Add branch
      </button>
      {option ? <p className="n4mm-pe__hint">{option.description}</p> : null}
    </fieldset>
  );
}

/** Building blocks for the selected source chain: one button per applicable preprocessing operation. */
function StepPalette({ ctx }: { ctx: EditorContext }) {
  const target = ctx.selection;
  const anchor = target.kind === "source" || target.kind === "step" ? target : null;
  const source = anchor ? ctx.byId.get(anchor.sourceId) : undefined;
  const options = source ? stepOptionsFor(source.representation, ctx.stepCatalog) : [];
  const insertAt = target.kind === "step" ? target.index + 1 : undefined;
  return (
    <div className="n4mm-pe__block">
      <h4 className="n4mm-pe__heading">Preprocessing</h4>
      {!anchor ? (
        <p className="n4mm-pe__hint">Select a source or a step on the canvas to add preprocessing to that chain.</p>
      ) : !source ? (
        <p className="n4mm-pe__hint">The selected source is not in the loaded dataset.</p>
      ) : (
        <>
          <p className="n4mm-pe__hint">
            {insertAt === undefined ? "Append to" : `Insert after step ${insertAt} of`} {sourceLabel(ctx, anchor.sourceId)} in{" "}
            {ownerLabel(ctx, anchor.branchId)}.
          </p>
          <ul className="n4mm-pe__chips">
            {options.map((option) => (
              <li key={option.methodId}>
                <button
                  type="button"
                  className="n4mm-pe-chip"
                  disabled={ctx.disabled}
                  title={option.description}
                  onClick={() => {
                    const at = insertAt ?? stepsFor(ctx.value, anchor.branchId, anchor.sourceId).length;
                    const step = { methodId: option.methodId, params: defaultStepParams(option) };
                    ctx.edit(insertStep(ctx.value, anchor.branchId, anchor.sourceId, step, at));
                    ctx.select({ kind: "step", branchId: anchor.branchId, sourceId: anchor.sourceId, index: at });
                  }}
                >
                  <span aria-hidden="true">+</span> {option.label}
                  <span className="n4mm-pe-chip__scope">{option.fitScope === "train-fitted" ? "fitted" : "per sample"}</span>
                </button>
              </li>
            ))}
          </ul>
          {options.length === 0 ? <p className="n4mm-pe__hint">No operation is offered for this representation.</p> : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Centre: issues and canvas
// ---------------------------------------------------------------------------

function IssueList({ ctx }: { ctx: EditorContext }) {
  if (ctx.issues.length === 0) return null;
  return (
    <div className="n4mm-pe__issues">
      <p className="n4mm-pe__issues-lead">Nothing is repaired automatically. Fix these before running:</p>
      <ul>
        {ctx.issues.map((issue, index) => (
          <li key={index} data-severity={issue.severity}>
            <span className="n4mm-pe__sev">{issue.severity === "error" ? "Error" : "Warning"}</span>
            <span>{issue.message}</span>
            <button type="button" className="n4mm-pe-link" onClick={() => ctx.select(issue.target)}>
              Show
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Wire {
  key: string;
  d: string;
  tone: string;
}

/**
 * Measures `[data-pe-from]` → `[data-pe-in]` card pairs and draws decorative
 * connectors behind the canvas (the visible text and outline carry the same
 * topology). A target to the right is reached by a curve; a target below
 * (the merge row) through a shared bus on the right of the lanes.
 */
function useWires(ref: RefObject<HTMLDivElement | null>, signature: unknown): Wire[] {
  const [wires, setWires] = useState<Wire[]>([]);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      const froms = Array.from(root.querySelectorAll<HTMLElement>("[data-pe-from]"));
      const inputs = new Map(Array.from(root.querySelectorAll<HTMLElement>("[data-pe-in]"))
        .map((element) => [element.dataset.peIn, element]));
      const rel = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top };
      };
      const busX = Math.max(0, ...froms.filter((el) => el.dataset.peTo === "merge").map((el) => rel(el).right)) + 26;
      const next: Wire[] = [];
      for (const from of froms) {
        const to = inputs.get(from.dataset.peTo);
        if (!to) continue;
        const a = rel(from);
        const b = rel(to);
        const tone = from.dataset.peTone ?? "";
        const x1 = a.right;
        const y1 = (a.top + a.bottom) / 2;
        let d: string;
        const sameRow = b.top < a.bottom && b.bottom > a.top;
        if (sameRow && b.left >= a.right + 8) {
          const x2 = b.left - 2;
          const y2 = (b.top + b.bottom) / 2;
          const bend = Math.max(16, (x2 - x1) / 2);
          d = `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
        } else {
          const offset = tone === "features" ? 9 : 0;
          const bus = busX + offset;
          const joinY = b.top - 16 + offset;
          const x2 = (b.left + b.right) / 2 + offset * 2;
          d = `M${x1},${y1} H${bus} V${joinY} H${x2} V${b.top - 2}`;
        }
        next.push({ key: from.dataset.peFrom ?? "", d, tone });
      }
      setWires((previous) =>
        previous.length === next.length && previous.every((wire, i) => wire.d === next[i]?.d && wire.tone === next[i]?.tone)
          ? previous
          : next,
      );
    };
    measure();
    const view = root.ownerDocument.defaultView as (Window & {
      ResizeObserver?: new (callback: ResizeObserverCallback) => ResizeObserver;
    }) | null;
    const Observer = view?.ResizeObserver;
    if (!Observer) return;
    const observer = new Observer(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [ref, signature]);
  return wires;
}

function Canvas({ ctx, onAddBranch }: { ctx: EditorContext; onAddBranch: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const wires = useWires(ref, ctx.value);
  const markerId = `n4mm-pe-arrow-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const { merge } = ctx.value;
  const showFeatures = merge.kind === "model" || merge.sourceIds.length > 0 || merge.sourceChains.length > 0;
  const wireTone = merge.kind === "model" ? "oof" : merge.kind === "mean" ? "mean" : "pass";
  const mergeIssues = issuesWithin(ctx.issues, (target) => target.kind === "merge");
  const mergeSelected = ctx.selection.kind === "merge";
  const meta = findModelOption(merge.head.methodId, ctx.modelCatalog);
  return (
    <div
      className="n4mm-pe__scroll"
      role="region"
      tabIndex={0}
      aria-label="Branch and merge canvas. Scrolls horizontally on narrow screens. Every card is a button that opens it in the inspector."
    >
      <div className="n4mm-pe-canvas" ref={ref}>
        <svg className="n4mm-pe-wires" aria-hidden="true" focusable="false">
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          {wires.map((wire) => (
            <path key={wire.key} d={wire.d} data-tone={wire.tone} markerEnd={`url(#${markerId})`} strokeLinejoin="round" />
          ))}
        </svg>
        <ol className="n4mm-pe-lanes" aria-label="Model branches">
          {ctx.value.branches.map((branch, index) => (
            <Lane key={`${index}:${branch.id}`} ctx={ctx} branch={branch} index={index} wireTone={wireTone} />
          ))}
          {showFeatures ? <FeatureLane ctx={ctx} /> : null}
          <li className="n4mm-pe-lanes__add">
            <button type="button" className="n4mm-pe-ghost" onClick={onAddBranch} disabled={ctx.disabled}>
              <span aria-hidden="true">+</span> Add a branch (choose its model and sources in “New branch”)
            </button>
          </li>
        </ol>
        <div className="n4mm-pe-sink">
          <p className="n4mm-pe-sink__text">{mergeInputsText(ctx.value, ctx.sources, ctx.modelCatalog)}</p>
          <button
            type="button"
            className="n4mm-pe-node"
            data-kind="merge"
            data-merge={merge.kind}
            data-pe-in="merge"
            data-pe-from="__merge"
            data-pe-to="output"
            data-pe-tone="pass"
            aria-pressed={mergeSelected}
            data-invalid={mergeIssues.length > 0 || undefined}
            onClick={() => ctx.select({ kind: "merge" })}
          >
            <span className="n4mm-pe-node__kind">Merge</span>
            <span className="n4mm-pe-node__title">{MERGE_KIND_LABEL[merge.kind]}</span>
            <span className="n4mm-pe-node__sub">
              {merge.kind === "model"
                ? `${meta?.shortLabel ?? merge.head.methodId} on out-of-fold predictions`
                : merge.kind === "mean"
                  ? "equal weights, nothing fitted"
                  : "single branch passes through"}
            </span>
            <IssueFlag count={mergeIssues.length} />
          </button>
          <div className="n4mm-pe-node" data-kind="output" data-pe-in="output">
            <span className="n4mm-pe-node__kind">Output</span>
            <span className="n4mm-pe-node__title">Prediction</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IssueFlag({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="n4mm-pe-flag">
      <span aria-hidden="true">!</span> {count} issue{count === 1 ? "" : "s"}
    </span>
  );
}

function SourceTag({ index }: { index: number | undefined }) {
  return (
    <span className="n4mm-tag" data-source={index === undefined ? undefined : index % 6}>
      {index === undefined ? "?" : sourceTag(index)}
    </span>
  );
}

function Lane({
  ctx,
  branch,
  index,
  wireTone,
}: {
  ctx: EditorContext;
  branch: MultimodalPipelineBranch;
  index: number;
  wireTone: string;
}) {
  const option = findModelOption(branch.head.methodId, ctx.modelCatalog);
  const laneIssues = issuesWithin(ctx.issues, (target) => belongsTo(target, branch.id));
  const modelIssues = issuesWithin(laneIssues, (target) => target.kind === "model");
  const selected = ctx.selection;
  const isBranch = selected.kind === "branch" && selected.branchId === branch.id;
  const isModel = selected.kind === "model" && selected.branchId === branch.id;
  const name = branch.label || branch.id;
  const { edit, select } = ctx;
  return (
    <li className="n4mm-pe-lane" data-selected={isBranch || undefined} data-invalid={laneIssues.length > 0 || undefined}>
      <div className="n4mm-pe-lane__head">
        <button
          type="button"
          className="n4mm-pe-lane__title"
          aria-pressed={isBranch}
          onClick={() => select({ kind: "branch", branchId: branch.id })}
        >
          <span className="n4mm-pe-lane__index">B{index + 1}</span>
          <span>{name}</span>
        </button>
        <IssueFlag count={laneIssues.length} />
        <span className="n4mm-pe-lane__tools">
          <button
            type="button"
            className="n4mm-icon"
            disabled={ctx.disabled}
            aria-label={`Duplicate ${name}`}
            title="Duplicate branch"
            onClick={() => {
              const result = duplicateBranch(ctx.value, branch.id);
              edit(result.document);
              select({ kind: "branch", branchId: result.branchId });
            }}
          >
            ⧉
          </button>
          <button
            type="button"
            className="n4mm-icon"
            disabled={ctx.disabled}
            aria-label={`Delete ${name}`}
            title="Delete branch"
            onClick={() => edit(removeBranch(ctx.value, branch.id))}
          >
            ×
          </button>
        </span>
      </div>
      <div className="n4mm-pe-lane__flow">
        <SourceOperator ctx={ctx} owner={branch.id} sourceIds={branch.sourceIds} mode={option?.inputMode} />
        <span className="n4mm-pe-lane__to">
        <span className="n4mm-pe-lane__line" aria-hidden="true" />
        <button
          type="button"
          className="n4mm-pe-node"
          data-kind="model"
          data-pe-from={`branch:${index}`}
          data-pe-to="merge"
          data-pe-tone={wireTone}
          aria-pressed={isModel}
          data-invalid={modelIssues.length > 0 || undefined}
          onClick={() => select({ kind: "model", branchId: branch.id })}
        >
          <span className="n4mm-pe-node__kind">Model</span>
          <span className="n4mm-pe-node__title">{option?.shortLabel ?? "Unknown model"}</span>
          <span className="n4mm-pe-node__sub">{option ? modelParamSummary(branch.head) || option.label : branch.head.methodId}</span>
          <IssueFlag count={modelIssues.length} />
        </button>
        </span>
      </div>
      <p className="n4mm-pe-lane__combine">{combinationText(branch, ctx.sources, ctx.modelCatalog)}</p>
    </li>
  );
}

function FeatureLane({ ctx }: { ctx: EditorContext }) {
  const { merge } = ctx.value;
  const laneIssues = issuesWithin(ctx.issues, (target) => (target.kind === "source" || target.kind === "step") && target.branchId === null);
  return (
    <li className="n4mm-pe-lane" data-kind="features" data-invalid={laneIssues.length > 0 || undefined}>
      <div className="n4mm-pe-lane__head">
        <button type="button" className="n4mm-pe-lane__title" onClick={() => ctx.select({ kind: "merge" })}>
          <span className="n4mm-pe-lane__index">F</span>
          <span>Raw features into the meta-model{merge.sourceIds.length === 0 ? " (optional, makes a hybrid)" : " (hybrid)"}</span>
        </button>
        <IssueFlag count={laneIssues.length} />
      </div>
      <div className="n4mm-pe-lane__flow" data-pe-from="features" data-pe-to="merge" data-pe-tone="features">
        <SourceOperator ctx={ctx} owner={null} sourceIds={merge.sourceIds} mode="concatenated" />
      </div>
    </li>
  );
}

/** One native source operator: connected source rows with their chains, plus connect chips for the others. */
function SourceOperator({
  ctx,
  owner,
  sourceIds,
  mode,
}: {
  ctx: EditorContext;
  owner: PipelineOwner;
  sourceIds: readonly string[];
  mode: MultimodalModelOption["inputMode"] | undefined;
}) {
  const ownerObject = owner === null ? ctx.value.merge : findBranch(ctx.value, owner);
  const where = ownerLabel(ctx, owner);
  const unconnected = ctx.sources.filter((source) => !sourceIds.includes(source.id));
  const orphanChains = (ownerObject?.sourceChains ?? []).filter((chain) => !sourceIds.includes(chain.sourceId));
  const caption =
    sourceIds.length <= 1 && mode !== "network"
      ? "single source"
      : mode
        ? MODE_CAPTION[mode]
        : "unknown combination";
  const selected = ctx.selection;
  return (
    <div className="n4mm-pe-operator" data-mode={mode}>
      <p className="n4mm-pe-operator__caption">
        Source inputs · <strong>{owner === null ? "features concatenated" : caption}</strong>
      </p>
      {sourceIds.length === 0 ? <p className="n4mm-pe-operator__empty">No source connected.</p> : null}
      <ul className="n4mm-pe-rows">
        {[...sourceIds, ...orphanChains.map((chain) => chain.sourceId)].map((sourceId, row) => {
          const orphan = row >= sourceIds.length;
          const steps = ownerObject ? (chainFor(ownerObject, sourceId)?.steps ?? []) : [];
          const source = ctx.byId.get(sourceId);
          const label = sourceLabel(ctx, sourceId);
          const sourceTarget: Target = { kind: "source", branchId: owner, sourceId };
          const sourceIssues = issuesWithin(ctx.issues, (target) => sameTarget(target, sourceTarget));
          return (
            <li key={`${row}:${sourceId}`} className="n4mm-pe-row" data-orphan={orphan || undefined}>
              <button
                type="button"
                className="n4mm-pe-node"
                data-kind="source"
                aria-pressed={sameTarget(selected, sourceTarget)}
                data-invalid={sourceIssues.length > 0 || undefined}
                aria-label={`${label}${orphan ? " (chain without connection)" : ""} in ${where}${
                  sourceIssues.length ? `, ${sourceIssues.length} issue${sourceIssues.length === 1 ? "" : "s"}` : ""
                }`}
                onClick={() => ctx.select(sourceTarget)}
              >
                <span className="n4mm-pe-node__title">
                  <SourceTag index={ctx.indexOf.get(sourceId)} />
                  {source?.label ?? sourceId}
                </span>
                <span className="n4mm-pe-node__sub">
                  {orphan
                    ? "not connected"
                    : source
                      ? `${representationLabel(source.representation)} · ${shapeText(source.shape)}`
                      : "not in dataset"}
                </span>
              </button>
              {steps.map((step, index) => {
                const option = findStepOption(step.methodId, ctx.stepCatalog);
                const stepTarget: Target = { kind: "step", branchId: owner, sourceId, index };
                const stepIssues = issuesWithin(ctx.issues, (target) => sameTarget(target, stepTarget));
                return (
                  <span key={`${index}:${step.methodId}`} className="n4mm-pe-row__step">
                    <span className="n4mm-pe-arrow" aria-hidden="true">
                      →
                    </span>
                    <button
                      type="button"
                      className="n4mm-pe-node"
                      data-kind="step"
                      data-fitted={option?.fitScope === "train-fitted" || undefined}
                      aria-pressed={sameTarget(selected, stepTarget)}
                      data-invalid={stepIssues.length > 0 || undefined}
                      aria-label={`Step ${index + 1}: ${option?.label ?? step.methodId}, ${label} in ${where}${
                        stepIssues.length ? `, ${stepIssues.length} issue${stepIssues.length === 1 ? "" : "s"}` : ""
                      }`}
                      onClick={() => ctx.select(stepTarget)}
                    >
                      <span className="n4mm-pe-node__title">{option?.label ?? step.methodId}</span>
                      <span className="n4mm-pe-node__sub">
                        {option ? (option.fitScope === "train-fitted" ? "fitted on train" : "per sample") : "not in catalogue"}
                      </span>
                    </button>
                  </span>
                );
              })}
              <button
                type="button"
                className="n4mm-pe-add"
                disabled={ctx.disabled || !source}
                aria-label={`Add preprocessing to ${label} in ${where}`}
                title="Add preprocessing"
                onClick={() => ctx.select(sourceTarget, { focusAdd: true })}
              >
                +
              </button>
            </li>
          );
        })}
      </ul>
      {unconnected.length > 0 && (owner !== null || ctx.value.merge.kind === "model") ? (
        <div className="n4mm-pe-connect">
          <span className="n4mm-pe-connect__label">{owner === null ? "Add raw features:" : "Connect:"}</span>
          {unconnected.map((source) => (
            <button
              key={source.id}
              type="button"
              className="n4mm-pe-chip"
              disabled={ctx.disabled}
              aria-label={`Connect ${sourceLabel(ctx, source.id)} to ${where}`}
              onClick={() => ctx.edit(connectSource(ctx.value, owner, source.id, ctx.hostOrder))}
            >
              <span aria-hidden="true">+</span> {sourceTag(ctx.indexOf.get(source.id) ?? 0)}
              <span className="n4mm-pe-chip__scope">{source.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right pane: inspector
// ---------------------------------------------------------------------------

function Inspector({ ctx, addRequest }: { ctx: EditorContext; addRequest: number }) {
  const target = ctx.selection;
  const ownIssues = issuesWithin(ctx.issues, (issue) => sameTarget(issue, target));
  let body: ReactNode;
  switch (target.kind) {
    case "document":
      body = <DocumentInspector ctx={ctx} />;
      break;
    case "branch":
      body = <BranchInspector ctx={ctx} branchId={target.branchId} />;
      break;
    case "model":
      body = <ModelInspector ctx={ctx} branchId={target.branchId} />;
      break;
    case "source":
      body = <SourceInspector ctx={ctx} owner={target.branchId} sourceId={target.sourceId} addRequest={addRequest} />;
      break;
    case "step":
      body = <StepInspector ctx={ctx} owner={target.branchId} sourceId={target.sourceId} index={target.index} />;
      break;
    case "merge":
      body = <MergeInspector ctx={ctx} />;
      break;
  }
  return (
    <div className="n4mm-pe-inspector">
      {target.kind !== "document" ? (
        <button type="button" className="n4mm-pe-link" onClick={() => ctx.select({ kind: "document" })}>
          ← Pipeline overview
        </button>
      ) : null}
      {ownIssues.length > 0 ? (
        <ul className="n4mm-pe-inspector__issues">
          {ownIssues.map((issue, index) => (
            <li key={index} data-severity={issue.severity}>
              <span className="n4mm-pe__sev">{issue.severity === "error" ? "Error" : "Warning"}</span> {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      {body}
    </div>
  );
}

function InspectorHead({ kind, title, children }: { kind: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="n4mm-pe-inspector__head">
      <span className="n4mm-pe__eyebrow">{kind}</span>
      <h4 className="n4mm-pe-inspector__title">{title}</h4>
      {children}
    </header>
  );
}

function DocumentInspector({ ctx }: { ctx: EditorContext }) {
  const { value } = ctx;
  return (
    <fieldset className="n4mm-pe-inspector__body" disabled={ctx.disabled}>
      <legend className="n4mm-sr-only">Pipeline settings</legend>
      <InspectorHead kind="Pipeline" title={value.label || "Untitled pipeline"} />
      <TextField label="Pipeline name" value={value.label} onCommit={(label) => ctx.edit({ ...value, label })} />
      <dl className="n4mm-pe-facts">
        <dt>Model branches</dt>
        <dd>{value.branches.length}</dd>
        <dt>Merge</dt>
        <dd>{MERGE_KIND_LABEL[value.merge.kind]}</dd>
        <dt>Sources used</dt>
        <dd>
          {ctx.sources
            .filter(
              (source) =>
                value.branches.some((branch) => branch.sourceIds.includes(source.id)) || value.merge.sourceIds.includes(source.id),
            )
            .map((source) => sourceLabel(ctx, source.id))
            .join(", ") || "none"}
        </dd>
      </dl>
      <p className="n4mm-pe__hint">{mergeInputsText(value, ctx.sources, ctx.modelCatalog)}</p>
      <p className="n4mm-pe__hint">
        Select any card on the canvas to edit it: a branch title for its name and inputs, a source for its preprocessing chain, a step for
        its parameters, a model for its method, and the merge for the fusion topology.
      </p>
    </fieldset>
  );
}

function BranchInspector({ ctx, branchId }: { ctx: EditorContext; branchId: string }) {
  const index = ctx.value.branches.findIndex((branch) => branch.id === branchId);
  const branch = ctx.value.branches[index];
  if (!branch) return null;
  const option = findModelOption(branch.head.methodId, ctx.modelCatalog);
  const name = branch.label || branch.id;
  const unknown = branch.sourceIds.filter((id) => !ctx.byId.has(id));
  const toggle = (sourceId: string, on: boolean) =>
    ctx.edit(on ? connectSource(ctx.value, branch.id, sourceId, ctx.hostOrder) : disconnectSource(ctx.value, branch.id, sourceId));
  return (
    <fieldset className="n4mm-pe-inspector__body" disabled={ctx.disabled}>
      <legend className="n4mm-sr-only">Branch {name}</legend>
      <InspectorHead kind={`Branch B${index + 1}`} title={name} />
      <TextField
        label="Branch name"
        value={branch.label}
        validate={(draft) => (draft.trim() === "" ? "A branch needs a name." : null)}
        onCommit={(label) => ctx.edit(updateBranch(ctx.value, branch.id, { label }))}
      />
      <TextField
        label="Branch ID"
        mono
        value={branch.id}
        hint="Stable identifier used in results and exports."
        validate={(draft) => branchIdError(ctx.value, branch.id, draft)}
        onCommit={(id) => {
          ctx.edit(updateBranch(ctx.value, branch.id, { id }));
          ctx.select({ kind: "branch", branchId: id });
        }}
      />
      <div className="n4mm-pe-buttons">
        <button type="button" className="n4mm-button" data-variant="quiet" disabled={index === 0} onClick={() => ctx.edit(moveBranch(ctx.value, branch.id, -1))}>
          ↑ Move up
        </button>
        <button
          type="button"
          className="n4mm-button"
          data-variant="quiet"
          disabled={index === ctx.value.branches.length - 1}
          onClick={() => ctx.edit(moveBranch(ctx.value, branch.id, 1))}
        >
          ↓ Move down
        </button>
        <button
          type="button"
          className="n4mm-button"
          data-variant="quiet"
          onClick={() => {
            const result = duplicateBranch(ctx.value, branch.id);
            ctx.edit(result.document);
            ctx.select({ kind: "branch", branchId: result.branchId });
          }}
        >
          ⧉ Duplicate
        </button>
        <button type="button" className="n4mm-button" data-variant="danger" onClick={() => ctx.edit(removeBranch(ctx.value, branch.id))}>
          × Delete branch
        </button>
      </div>

      <div className="n4mm-pe-group" role="group" aria-label={`Sources connected to ${name}`}>
        <h5 className="n4mm-pe__heading">Connected sources</h5>
        <p className="n4mm-pe__hint">
          Disconnecting a source deletes its preprocessing chain in this branch. Order follows the dataset.
        </p>
        {ctx.sources.map((source, sourceIndex) => {
          const on = branch.sourceIds.includes(source.id);
          const steps = chainFor(branch, source.id)?.steps.length ?? 0;
          return (
            <label key={source.id} className="n4mm-check n4mm-pe-source-check">
              <input type="checkbox" checked={on} onChange={(event) => toggle(source.id, event.currentTarget.checked)} />
              <SourceTag index={sourceIndex} />
              <span>
                {source.label}
                <span className="n4mm-muted">
                  {" "}
                  · {representationLabel(source.representation)} · {shapeText(source.shape)}
                  {on ? ` · ${steps} step${steps === 1 ? "" : "s"}` : ""}
                </span>
              </span>
            </label>
          );
        })}
        {unknown.map((sourceId) => (
          <label key={sourceId} className="n4mm-check n4mm-pe-source-check">
            <input type="checkbox" checked onChange={() => toggle(sourceId, false)} />
            <SourceTag index={undefined} />
            <span className="n4mm-mono">{sourceId}</span>
            <span className="n4mm-muted"> · not in the loaded dataset</span>
          </label>
        ))}
      </div>
      <p className="n4mm-pe__hint">{combinationText(branch, ctx.sources, ctx.modelCatalog)}</p>
      <div className="n4mm-pe-buttons">
        <button type="button" className="n4mm-button" data-variant="quiet" onClick={() => ctx.select({ kind: "model", branchId: branch.id })}>
          Edit model: {option ? modelSummary(branch.head, ctx.modelCatalog) : branch.head.methodId}
        </button>
      </div>
    </fieldset>
  );
}

function HeadEditor({
  ctx,
  head,
  options,
  onChange,
  label,
}: {
  ctx: EditorContext;
  head: MultimodalStep;
  options: readonly MultimodalModelOption[];
  onChange: (head: MultimodalStep) => void;
  label: string;
}) {
  const option = options.find((candidate) => candidate.methodId === head.methodId);
  const primary = option?.params.filter((spec) => !spec.advanced) ?? [];
  const advanced = option?.params.filter((spec) => spec.advanced) ?? [];
  const declared = new Set(option?.params.map((spec) => spec.name) ?? []);
  const preserved = Object.keys(head.params).filter((name) => !declared.has(name));
  const field = (spec: MultimodalModelParamSpec) => (
    <div key={spec.name} className="n4mm-pe-param">
      {head.params[spec.name] === undefined ? <>
        <span className="n4mm-field__label">{spec.label}</span>
        <span className="n4mm-field__hint">Not set. The native default applies.</span>
        <button type="button" className="n4mm-button" data-variant="quiet"
          onClick={() => onChange(withParam(head, spec.name, spec.default))}>
          Set {spec.label} to {String(spec.default)}
        </button>
      </> : <ParamField spec={spec} value={head.params[spec.name]!} onChange={(next) => onChange(withParam(head, spec.name, next))} />}
      {spec.hint ? <span className="n4mm-field__hint">{spec.hint}</span> : null}
    </div>
  );
  return (
    <>
      <label className="n4mm-field">
        <span className="n4mm-field__label">{label}</span>
        <select
          value={head.methodId}
          onChange={(event) => {
            const next = options.find((candidate) => candidate.methodId === event.currentTarget.value);
            if (next) onChange(headForModel(next, head));
          }}
        >
          {option ? null : (
            <option value={head.methodId} disabled>
              Unsupported: {head.methodId}
            </option>
          )}
          {options.map((candidate) => (
            <option key={candidate.methodId} value={candidate.methodId}>
              {candidate.label}
            </option>
          ))}
        </select>
        <span className="n4mm-field__hint n4mm-mono">{head.methodId}</span>
      </label>
      {option ? <p className="n4mm-pe__hint">{option.description}</p> : null}
      {primary.length > 0 ? <div className="n4mm-pe-params">{primary.map(field)}</div> : null}
      {advanced.length > 0 ? (
        <details className="n4mm-details">
          <summary>Advanced parameters ({advanced.length})</summary>
          <div className="n4mm-pe-params">{advanced.map(field)}</div>
        </details>
      ) : null}
      {preserved.length > 0 ? (
        <p className="n4mm-pe__hint">
          Additional parameters kept unchanged: <span className="n4mm-mono">{preserved.join(", ")}</span>.
        </p>
      ) : null}
      {ctx.disabled ? <p className="n4mm-pe__hint">Editing is locked while the pipeline runs.</p> : null}
    </>
  );
}

function ModelInspector({ ctx, branchId }: { ctx: EditorContext; branchId: string }) {
  const index = ctx.value.branches.findIndex((branch) => branch.id === branchId);
  const branch = ctx.value.branches[index];
  if (!branch) return null;
  const option = findModelOption(branch.head.methodId, ctx.modelCatalog);
  const options = ctx.modelCatalog.filter((candidate) => candidate.roles.includes("branch"));
  return (
    <fieldset className="n4mm-pe-inspector__body" disabled={ctx.disabled}>
      <legend className="n4mm-sr-only">Model of {branch.label || branch.id}</legend>
      <InspectorHead kind={`Model · branch B${index + 1}`} title={option?.label ?? branch.head.methodId}>
        <button type="button" className="n4mm-pe-link" onClick={() => ctx.select({ kind: "branch", branchId: branch.id })}>
          {branch.label || branch.id}
        </button>
      </InspectorHead>
      <HeadEditor
        ctx={ctx}
        head={branch.head}
        options={options}
        label="Model"
        onChange={(head) => ctx.edit(updateBranch(ctx.value, branch.id, { head }))}
      />
      <h5 className="n4mm-pe__heading">Inputs</h5>
      <p className="n4mm-pe__hint">{combinationText(branch, ctx.sources, ctx.modelCatalog)}</p>
      {option?.inputMode === "network" ? (
        <ul className="n4mm-pe-derived">
          {branch.sourceIds.map((sourceId) => {
            const source = ctx.byId.get(sourceId);
            return (
              <li key={sourceId}>
                {sourceLabel(ctx, sourceId)}:{" "}
                {source
                  ? `${NETWORK_BRANCH_LABEL[networkBranchKind(source.representation)]} on ${shapeText(source.shape)}`
                  : "unknown shape"}
              </li>
            );
          })}
          <li>Branch types follow these source shapes.</li>
        </ul>
      ) : null}
    </fieldset>
  );
}

function ChainList({
  ctx,
  owner,
  sourceId,
}: {
  ctx: EditorContext;
  owner: PipelineOwner;
  sourceId: string;
}) {
  const ownerObject = owner === null ? ctx.value.merge : findBranch(ctx.value, owner);
  const steps = ownerObject ? (chainFor(ownerObject, sourceId)?.steps ?? []) : [];
  if (steps.length === 0) return <p className="n4mm-pe__hint">No preprocessing: the source enters the operator as supplied.</p>;
  return (
    <ol className="n4mm-pe-chain">
      {steps.map((step, index) => {
        const option = findStepOption(step.methodId, ctx.stepCatalog);
        const label = option?.label ?? step.methodId;
        return (
          <li key={`${index}:${step.methodId}`}>
            <button
              type="button"
              className="n4mm-pe-link"
              onClick={() => ctx.select({ kind: "step", branchId: owner, sourceId, index })}
            >
              {index + 1}. {label}
            </button>
            <span className="n4mm-badge" data-tone={option?.fitScope === "train-fitted" ? "fitted" : undefined}>
              {option ? (option.fitScope === "train-fitted" ? "fitted on train" : "per sample") : "not in catalogue"}
            </span>
            <span className="n4mm-pe-chain__tools">
              <button
                type="button"
                className="n4mm-icon"
                disabled={index === 0}
                aria-label={`Move ${label} up`}
                onClick={() => ctx.edit(moveStep(ctx.value, owner, sourceId, index, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="n4mm-icon"
                disabled={index === steps.length - 1}
                aria-label={`Move ${label} down`}
                onClick={() => ctx.edit(moveStep(ctx.value, owner, sourceId, index, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="n4mm-icon"
                aria-label={`Remove ${label}`}
                onClick={() => ctx.edit(removeStep(ctx.value, owner, sourceId, index))}
              >
                ×
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SourceInspector({
  ctx,
  owner,
  sourceId,
  addRequest,
}: {
  ctx: EditorContext;
  owner: PipelineOwner;
  sourceId: string;
  addRequest: number;
}) {
  const addRef = useRef<HTMLSelectElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (addRequest > 0) addRef.current?.focus();
  }, [addRequest]);
  const source = ctx.byId.get(sourceId);
  const ownerObject = owner === null ? ctx.value.merge : findBranch(ctx.value, owner);
  const connected = ownerObject?.sourceIds.includes(sourceId) ?? false;
  const options = source ? stepOptionsFor(source.representation, ctx.stepCatalog) : [];
  const where = ownerLabel(ctx, owner);
  const peers = ctx.value.branches.filter((branch) => branch.id !== owner && branch.sourceIds.includes(sourceId)).length;
  return (
    <fieldset className="n4mm-pe-inspector__body" disabled={ctx.disabled}>
      <legend className="n4mm-sr-only">
        {sourceLabel(ctx, sourceId)} in {where}
      </legend>
      <InspectorHead kind={owner === null ? "Raw feature input" : "Source input"} title={sourceLabel(ctx, sourceId)}>
        <button
          type="button"
          className="n4mm-pe-link"
          onClick={() => ctx.select(owner === null ? { kind: "merge" } : { kind: "branch", branchId: owner })}
        >
          in {where}
        </button>
      </InspectorHead>
      {source ? (
        <dl className="n4mm-pe-facts">
          <dt>Representation</dt>
          <dd>{representationLabel(source.representation)}</dd>
          <dt>Shape per sample</dt>
          <dd>{shapeText(source.shape)}</dd>
          {source.axis ? (
            <>
              <dt>Axis</dt>
              <dd>
                {source.axis.kind} ({source.axis.unit})
              </dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="n4mm-pe__hint">This source is not in the loaded dataset.</p>
      )}
      <h5 className="n4mm-pe__heading">Preprocessing chain</h5>
      <p className="n4mm-pe__hint">
        Applied to this source only, before the operator combines inputs. Train-fitted steps learn inside each training scope and are
        replayed unchanged on validation and test samples.
      </p>
      <ChainList ctx={ctx} owner={owner} sourceId={sourceId} />
      {options.length > 0 ? (
        <label className="n4mm-field">
          <span className="n4mm-field__label">Add a step at the end</span>
          <select
            ref={addRef}
            value=""
            onChange={(event) => {
              const option = findStepOption(event.currentTarget.value, ctx.stepCatalog);
              if (!option) return;
              const count = ownerObject ? (chainFor(ownerObject, sourceId)?.steps.length ?? 0) : 0;
              ctx.edit(insertStep(ctx.value, owner, sourceId, { methodId: option.methodId, params: defaultStepParams(option) }));
              ctx.select({ kind: "step", branchId: owner, sourceId, index: count });
            }}
          >
            <option value="">Choose an operation…</option>
            {options.map((option) => (
              <option key={option.methodId} value={option.methodId}>
                {option.label} ({option.fitScope === "train-fitted" ? "train-fitted" : "per sample"})
              </option>
            ))}
          </select>
        </label>
      ) : source ? (
        <p className="n4mm-pe__hint">No preprocessing operation is offered for this representation.</p>
      ) : null}
      <div className="n4mm-pe-buttons">
        {peers > 0 ? (
          <button
            type="button"
            className="n4mm-button"
            data-variant="quiet"
            onClick={() => {
              const result = copyChainToBranches(ctx.value, owner, sourceId);
              ctx.edit(result.document);
              setCopied(`Chain copied to ${result.changed} other branch${result.changed === 1 ? "" : "es"}.`);
            }}
          >
            Copy chain to {peers} other branch{peers === 1 ? "" : "es"} using this source
          </button>
        ) : null}
        <button type="button" className="n4mm-button" data-variant="danger" onClick={() => ctx.edit(disconnectSource(ctx.value, owner, sourceId))}>
          {connected ? "Disconnect source" : "Delete chain"}
        </button>
      </div>
      <p className="n4mm-pe__hint" role="status">
        {copied ?? ""}
      </p>
    </fieldset>
  );
}

function StepInspector({ ctx, owner, sourceId, index }: { ctx: EditorContext; owner: PipelineOwner; sourceId: string; index: number }) {
  const ownerObject = owner === null ? ctx.value.merge : findBranch(ctx.value, owner);
  const steps = ownerObject ? (chainFor(ownerObject, sourceId)?.steps ?? []) : [];
  const step = steps[index];
  if (!step) return null;
  const option = findStepOption(step.methodId, ctx.stepCatalog);
  const where = ownerLabel(ctx, owner);
  return (
    <fieldset className="n4mm-pe-inspector__body" disabled={ctx.disabled}>
      <legend className="n4mm-sr-only">
        Step {index + 1} of {sourceLabel(ctx, sourceId)} in {where}
      </legend>
      <InspectorHead kind={`Preprocessing step ${index + 1} of ${steps.length}`} title={option?.label ?? step.methodId}>
        <button type="button" className="n4mm-pe-link" onClick={() => ctx.select({ kind: "source", branchId: owner, sourceId })}>
          {sourceLabel(ctx, sourceId)} in {where}
        </button>
      </InspectorHead>
      <p className="n4mm-pe-inspector__meta">
        <span className="n4mm-badge" data-tone={option?.fitScope === "train-fitted" ? "fitted" : undefined}>
          {option ? (option.fitScope === "train-fitted" ? "fitted on training scope" : "per sample") : "not in catalogue"}
        </span>
        <span className="n4mm-mono n4mm-muted">{step.methodId}</span>
      </p>
      {option ? <p className="n4mm-pe__hint">{option.description}</p> : null}
      {option && option.params.length > 0 ? (
        <div className="n4mm-pe-params">
          {option.params.map((spec) => step.params[spec.name] === undefined ? (
            <div key={spec.name} className="n4mm-pe-param">
              <span className="n4mm-field__label">{spec.label}</span>
              <span className="n4mm-field__hint">Not set. The native default applies.</span>
              <button type="button" className="n4mm-button" data-variant="quiet"
                onClick={() => ctx.edit(updateStep(ctx.value, owner, sourceId, index, withParam(step, spec.name, spec.default)))}>
                Set {spec.label} to {String(spec.default)}
              </button>
            </div>
          ) : (
            <ParamField key={spec.name} spec={spec} value={step.params[spec.name]!}
              onChange={(next) => ctx.edit(updateStep(ctx.value, owner, sourceId, index, withParam(step, spec.name, next)))} />
          ))}
        </div>
      ) : option ? (
        <p className="n4mm-pe__hint">This operation has no parameter.</p>
      ) : (
        <dl className="n4mm-pe-facts">
          {Object.entries(step.params).map(([name, value]) => (
            <div key={name}>
              <dt className="n4mm-mono">{name}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="n4mm-pe-buttons">
        <button
          type="button"
          className="n4mm-button"
          data-variant="quiet"
          disabled={index === 0}
          onClick={() => {
            ctx.edit(moveStep(ctx.value, owner, sourceId, index, -1));
            ctx.select({ kind: "step", branchId: owner, sourceId, index: index - 1 });
          }}
        >
          ← Earlier
        </button>
        <button
          type="button"
          className="n4mm-button"
          data-variant="quiet"
          disabled={index === steps.length - 1}
          onClick={() => {
            ctx.edit(moveStep(ctx.value, owner, sourceId, index, 1));
            ctx.select({ kind: "step", branchId: owner, sourceId, index: index + 1 });
          }}
        >
          Later →
        </button>
        <button
          type="button"
          className="n4mm-button"
          data-variant="danger"
          onClick={() => {
            ctx.edit(removeStep(ctx.value, owner, sourceId, index));
            ctx.select({ kind: "source", branchId: owner, sourceId });
          }}
        >
          × Remove step
        </button>
      </div>
    </fieldset>
  );
}

function MergeInspector({ ctx }: { ctx: EditorContext }) {
  const { merge } = ctx.value;
  const name = useId();
  const metaOptions = ctx.modelCatalog.filter((option) => option.roles.includes("meta"));
  const toggleFeature = (sourceId: string, on: boolean) =>
    ctx.edit(on ? connectSource(ctx.value, null, sourceId, ctx.hostOrder) : disconnectSource(ctx.value, null, sourceId));
  return (
    <fieldset className="n4mm-pe-inspector__body" disabled={ctx.disabled}>
      <legend className="n4mm-sr-only">Merge</legend>
      <InspectorHead kind="Merge" title={MERGE_KIND_LABEL[merge.kind]} />
      <div className="n4mm-pe-kinds" role="radiogroup" aria-label="How branch predictions are merged">
        {(["none", "mean", "model"] as const).map((kind) => (
          <label key={kind} className="n4mm-pe-kind" data-checked={merge.kind === kind || undefined}>
            <input
              type="radio"
              name={name}
              checked={merge.kind === kind}
              onChange={() => ctx.edit(updateMerge(ctx.value, { kind }))}
            />
            <span>
              <strong>{MERGE_KIND_LABEL[kind]}</strong>
              <span className="n4mm-pe-kind__text">{MERGE_KIND_TEXT[kind]}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="n4mm-pe__hint">Changing the merge never deletes branches or inputs; mismatches are listed as errors to resolve.</p>
      <h5 className="n4mm-pe__heading">Actual inputs</h5>
      <p className="n4mm-pe-merge-text">{mergeInputsText(ctx.value, ctx.sources, ctx.modelCatalog)}</p>
      {merge.kind === "model" ? (
        <>
          <HeadEditor
            ctx={ctx}
            head={merge.head}
            options={metaOptions}
            label="Meta-model"
            onChange={(head) => ctx.edit(updateMerge(ctx.value, { head }))}
          />
          <p className="n4mm-caveat">The meta-model never sees in-sample branch predictions or held-out samples.</p>
        </>
      ) : merge.kind === "mean" ? (
        <p className="n4mm-caveat">Fixed averaging is not stacking: the merge has no fitted weights.</p>
      ) : null}
      {merge.kind === "model" || merge.sourceIds.length > 0 ? (
        <div className="n4mm-pe-group" role="group" aria-label="Raw feature inputs of the meta-model">
          <h5 className="n4mm-pe__heading">Raw feature inputs (hybrid)</h5>
          <p className="n4mm-pe__hint">
            Preprocessed source variables given to the meta-model next to the out-of-fold predictions, aligned by sample identity.
          </p>
          {ctx.sources.map((source, index) => (
            <label key={source.id} className="n4mm-check n4mm-pe-source-check">
              <input
                type="checkbox"
                checked={merge.sourceIds.includes(source.id)}
                onChange={(event) => toggleFeature(source.id, event.currentTarget.checked)}
              />
              <SourceTag index={index} />
              {source.label}
            </label>
          ))}
          {merge.sourceIds
            .filter((id) => !ctx.byId.has(id))
            .map((id) => (
              <label key={id} className="n4mm-check n4mm-pe-source-check">
                <input type="checkbox" checked onChange={() => toggleFeature(id, false)} />
                <SourceTag index={undefined} />
                <span className="n4mm-mono">{id}</span>
              </label>
            ))}
        </div>
      ) : null}
    </fieldset>
  );
}
