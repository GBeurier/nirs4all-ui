import { useState, type ReactNode } from "react";

import { cx } from "../workbench/_cx.js";
import { Button, IconButton, NumberField, Popover, SelectField, Toggle } from "../workbench/controls.js";
import { formatDuration, formatValue } from "../workbench/format.js";
import { resolveIcons, type WorkbenchIcons } from "../workbench/icons.js";
import type { RowColumn } from "../workbench/colorBy.js";
import type { PlaygroundStrings } from "./locale.js";
import { OPERATOR_KIND_COLORS, OperatorPicker } from "./OperatorPicker.js";
import { RAW_CURSOR, summarizeParams } from "./pipeline.js";
import type { OperatorDefinition, OperatorParam, PipelineStep, StepOutcome } from "./types.js";

export interface PipelinePanelProps {
  steps: readonly PipelineStep[];
  operators: readonly OperatorDefinition[];
  outcomes: ReadonlyMap<string, StepOutcome>;
  cursor: string | null;
  onCursorChange: (cursor: string | null) => void;
  onAdd: (operator: OperatorDefinition, afterStepId: string | null) => void;
  onUpdate: (stepId: string, patch: Partial<Omit<PipelineStep, "id">>) => void;
  onRemove: (stepId: string) => void;
  onDuplicate: (stepId: string) => void;
  onMove: (stepId: string, toIndex: number) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Dataset columns offered to `column`-typed parameters. */
  columns: readonly RowColumn[];
  datasetCard: ReactNode;
  footer?: ReactNode;
  rawShape?: readonly [number, number] | undefined;
  running: boolean;
  strings: PlaygroundStrings;
  icons?: WorkbenchIcons | undefined;
}

function ParamEditor({
  param,
  value,
  onChange,
  columns,
}: {
  param: OperatorParam;
  value: unknown;
  onChange: (value: unknown) => void;
  columns: readonly RowColumn[];
}) {
  const label = param.label ?? param.name;
  switch (param.type) {
    case "bool":
      return <Toggle checked={Boolean(value)} onChange={onChange} label={label} {...(param.help ? { hint: param.help } : {})} />;
    case "select":
      return (
        <SelectField
          label={label}
          value={String(value ?? "")}
          options={(param.options ?? []).map((o) => ({ value: String(o.value), label: o.label ?? String(o.value) }))}
          onChange={(raw) => {
            const option = param.options?.find((o) => String(o.value) === raw);
            onChange(option ? option.value : raw);
          }}
        />
      );
    case "column":
      return (
        <SelectField
          label={label}
          value={String(value ?? "")}
          placeholder="—"
          options={columns.map((c) => ({ value: c.key, label: c.label }))}
          onChange={onChange}
        />
      );
    case "range": {
      const pair = Array.isArray(value) ? (value as number[]) : [param.min ?? 0, param.max ?? 1];
      return (
        <div className="n4pg-param-range">
          <span className="n4wb-field-label">{label}</span>
          <NumberField label="min" value={pair[0] ?? 0} onChange={(v) => onChange([v, pair[1]])} {...(param.unit ? { unit: param.unit } : {})} />
          <NumberField label="max" value={pair[1] ?? 0} onChange={(v) => onChange([pair[0], v])} {...(param.unit ? { unit: param.unit } : {})} />
        </div>
      );
    }
    case "int":
    case "float": {
      const numeric = typeof value === "number" ? value : Number(param.default ?? 0);
      const step = param.step ?? (param.type === "int" ? 1 : 0.01);
      const bounded = param.min !== undefined && param.max !== undefined;
      return (
        <div className="n4pg-param-num">
          <NumberField
            label={label}
            value={numeric}
            onChange={(v) => onChange(param.type === "int" ? Math.round(v) : v)}
            {...(param.min !== undefined ? { min: param.min } : {})}
            {...(param.max !== undefined ? { max: param.max } : {})}
            step={step}
            {...(param.unit ? { unit: param.unit } : {})}
          />
          {bounded ? (
            <input
              type="range"
              className="n4pg-slider"
              min={param.min}
              max={param.max}
              step={step}
              value={numeric}
              aria-label={label}
              onChange={(event) => onChange(param.type === "int" ? Math.round(Number(event.target.value)) : Number(event.target.value))}
            />
          ) : null}
        </div>
      );
    }
    default:
      return (
        <label className="n4wb-field">
          <span className="n4wb-field-label">{label}</span>
          <input className="n4wb-input" defaultValue={String(value ?? "")} onBlur={(event) => onChange(event.target.value)} />
        </label>
      );
  }
}

function StepCard({
  step,
  index,
  count,
  operator,
  outcome,
  inPreview,
  isCursor,
  expanded,
  onToggleExpand,
  props,
  dragHandlers,
}: {
  step: PipelineStep;
  index: number;
  count: number;
  operator: OperatorDefinition | undefined;
  outcome: StepOutcome | undefined;
  inPreview: boolean;
  isCursor: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  props: PipelinePanelProps;
  dragHandlers: {
    onDragStart: () => void;
    onDragEnd: () => void;
    onDragOver: () => void;
    onDrop: () => void;
    isDragging: boolean;
    isDropTarget: boolean;
  };
}) {
  const { strings } = props;
  const icon = resolveIcons(props.icons);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const kind = operator?.kind ?? "other";
  const color = OPERATOR_KIND_COLORS[kind];
  const params = operator?.params ?? [];
  const basic = params.filter((p) => !p.advanced);
  const advanced = params.filter((p) => p.advanced);
  const status = outcome?.status;
  const removed = outcome?.removedRows?.length ?? 0;
  const tagged = outcome?.taggedRows?.length ?? 0;

  return (
    <li
      className={cx(
        "n4pg-step",
        !step.enabled && "is-disabled",
        !inPreview && "is-outside",
        isCursor && "is-cursor",
        status === "error" && "is-error",
        dragHandlers.isDragging && "is-dragging",
        dragHandlers.isDropTarget && "is-drop-target",
      )}
      style={{ ["--kind" as string]: color }}
      onDragOver={(event) => {
        event.preventDefault();
        dragHandlers.onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragHandlers.onDrop();
      }}
    >
      <button
        type="button"
        className="n4pg-node"
        aria-label={isCursor ? strings.previewAll : strings.previewHere}
        title={isCursor ? strings.previewAll : strings.previewHere}
        aria-pressed={isCursor}
        onClick={() => props.onCursorChange(isCursor ? null : step.id)}
      >
        <span className="n4pg-node-dot" />
      </button>
      <div className="n4pg-card">
        <div className="n4pg-card-head">
          <span
            className="n4pg-grip"
            draggable
            title="Drag to reorder"
            aria-hidden="true"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", step.id);
              dragHandlers.onDragStart();
            }}
            onDragEnd={dragHandlers.onDragEnd}
          >
            {icon.grip}
          </span>
          <button type="button" className="n4pg-card-title" onClick={onToggleExpand} aria-expanded={expanded}>
            <span className="n4pg-card-name">{step.label ?? operator?.name ?? step.operatorId}</span>
            {!expanded ? <span className="n4pg-card-summary">{summarizeParams(operator, step.params)}</span> : null}
          </button>
          <span className="n4pg-card-actions">
            <Toggle checked={step.enabled} onChange={(enabled) => props.onUpdate(step.id, { enabled })} label={<span className="n4wb-sr">{step.enabled ? strings.disable : strings.enable}</span>} />
            <Popover label="Step actions" trigger={<span aria-hidden="true">⋯</span>} triggerClassName="n4wb-icon-btn">
              {(close) => (
                <ul className="n4wb-menu">
                  <li>
                    <button type="button" className="n4wb-menu-item" disabled={index === 0} onClick={() => { props.onMove(step.id, index - 1); close(); }}>
                      {strings.moveUp}
                    </button>
                  </li>
                  <li>
                    <button type="button" className="n4wb-menu-item" disabled={index === count - 1} onClick={() => { props.onMove(step.id, index + 1); close(); }}>
                      {strings.moveDown}
                    </button>
                  </li>
                  <li>
                    <button type="button" className="n4wb-menu-item" onClick={() => { props.onDuplicate(step.id); close(); }}>
                      {strings.duplicate}
                    </button>
                  </li>
                  <li className="n4wb-menu-sep" role="separator" />
                  <li>
                    <button type="button" className="n4wb-menu-item n4pg-danger" onClick={() => { props.onRemove(step.id); close(); }}>
                      {strings.remove}
                    </button>
                  </li>
                </ul>
              )}
            </Popover>
          </span>
        </div>
        <div className="n4pg-card-meta">
          {status === "ok" || status === undefined ? (
            <>
              {outcome?.durationMs !== undefined ? <span>{formatDuration(outcome.durationMs)}</span> : null}
              {outcome?.shape ? <span className="n4wb-mono">{strings.stepShape(outcome.shape[0], outcome.shape[1])}</span> : null}
              {removed > 0 ? <span className="n4pg-badge is-danger">{strings.removedRows(removed)}</span> : null}
              {tagged > 0 ? <span className="n4pg-badge is-warning">{strings.taggedRows(tagged)}</span> : null}
              {!inPreview ? <span className="n4pg-badge">{strings.notApplied}</span> : null}
              {props.running && inPreview && step.enabled ? <span className="n4pg-pending" aria-hidden="true" /> : null}
            </>
          ) : status === "skipped" ? (
            <span className="n4pg-badge">skipped</span>
          ) : null}
        </div>
        {status === "error" && outcome?.message ? <p className="n4wb-note is-error n4pg-card-error">{outcome.message}</p> : null}
        {expanded ? (
          <div className="n4pg-params">
            {operator?.description ? <p className="n4pg-card-desc">{operator.description}</p> : null}
            {basic.map((param) => (
              <ParamEditor
                key={param.name}
                param={param}
                value={step.params[param.name]}
                columns={props.columns}
                onChange={(value) => props.onUpdate(step.id, { params: { ...step.params, [param.name]: value } })}
              />
            ))}
            {advanced.length > 0 ? (
              <>
                <button type="button" className="n4pg-advanced-toggle" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
                  {showAdvanced ? "−" : "+"} {strings.advanced} ({advanced.length})
                </button>
                {showAdvanced
                  ? advanced.map((param) => (
                      <ParamEditor
                        key={param.name}
                        param={param}
                        value={step.params[param.name]}
                        columns={props.columns}
                        onChange={(value) => props.onUpdate(step.id, { params: { ...step.params, [param.name]: value } })}
                      />
                    ))
                  : null}
              </>
            ) : null}
            {params.length === 0 ? <p className="n4wb-muted n4pg-card-desc">No parameters.</p> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The pipeline timeline: the raw-data node, then one card per step. The rail
 * nodes set the *preview cursor* — views show the data after that step, and
 * later steps are dimmed — so any intermediate state of the chain is one click
 * away without editing it.
 */
export function PipelinePanel(props: PipelinePanelProps) {
  const { steps, operators, outcomes, cursor, strings } = props;
  const icon = resolveIcons(props.icons);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const byId = new Map(operators.map((op) => [op.id, op]));
  const cursorIndex = cursor && cursor !== RAW_CURSOR ? steps.findIndex((s) => s.id === cursor) : cursor === RAW_CURSOR ? -1 : steps.length - 1;
  const insertAfter = cursor && cursor !== RAW_CURSOR ? cursor : null;

  const picker = (
    <Popover
      label={strings.addStep}
      align="start"
      className="n4pg-add"
      triggerClassName="n4wb-btn n4wb-btn-primary n4pg-add-btn"
      trigger={
        <>
          {icon.plus}
          <span>{strings.addStep}</span>
        </>
      }
    >
      {(close) => (
        <OperatorPicker
          operators={operators}
          strings={strings}
          icons={props.icons}
          onPick={(op) => {
            props.onAdd(op, insertAfter);
            close();
          }}
        />
      )}
    </Popover>
  );

  return (
    <div className="n4pg-pipeline">
      <div className="n4wb-panel-head">
        <h3>{strings.pipeline}</h3>
        <span className="n4wb-count">{steps.length}</span>
        <span className="n4wb-header-grow" />
        <IconButton label={strings.undo} shortcut="Ctrl+Z" disabled={!props.canUndo} onClick={props.onUndo}>
          {icon.undo}
        </IconButton>
        <IconButton label={strings.redo} shortcut="Ctrl+Shift+Z" disabled={!props.canRedo} onClick={props.onRedo}>
          {icon.redo}
        </IconButton>
        <IconButton label={strings.clearPipeline} tone="danger" disabled={steps.length === 0} onClick={props.onClear}>
          {icon.trash}
        </IconButton>
      </div>
      <div className="n4wb-scroll">
        {props.datasetCard}
        <ol className="n4pg-timeline">
          <li className={cx("n4pg-step", "n4pg-step-raw", cursor === RAW_CURSOR && "is-cursor")}>
            <button
              type="button"
              className="n4pg-node"
              aria-pressed={cursor === RAW_CURSOR}
              title={strings.rawDataHint}
              aria-label={strings.rawData}
              onClick={() => props.onCursorChange(cursor === RAW_CURSOR ? null : RAW_CURSOR)}
            >
              <span className="n4pg-node-dot" />
            </button>
            <div className="n4pg-raw">
              <strong>{strings.rawData}</strong>
              {props.rawShape ? <span className="n4wb-mono n4wb-muted">{strings.stepShape(props.rawShape[0], props.rawShape[1])}</span> : null}
            </div>
          </li>
          {steps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              count={steps.length}
              operator={byId.get(step.operatorId)}
              outcome={outcomes.get(step.id)}
              inPreview={index <= cursorIndex}
              isCursor={cursor === step.id}
              expanded={expanded === step.id}
              onToggleExpand={() => setExpanded((e) => (e === step.id ? null : step.id))}
              props={props}
              dragHandlers={{
                onDragStart: () => setDragging(step.id),
                onDragEnd: () => {
                  setDragging(null);
                  setDropTarget(null);
                },
                onDragOver: () => setDropTarget(step.id),
                onDrop: () => {
                  if (dragging && dragging !== step.id) props.onMove(dragging, index);
                  setDragging(null);
                  setDropTarget(null);
                },
                isDragging: dragging === step.id,
                isDropTarget: dropTarget === step.id && dragging !== step.id,
              }}
            />
          ))}
        </ol>
        {steps.length === 0 ? (
          <div className="n4pg-empty-chain">
            <strong>{strings.emptyPipeline}</strong>
            <p>{strings.emptyPipelineHint}</p>
          </div>
        ) : null}
        <div className="n4pg-add-row">{picker}</div>
      </div>
      {props.footer ? <div className="n4wb-panel-foot">{props.footer}</div> : null}
    </div>
  );
}

/** Compact dataset summary at the top of the pipeline panel. */
export function DatasetCard({
  name,
  rows,
  cols,
  range,
  unit,
  targets,
  activeTarget,
  onTargetChange,
  onChange,
  slot,
  strings,
}: {
  name: string;
  rows: number;
  cols: number;
  range: readonly [number, number] | null;
  unit: string;
  targets: ReadonlyArray<{ name: string; kind: string }>;
  activeTarget: string | null;
  onTargetChange: (name: string) => void;
  onChange?: (() => void) | undefined;
  slot?: ReactNode;
  strings: PlaygroundStrings;
}) {
  return (
    <div className="n4pg-dataset">
      <div className="n4pg-dataset-head">
        <span className="n4pg-dataset-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="6" rx="8" ry="3" />
            <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
          </svg>
        </span>
        <span className="n4pg-dataset-name" title={name}>
          {name}
        </span>
        {onChange ? (
          <Button variant="ghost" onClick={onChange}>
            {strings.changeDataset}
          </Button>
        ) : null}
      </div>
      <div className="n4pg-dataset-facts">
        <span>
          <strong className="n4wb-mono">{rows.toLocaleString("en-US")}</strong> {strings.samples}
        </span>
        <span>
          <strong className="n4wb-mono">{cols.toLocaleString("en-US")}</strong> {strings.wavelengths}
        </span>
        {range ? (
          <span className="n4wb-mono n4wb-muted">
            {formatValue(range[0], 1)}–{formatValue(range[1], 1)} {unit}
          </span>
        ) : null}
      </div>
      {targets.length > 1 ? (
        <SelectField
          label={strings.target}
          value={activeTarget ?? ""}
          options={targets.map((t) => ({ value: t.name, label: `${t.name} · ${t.kind}` }))}
          onChange={onTargetChange}
        />
      ) : targets.length === 1 ? (
        <div className="n4pg-dataset-target">
          {strings.target}: <strong>{targets[0]!.name}</strong> <span className="n4wb-muted">· {targets[0]!.kind}</span>
        </div>
      ) : null}
      {slot}
    </div>
  );
}
