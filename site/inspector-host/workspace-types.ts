import type { ReactNode } from "react"
import type { N4aInspectionView, N4aPreviewState } from "nirs4all-ui/n4aInspector"
import type { PipelineDefinition } from "./pipeline"

export interface PublicExample {
  id: string
  title: string
  scenario: string
  description: string
  file: string
  datasets: string[]
  counts: Record<string, number>
  bytes: number
  sources: { title: string; url: string; license: string; attribution: string }[]
  notes: string[]
}

export type WorkspaceView = "data" | "pipelines" | "results" | "models"
export interface DatasetOption { id: string; label: string }

export interface WorkspaceAction {
  label: string
  kind: "run" | "replay" | "retrain"
  recipeArtifactId?: string
  datasetArtifactId: string
  entrypoint?: string
  partition?: string
  sourceId: string
}

export interface ActionEvent {
  label: string
  variantId?: string
  foldId?: string
}

export interface ActionState {
  status: "idle" | "running" | "done" | "error" | "cancelled"
  action?: WorkspaceAction
  message?: string
  events?: readonly ActionEvent[]
  preview?: N4aPreviewState
  download?: { url: string; name: string }
  output?: N4aInspectionView
  previews?: Readonly<Record<string, N4aPreviewState>>
}

export interface InstrumentedWorkspaceProps {
  examples: readonly PublicExample[]
  loadingExample: string | null
  currentExample: PublicExample | null
  onLoadExample: (example: PublicExample) => void
  examplesOpen: boolean
  onExamplesOpenChange: (open: boolean) => void
  onLoadSynthetic: () => void
  inspection: N4aInspectionView | null
  view: WorkspaceView
  onViewChange: (view: WorkspaceView) => void
  previews: Readonly<Record<string, N4aPreviewState>>
  pipelines: Readonly<Record<string, PipelineDefinition | null>>
  onRequestPreview: (id: string) => void
  onInspectArtifact: (id: string) => void
  actionInputs: ReactNode
  datasetId: string
  sourceId: string
  actionDisabled: boolean
  modelActions: (artifactId: string) => readonly WorkspaceAction[]
  actionState: ActionState
  onAction: (action: WorkspaceAction) => void
  onCancelAction: () => void
  onRequestOutputPreview: (id: string) => void
  onOpenActionOutput: () => void
}
