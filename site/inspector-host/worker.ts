import { inspectN4aContainer, type N4aInspectionSession, openN4aContainer, writeN4aContainer } from 'nirs4all'
import { inspectN4aBytes, predictN4aNative, produceN4aNative, retrainN4aNative } from 'nirs4all/actions'
import { datasetInspectionPorts } from '@nirs4all/io-wasm/inspection'
import { normalizeDataset } from '@nirs4all/io-wasm/public-dataset'
import { dagMlInspectionPorts } from 'dag-ml-wasm/artifact-inspector'
import { webHostInspectionPort } from '#web-inspection-port'
import { DAG_GRAPH, DAG_PLAN, type PipelineDefinition } from './pipeline'
import type { ActionEvent, WorkspaceAction } from './workspace-types'

let session: N4aInspectionSession | undefined
let outputSession: N4aInspectionSession | undefined
let container: Awaited<ReturnType<typeof openN4aContainer>> | undefined
let file: File | undefined
let companion: Awaited<ReturnType<typeof openN4aContainer>> | undefined
const decode = (bytes: Uint8Array): any => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
const provenancePort = {
  owner: 'nirs4all.web-host', contentType: 'nirs4all.public-example.provenance', version: 1,
  inspect: (bytes: Uint8Array, artifact: { id: string }) => {
    const value = decode(bytes)
    return { artifactId: artifact.id, kind: 'document' as const, title: value.title, status: 'not_evaluated' as const, detail: 'Public example source attribution and documented preparation. Source license and evaluation protocol are not execution admission.',
      fields: ['id', 'title', 'url', 'license', 'attribution', 'originalSamples', 'selectedSamples', 'excludedNonfiniteRows'].filter(key => value[key] !== undefined).map(label => ({ label, value: String(value[label]) })),
      tables: [{ title: 'Preparation notes', columns: ['Note'], rows: (value.changes ?? []).map((note: string) => [note]) }] }
  },
}
const previewers = [
  ...datasetInspectionPorts,
  ...dagMlInspectionPorts.map(port => {
    if (port.contentType !== DAG_PLAN && port.contentType !== DAG_GRAPH) return port
    return { ...port, inspect(bytes: Uint8Array, artifact: { id: string }, options: unknown) {
      const preview = port.inspect(bytes, artifact, options)
      const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const value = JSON.parse(json)
      const fileName = artifact.id.replace(/[^a-z0-9._-]+/gi, '-') || 'pipeline'
      let definition: PipelineDefinition | null = null
      if (port.contentType === DAG_GRAPH) {
        definition = { kind: 'graph', fileName, document: value, originalJson: json }
      } else {
        const recipe = value.campaign?.metadata?.native_pipeline_recipe
        const generation = value.campaign?.generation
        if (Array.isArray(recipe?.steps) && recipe.steps.length && Array.isArray(recipe.candidates)) {
          definition = { kind: 'native', fileName, document: recipe, steps: recipe.steps,
            generation: Array.isArray(generation?.dimensions) ? generation : undefined,
            variantCount: value.variants?.length, foldCount: value.fold_set?.folds?.length }
        }
      }
      return { ...preview, definition }
    } }
  }),
  webHostInspectionPort,
  provenancePort,
]

function progress(event: ActionEvent) {
  self.postMessage({ type: 'progress', event })
}

async function observeEstimator() {
  const { N4mWasmEstimatorControllers: OwnerController } = await import('dag-ml-wasm/n4m-estimator-controller')
  let previous = ''
  const labels: Record<string, string> = { FIT_CV: 'Cross-validation', REFIT: 'Refitting selected variant', PREDICT: 'Predicting with fitted state' }
  return { N4mWasmEstimatorControllers: class extends OwnerController {
    constructor(options: ConstructorParameters<typeof OwnerController>[0]) {
      super({ ...options, resolveFeatures: input => {
        const { phase, variant_id, fold_id } = input.task
        const label = typeof phase === 'string' ? labels[phase] : undefined
        const variantId = typeof variant_id === 'string' ? variant_id : undefined
        const foldId = typeof fold_id === 'string' ? fold_id : undefined
        const key = JSON.stringify([phase, variantId, foldId])
        if (label && key !== previous) {
          previous = key
          progress({ label, ...(variantId ? { variantId } : {}), ...(foldId ? { foldId } : {}) })
        }
        return options.resolveFeatures(input)
      } })
    }
  } }
}

function artifacts(handle = container): any[] {
  if (!handle) throw new Error('Open a container first.')
  return (handle.view() as any).readability.manifest.artifacts
}
async function readArtifact(id: string, owner: string, types: readonly string[], handle = container) {
  const artifact = artifacts(handle).find(a => a.id === id)
  if (!artifact || artifact.owner !== owner || !types.includes(artifact.content_type.id) || artifact.storage.kind !== 'embedded') throw new Error('The requested embedded owner artifact is unavailable. External references are never fetched.')
  const versions: Record<string, number> = { 'nirs4all.dataset.v1': 1, 'nirs4all.dataset.v2': 2, 'dagml.execution_plan': 1 }
  if (artifact.content_type.version !== versions[artifact.content_type.id]) throw new Error('This owner schema version is not supported for browser actions.')
  const bytes = await handle!.readMember(artifact.storage.root_member)
  if (!bytes) throw new Error('The declared embedded member is unavailable.')
  return bytes
}
async function dataset(id: string) {
  const external = id.startsWith('companion:')
  const handle = external ? companion : container
  if (!handle) throw new Error('The selected dataset container is not attached.')
  const bytes = await readArtifact(external ? id.slice('companion:'.length) : id, 'nirs4all-io', ['nirs4all.dataset.v1', 'nirs4all.dataset.v2'], handle)
  return { bytes, record: normalizeDataset(decode(bytes)), handle }
}
async function carryAttribution(archiveBytes: Uint8Array, input: NonNullable<typeof container>) {
  const attribution = artifacts(input).filter(a => a.owner === 'nirs4all.web-host' && a.content_type.id === 'nirs4all.public-example.provenance' && a.content_type.version === 1 && a.storage.kind === 'embedded')
  if (!attribution.length) return archiveBytes
  const output = await openN4aContainer(archiveBytes)
  try {
    const manifest = (output.view() as any).readability.manifest, members: { path: string; bytes: Uint8Array }[] = []
    for (const member of manifest.members) {
      const bytes = await output.readMember(member.path)
      if (!bytes) throw new Error('The produced archive member is unavailable.')
      members.push({ path: member.path, bytes })
    }
    const sourceManifest = (input.view() as any).readability.manifest
    for (const [index, artifact] of attribution.entries()) {
      const path = `input-attribution/${index}.json`, bytes = await input.readMember(artifact.storage.root_member)
      if (!bytes) throw new Error('The input attribution member is unavailable.')
      const original = sourceManifest.members.find((m: any) => m.path === artifact.storage.root_member)
      members.push({ path, bytes })
      manifest.members.push({ ...original, path })
      manifest.artifacts.push({ ...artifact, id: `input-attribution:${index}`, storage: { kind: 'embedded', root_member: path, member_paths: [path] }, requirements: null })
    }
    return (await writeN4aContainer(manifest, members)).archiveBytes
  } finally { output.close() }
}
async function execute(action: WorkspaceAction) {
  if (!file) throw new Error('Open a container before executing an action.')
  // Separate action boundary: the report-only inspection session exposes no raw execution reads.
  progress({ label: 'Verifying input container and dataset' })
  container ??= await openN4aContainer(file)
  if (!['run', 'replay', 'retrain'].includes(action.kind)) throw new Error('Unknown action.')
  const selected = action.datasetArtifactId ? await dataset(action.datasetArtifactId) : undefined
  if (action.kind === 'run') {
    if (!selected || !action.recipeArtifactId) throw new Error('Select an embedded dataset and a stored execution plan.')
    const plan = decode(await readArtifact(action.recipeArtifactId, 'dag-ml', ['dagml.execution_plan']))
    const recipe = plan.campaign?.metadata?.native_pipeline_recipe
    if (!recipe) throw new Error('The stored plan has no complete native pipeline recipe. This browser will not reconstruct or approximate it.')
    progress({ label: 'Loading the runtime and preparing the training plan' })
    const estimatorAdapter = await observeEstimator()
    const output = await produceN4aNative(selected.bytes, { sourceId: action.sourceId, recipe, estimatorAdapter })
    progress({ label: 'Preparing the verified result bundle' })
    return { archiveBytes: await carryAttribution(output.archiveBytes, selected.handle), message: 'Completed a new owner CV → OOF selection → refit run. Download or open its sealed .n4a bundle.' }
  }
  const archive = new Uint8Array(await file.arrayBuffer())
  // The owner's closed-profile admission is mandatory, even when metadata lists an entrypoint.
  const admitted = await inspectN4aBytes(archive)
  if (action.sourceId !== admitted.training.source_id) throw new Error('The selected source differs from the fitted archive source.')
  if (action.kind === 'retrain') {
    if (!selected) throw new Error('Retraining requires an explicit dataset.')
    progress({ label: 'Loading the runtime and preparing the refit' })
    const estimatorAdapter = await observeEstimator()
    const output = await retrainN4aNative(archive, selected.bytes, { estimatorAdapter })
    progress({ label: 'Preparing the verified result bundle' })
    return { archiveBytes: await carryAttribution(output.archiveBytes, selected.handle), message: 'Completed a fresh fit from the archive’s stored recipe. The original fitted archive is unchanged.' }
  }
  const entry = (admitted.manifest.entrypoints as any[]).find(e => e.id === action.entrypoint && e.owner === 'dag-ml')
  if (!entry || !['predict', 'predict-external'].includes(entry.operation)) throw new Error('No matching declared prediction operation.')
  if (entry.operation === 'predict' && !entry.input_artifacts.includes(action.datasetArtifactId)) throw new Error('Stored replay must use its declared input dataset. Attach other data for the external prediction operation.')
  progress({ label: 'Loading the runtime and restoring fitted state' })
  const estimatorAdapter = await observeEstimator()
  const replay = await predictN4aNative(archive, { entrypoint: action.entrypoint!, sourceId: action.sourceId,
    partition: action.partition, estimatorAdapter, record: entry.operation === 'predict-external' ? selected?.bytes : undefined })
  const rows: (string | number | null)[][] = []
  const sourceRecord = selected?.record ?? (action.datasetArtifactId ? (await dataset(action.datasetArtifactId)).record : undefined)
  const raw: any = sourceRecord?.dataset
  const truth = new Map<string, unknown[]>(raw?.sample_ids.map((id: string, i: number) => [id, Array.isArray(raw.y?.values[i]) ? raw.y.values[i] : [raw.y?.values[i]]]) ?? [])
  const chains: any[] = [], predictions: any[] = []
  for (const output of replay.replay.outputs ?? []) for (const block of output.predictions ?? []) {
    const names: string[] = block.target_names ?? output.binding?.target_names ?? []
    for (const [targetIndex, target] of names.entries()) {
      const chainId = `${output.binding?.binding_id}:${target}:${block.partition}`
      const pairs: { id: string; observed: number; predicted: number }[] = []
      block.sample_ids.forEach((id: string, i: number) => {
        const value = block.values[i][targetIndex]
        const observedIndex = raw?.target_names?.indexOf(target) ?? -1
        const position = raw?.sample_ids.indexOf(id) ?? -1
        const targetMask = position >= 0 ? raw?.target_mask?.values[position] : false
        const present = targetMask === undefined || targetMask === null || (Array.isArray(targetMask) ? targetMask[observedIndex] : targetMask)
        const observed = observedIndex >= 0 && present ? truth.get(id)?.[observedIndex] : undefined
        rows.push([id, target, value, typeof observed === 'number' ? observed : null, action.partition ?? block.partition, 'stored fitted state'])
        if (typeof observed === 'number' && Number.isFinite(observed) && typeof value === 'number' && Number.isFinite(value)) pairs.push({ id, observed, predicted: value })
      })
      if (pairs.length) {
        chains.push({ id: chainId, label: `${target} · ${action.partition}`, task: 'regression', target, model: 'Stored fitted predictor', steps: [], scores: {} })
        predictions.push({ chainId, sampleKeys: pairs.map(x => x.id), yTrue: pairs.map(x => x.observed), yPred: pairs.map(x => x.predicted), partition: pairs.map(() => action.partition ?? block.partition) })
      }
    }
  }
  return { preview: { artifactId: 'action:replay', kind: 'result', title: `Fitted-state replay · ${action.partition ?? 'predict'}`, status: 'validated',
    detail: 'Executed by the Core / DAG-ML / Methods owner runtime. No fitting performed. Observed targets, when present, are joined by sample identity and target name. No metrics are recomputed.',
    fields: [{ label: 'Predicted samples', value: String(replay.sampleIds.length) }, { label: 'Training performed', value: 'false' }, { label: 'Partition', value: action.partition ?? 'predict' }],
    tables: [{ title: 'Replay predictions', columns: ['Sample ID', 'Target', 'Prediction', 'Observed (if supplied)', 'Partition', 'Source'], rows, totalRows: rows.length }],
    ...(chains.length ? { inspector: { chains, scoreRefs: [], predictions: Object.fromEntries(predictions.map(p => [p.chainId, p])) } } : {}) }, receipt: replay.receipt,
    message: `Replayed ${replay.sampleIds.length} samples with the stored fitted state; no fit was performed.` }
}
self.onmessage = async (event: MessageEvent) => {
  const request = event.data
  try {
    if (request.type === 'open') {
      session?.close(); container?.close(); container = undefined; companion?.close(); companion = undefined
      file = request.file
      session = await inspectN4aContainer(file!, { previewers })
      self.postMessage({ type: 'opened', report: session.report() })
    } else if (request.type === 'preview') {
      if (!session) throw new Error('Open a container before requesting previews.')
      const preview = await session.preview(request.artifactId, { maxRows: request.rows })
      self.postMessage({ type: 'preview', artifactId: request.artifactId, rows: request.rows, preview })
    } else if (request.type === 'attach') {
      companion?.close(); companion = undefined
      companion = await openN4aContainer(request.file)
      self.postMessage({ type: 'attached', artifacts: artifacts(companion).filter(a => a.owner === 'nirs4all-io' && a.kind === 'dataset' && a.storage.kind === 'embedded').map(a => ({ id: `companion:${a.id}`, label: `${request.file.name} / ${a.id}` })) })
    } else if (request.type === 'action') {
      file = request.file
      if (request.companionFile) companion = await openN4aContainer(request.companionFile)
      try {
        const { archiveBytes, ...result } = await execute(request.action)
        const output = archiveBytes && new Blob([archiveBytes])
        self.postMessage({ type: 'actionDone', result: { ...result, archive: output } })
        if (output) {
          try {
            outputSession = await inspectN4aContainer(output, { previewers })
            self.postMessage({ type: 'outputOpened', report: outputSession.report() })
          } catch (error) {
            self.postMessage({ type: 'outputError', message: error instanceof Error ? error.message : String(error) })
          }
        }
      } finally { container?.close(); companion?.close(); container = undefined; companion = undefined; file = undefined }
    } else if (request.type === 'outputPreview') {
      if (!outputSession) throw new Error('The generated bundle is unavailable.')
      const { definition: _definition, ...preview } = await outputSession.preview(request.artifactId, { maxRows: request.rows })
      self.postMessage({ type: 'outputPreview', artifactId: request.artifactId, preview })
    }
  } catch (error) {
    self.postMessage({ type: 'error', operation: request.type, artifactId: request.artifactId, rows: request.rows, message: error instanceof Error ? error.message : String(error) })
  }
}
