import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";

import { cx } from "./_cx.js";
import { DatasetWizardStepper } from "./DatasetWizardStepper.js";
import { icon } from "./icons.js";
import {
  MULTIMODAL_AXIS_OPTIONS,
  MULTIMODAL_BUILDER_STEPS,
  MULTIMODAL_MODALITY_OPTIONS,
  MULTIMODAL_PROFILE_OPTIONS,
  MULTIMODAL_ROLE_OPTIONS,
  PNG_MANIFEST_HEADERS,
  PNG_SUPPORTED_CHANNELS,
  allowedAxisModes,
  allowedModalities,
  allowedProfiles,
  allowedRoles,
  builderDraftKey,
  builderIssues,
  carriesTarget,
  fileForSource,
  formatBytes,
  isDataTableFile,
  isMappingFile,
  isMeasurementRole,
  isNumericKind,
  optionLabel,
  replaceSource,
  reservedColumns,
  withCoordinate,
  withFeatures,
  withFieldColumn,
  withProfile,
  withRole,
  withShapeDimension,
  type MultimodalBuilderIssue,
  type MultimodalBuilderStep,
} from "./multimodalBuilderModel.js";
import type {
  MultimodalBuilderColumn,
  MultimodalBuilderDraft,
  MultimodalBuilderFile,
  MultimodalBuilderSource,
  MultimodalBuilderValidation,
  MultimodalDatasetBuilderProps,
} from "./multimodalTypes.js";

const ACCEPT = ".csv,.vcf,.png,.json";
const MAX_FEATURE_ROWS = 400;
const MAX_COORDINATE_ROWS = 200;
const MAX_IMAGE_ROWS = 12;

const STEP_TITLES: Record<MultimodalBuilderStep, string> = {
  source: "Add your files",
  role: "Choose the role of each table",
  columns: "Map identities, target and features",
  validation: "Validate the alignment",
};

const STEP_LEADS: Record<MultimodalBuilderStep, string> = {
  source: "Drop the measurement tables, an optional manifest and the image files. Files stay in this browser; the host describes every table.",
  role: "Tell the builder what each table contains. Values imported from a manifest are only a starting point and stay editable.",
  columns: "For each source, pick the sample identifier, the target and the feature columns.",
  validation: "The owner matches every source by sample identifier. The dataset can be created once this exact mapping is validated.",
};

const STEP_NAMES: Record<MultimodalBuilderStep, string> = {
  source: "Source",
  role: "Role",
  columns: "Columns",
  validation: "Validation",
};

const FILE_KIND_LABELS: Record<MultimodalBuilderFile["kind"], string> = {
  table: "Table",
  vcf: "VCF",
  image: "PNG image",
  manifest: "Manifest",
  other: "Unsupported",
};

type DisplayStatus = MultimodalBuilderValidation["status"] | "stale";

/**
 * Controlled four-step multimodal import wizard (Source → Role → Columns →
 * Validation). The host owns files, the draft, owner descriptions and
 * validation; this component renders them and reports user intent. It never
 * reads file bytes: pickers and drops only forward `File` objects.
 */
export function MultimodalDatasetBuilder({
  files,
  draft,
  onDraftChange,
  onAddFiles,
  onRemoveFile,
  validation,
  onValidate,
  onCreate,
  busy = false,
  disabled = false,
  error = null,
  className,
}: MultimodalDatasetBuilderProps) {
  const uid = useId();
  const [step, setStep] = useState<MultimodalBuilderStep>("source");
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);

  // Validation applies to one exact mapping: any later edit makes it stale.
  const key = useMemo(() => builderDraftKey(files, draft), [files, draft]);
  const keyRef = useRef(key);
  keyRef.current = key;
  const [checkedKey, setCheckedKey] = useState<string | null>(() => (validation.status === "idle" ? null : key));
  useEffect(() => {
    if (validation.status === "checking") setCheckedKey(keyRef.current);
  }, [validation.status]);

  useEffect(() => {
    if (!navigated.current) return;
    navigated.current = false;
    headingRef.current?.focus();
  }, [step]);

  const status: DisplayStatus =
    validation.status === "idle" ? "idle" : checkedKey === key ? validation.status : "stale";
  const issues = useMemo(() => builderIssues(files, draft), [files, draft]);
  const blocking = issues.filter((issue) => issue.blocking);
  const locked = disabled || busy;
  const canValidate = !locked && blocking.length === 0 && status !== "checking";
  const canCreate = !locked && status === "valid" && blocking.length === 0;

  const tables = files.filter(isMappingFile);
  const dataTableCount = files.filter(isDataTableFile).length;
  const manifestCount = files.filter((file) => file.kind === "manifest").length;
  const images = files.filter((file) => file.kind === "image");
  const activeSources = draft.sources.filter((source) => source.role !== "ignored");
  const measurementSources = activeSources.filter((source) => isMeasurementRole(source.role));
  const activeSource = activeSources.find((source) => source.id === activeSourceId) ?? activeSources[0];

  const stepIndex = MULTIMODAL_BUILDER_STEPS.indexOf(step);
  const previousStep = MULTIMODAL_BUILDER_STEPS[stepIndex - 1];
  const nextStep = MULTIMODAL_BUILDER_STEPS[stepIndex + 1];

  const goTo = (target: MultimodalBuilderStep, sourceId?: string) => {
    navigated.current = true;
    if (sourceId) setActiveSourceId(sourceId);
    setStep(target);
  };

  const updateSource = (id: string, update: (source: MultimodalBuilderSource) => MultimodalBuilderSource) => {
    onDraftChange(replaceSource(draft, id, update));
  };

  const validate = () => {
    setCheckedKey(key);
    onValidate();
  };

  const nextBlocker = (() => {
    if (step === "source") {
      if (tables.length === 0) return "Add a CSV or VCF table to continue.";
      if (draft.sources.length === 0) return busy ? "Waiting for the table descriptions…" : "The tables have not been described yet.";
    }
    if (step === "role" && measurementSources.length === 0) return "Mark at least one table as measurements or combined.";
    return null;
  })();

  const completed: MultimodalBuilderStep[] = [];
  if (tables.length > 0 && draft.sources.length > 0) completed.push("source");
  if (!issues.some((issue) => issue.blocking && issue.step === "role") && measurementSources.length > 0) completed.push("role");
  if (draft.sources.length > 0 && !issues.some((issue) => issue.blocking && issue.step === "columns")) completed.push("columns");
  if (status === "valid") completed.push("validation");

  const headingId = `${uid}-step-heading`;

  return (
    <div className={cx("dsb", "dsb-mm", className)} data-step={step} aria-busy={busy || undefined}>
      <header className="dsb__topbar dsb-mm__topbar">
        <div className="dsb__brand">
          <span className="dsb__brand-mark" aria-hidden="true">
            {icon("spark")}
          </span>
          <span className="dsb__brand-name">Dataset Builder</span>
          <span className="dsb__brand-sub">multimodal import</span>
        </div>
        <label className="dsb-mm__name">
          <span className="dsb-mm__name-label">Dataset name</span>
          <input
            className="dsb__name-input"
            type="text"
            value={draft.name}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            disabled={locked}
            spellCheck={false}
            required
          />
        </label>
        <div className="dsb__chips">
          <StatusChip status={status} />
        </div>
      </header>

      {error ? (
        <div className="dsb-mm-alert" role="alert">
          <span className="dsb-mm-alert__icon">{icon("error")}</span>
          <span>{error}</span>
        </div>
      ) : null}
      {busy ? (
        <p className="dsb-mm-busy" role="status">
          <span className="dsb-mm-busy__dot" aria-hidden="true" /> Working…
        </p>
      ) : null}

      <div className="dsb__body dsb-mm__body">
        <section className="dsb__main dsb-mm__main" aria-labelledby={headingId}>
          <div className="dsb-mm__progress">
            <DatasetWizardStepper activeStep={step} completedSteps={completed} onStepClick={(target) => goTo(target)} locale="en" />
            <p className="dsb-mm__count">
              {`Step ${stepIndex + 1} of ${MULTIMODAL_BUILDER_STEPS.length}`}
            </p>
          </div>

          <header className="dsb-mm__step-head">
            <h3 className="dsb__title dsb-mm__step-title" id={headingId} ref={headingRef} tabIndex={-1}>
              {STEP_TITLES[step]}
            </h3>
            <p className="dsb-mm__lead">{STEP_LEADS[step]}</p>
          </header>

          {step === "source" ? (
            <SourceStep
              uid={uid}
              tables={tables}
              images={images}
              draft={draft}
              locked={locked}
              onAddFiles={onAddFiles}
              onRemoveFile={onRemoveFile}
            />
          ) : null}

          {step === "role" ? (
            <RoleStep uid={uid} files={files} draft={draft} locked={locked} updateSource={updateSource} onBack={() => goTo("source")} />
          ) : null}

          {step === "columns" ? (
            activeSources.length === 0 || !activeSource ? (
              <EmptyStep message="No table is in use yet. Choose the role of each table first." action="Go to Role" onAction={() => goTo("role")} />
            ) : (
              <>
                <nav className="dsb__source-tabs dsb-mm-tabs" aria-label="Sources to map">
                  {activeSources.map((source, index) => (
                    <button
                      key={source.id}
                      type="button"
                      className="dsb__source-tab"
                      data-active={source.id === activeSource.id || undefined}
                      aria-current={source.id === activeSource.id ? "true" : undefined}
                      onClick={() => setActiveSourceId(source.id)}
                    >
                      <span className="dsb-mm-index" aria-hidden="true">
                        {index + 1}
                      </span>
                      {source.label || source.file}
                      {issues.some((issue) => issue.blocking && issue.sourceId === source.id) ? (
                        <span className="dsb-mm-tabs__flag" title="Fields to complete">
                          {icon("warning")}
                          <span className="dsb-mm-sr">fields to complete</span>
                        </span>
                      ) : null}
                    </button>
                  ))}
                </nav>
                <ColumnsPanel
                  key={activeSource.id}
                  uid={uid}
                  source={activeSource}
                  file={fileForSource(files, activeSource)}
                  imageCount={images.length}
                  locked={locked}
                  update={(fn) => updateSource(activeSource.id, fn)}
                />
              </>
            )
          ) : null}

          {step === "validation" ? (
            <ValidationStep
              uid={uid}
              draft={draft}
              issues={issues}
              validation={validation}
              status={status}
              onGoTo={goTo}
            />
          ) : null}

          <footer className="dsb__footer dsb-mm__footer">
            <button
              type="button"
              className="dsb-btn dsb-btn--ghost dsb-mm__back"
              onClick={previousStep ? () => goTo(previousStep) : undefined}
              disabled={!previousStep}
            >
              <span className="dsb-mm__back-icon" aria-hidden="true">
                {icon("arrow")}
              </span>
              Back
            </button>
            <p className="dsb-mm__hint" role="status">
              {step === "validation" ? validationHint(status, blocking.length, locked) : nextBlocker ?? ""}
            </p>
            {nextStep ? (
              <button type="button" className="dsb-btn dsb-btn--primary" onClick={() => goTo(nextStep)} disabled={nextBlocker !== null}>
                {`Continue to ${STEP_NAMES[nextStep]}`} {icon("arrow")}
              </button>
            ) : (
              <div className="dsb-mm__actions">
                <button
                  type="button"
                  className={cx("dsb-btn", status === "valid" ? "dsb-btn--ghost" : "dsb-btn--primary")}
                  onClick={validate}
                  disabled={!canValidate}
                >
                  {icon("eye")} {status === "valid" ? "Validate again" : "Validate alignment"}
                </button>
                <button type="button" className="dsb-btn dsb-btn--primary" onClick={onCreate} disabled={!canCreate}>
                  {icon("check")} Create dataset
                </button>
              </div>
            )}
          </footer>
        </section>

        <aside className="dsb-mm-summary" aria-label="Import summary">
          <h3 className="dsb-mm-summary__title">Summary</h3>
          <dl className="dsb-mm-summary__list">
            <div>
              <dt>Dataset</dt>
              <dd>{draft.name.trim() || "Unnamed"}</dd>
            </div>
            <div>
              <dt>Files</dt>
              <dd>
                {dataTableCount} table{dataTableCount === 1 ? "" : "s"} · {images.length} image{images.length === 1 ? "" : "s"}
                {manifestCount > 0 ? ` · ${manifestCount} manifest${manifestCount === 1 ? "" : "s"}` : ""}
              </dd>
            </div>
            <div>
              <dt>Measurement sources</dt>
              <dd>
                {measurementSources.length === 0 ? (
                  "None yet"
                ) : (
                  <ul className="dsb-mm-summary__sources">
                    {measurementSources.map((source) => (
                      <li key={source.id}>
                        <strong>{source.label || source.file}</strong>
                        <span>
                          {optionLabel(MULTIMODAL_MODALITY_OPTIONS, source.modality)} · {featureSummary(source)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{targetSummary(draft)}</dd>
            </div>
            <div>
              <dt>Fields</dt>
              <dd data-tone={blocking.length > 0 ? "warning" : "ok"}>
                {blocking.length > 0 ? `${blocking.length} item${blocking.length === 1 ? "" : "s"} to complete` : "Ready to validate"}
              </dd>
            </div>
            <div>
              <dt>Owner check</dt>
              <dd>
                <StatusChip status={status} />
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Source
// ---------------------------------------------------------------------------

function SourceStep({
  uid,
  tables,
  images,
  draft,
  locked,
  onAddFiles,
  onRemoveFile,
}: {
  uid: string;
  tables: readonly MultimodalBuilderFile[];
  images: readonly MultimodalBuilderFile[];
  draft: MultimodalBuilderDraft;
  locked: boolean;
  onAddFiles: (files: readonly File[]) => void;
  onRemoveFile: (name: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const hintId = `${uid}-drop-hint`;

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.currentTarget.files ?? []);
    if (picked.length > 0) onAddFiles(picked);
    event.currentTarget.value = "";
  };
  const onDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!locked) setDragging(true);
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (locked) return;
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (dropped.length > 0) onAddFiles(dropped);
  };
  const imageBytes = images.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="dsb-mm-source">
      <label
        className="dsb__dropzone dsb-mm-drop"
        data-dragging={dragging || undefined}
        data-disabled={locked || undefined}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          className="dsb-mm-sr"
          type="file"
          multiple
          accept={ACCEPT}
          disabled={locked}
          onChange={onChange}
          aria-describedby={hintId}
        />
        <span className="dsb__dropzone-icon">{icon("upload")}</span>
        <strong>Drop files here or choose files</strong>
        <span className="dsb__dropzone-hint" id={hintId}>
          Comma-separated UTF-8 CSV tables with a header row, VCF genotypes, PNG images and an optional configuration named
          manifest.json. Nothing is uploaded.
        </span>
        <span className="dsb__dropzone-types" aria-hidden="true">
          <span className="dsb-chip">CSV</span>
          <span className="dsb-chip">VCF</span>
          <span className="dsb-chip">PNG</span>
          <span className="dsb-chip">Manifest</span>
        </span>
      </label>

      <div className="dsb-mm-inventory">
        <section className="dsb-mm-group" aria-labelledby={`${uid}-tables`}>
          <h4 className="dsb-mm-group__title" id={`${uid}-tables`}>
            Mapping tables <span className="dsb-mm-count">{tables.filter(isDataTableFile).length}</span>
            {tables.some((file) => file.kind === "manifest") ? (
              <span className="dsb-mm-muted">+ {tables.filter((file) => file.kind === "manifest").length} manifest</span>
            ) : null}
          </h4>
          {tables.length === 0 ? (
            <p className="dsb-mm-note">No table yet. Every source needs a CSV or VCF table with one sample identifier per row or column.</p>
          ) : (
            <ul className="dsb-mm-files">
              {tables.map((file) => {
                const source = draft.sources.find((candidate) => candidate.file === file.name);
                return (
                  <li key={file.name} className="dsb-mm-file" data-kind={file.kind}>
                    <span className="dsb-mm-file__icon" aria-hidden="true">
                      {icon("file")}
                    </span>
                    <span className="dsb-mm-file__body">
                      <span className="dsb-mm-file__name">{file.name}</span>
                      <span className="dsb-mm-file__meta">
                        {FILE_KIND_LABELS[file.kind]} · {formatBytes(file.size)} · {fileMappingText(file, source)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="dsb-btn dsb-btn--ghost dsb-mm-file__remove"
                      onClick={() => onRemoveFile(file.name)}
                      disabled={locked}
                      aria-label={`Remove ${file.name}`}
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dsb-mm-group" aria-labelledby={`${uid}-images`}>
          <h4 className="dsb-mm-group__title" id={`${uid}-images`}>
            Image assets (PNG) <span className="dsb-mm-count">{images.length}</span>
          </h4>
          <p className="dsb-mm-note">
            {images.length === 0
              ? "Only needed for image sources. PNG files are referenced by the file column of an image manifest; they are not mapped as tables."
              : `${images.length} PNG file${images.length === 1 ? "" : "s"} · ${formatBytes(imageBytes)}. They are referenced by the file column of an image manifest, not mapped as tables.`}
          </p>
          {images.length > 0 ? (
            <>
              <ImageList images={images.slice(0, MAX_IMAGE_ROWS)} locked={locked} onRemoveFile={onRemoveFile} />
              {images.length > MAX_IMAGE_ROWS ? (
                <details className="dsb-mm-details">
                  <summary>Show the other {images.length - MAX_IMAGE_ROWS} images</summary>
                  <ImageList images={images.slice(MAX_IMAGE_ROWS)} locked={locked} onRemoveFile={onRemoveFile} />
                </details>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ImageList({
  images,
  locked,
  onRemoveFile,
}: {
  images: readonly MultimodalBuilderFile[];
  locked: boolean;
  onRemoveFile: (name: string) => void;
}) {
  return (
    <ul className="dsb-mm-images">
      {images.map((file) => (
        <li key={file.name} className="dsb-mm-images__item">
          <span className="dsb-mm-images__name">{file.name}</span>
          <span className="dsb-mm-images__size">{formatBytes(file.size)}</span>
          <button
            type="button"
            className="dsb-mm-images__remove"
            onClick={() => onRemoveFile(file.name)}
            disabled={locked}
            aria-label={`Remove ${file.name}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function fileMappingText(file: MultimodalBuilderFile, source: MultimodalBuilderSource | undefined): string {
  if (file.kind === "manifest") return "optional configuration; source and column choices stay editable";
  if (file.kind === "other") return "not a supported table; it will be ignored";
  if (!source) return "waiting for description";
  const rows = source.rowCount === null ? "rows unknown" : `${source.rowCount} row${source.rowCount === 1 ? "" : "s"}`;
  return `${optionLabel(MULTIMODAL_ROLE_OPTIONS, source.role)} · ${rows} · ${source.columns.length} column${source.columns.length === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Step 2 — Role
// ---------------------------------------------------------------------------

function RoleStep({
  uid,
  files,
  draft,
  locked,
  updateSource,
  onBack,
}: {
  uid: string;
  files: readonly MultimodalBuilderFile[];
  draft: MultimodalBuilderDraft;
  locked: boolean;
  updateSource: (id: string, update: (source: MultimodalBuilderSource) => MultimodalBuilderSource) => void;
  onBack: () => void;
}) {
  if (draft.sources.length === 0) {
    return <EmptyStep message="No described table yet. Add CSV or VCF tables first." action="Go to Source" onAction={onBack} />;
  }
  return (
    <div className="dsb-mm-roles">
      {draft.sources.map((source, index) => {
        const file = fileForSource(files, source);
        const profiles = allowedProfiles(file);
        const modalities = allowedModalities(source.profile);
        const fieldId = `${uid}-role-${index}`;
        return (
          <article key={source.id} className="dsb-mm-card" data-ignored={source.role === "ignored" || undefined}>
            <header className="dsb-mm-card__head">
              <span className="dsb-mm-index" aria-hidden="true">
                {index + 1}
              </span>
              <div className="dsb-mm-card__heading">
                <h4 className="dsb-mm-card__title">{source.file}</h4>
                <p className="dsb-mm-card__meta">
                  {source.rowCount === null ? "rows unknown" : `${source.rowCount} rows`} · {source.columns.length} columns ·{" "}
                  {optionLabel(MULTIMODAL_PROFILE_OPTIONS, source.profile)}
                </p>
              </div>
            </header>
            <fieldset className="dsb-mm-choice" disabled={locked}>
              <legend className="dsb-mm-choice__legend">Role of this table</legend>
              {MULTIMODAL_ROLE_OPTIONS.filter((option) => allowedRoles(source).includes(option.value)).map((option) => (
                <label key={option.value} className="dsb-mm-choice__item" data-checked={source.role === option.value || undefined}>
                  <input
                    type="radio"
                    name={`${fieldId}-role`}
                    value={option.value}
                    checked={source.role === option.value}
                    onChange={() => updateSource(source.id, (current) => withRole(current, option.value))}
                  />
                  <span className="dsb-mm-choice__text">
                    <span className="dsb-mm-choice__label">{option.label}</span>
                    <span className="dsb-mm-choice__desc">{option.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {source.role !== "ignored" ? (
              <div className="dsb-mm-grid">
                <Field label="Source label" required>
                  <input
                    type="text"
                    value={source.label}
                    disabled={locked}
                    required
                    onChange={(event) => updateSource(source.id, (current) => ({ ...current, label: event.target.value }))}
                  />
                </Field>
                <Field label="Table profile" hint={profiles.length === 1 ? "Fixed by the file type." : undefined}>
                  <select
                    value={source.profile}
                    disabled={locked || profiles.length === 1}
                    onChange={(event) =>
                      updateSource(source.id, (current) => withProfile(current, event.target.value as MultimodalBuilderSource["profile"]))
                    }
                  >
                    {MULTIMODAL_PROFILE_OPTIONS.filter((option) => profiles.includes(option.value) || option.value === source.profile).map(
                      (option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                {isMeasurementRole(source.role) ? (
                  <Field label="Modality">
                    <select
                      value={source.modality}
                      disabled={locked || modalities.length === 1}
                      onChange={(event) =>
                        updateSource(source.id, (current) => ({
                          ...current,
                          modality: event.target.value as MultimodalBuilderSource["modality"],
                        }))
                      }
                    >
                      {MULTIMODAL_MODALITY_OPTIONS.filter((option) => modalities.includes(option.value) || option.value === source.modality).map(
                        (option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                ) : null}
              </div>
            ) : null}
            <SourceNotes source={source} />
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Columns
// ---------------------------------------------------------------------------

function ColumnsPanel({
  uid,
  source,
  file,
  imageCount,
  locked,
  update,
}: {
  uid: string;
  source: MultimodalBuilderSource;
  file: MultimodalBuilderFile | undefined;
  imageCount: number;
  locked: boolean;
  update: (fn: (source: MultimodalBuilderSource) => MultimodalBuilderSource) => void;
}) {
  return (
    <div className="dsb-mm-columns">
      <header className="dsb-mm-columns__head">
        <h4 className="dsb-mm-card__title">{source.label || source.file}</h4>
        <p className="dsb-mm-card__meta">
          {file?.name ?? source.file} · {optionLabel(MULTIMODAL_ROLE_OPTIONS, source.role)} ·{" "}
          {optionLabel(MULTIMODAL_PROFILE_OPTIONS, source.profile)}
          {isMeasurementRole(source.role) ? ` · ${optionLabel(MULTIMODAL_MODALITY_OPTIONS, source.modality)}` : ""}
        </p>
      </header>
      <SourceNotes source={source} />
      <fieldset className="dsb-mm-lock" disabled={locked}>
        {source.profile === "vcf_gt_dosage" ? (
          <VcfPanel source={source} />
        ) : source.profile === "png_manifest" ? (
          <PngPanel source={source} imageCount={imageCount} update={update} />
        ) : (
          <>
            <IdentityFields source={source} update={update} />
            {isMeasurementRole(source.role) ? (
              <>
                <FeaturePicker source={source} update={update} />
                <AxisFields uid={uid} source={source} update={update} />
              </>
            ) : (
              <ColumnPreview source={source} title="Columns of this table" />
            )}
          </>
        )}
      </fieldset>
    </div>
  );
}

function IdentityFields({
  source,
  update,
}: {
  source: MultimodalBuilderSource;
  update: (fn: (source: MultimodalBuilderSource) => MultimodalBuilderSource) => void;
}) {
  const target = carriesTarget(source.role);
  return (
    <fieldset className="dsb-mm-group">
      <legend className="dsb-mm-group__title">{target ? "Identity and target" : "Identity"}</legend>
      <div className="dsb-mm-grid">
        <ColumnSelect
          label="Sample ID column"
          required
          value={source.sampleId}
          columns={source.columns}
          placeholder="Choose a column…"
          hint="Exact identifiers used to match the other sources. Rows are never matched by position."
          onChange={(value) => update((current) => withFieldColumn(current, "sampleId", value))}
        />
        {target ? (
          <>
            <ColumnSelect
              label="Target column"
              required
              value={source.target}
              columns={source.columns}
              placeholder="Choose a column…"
              onChange={(value) => update((current) => withFieldColumn(current, "target", value))}
            />
            <Field label="Target unit" hint="Optional, e.g. % or mg/g.">
              <input
                type="text"
                value={source.targetUnit}
                onChange={(event) => update((current) => ({ ...current, targetUnit: event.target.value }))}
              />
            </Field>
            <ColumnSelect
              label="Group column"
              value={source.group}
              columns={source.columns}
              placeholder="None"
              hint="Samples of one group stay in the same split."
              onChange={(value) => update((current) => withFieldColumn(current, "group", value))}
            />
            <ColumnSelect
              label="Partition column"
              value={source.partition}
              columns={source.columns}
              placeholder="None"
              hint="A declared calibration / hold-out split. None lets the validation protocol build it."
              onChange={(value) => update((current) => withFieldColumn(current, "partition", value))}
            />
          </>
        ) : null}
      </div>
    </fieldset>
  );
}

function FeaturePicker({
  source,
  update,
}: {
  source: MultimodalBuilderSource;
  update: (fn: (source: MultimodalBuilderSource) => MultimodalBuilderSource) => void;
}) {
  const [query, setQuery] = useState("");
  const reserved = reservedColumns(source);
  const chosen = new Set(source.features);
  const needle = query.trim().toLowerCase();
  const shown = needle ? source.columns.filter((column) => column.name.toLowerCase().includes(needle)) : source.columns;
  const selectable = shown.filter((column) => !reserved.has(column.name));
  const selectableTotal = source.columns.filter((column) => !reserved.has(column.name)).length;
  const numeric = selectable.filter((column) => isNumericKind(column.kind));

  return (
    <fieldset className="dsb-mm-group">
      <legend className="dsb-mm-group__title">Feature columns</legend>
      <div className="dsb-mm-toolbar">
        <input
          type="search"
          className="dsb-mm-search"
          placeholder="Filter columns…"
          aria-label="Filter columns by name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="dsb-mm-toolbar__actions">
          <button
            type="button"
            className="dsb-btn dsb-btn--ghost"
            onClick={() => update((current) => withFeatures(current, selectable.map((column) => column.name), true))}
            disabled={selectable.length === 0}
          >
            Select shown ({selectable.length})
          </button>
          <button
            type="button"
            className="dsb-btn dsb-btn--ghost"
            onClick={() => update((current) => withFeatures(current, numeric.map((column) => column.name), true))}
            disabled={numeric.length === 0}
          >
            Select numeric ({numeric.length})
          </button>
          <button
            type="button"
            className="dsb-btn dsb-btn--ghost"
            onClick={() => update((current) => withFeatures(current, shown.map((column) => column.name), false))}
            disabled={!shown.some((column) => chosen.has(column.name))}
          >
            Clear shown
          </button>
        </div>
        <span className="dsb-mm-count" aria-live="polite">
          {source.features.length} of {selectableTotal} selected
        </span>
      </div>
      <div className="dsb-mapping__table-wrap dsb-mm-table-wrap">
        <table className="dsb-mapping__table">
          <caption className="dsb-mm-sr">Feature columns of {source.label || source.file}</caption>
          <thead>
            <tr>
              <th scope="col" className="dsb-mapping__col-check">
                <span className="dsb-mm-sr">Use as feature</span>
              </th>
              <th scope="col">Column</th>
              <th scope="col">Preview</th>
              <th scope="col">Type</th>
              <th scope="col">Use</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, MAX_FEATURE_ROWS).map((column) => {
              const role = reserved.get(column.name);
              const selected = chosen.has(column.name);
              return (
                <tr key={column.name} data-selected={selected || undefined}>
                  <td className="dsb-mapping__col-check">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={role !== undefined}
                      aria-label={`Use ${column.name} as a feature`}
                      onChange={(event) => update((current) => withFeatures(current, [column.name], event.target.checked))}
                    />
                  </td>
                  <td className="dsb-mapping__name">{column.name}</td>
                  <td className="dsb-mapping__preview dsb-mm-preview">{column.preview ?? "—"}</td>
                  <td className="dsb-mapping__type">{column.kind}</td>
                  <td>
                    {role ? (
                      <span className="dsb-mm-badge" data-tone="reserved">
                        {role}
                      </span>
                    ) : selected ? (
                      <span className="dsb-mm-badge" data-tone="feature">
                        Feature
                      </span>
                    ) : (
                      <span className="dsb-mm-muted">Not used</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="dsb-mapping__empty">
                  {source.columns.length === 0 ? "The host has not described any column for this table." : "No column matches this filter."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {shown.length > MAX_FEATURE_ROWS ? (
        <p className="dsb-mm-note">
          Showing the first {MAX_FEATURE_ROWS} of {shown.length} matching columns. Refine the filter; bulk actions apply to all{" "}
          {shown.length}.
        </p>
      ) : null}
    </fieldset>
  );
}

function AxisFields({
  uid,
  source,
  update,
}: {
  uid: string;
  source: MultimodalBuilderSource;
  update: (fn: (source: MultimodalBuilderSource) => MultimodalBuilderSource) => void;
}) {
  const listId = `${uid}-axis-kinds`;
  const first = source.features[0];
  const last = source.features[source.features.length - 1];
  const coordinates = source.coordinates ?? {};
  const [coordinateQuery, setCoordinateQuery] = useState("");
  const coordinateMatches = source.features.filter((feature) => feature.toLowerCase().includes(coordinateQuery.toLowerCase()));
  const modes = allowedAxisModes(source);
  return (
    <fieldset className="dsb-mm-group">
      <legend className="dsb-mm-group__title">Feature axis</legend>
      {!modes.includes(source.axisMode) ? (
        <p className="dsb-mm-caveat" role="note">
          {source.modality === "spectroscopy"
            ? "Spectroscopy sources need their own explicit axis: choose numeric column names or exact declared values, then enter the axis kind and unit."
            : "Genetic dosage columns have no spectral axis. Select None to remove the previous spectral axis declaration."}
        </p>
      ) : null}
      <div className="dsb-mm-choice dsb-mm-choice--row">
        {MULTIMODAL_AXIS_OPTIONS.filter((option) => modes.includes(option.value)).map((option) => (
          <label key={option.value} className="dsb-mm-choice__item" data-checked={source.axisMode === option.value || undefined}>
            <input
              type="radio"
              name={`${uid}-${source.id}-axis`}
              value={option.value}
              checked={source.axisMode === option.value}
              onChange={() => update((current) => ({ ...current, axisMode: option.value }))}
            />
            <span className="dsb-mm-choice__text">
              <span className="dsb-mm-choice__label">{option.label}</span>
              <span className="dsb-mm-choice__desc">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
      {source.axisMode !== "none" ? (
        <div className="dsb-mm-grid">
          <Field label="Axis kind" required>
            <input
              type="text"
              list={listId}
              value={source.axisKind}
              placeholder="wavelength"
              required
              onChange={(event) => update((current) => ({ ...current, axisKind: event.target.value }))}
            />
            <datalist id={listId}>
              <option value="wavelength" />
              <option value="wavenumber" />
              <option value="time" />
            </datalist>
          </Field>
          <Field label="Axis unit" required>
            <input
              type="text"
              value={source.axisUnit}
              placeholder="nm"
              required
              onChange={(event) => update((current) => ({ ...current, axisUnit: event.target.value }))}
            />
          </Field>
        </div>
      ) : null}
      {source.axisMode === "headers" && first !== undefined ? (
        <p className="dsb-mm-note">
          Axis values come from the selected column names: <code>{first}</code>
          {last !== undefined && last !== first ? (
            <>
              {" "}… <code>{last}</code>
            </>
          ) : null}
          .
        </p>
      ) : null}
      {source.axisMode === "declared" ? (
        source.features.length === 0 ? (
          <p className="dsb-mm-note">Select feature columns first, then declare one axis value per feature.</p>
        ) : (
          <>
            <Field label="Find axis coordinates" hint="Filter by feature name to reach any coordinate in a large source.">
              <input type="search" value={coordinateQuery} onChange={(event) => setCoordinateQuery(event.target.value)} />
            </Field>
            <div className="dsb-mapping__table-wrap dsb-mm-table-wrap dsb-mm-table-wrap--short">
              <table className="dsb-mapping__table">
                <caption className="dsb-mm-sr">Declared axis values</caption>
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    <th scope="col">Axis value{source.axisUnit ? ` (${source.axisUnit})` : ""}</th>
                  </tr>
                </thead>
                <tbody>
                  {coordinateMatches.slice(0, MAX_COORDINATE_ROWS).map((feature) => (
                    <tr key={feature}>
                      <td className="dsb-mapping__name">{feature}</td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          className="dsb-mm-number"
                          value={Number.isFinite(coordinates[feature]) ? String(coordinates[feature]) : ""}
                          aria-label={`Axis value of ${feature}`}
                          onChange={(event) =>
                            update((current) =>
                              withCoordinate(current, feature, event.target.value === "" ? null : Number(event.target.value)),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {source.features.length > MAX_COORDINATE_ROWS ? (
              <p className="dsb-mm-note">
                Showing {Math.min(MAX_COORDINATE_ROWS, coordinateMatches.length)} of {coordinateMatches.length} matching features.
                Filter by name to edit the remaining coordinates; every declared value is preserved.
              </p>
            ) : null}
          </>
        )
      ) : null}
    </fieldset>
  );
}

function VcfPanel({ source }: { source: MultimodalBuilderSource }) {
  const variants = source.features.length > 0 ? source.features : source.columns.map((column) => column.name);
  return (
    <fieldset className="dsb-mm-group">
      <legend className="dsb-mm-group__title">VCF genotypes</legend>
      <dl className="dsb-mm-facts">
        <div>
          <dt>Sample identities</dt>
          <dd>The exact sample names of the VCF header line. They must match the other tables character for character.</dd>
        </div>
        <div>
          <dt>Variants</dt>
          <dd>
            All {variants.length} variants are used, in file order. Variant selection is not available for this profile.
          </dd>
        </div>
        <div>
          <dt>Values</dt>
          <dd>Each GT call becomes an alternate-allele dosage of 0, 1 or 2.</dd>
        </div>
      </dl>
      <p className="dsb-mm-caveat" role="note">
        Phase is discarded: <code>0|1</code> and <code>1|0</code> both become dosage 1.
      </p>
      {variants.length > 0 ? (
        <div className="dsb-mm-readonly">
          <span className="dsb-mm-readonly__label">Variants (read-only)</span>
          <ul className="dsb-mm-chips">
            {variants.slice(0, 24).map((name, index) => (
              <li key={`${index}-${name}`} className="dsb-chip">
                {name}
              </li>
            ))}
            {variants.length > 24 ? <li className="dsb-mm-muted">+ {variants.length - 24} more</li> : null}
          </ul>
        </div>
      ) : null}
    </fieldset>
  );
}

function PngPanel({
  source,
  imageCount,
  update,
}: {
  source: MultimodalBuilderSource;
  imageCount: number;
  update: (fn: (source: MultimodalBuilderSource) => MultimodalBuilderSource) => void;
}) {
  const headers = new Set(source.columns.map((column) => column.name));
  const described = source.columns.length > 0;
  const dims: Array<{ label: string; hint: string }> = [
    { label: "Height", hint: "pixels" },
    { label: "Width", hint: "pixels" },
  ];
  const channels = source.shape[2];
  return (
    <>
      <fieldset className="dsb-mm-group">
        <legend className="dsb-mm-group__title">Image manifest</legend>
        <table className="dsb-mm-mini">
          <caption className="dsb-mm-sr">Headers read by the image manifest profile</caption>
          <thead>
            <tr>
              <th scope="col">Required header</th>
              <th scope="col">Meaning</th>
              <th scope="col">In this table</th>
            </tr>
          </thead>
          <tbody>
            {PNG_MANIFEST_HEADERS.map((header) => (
              <tr key={header}>
                <th scope="row">
                  <code>{header}</code>
                </th>
                <td>{header === "sample_id" ? "Sample identifier" : "PNG file name"}</td>
                <td data-tone={!described ? undefined : headers.has(header) ? "ok" : "error"}>
                  {!described ? "Not described yet" : headers.has(header) ? "Found" : "Missing"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dsb-mm-note">
          The image profile reads exactly these two headers. Column remapping is not supported: if the manifest uses other names,
          rename its headers and add it again.
        </p>
      </fieldset>
      <fieldset className="dsb-mm-group">
        <legend className="dsb-mm-group__title">Image shape (height × width × channels)</legend>
        <div className="dsb-mm-grid dsb-mm-grid--shape">
          {dims.map((dim, index) => (
            <Field key={dim.label} label={dim.label} hint={dim.hint} required>
              <input
                type="number"
                min={1}
                step={1}
                className="dsb-mm-number"
                required
                value={source.shape[index] ? String(source.shape[index]) : ""}
                onChange={(event) =>
                  update((current) =>
                    withShapeDimension(current, index, event.target.value === "" ? null : Number(event.target.value)),
                  )
                }
              />
            </Field>
          ))}
          <Field label="Channels" required>
            <select
              required
              value={channels !== undefined && PNG_SUPPORTED_CHANNELS.includes(channels) ? String(channels) : ""}
              onChange={(event) =>
                update((current) => withShapeDimension(current, 2, event.target.value === "" ? null : Number(event.target.value)))
              }
            >
              <option value="">Choose…</option>
              <option value="1">1 · grayscale</option>
              <option value="3">3 · RGB</option>
            </select>
          </Field>
        </div>
        <p className="dsb-mm-caveat" role="note">
          Supported PNG profile: 8-bit grayscale or RGB, non-interlaced. Alpha, palette and 16-bit PNGs are refused.
        </p>
        <p className="dsb-mm-note">
          Every decoded PNG is checked against this exact shape; an image with another shape is refused. {imageCount} PNG file
          {imageCount === 1 ? " is" : "s are"} in the inventory.
        </p>
      </fieldset>
      <ColumnPreview source={source} title="Manifest columns" />
    </>
  );
}

function ColumnPreview({ source, title }: { source: MultimodalBuilderSource; title: string }) {
  const reserved = reservedColumns(source);
  return (
    <section className="dsb-mm-group">
      <h5 className="dsb-mm-group__title">{title}</h5>
      <div className="dsb-mapping__table-wrap dsb-mm-table-wrap dsb-mm-table-wrap--short">
        <table className="dsb-mapping__table">
          <caption className="dsb-mm-sr">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Column</th>
              <th scope="col">Preview</th>
              <th scope="col">Type</th>
              <th scope="col">Use</th>
            </tr>
          </thead>
          <tbody>
            {source.columns.slice(0, MAX_FEATURE_ROWS).map((column) => (
              <tr key={column.name}>
                <td className="dsb-mapping__name">{column.name}</td>
                <td className="dsb-mapping__preview dsb-mm-preview">{column.preview ?? "—"}</td>
                <td className="dsb-mapping__type">{column.kind}</td>
                <td>
                  {reserved.has(column.name) ? (
                    <span className="dsb-mm-badge" data-tone="reserved">
                      {reserved.get(column.name)}
                    </span>
                  ) : (
                    <span className="dsb-mm-muted">Not used</span>
                  )}
                </td>
              </tr>
            ))}
            {source.columns.length === 0 ? (
              <tr>
                <td colSpan={4} className="dsb-mapping__empty">
                  The host has not described any column for this table.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Validation
// ---------------------------------------------------------------------------

function ValidationStep({
  uid,
  draft,
  issues,
  validation,
  status,
  onGoTo,
}: {
  uid: string;
  draft: MultimodalBuilderDraft;
  issues: readonly MultimodalBuilderIssue[];
  validation: MultimodalBuilderValidation;
  status: DisplayStatus;
  onGoTo: (step: MultimodalBuilderStep, sourceId?: string) => void;
}) {
  const active = draft.sources.filter((source) => source.role !== "ignored");
  return (
    <div className="dsb-mm-validation">
      <section className="dsb-mm-group" aria-labelledby={`${uid}-ready`}>
        <h4 className="dsb-mm-group__title" id={`${uid}-ready`}>
          Required fields
        </h4>
        {issues.length === 0 ? (
          <p className="dsb-mm-note" data-tone="ok">
            {icon("check")} All required fields are filled. Only the owner check below decides whether the sources align.
          </p>
        ) : (
          <ul className="dsb-validation__list">
            {issues.map((issue, index) => (
              <li key={`${issue.step}-${index}`} className="dsb-validation__item" data-level={issue.blocking ? "error" : "warning"}>
                <span className="dsb-validation__icon">{icon(issue.blocking ? "error" : "warning")}</span>
                <span className="dsb-validation__text">
                  <span className="dsb-validation__label">{issue.message}</span>
                </span>
                <button
                  type="button"
                  className="dsb-btn dsb-btn--ghost dsb-validation__trailing"
                  onClick={() => onGoTo(issue.step, issue.sourceId)}
                >
                  Go to {STEP_NAMES[issue.step]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dsb-mm-group" aria-labelledby={`${uid}-mapping`}>
        <h4 className="dsb-mm-group__title" id={`${uid}-mapping`}>
          Mapping to validate
        </h4>
        <div className="dsb-mapping__table-wrap dsb-mm-table-wrap">
          <table className="dsb-mapping__table">
            <caption className="dsb-mm-sr">Mapping submitted to the owner check</caption>
            <thead>
              <tr>
                <th scope="col" className="dsb-mm-source-col">
                  Source
                </th>
                <th scope="col">Role</th>
                <th scope="col">Sample ID</th>
                <th scope="col">Features</th>
                <th scope="col">Axis</th>
                <th scope="col">Target</th>
              </tr>
            </thead>
            <tbody>
              {active.map((source) => (
                <tr key={source.id}>
                  <th scope="row" className="dsb-mapping__name dsb-mm-source-col">
                    {source.label || source.file}
                  </th>
                  <td>{optionLabel(MULTIMODAL_ROLE_OPTIONS, source.role)}</td>
                  <td className="dsb-mm-mono">{sampleIdText(source)}</td>
                  <td>{isMeasurementRole(source.role) ? featureSummary(source) : "—"}</td>
                  <td>{axisText(source)}</td>
                  <td>{carriesTarget(source.role) && source.target ? `${source.target}${source.targetUnit ? ` (${source.targetUnit})` : ""}` : "—"}</td>
                </tr>
              ))}
              {active.length === 0 ? (
                <tr>
                  <td colSpan={6} className="dsb-mapping__empty">
                    No table is in use.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dsb-mm-group dsb-mm-owner" data-status={status} aria-labelledby={`${uid}-owner`}>
        <h4 className="dsb-mm-group__title" id={`${uid}-owner`}>
          Owner alignment check
        </h4>
        <OwnerResult validation={validation} status={status} />
      </section>
    </div>
  );
}

function OwnerResult({ validation, status }: { validation: MultimodalBuilderValidation; status: DisplayStatus }) {
  if (status === "idle") {
    return (
      <p className="dsb-mm-note" role="status">
        Not validated yet. <strong>Validate alignment</strong> asks the host to read the files with the nirs4all owners and to
        match every source by sample identifier.
      </p>
    );
  }
  if (status === "checking") {
    return (
      <p className="dsb-mm-owner__line" role="status">
        <span className="dsb-mm-busy__dot" aria-hidden="true" /> Checking alignment…
      </p>
    );
  }
  if (status === "stale") {
    return (
      <p className="dsb-mm-owner__line" role="status" data-tone="warning">
        {icon("warning")} The files or mapping changed after the last check. Validate again before creating the dataset.
      </p>
    );
  }
  const facts: Array<[string, ReactNode]> = [];
  if (validation.samples !== undefined) facts.push(["Samples", validation.samples]);
  if (validation.groups !== undefined) facts.push(["Groups", validation.groups]);
  if (validation.calibration !== undefined) facts.push(["Calibration", validation.calibration]);
  if (validation.holdout !== undefined) facts.push(["Hold-out", validation.holdout]);
  if (validation.fingerprint) facts.push(["Fingerprint", <code key="fp">{validation.fingerprint}</code>]);
  return (
    <>
      {status === "valid" ? (
        <p className="dsb-mm-owner__line" role="status" data-tone="ok">
          {icon("check")} {validation.message ?? "Alignment validated by the owner."}
        </p>
      ) : (
        <div className="dsb-mm-alert" role="alert">
          <span className="dsb-mm-alert__icon">{icon("error")}</span>
          <span>{validation.message ?? "The owner refused this mapping."}</span>
        </div>
      )}
      {facts.length > 0 ? (
        <dl className="dsb-mm-facts dsb-mm-facts--inline">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {validation.sources && validation.sources.length > 0 ? (
        <div className="dsb-mapping__table-wrap dsb-mm-table-wrap">
          <table className="dsb-mapping__table dsb-mm-counts">
            <caption className="dsb-mm-sr">Per-source matching reported by the owner</caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col" className="dsb-mm-num">
                  Matched
                </th>
                <th scope="col" className="dsb-mm-num">
                  Missing
                </th>
                <th scope="col" className="dsb-mm-num">
                  Refused
                </th>
                <th scope="col" className="dsb-mm-num">
                  Missing cells
                </th>
              </tr>
            </thead>
            <tbody>
              {validation.sources.map((entry) => (
                <tr key={entry.id}>
                  <th scope="row" className="dsb-mapping__name">
                    {entry.label}
                  </th>
                  <td className="dsb-mm-num">{entry.matched}</td>
                  <td className="dsb-mm-num" data-alert={entry.missing > 0 || undefined}>
                    {entry.missing}
                  </td>
                  <td className="dsb-mm-num" data-alert={entry.refused > 0 || undefined}>
                    {entry.refused}
                  </td>
                  <td className="dsb-mm-num" data-alert={entry.missingCells > 0 || undefined}>
                    {entry.missingCells}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string | undefined;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="dsb-field dsb-mm-field">
      <span className="dsb-field__label">
        {label}
        {required ? (
          <span className="dsb-mm-required" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </span>
      {children}
      {hint ? <span className="dsb-mm-field__hint">{hint}</span> : null}
    </label>
  );
}

function ColumnSelect({
  label,
  value,
  columns,
  placeholder,
  hint,
  required,
  onChange,
}: {
  label: string;
  value: string;
  columns: readonly MultimodalBuilderColumn[];
  placeholder: string;
  hint?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const known = value === "" || columns.some((column) => column.name === value);
  return (
    <Field label={label} hint={hint} required={required ?? false}>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {!known ? <option value={value}>{value} (not described)</option> : null}
        {columns.map((column) => (
          <option key={column.name} value={column.name}>
            {column.preview ? `${column.name} · ${truncate(column.preview, 18)}` : column.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function SourceNotes({ source }: { source: MultimodalBuilderSource }) {
  if (!source.refusal && source.warnings.length === 0) return null;
  return (
    <div className="dsb-mm-notes">
      {source.refusal ? (
        <div className="dsb-mm-alert" role="alert">
          <span className="dsb-mm-alert__icon">{icon("error")}</span>
          <span>
            <strong>Refused by the owner:</strong> {source.refusal}
          </span>
        </div>
      ) : null}
      {source.warnings.length > 0 ? (
        <ul className="dsb-mm-warnings">
          {source.warnings.map((warning) => (
            <li key={warning}>
              {icon("warning")} {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EmptyStep({ message, action, onAction }: { message: string; action: string; onAction: () => void }) {
  return (
    <div className="dsb-mm-empty">
      <p>{message}</p>
      <button type="button" className="dsb-btn dsb-btn--ghost" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

const STATUS_CHIPS: Record<DisplayStatus, { label: string; tone?: "ok" | "warning" | "error"; icon: "check" | "warning" | "error" | "info" }> = {
  idle: { label: "Not validated", icon: "info" },
  checking: { label: "Checking…", tone: "warning", icon: "info" },
  stale: { label: "Validate again", tone: "warning", icon: "warning" },
  valid: { label: "Validated", tone: "ok", icon: "check" },
  error: { label: "Refused", tone: "error", icon: "error" },
};

function StatusChip({ status }: { status: DisplayStatus }) {
  const chip = STATUS_CHIPS[status];
  return (
    <span className="dsb__chip dsb-mm-status" data-status={chip.tone}>
      {icon(chip.icon)} {chip.label}
    </span>
  );
}

function validationHint(status: DisplayStatus, blocking: number, locked: boolean): string {
  if (locked && status !== "checking") return "Waiting for the host…";
  if (blocking > 0) return `Complete ${blocking} required field${blocking === 1 ? "" : "s"} to validate.`;
  if (status === "valid") return "This exact mapping is validated.";
  if (status === "checking") return "Checking alignment…";
  if (status === "error") return "Fix the reported problem, then validate again.";
  return "Validate the alignment to enable creation.";
}

function featureSummary(source: MultimodalBuilderSource): string {
  if (source.profile === "png_manifest") {
    return source.shape.length === 3 && source.shape.every((d) => d > 0) ? `images ${source.shape.join(" × ")}` : "images, shape not set";
  }
  if (source.profile === "vcf_gt_dosage") {
    const count = source.features.length || source.columns.length;
    return `all ${count} variants`;
  }
  return `${source.features.length} feature${source.features.length === 1 ? "" : "s"}`;
}

function sampleIdText(source: MultimodalBuilderSource): string {
  if (source.profile === "vcf_gt_dosage") return "VCF header";
  if (source.profile === "png_manifest") return "sample_id";
  return source.sampleId || "—";
}

function axisText(source: MultimodalBuilderSource): string {
  if (!isMeasurementRole(source.role) || source.profile !== "numeric_csv" || source.axisMode === "none") return "—";
  const unit = source.axisUnit ? ` (${source.axisUnit})` : "";
  const mode = source.axisMode === "headers" ? "from names" : "declared";
  return `${source.axisKind || "?"}${unit}, ${mode}`;
}

function targetSummary(draft: MultimodalBuilderDraft): string {
  const holder = draft.sources.find((source) => source.role !== "ignored" && carriesTarget(source.role) && source.target);
  if (!holder) return "Not chosen";
  return `${holder.target}${holder.targetUnit ? ` (${holder.targetUnit})` : ""} · ${holder.label || holder.file}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
