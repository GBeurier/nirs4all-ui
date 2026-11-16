/** Controlled, owner-inspected import draft. Hosts own file bytes and validation. */
export type MultimodalBuilderRole = "source" | "metadata" | "combined" | "ignored";
export type MultimodalBuilderProfile = "numeric_csv" | "vcf_gt_dosage" | "png_manifest";
export interface MultimodalBuilderFile { name: string; size: number; kind: "table" | "vcf" | "image" | "manifest" | "other"; }
export interface MultimodalBuilderColumn { name: string; preview: string | null; kind: string; }
export interface MultimodalBuilderSource {
  id: string;
  file: string;
  label: string;
  role: MultimodalBuilderRole;
  profile: MultimodalBuilderProfile;
  modality: "spectroscopy" | "genetics" | "image";
  columns: readonly MultimodalBuilderColumn[];
  rowCount: number | null;
  sampleId: string;
  target: string;
  targetUnit: string;
  group: string;
  partition: string;
  features: readonly string[];
  axisMode: "none" | "headers" | "declared";
  axisKind: string;
  axisUnit: string;
  /** Exact coordinates associated with declared feature names. */
  coordinates?: Readonly<Record<string, number>>;
  /** PNG HWC. The owner checks every decoded image against it. */
  shape: readonly number[];
  warnings: readonly string[];
  refusal?: string;
}
export interface MultimodalBuilderDraft { name: string; sources: readonly MultimodalBuilderSource[]; }
export interface MultimodalBuilderValidation {
  status: "idle" | "checking" | "valid" | "error";
  message?: string;
  samples?: number;
  groups?: number;
  calibration?: number;
  holdout?: number;
  fingerprint?: string;
  sources?: readonly { id: string; label: string; matched: number; missing: number; refused: number; missingCells: number }[];
}
export interface MultimodalDatasetBuilderProps {
  files: readonly MultimodalBuilderFile[];
  draft: MultimodalBuilderDraft;
  onDraftChange: (draft: MultimodalBuilderDraft) => void;
  onAddFiles: (files: readonly File[]) => void;
  onRemoveFile: (name: string) => void;
  validation: MultimodalBuilderValidation;
  onValidate: () => void;
  onCreate: () => void;
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  className?: string;
}
