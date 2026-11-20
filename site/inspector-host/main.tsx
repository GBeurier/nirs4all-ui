import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { N4aInspector, projectN4aInspection, projectN4aPreview, type N4aInspectionView, type N4aPreviewState, type N4aSection } from 'nirs4all-ui/n4aInspector'
import { InstrumentedWorkspace } from './InstrumentedWorkspace'
import { DAG_PLAN, isPipeline, type PipelineDefinition } from './pipeline'
import type { ActionState, DatasetOption, PublicExample, WorkspaceAction, WorkspaceView } from './workspace-types'
import 'nirs4all-ui/assets/theme.css'
import 'nirs4all-ui/assets/workbench.css'
import 'nirs4all-ui/assets/qualification.css'
import 'nirs4all-ui/assets/dag.css'
import 'nirs4all-ui/assets/viz.css'
import 'nirs4all-ui/assets/chains.css'
import 'nirs4all-ui/assets/n4a-inspector.css'
import './style.css'

const errorText = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)

function App() {
  const [inspection, setInspection] = useState<N4aInspectionView | null>(null)
  const [phase, setPhase] = useState<'idle' | 'opening' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, N4aPreviewState>>({})
  const [pipelines, setPipelines] = useState<Record<string, PipelineDefinition | null>>({})
  const [view, setView] = useState<WorkspaceView>('data')
  const [rows, setRows] = useState(32)
  const [variant, setVariant] = useState<'explorer' | 'compact'>('explorer')
  const [section, setSection] = useState<N4aSection>('overview')
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [examples, setExamples] = useState<PublicExample[]>([])
  const [examplesOpen, setExamplesOpen] = useState(true)
  const [loadingExample, setLoadingExample] = useState<string | null>(null)
  const [currentExample, setCurrentExample] = useState<PublicExample | null>(null)
  const [actionState, setActionState] = useState<ActionState>({ status: 'idle' })
  const [dataId, setDataId] = useState('')
  const [sourceId, setSourceId] = useState('spectra')
  const [externalPartition, setExternalPartition] = useState('predict')
  const [attaching, setAttaching] = useState(false)
  const [attached, setAttached] = useState<DatasetOption[]>([])
  const [theme, setTheme] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const worker = useRef<Worker | null>(null)
  const actionWorker = useRef<Worker | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const companionInput = useRef<HTMLInputElement>(null)
  const currentFile = useRef<File | null>(null)
  const companionFile = useRef<File | null>(null)
  const pendingAttachment = useRef<File | null>(null)
  const outputFile = useRef<File | null>(null)
  const outputUrl = useRef<string | null>(null)
  const pendingFetch = useRef<AbortController | null>(null)
  const rowsRef = useRef(rows); rowsRef.current = rows
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    const controller = new AbortController()
    fetch('./examples/index.json', { signal: controller.signal }).then(response => { if (!response.ok) throw new Error('Public example catalog is unavailable.'); return response.json() }).then(catalog => setExamples(catalog.examples)).catch(cause => { if (!controller.signal.aborted) setError(String(cause.message ?? cause)) })
    return () => { controller.abort(); worker.current?.terminate(); actionWorker.current?.terminate(); pendingFetch.current?.abort(); if (outputUrl.current) URL.revokeObjectURL(outputUrl.current) }
  }, [])
  function clearOutput() {
    actionWorker.current?.terminate(); actionWorker.current = null
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current)
    outputUrl.current = null; outputFile.current = null; setActionState({ status: 'idle' })
  }
  function close() {
    pendingFetch.current?.abort(); pendingFetch.current = null; setLoadingExample(null)
    worker.current?.terminate(); worker.current = null
    currentFile.current = null; companionFile.current = null; pendingAttachment.current = null; setAttaching(false)
    setInspection(null); setPreviews({}); setPipelines({}); setError(null); setPhase('idle'); setAttached([]); setDataId(''); setCurrentExample(null); clearOutput()
    setExamplesOpen(true)
  }
  function start(file: File, example: PublicExample | null = null) {
    worker.current?.terminate()
    currentFile.current = file; companionFile.current = null; pendingAttachment.current = null; setAttaching(false)
    setInspection(null); setPreviews({}); setPipelines({}); setError(null); setPhase('opening'); setAttached([]); setDataId(''); setCurrentExample(example)
    setSection('overview'); setSelectedArtifactId(null); setSourceId('spectra'); setExternalPartition('predict')
    setExamplesOpen(false)
    const next = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.current = next
    next.onmessage = ({ data }) => {
      if (worker.current !== next) return
      try {
        if (data.type === 'opened') {
          const view = projectN4aInspection(data.report, file.name)
          setInspection(view); setPhase('ready')
          const datasets = view.artifacts.filter(a => a.owner === 'nirs4all-io' && a.section === 'data' && a.storage === 'embedded')
          const storedReplay = view.entrypoints.find(entry => entry.owner === 'dag-ml' && entry.operation === 'predict')
          setDataId(datasets.length === 1 ? datasets[0]!.id : storedReplay?.inputArtifacts.find(id => datasets.some(dataset => dataset.id === id)) ?? '')
          const initialView = datasets.length ? 'data' : view.artifacts.some(isPipeline) ? 'pipelines' : view.counts.models ? 'models' : 'results'
          setView(initialView)
          const candidates = view.artifacts.filter(artifact => artifact.storage === 'embedded' &&
            (initialView === 'pipelines' ? isPipeline(artifact) : artifact.section === initialView))
          const first = candidates.find(artifact => artifact.contentType === DAG_PLAN || artifact.kind === 'result') ?? candidates[0]
          if (first) {
            setPreviews({ [first.id]: { status: 'loading' } })
            next.postMessage({ type: 'preview', artifactId: first.id, rows: rowsRef.current })
          }
        } else if (data.type === 'preview' && data.rows === rowsRef.current) {
          const { definition, ...ownerPreview } = data.preview
          const preview = projectN4aPreview(ownerPreview)
          if (definition !== undefined) setPipelines(current => ({ ...current, [data.artifactId]: definition }))
          setPreviews(current => ({ ...current, [data.artifactId]: { status: 'ready', preview } }))
          setInspection(current => current ? { ...current, artifacts: current.artifacts.map(artifact => artifact.id === data.artifactId ? { ...artifact, contentStatus: preview.status, contentDetail: preview.detail } : artifact) } : current)
        } else if (data.type === 'attached') {
          companionFile.current = pendingAttachment.current; pendingAttachment.current = null; setAttaching(false)
          setAttached(data.artifacts); setDataId(data.artifacts[0]?.id ?? '')
          if (!data.artifacts.length) setError('The companion container has no embedded IO dataset. References are not fetched.')
        } else if (data.type === 'error') {
          if (data.operation === 'attach') {
            pendingAttachment.current = null; setAttaching(false); setError(data.message)
          }
          else if (data.artifactId && data.rows === rowsRef.current) {
            setPreviews(current => ({ ...current, [data.artifactId]: { status: 'error', message: data.message } }))
          }
          else if (!data.artifactId) { setError(data.message); setPhase('error'); next.terminate(); worker.current = null }
        }
      } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setPhase('error'); next.terminate(); worker.current = null }
    }
    next.onerror = event => { if (worker.current === next) { setError(event.message || 'The worker stopped.'); setPhase('error'); next.terminate(); worker.current = null } }
    next.postMessage({ type: 'open', file })
  }
  function open(files: FileList | readonly File[], example: PublicExample | null = null) {
    pendingFetch.current?.abort(); pendingFetch.current = null; setLoadingExample(null); clearOutput()
    if (files.length !== 1) { setError('Select one container at a time.'); return }
    start(files[0]!, example)
  }
  function requestPreview(artifactId: string) {
    if (!worker.current) return
    setPreviews(current => ({ ...current, [artifactId]: { status: 'loading' } }))
    worker.current.postMessage({ type: 'preview', artifactId, rows })
  }
  function showExamples() {
    setExamplesOpen(true)
    requestAnimationFrame(() => {
      const library = document.getElementById('public-example-library')
      library?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      library?.querySelector('summary')?.focus({ preventScroll: true })
    })
  }
  async function loadExample(example?: PublicExample) {
    pendingFetch.current?.abort()
    const controller = new AbortController(); pendingFetch.current = controller
    setLoadingExample(example?.id ?? 'synthetic'); setError(null)
    try {
      const name = example?.file ?? 'synthetic-signals.n4a'
      const response = await fetch(`./examples/${name}`, { signal: controller.signal })
      if (!response.ok) throw new Error('The example could not be loaded.')
      const blob = await response.blob()
      if (controller.signal.aborted) return
      pendingFetch.current = null; setLoadingExample(null); clearOutput(); start(new File([blob], name), example ?? null)
    } catch (cause) { if (!controller.signal.aborted) { setLoadingExample(null); setError(cause instanceof Error ? cause.message : String(cause)) } }
  }
  const datasets = useMemo(() => [...(inspection?.artifacts.filter(a => a.storage === 'embedded' && a.owner === 'nirs4all-io' && a.section === 'data').map(a => ({ id: a.id, label: a.id })) ?? []), ...attached], [inspection, attached])
  function modelActions(artifactId: string): WorkspaceAction[] {
    if (!inspection || !dataId || !sourceId.trim()) return []
    const external = dataId.startsWith('companion:')
    const entries = inspection.entrypoints.filter(entry => entry.owner === 'dag-ml' && entry.rootArtifact === artifactId)
    const replay = entries.find(entry => external ? entry.operation === 'predict-external'
      : entry.operation === 'predict' && entry.inputArtifacts.includes(dataId))
    const actions: WorkspaceAction[] = []
    if (replay) actions.push({ label: external ? 'Replay on attached data' : 'Replay on heldout rows', kind: 'replay',
      entrypoint: replay.id, partition: external ? externalPartition : 'test', datasetArtifactId: dataId, sourceId })
    if (entries.some(entry => entry.operation === 'predict' || entry.operation === 'predict-external')) {
      actions.push({ label: 'Retrain stored recipe', kind: 'retrain', datasetArtifactId: dataId, sourceId })
    }
    return actions
  }
  function attachDataset(file: File, partition: string) {
    if (!worker.current) return
    setError(null); setAttaching(true); setExternalPartition(partition); setAttached([])
    setDataId(current => current.startsWith('companion:') ? '' : current)
    companionFile.current = null; pendingAttachment.current = file
    worker.current.postMessage({ type: 'attach', file })
  }
  async function attachExample(id: string) {
    const example = examples.find(e => e.id === id), target = worker.current
    if (!example || !target) return
    setAttaching(true)
    try {
      const response = await fetch(`./examples/${example.file}`)
      if (!response.ok) throw new Error('The companion example could not be loaded.')
      const file = new File([await response.blob()], example.file)
      if (worker.current !== target) return
      attachDataset(file, id === '09-prediction-cohort' ? 'predict' : 'test')
    } catch (cause) { if (worker.current === target) { setAttaching(false); setError(errorText(cause)) } }
  }
  function onAction(action: WorkspaceAction) {
    if (!currentFile.current || attaching || actionState.status === 'running') return
    clearOutput()
    const runner = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    actionWorker.current = runner
    setActionState({ status: 'running', action, events: [{ label: 'Starting the browser worker' }] })
    setView('results')
    requestAnimationFrame(() => document.getElementById('n4iw-run')?.focus())
    runner.onmessage = ({ data }) => {
      if (actionWorker.current !== runner) return
      if (data.type === 'progress') {
        setActionState(current => ({ ...current, events: [...(current.events ?? []), data.event] }))
      } else if (data.type === 'actionDone') {
        const result = data.result
        if (result.archive) {
          const generated = new File([result.archive], 'browser-analysis.n4a')
          const url = URL.createObjectURL(generated)
          outputFile.current = generated; outputUrl.current = url
          setActionState(current => ({ ...current, status: 'done', message: result.message,
            download: { url, name: generated.name }, preview: { status: 'loading' } }))
        } else {
          setActionState(current => ({ ...current, status: 'done', message: result.message,
            preview: { status: 'ready', preview: projectN4aPreview(result.preview) } }))
          runner.terminate(); actionWorker.current = null
        }
      } else if (data.type === 'outputOpened') {
        try {
          const output = projectN4aInspection(data.report, 'browser-analysis.n4a')
          const result = output.artifacts.find(artifact => artifact.kind === 'result' && artifact.storage === 'embedded')
          setActionState(current => ({ ...current, output, preview: undefined, previews: result ? { [result.id]: { status: 'loading' } } : {} }))
          if (result) runner.postMessage({ type: 'outputPreview', artifactId: result.id, rows: rowsRef.current })
        } catch (cause) {
          setActionState(current => ({ ...current, preview: { status: 'error', message: errorText(cause) } }))
        }
      } else if (data.type === 'outputError') {
        setActionState(current => ({ ...current, preview: { status: 'error', message: data.message } }))
      } else if (data.type === 'outputPreview' || (data.type === 'error' && data.operation === 'outputPreview')) {
        try {
          const preview: N4aPreviewState = data.type === 'error' ? { status: 'error', message: data.message }
            : { status: 'ready', preview: projectN4aPreview(data.preview) }
          setActionState(current => ({ ...current, previews: { ...current.previews, [data.artifactId]: preview } }))
        } catch (cause) {
          setActionState(current => ({ ...current, previews: { ...current.previews, [data.artifactId]: { status: 'error', message: errorText(cause) } } }))
        }
      } else if (data.type === 'error') {
        setActionState(current => ({ ...current, status: 'error', message: data.message }))
        runner.terminate(); actionWorker.current = null
      }
    }
    runner.onerror = event => {
      if (actionWorker.current !== runner) return
      setActionState(current => current.status === 'done'
        ? { ...current, preview: { status: 'error', message: event.message || 'Output worker stopped.' } }
        : { ...current, status: 'error', message: event.message || 'The browser worker stopped.' })
      runner.terminate(); actionWorker.current = null
    }
    runner.postMessage({ type: 'action', action, file: currentFile.current, companionFile: companionFile.current })
  }
  function cancelAction() {
    actionWorker.current?.terminate(); actionWorker.current = null
    setActionState(current => ({ ...current, status: 'cancelled' }))
  }
  function requestOutputPreview(artifactId: string) {
    if (!actionWorker.current) return
    setActionState(current => ({ ...current, previews: { ...current.previews, [artifactId]: { status: 'loading' } } }))
    actionWorker.current.postMessage({ type: 'outputPreview', artifactId, rows: rowsRef.current })
  }
  function exportReport() {
    if (!inspection) return
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 'nirs4all.inspection-report.v1', inspection, previews }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `${inspection.fileName}.inspection.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const actionDisabled = attaching || actionState.status === 'running'
  const actionInputs = <div className="n4ai-host-source n4iw-run-inputs" aria-label="Action input data">
      <label>Action dataset <select aria-label="Action dataset" value={dataId} disabled={actionDisabled} onChange={event => setDataId(event.target.value)}><option value="">Choose embedded or attached data</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
      <label>Source ID <input aria-label="Source ID" disabled={actionDisabled} value={sourceId} onChange={event => setSourceId(event.target.value)} /></label>
      <button type="button" disabled={actionDisabled} onClick={() => companionInput.current?.click()}>Attach data .n4a</button>
      <label>Attach example data <select aria-label="Attach example data" value="" disabled={actionDisabled} onChange={event => { if (event.target.value) attachExample(event.target.value) }}><option value="">Choose public input</option>{examples.filter(e => ['01-data-share', '09-prediction-cohort'].includes(e.id)).map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
      {view === 'models' && dataId.startsWith('companion:') ? <label>Replay partition <select aria-label="Replay partition" value={externalPartition} onChange={event => setExternalPartition(event.target.value)}><option value="predict">predict</option><option value="test">test</option><option value="train">train (in-sample)</option></select></label> : null}
      <input hidden type="file" accept=".n4a" aria-label="Attach a dataset container" ref={companionInput} onChange={event => { const file = event.target.files?.[0]; if (file) attachDataset(file, 'predict'); event.target.value = '' }} />
      {attaching && <span role="status">Opening attached dataset…</span>}
    </div>
  return <main className="n4ai-host">
    <div className="n4ai-host-bar"><a href="../">nirs4all</a><span>Container exploration & local execution</span><button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</button></div>
    <section className="n4ai-host-source" aria-label="Open a local container" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); open(event.dataTransfer.files) }}>
      <p>Drop a .n4a file here, or <button type="button" onClick={() => fileInput.current?.click()}>Browse files</button>.</p>
      <input hidden ref={fileInput} aria-label="Choose a .n4a container" type="file" accept=".n4a" onChange={event => { if (event.target.files?.length) open(event.target.files); event.target.value = '' }} />
      <p>Files and computations stay on your device. External artifact references are never fetched.</p>
      <button type="button" aria-controls="public-example-library" aria-expanded={examplesOpen} onClick={showExamples}>Load example</button>
      <label>Rows per preview <input aria-label="Rows per preview" type="number" min="1" step="1" value={rows} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value > 0) { setRows(value); setPreviews(current => Object.fromEntries(Object.entries(current).filter(([id]) => Object.hasOwn(pipelines, id)))) } }} /></label>
      {phase === 'opening' ? <button type="button" onClick={close}>Cancel inspection</button> : null}
    </section>
    {error ? <p className="n4wb-note is-error" role="alert">{error}</p> : null}
    <InstrumentedWorkspace key={inspection?.containerSha256 ?? 'empty'} examples={examples} loadingExample={loadingExample} currentExample={currentExample}
      onLoadExample={loadExample} examplesOpen={examplesOpen} onExamplesOpenChange={setExamplesOpen} onLoadSynthetic={() => loadExample()}
      inspection={inspection} view={view} onViewChange={setView} previews={previews} pipelines={pipelines} onRequestPreview={requestPreview}
      onInspectArtifact={id => { const a = inspection?.artifacts.find(a => a.id === id); setSelectedArtifactId(id); if (a) setSection(a.section); document.getElementById('container-identity')?.scrollIntoView({ behavior: 'smooth' }) }}
      actionInputs={actionInputs}
      datasetId={dataId} sourceId={sourceId} actionDisabled={actionDisabled} modelActions={modelActions}
      actionState={actionState} onAction={onAction} onCancelAction={cancelAction} onRequestOutputPreview={requestOutputPreview}
      onOpenActionOutput={() => { if (outputFile.current) open([outputFile.current]) }} />
    <div id="container-identity"><N4aInspector inspection={inspection} phase={phase} error={error} previews={previews} variant={variant} section={section} onSectionChange={setSection} selectedArtifactId={selectedArtifactId} onSelectArtifact={setSelectedArtifactId} onRequestPreview={requestPreview} onClose={close} onExportReport={exportReport}
      headerActions={<label>View <select aria-label="View" value={variant} onChange={event => setVariant(event.target.value as 'explorer' | 'compact')}><option value="explorer">Explorer</option><option value="compact">Compact</option></select></label>} /></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
