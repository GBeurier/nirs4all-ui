import { useState, type ChangeEvent } from "react";
import { modalityLabel, representationLabel, sourceTag } from "./catalog.js";
import {
  axisRangeText,
  distinctGroupCount,
  invalidCellCount,
  partitionCounts,
  rowWidth,
  shapeText,
} from "./data.js";
import type {
  MultimodalCaseId,
  MultimodalDataOrigin,
  MultimodalDataPreset,
  MultimodalDataset,
  MultimodalDataStatus,
  MultimodalImportProfile,
} from "./types.js";

export interface DataPanelProps {
  caseId: MultimodalCaseId;
  presets: readonly MultimodalDataPreset[];
  importProfiles: readonly MultimodalImportProfile[];
  dataOrigin: MultimodalDataOrigin | null;
  dataStatus: MultimodalDataStatus;
  onLoadPreset: (presetId: string) => void;
  onImportFiles: (profileId: string, files: readonly File[]) => void;
  disabled?: boolean;
}

type DataTab = "synthetic" | "import";

/** Bundled synthetic presets and documented import profiles for the current case. */
export function DataPanel({
  caseId,
  presets,
  importProfiles,
  dataOrigin,
  dataStatus,
  onLoadPreset,
  onImportFiles,
  disabled,
}: DataPanelProps) {
  const [tab, setTab] = useState<DataTab>(dataOrigin?.kind === "import" ? "import" : "synthetic");
  const casePresets = presets.filter((preset) => preset.caseId === caseId);
  const caseProfiles = importProfiles.filter((profile) => profile.caseId === caseId);
  const busy = dataStatus.kind === "loading";

  return (
    <div className="n4mm-data">
      <div className="n4mm-segmented" role="group" aria-label="Data origin">
        <button type="button" aria-pressed={tab === "synthetic"} onClick={() => setTab("synthetic")}>
          Synthetic teaching data
        </button>
        <button type="button" aria-pressed={tab === "import"} onClick={() => setTab("import")}>
          Import your files
        </button>
      </div>

      {tab === "synthetic" ? (
        <div className="n4mm-data__pane">
          <p className="n4mm-note">
            Deterministic datasets generated offline with the nirs4all Python synthesis tools and bundled with this page.
            They are loaded through the same import route as your own files. Each preset records its seed, sizes and the
            simulated relationships; scores obtained on them illustrate mechanisms, not real-world rankings.
          </p>
          {casePresets.length === 0 ? (
            <p className="n4mm-note" role="note">
              No bundled preset is declared for this case by the host.
            </p>
          ) : (
            <ul className="n4mm-list">
              {casePresets.map((preset) => {
                const loaded = dataOrigin?.kind === "preset" && dataOrigin.presetId === preset.id;
                return (
                  <li key={preset.id} className="n4mm-list__item" data-active={loaded || undefined}>
                    <div className="n4mm-list__main">
                      <span className="n4mm-list__title">{preset.label}</span>
                      <span className="n4mm-list__text">{preset.description}</span>
                      {preset.facts && preset.facts.length > 0 ? (
                        <dl className="n4mm-facts">
                          {preset.facts.map((fact) => (
                            <div key={fact.label}>
                              <dt>{fact.label}</dt>
                              <dd>{fact.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="n4mm-button"
                      data-variant={loaded ? "quiet" : undefined}
                      disabled={disabled || busy}
                      onClick={() => onLoadPreset(preset.id)}
                    >
                      {loaded ? "Reload" : "Load"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="n4mm-data__pane">
          <p className="n4mm-note">
            Files are read in this browser and interpreted by the nirs4all IO and Formats owners. Sources are joined by
            explicit sample identifiers, never by file row position; missing, duplicate or unmatched identities are reported
            below before any training.
          </p>
          {caseProfiles.length === 0 ? (
            <p className="n4mm-note" role="note">
              No import profile is declared for this case by the host.
            </p>
          ) : (
            caseProfiles.map((profile) => (
              <ImportProfileCard
                key={profile.id}
                profile={profile}
                disabled={Boolean(disabled) || busy}
                onImportFiles={onImportFiles}
              />
            ))
          )}
        </div>
      )}

      <DataStatusLine status={dataStatus} origin={dataOrigin} />
    </div>
  );
}

function ImportProfileCard({
  profile,
  disabled,
  onImportFiles,
}: {
  profile: MultimodalImportProfile;
  disabled: boolean;
  onImportFiles: (profileId: string, files: readonly File[]) => void;
}) {
  const inputId = `n4mm-import-${profile.id}`;
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    if (files.length > 0) onImportFiles(profile.id, files);
    event.currentTarget.value = "";
  };
  return (
    <div className="n4mm-profile">
      <div className="n4mm-profile__head">
        <span className="n4mm-list__title">{profile.label}</span>
        <span className="n4mm-list__text">{profile.description}</span>
      </div>
      <table className="n4mm-table n4mm-table--compact">
        <caption className="n4mm-sr-only">Files expected by {profile.label}</caption>
        <thead>
          <tr>
            <th scope="col">File role</th>
            <th scope="col">Content</th>
            <th scope="col">Required</th>
          </tr>
        </thead>
        <tbody>
          {profile.files.map((file) => (
            <tr key={file.role}>
              <th scope="row">{file.role}</th>
              <td>{file.description}</td>
              <td>{file.required ? "yes" : "optional"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="n4mm-profile__actions">
        <label className="n4mm-file" htmlFor={inputId} data-disabled={disabled || undefined}>
          <input id={inputId} type="file" multiple accept={profile.accept} disabled={disabled} onChange={onChange} />
          <span>Choose files…</span>
        </label>
        {profile.examples && profile.examples.length > 0 ? (
          <span className="n4mm-profile__examples">
            Matching examples:{" "}
            {profile.examples.map((example, index) => (
              <span key={example.href}>
                {index > 0 ? " · " : null}
                <a href={example.href} download={example.fileName ?? true}>
                  {example.label}
                </a>
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DataStatusLine({ status, origin }: { status: MultimodalDataStatus; origin: MultimodalDataOrigin | null }) {
  if (status.kind === "loading") {
    return (
      <p className="n4mm-status" role="status" data-tone="busy">
        {status.label}
      </p>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="n4mm-alert" role="alert">
        <strong>{status.name ?? "Import refused"}</strong>
        <span>{status.message}</span>
      </div>
    );
  }
  if (status.kind === "ready" && origin) {
    return (
      <p className="n4mm-status" role="status">
        {origin.kind === "preset"
          ? "Synthetic preset loaded through the IO import route."
          : `Imported ${origin.fileNames.length} file${origin.fileNames.length === 1 ? "" : "s"}: ${origin.fileNames.join(", ")}`}
      </p>
    );
  }
  return (
    <p className="n4mm-status" role="status">
      No data loaded yet. Load a synthetic preset or import files to begin.
    </p>
  );
}

export interface AlignmentTableProps {
  dataset: MultimodalDataset;
}

/** Explicit identity matching and per-source metadata, exactly as supplied by IO. */
export function AlignmentTable({ dataset }: AlignmentTableProps) {
  const groups = distinctGroupCount(dataset);
  const partitions = partitionCounts(dataset);
  const alignment = new Map(dataset.alignment.map((entry) => [entry.sourceId, entry]));
  const provenance = primitiveEntries(dataset.provenance);
  return (
    <div className="n4mm-alignment">
      <dl className="n4mm-facts n4mm-facts--inline">
        <div>
          <dt>Dataset</dt>
          <dd>{dataset.name}</dd>
        </div>
        <div>
          <dt>Samples (canonical identities)</dt>
          <dd>{dataset.sampleIds.length}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>
            {dataset.target.name}
            {dataset.target.unit ? ` (${dataset.target.unit})` : ""}
          </dd>
        </div>
        <div>
          <dt>Groups</dt>
          <dd>{groups === null ? "none declared" : `${groups} declared — kept together in every split`}</dd>
        </div>
        <div>
          <dt>Held-out partition</dt>
          <dd>
            {partitions === null
              ? "not declared — built by the native owner from the validation protocol"
              : `declared: ${partitions.train} calibration / ${partitions.test} test`}
          </dd>
        </div>
        <div>
          <dt>Fingerprint</dt>
          <dd className="n4mm-mono">{dataset.fingerprint}</dd>
        </div>
      </dl>
      <div className="n4mm-scroll">
        <table className="n4mm-table">
          <caption>
            Source matching by sample identifier. Matched identities enter training; missing or refused identities are
            reported, never repaired by position.
          </caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Modality</th>
              <th scope="col">Representation</th>
              <th scope="col">Shape per sample</th>
              <th scope="col">Axis / features</th>
              <th scope="col" className="n4mm-num">
                Matched
              </th>
              <th scope="col" className="n4mm-num">
                Missing
              </th>
              <th scope="col" className="n4mm-num">
                Refused
              </th>
              <th scope="col" className="n4mm-num">
                Missing cells
              </th>
            </tr>
          </thead>
          <tbody>
            {dataset.sources.map((source, index) => {
              const entry = alignment.get(source.id);
              const invalid = invalidCellCount(source);
              return (
                <tr key={source.id}>
                  <th scope="row">
                    <span className="n4mm-tag" data-source={index % 6}>
                      {sourceTag(index)}
                    </span>{" "}
                    {source.label} <span className="n4mm-mono n4mm-muted">({source.id})</span>
                  </th>
                  <td>{modalityLabel(source.modality)}</td>
                  <td>{representationLabel(source.representation)}</td>
                  <td className="n4mm-mono">{shapeText(source.shape)}</td>
                  <td>{source.axis ? axisRangeText(source.axis) : `${rowWidth(source)} named values`}</td>
                  <td className="n4mm-num">{entry ? entry.matched : "—"}</td>
                  <td className="n4mm-num" data-alert={entry && entry.missing > 0 ? true : undefined}>
                    {entry ? entry.missing : "—"}
                  </td>
                  <td className="n4mm-num" data-alert={entry && entry.refused > 0 ? true : undefined}>
                    {entry ? entry.refused : "—"}
                  </td>
                  <td className="n4mm-num" data-alert={invalid > 0 ? true : undefined}>
                    {source.validity ? invalid : "none flagged"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dataset.sources.some((source) => invalidCellCount(source) > 0) ? (
        <p className="n4mm-alert" role="note">
          Some values are missing. This first teaching profile requires complete data: training is refused rather than
          imputed over the whole dataset (which would leak information across folds). Missing cells stay visible as NA.
        </p>
      ) : null}
      {provenance.length > 0 ? (
        <details className="n4mm-details">
          <summary>Dataset provenance</summary>
          <dl className="n4mm-facts">
            {provenance.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd className="n4mm-mono">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}

function primitiveEntries(record: Readonly<Record<string, unknown>> | undefined): Array<[string, string]> {
  if (!record) return [];
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      entries.push([key, String(value)]);
    } else if (Array.isArray(value) && value.every((item) => typeof item !== "object")) {
      entries.push([key, value.map(String).join(", ")]);
    }
  }
  return entries;
}
