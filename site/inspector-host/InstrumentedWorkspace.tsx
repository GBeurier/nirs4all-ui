import { useId, useMemo, useState } from 'react'
import {
  formatN4aBytes,
  N4aArtifactPreviewView,
  N4A_CONTENT_STATUS_TEXT,
  n4aPreviewUnavailableReason,
  type N4aArtifactView,
  type N4aPreviewState,
} from 'nirs4all-ui/n4aInspector'
import { DAG_PLAN, isPipeline } from './pipeline'
import { Generation, GeneratorExamples, SourceEditor } from './PipelineSource'
import type { InstrumentedWorkspaceProps, PublicExample, WorkspaceView } from './workspace-types'
import './workspace.css'

const VIEWS: readonly { id: WorkspaceView; label: string }[] = [
  { id: 'data', label: 'Data' },
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'results', label: 'Results' },
  { id: 'models', label: 'Models' },
]

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function bytesText(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return 'size not declared'
  const human = formatN4aBytes(String(bytes))
  return human === `${bytes} bytes` ? human : `${human} (${bytes} bytes)`
}

function StatusBadge({ artifact }: { artifact: N4aArtifactView }) {
  const status = N4A_CONTENT_STATUS_TEXT[artifact.contentStatus]
  return <span className={`n4ai-badge is-${status.tone}`} title={status.help}>{status.label}</span>
}

// ------------------------------------------------------------------ gallery

function ExampleProvenance({ example }: { example: PublicExample }) {
  return (
    <details className="n4ai-details n4iw-provenance">
      <summary>Sources, licenses and notes · {example.sources.length + example.notes.length}</summary>
      {example.sources.length > 0 ? (
        <ul className="n4iw-sources" aria-label={`Sources of ${example.title}`}>
          {example.sources.map(source => (
            <li key={`${source.url}-${source.title}`}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
              <span className="n4iw-license">{source.license}</span>
              <span className="n4ai-caption">{source.attribution}</span>
            </li>
          ))}
        </ul>
      ) : <p className="n4ai-muted-line">No external source declared.</p>}
      {example.notes.length > 0 ? (
        <ul className="n4iw-notes" aria-label={`Notes on ${example.title}`}>
          {example.notes.map(note => <li key={note}>{note}</li>)}
        </ul>
      ) : null}
    </details>
  )
}

function ExampleCard({ example, current, loading, busy, onLoad }: { example: PublicExample; current: boolean; loading: boolean; busy: boolean; onLoad: () => void }) {
  const titleId = useId()
  const counts = Object.entries(example.counts).filter(([, count]) => Number.isFinite(count))
  return (
    <li>
      <article className={`n4iw-card${current ? ' is-current' : ''}`} aria-labelledby={titleId} aria-current={current ? 'true' : undefined}>
        <span className="n4ai-eyebrow">{example.scenario}</span>
        <h3 id={titleId} className="n4iw-card-title">{example.title}</h3>
        <p className="n4iw-card-text">{example.description}</p>
        <p className="n4iw-card-datasets"><span className="n4iw-label">Data</span> {example.datasets.join(' · ') || 'none declared'}</p>
        <ul className="n4iw-counts" aria-label="Contents">
          {counts.map(([key, count]) => <li key={key} className="n4ai-badge"><span className="n4wb-mono">{count}</span>&nbsp;{key}</li>)}
          <li className="n4ai-badge">{bytesText(example.bytes)}</li>
        </ul>
        <div className="n4iw-card-actions">
          <button type="button" className="n4wb-btn n4wb-btn-primary" onClick={onLoad} disabled={busy} aria-describedby={titleId}>
            {loading ? <><span className="n4wb-view-busy" aria-hidden="true" />Opening…</> : current ? 'Open again' : 'Open example'}
          </button>
          <a className="n4wb-btn n4wb-btn-outline" href={`examples/${example.file}`} download={example.file} aria-label={`Download ${example.file}`}>
            Download .n4a
          </a>
        </div>
        <ExampleProvenance example={example} />
      </article>
    </li>
  )
}

function Gallery({ examples, loadingExample, currentExample, onLoadExample }: Pick<InstrumentedWorkspaceProps, 'examples' | 'loadingExample' | 'currentExample' | 'onLoadExample'>) {
  const headingId = useId()
  const [scenario, setScenario] = useState<string | null>(null)
  const scenarios = useMemo(() => [...new Set(examples.map(example => example.scenario))], [examples])
  const shown = scenario === null ? examples : examples.filter(example => example.scenario === scenario)
  return (
    <section className="n4iw-section n4iw-gallery" aria-labelledby={headingId}>
      <div className="n4iw-section-head">
        <h2 id={headingId} className="n4ai-h2">Public examples <span className="n4wb-count">{examples.length}</span></h2>
        <p className="n4ai-caption">Real public datasets packed as .n4a containers. Opening one downloads only that file; it stays in this browser.</p>
      </div>
      {examples.length === 0 ? <p className="n4ai-muted-line">No example is published with this page.</p> : (
        <>
          {scenarios.length > 1 ? (
            <div className="n4iw-filter" role="group" aria-label="Filter examples by scenario">
              <button type="button" className={`n4iw-filter-btn${scenario === null ? ' is-active' : ''}`} aria-pressed={scenario === null} onClick={() => setScenario(null)}>
                All <span className="n4wb-count">{examples.length}</span>
              </button>
              {scenarios.map(name => (
                <button key={name} type="button" className={`n4iw-filter-btn${scenario === name ? ' is-active' : ''}`} aria-pressed={scenario === name} onClick={() => setScenario(name)}>
                  {name} <span className="n4wb-count">{examples.filter(example => example.scenario === name).length}</span>
                </button>
              ))}
            </div>
          ) : null}
          <ul className="n4iw-cards" aria-label="Examples">
            {shown.map(example => (
              <ExampleCard
                key={example.id}
                example={example}
                current={currentExample?.id === example.id}
                loading={loadingExample === example.id}
                busy={loadingExample !== null}
                onLoad={() => onLoadExample(example)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// ------------------------------------------------------------------ explore views

function PreviewSlot({ artifact, state, onRequestPreview }: { artifact: N4aArtifactView; state: N4aPreviewState | undefined; onRequestPreview: (id: string) => void }) {
  const reason = n4aPreviewUnavailableReason(artifact)
  if (reason) {
    return (
      <div className="n4iw-slot">
        <p className="n4wb-note">{reason}</p>
        {artifact.contentDetail ? <p className="n4ai-text">{artifact.contentDetail}</p> : null}
      </div>
    )
  }
  if (!state) {
    return (
      <div className="n4iw-slot">
        <button type="button" className="n4wb-btn n4wb-btn-outline" onClick={() => onRequestPreview(artifact.id)}>Load preview</button>
        <p className="n4ai-caption">The owner reads this artifact only when you ask. Nothing is executed.</p>
      </div>
    )
  }
  if (state.status === 'loading') return <p className="n4ai-loading n4iw-slot"><span className="n4wb-view-busy" aria-hidden="true" />Reading {artifact.id} with its owner…</p>
  if (state.status === 'error') {
    return (
      <div className="n4iw-slot">
        <p className="n4wb-note is-error" role="alert">Preview failed: {state.message}</p>
        <button type="button" className="n4wb-btn n4wb-btn-outline" onClick={() => onRequestPreview(artifact.id)}>Retry preview</button>
      </div>
    )
  }
  if (state.preview.artifactId !== artifact.id) {
    return <p className="n4wb-note is-error" role="alert">Preview refused: it describes artifact <code className="n4ai-id">{state.preview.artifactId}</code>, not the selected artifact.</p>
  }
  return <N4aArtifactPreviewView preview={state.preview} mode="explore" />
}

function ArtifactPicker({ label, artifacts, active, onSelect }: {
  label: string
  artifacts: readonly N4aArtifactView[]
  active: string
  onSelect: (id: string) => void
}) {
  return <label className="n4iw-picker">{label}
    <select aria-label={label} value={active} onChange={event => onSelect(event.target.value)}>
      {artifacts.map(artifact => <option key={artifact.id} value={artifact.id}>
        {artifact.id}{artifact.storage === 'reference' ? ' (reference)' : ''}
      </option>)}
    </select>
  </label>
}

function SessionResults({ actionState: state, onCancelAction, onOpenActionOutput, onRequestOutputPreview }: InstrumentedWorkspaceProps) {
  const [selected, setSelected] = useState('')
  const artifacts = state.output?.artifacts.filter(artifact => ['results', 'models'].includes(artifact.section)) ?? []
  const active = artifacts.find(artifact => artifact.id === selected) ?? artifacts.find(artifact => artifact.kind === 'result') ?? artifacts[0]
  const event = state.events?.at(-1)
  return <section className="n4iw-detail n4iw-session" aria-labelledby="n4iw-run">
    <h3 id="n4iw-run" tabIndex={-1}>{state.action?.label ?? 'Browser execution'}</h3>
    {state.action && <dl className="n4iw-kv">
      {state.action.recipeArtifactId && <div><dt>Pipeline</dt><dd>{state.action.recipeArtifactId}</dd></div>}
      <div><dt>Dataset</dt><dd>{state.action.datasetArtifactId}</dd></div>
      <div><dt>Source</dt><dd>{state.action.sourceId}</dd></div>
      {state.action.partition && <div><dt>Partition</dt><dd>{state.action.partition}</dd></div>}
    </dl>}
    {state.status === 'running' && <div className="n4iw-running">
      <p className="n4ai-loading" role="status"><span className="n4wb-view-busy" aria-hidden="true" />{event?.label}
        {event?.foldId && ` · ${event.foldId}`}</p>
      <button type="button" className="n4wb-btn n4wb-btn-outline" onClick={onCancelAction}>Cancel run</button>
    </div>}
    {state.status === 'cancelled' && <p role="status">Execution cancelled.</p>}
    {state.status === 'error' && <p className="n4wb-note is-error" role="alert">{state.message}</p>}
    {state.status === 'done' && <p className="n4wb-note" role="status">{state.message}</p>}
    {state.events?.length ? <details className="n4ai-details n4iw-log" open={state.status === 'running' || undefined}>
      <summary>Execution log · {state.events.length} events</summary>
      <ol tabIndex={0} aria-label="Recorded execution events">{state.events.map((item, index) => <li key={index}>{item.label}
        {item.variantId && <> · <code>{item.variantId}</code></>}
        {item.foldId && <> · <code>{item.foldId}</code></>}
      </li>)}</ol>
    </details> : null}
    {state.download && <div className="n4iw-card-actions">
      <a className="n4wb-btn n4wb-btn-outline" href={state.download.url} download={state.download.name}>Download new bundle</a>
      <button type="button" className="n4wb-btn n4wb-btn-outline" onClick={onOpenActionOutput}>Open generated bundle</button>
    </div>}
    {state.preview?.status === 'loading' && <p role="status">Opening the generated results…</p>}
    {state.preview?.status === 'error' && <p className="n4wb-note is-error" role="alert">{state.preview.message}</p>}
    {state.preview?.status === 'ready' && <N4aArtifactPreviewView preview={state.preview.preview} mode="explore" />}
    {active && <>
      <ArtifactPicker label="Generated artifact" artifacts={artifacts} active={active.id} onSelect={id => {
        setSelected(id)
        if (!state.previews?.[id]) onRequestOutputPreview(id)
      }} />
      <PreviewSlot key={active.id} artifact={active} state={state.previews?.[active.id]} onRequestPreview={onRequestOutputPreview} />
    </>}
  </section>
}

function ExploreViews(props: InstrumentedWorkspaceProps & { inspection: NonNullable<InstrumentedWorkspaceProps['inspection']> }) {
  const { inspection, view, previews, pipelines, actionState, onRequestPreview } = props
  const headingId = useId()
  const panelId = useId()
  const [selected, setSelected] = useState<Partial<Record<WorkspaceView, string>>>({})
  const [pipelineMode, setPipelineMode] = useState<'plans' | 'graphs' | 'examples'>('plans')
  const [resultsMode, setResultsMode] = useState<'stored' | null>(null)
  const hasSession = actionState.status !== 'idle'
  const sessionVisible = hasSession && resultsMode !== 'stored'
  const graphArtifacts = inspection.artifacts.filter(artifact => isPipeline(artifact) && artifact.contentType !== DAG_PLAN)
  const plans = inspection.artifacts.filter(artifact => isPipeline(artifact) && artifact.contentType === DAG_PLAN)
  const storedResults = inspection.artifacts.filter(artifact => artifact.section === 'results')

  function artifactsFor(tab: WorkspaceView, mode = pipelineMode) {
    if (tab === 'pipelines') {
      if (mode === 'examples') return []
      return mode === 'graphs' || !plans.length ? graphArtifacts : plans
    }
    if (tab === 'results') return storedResults
    return inspection.artifacts.filter(artifact => artifact.section === tab)
  }

  function choose(tab: WorkspaceView, candidates = artifactsFor(tab), id = selected[tab]) {
    const artifact = candidates.find(item => item.id === id)
      ?? candidates.find(item => item.kind === 'result' && n4aPreviewUnavailableReason(item) === null)
      ?? candidates.find(item => n4aPreviewUnavailableReason(item) === null) ?? candidates[0]
    if (!artifact) return
    setSelected(current => ({ ...current, [tab]: artifact.id }))
    if (n4aPreviewUnavailableReason(artifact) === null && !previews[artifact.id]) onRequestPreview(artifact.id)
  }

  const artifacts = artifactsFor(view)
  const active = artifacts.find(artifact => artifact.id === selected[view])
    ?? artifacts.find(artifact => artifact.kind === 'result') ?? artifacts[0]
  const definition = view === 'pipelines' && active ? pipelines[active.id] : undefined
  const running = actionState.status === 'running'
  const pipelineModes = [
    ...(plans.length ? [{ id: 'plans' as const, text: 'Execution plans' }] : []),
    ...(graphArtifacts.length ? [{ id: 'graphs' as const, text: 'Stored graphs' }] : []),
    { id: 'examples' as const, text: 'SDK generator examples' },
  ]
  return <section className="n4iw-section" aria-labelledby={headingId}>
    <h2 id={headingId} className="n4ai-h2">Explore the container</h2>
    <nav className="n4iw-views" aria-label="Workspace views">
      {VIEWS.map(entry => <button key={entry.id} type="button"
        className={`n4iw-view-btn${view === entry.id ? ' is-active' : ''}`}
        aria-current={view === entry.id ? 'true' : undefined} aria-controls={panelId}
        onClick={() => { props.onViewChange(entry.id); choose(entry.id) }}>
        <strong>{entry.label}</strong>
        <span className="n4wb-count">{entry.id === 'pipelines' ? plans.length || graphArtifacts.length : inspection.counts[entry.id]}</span>
        {entry.id === 'results' && hasSession && <span className="n4iw-view-hint">{running ? 'Browser execution running' : 'Browser session results'}</span>}
      </button>)}
    </nav>
    <div id={panelId} className="n4iw-panel" role="region" aria-label={VIEWS.find(item => item.id === view)?.label}>
      {view === 'pipelines' && <nav className="n4iw-subnav" aria-label="Pipeline views">
        {pipelineModes.map(mode => <button key={mode.id} type="button" className="n4wb-btn n4wb-btn-outline"
          aria-pressed={(pipelineMode === 'plans' && !plans.length ? 'graphs' : pipelineMode) === mode.id} onClick={() => {
            setPipelineMode(mode.id); choose('pipelines', artifactsFor('pipelines', mode.id))
          }}>{mode.text}</button>)}
      </nav>}
      {view === 'results' && hasSession && <nav className="n4iw-subnav" aria-label="Result sources">
        <button type="button" className="n4wb-btn n4wb-btn-outline" aria-pressed={sessionVisible} onClick={() => setResultsMode(null)}>Browser session</button>
        <button type="button" className="n4wb-btn n4wb-btn-outline" aria-pressed={!sessionVisible} onClick={() => { setResultsMode('stored'); choose('results') }}>Stored in opened file</button>
      </nav>}
      {view === 'results' && sessionVisible ? <SessionResults {...props} /> : view === 'pipelines' && pipelineMode === 'examples' ? <GeneratorExamples /> : active ? (
        <div className="n4iw-detail" key={active.id}>
          <ArtifactPicker label={view === 'pipelines' ? 'Pipeline' : view === 'models' ? 'Model' : 'Artifact'} artifacts={artifacts} active={active.id}
            onSelect={id => choose(view, artifacts, id)} />
          <div className="n4iw-detail-head">
            <span className="n4ai-badges">
              {active.storage === 'reference' ? <span className="n4ai-badge is-warning">Reference only</span> : <span className="n4ai-badge">Embedded</span>}
              <StatusBadge artifact={active} />
            </span>
            <button type="button" className="n4wb-btn n4wb-btn-ghost n4iw-inspect" onClick={() => props.onInspectArtifact(active.id)}>Inspect artifact</button>
          </div>
          {view === 'pipelines' ? <>
            <PreviewSlot artifact={active} state={previews[active.id]} onRequestPreview={onRequestPreview} />
            {definition && <Generation definition={definition} />}
            {definition?.kind === 'native' && <section className="n4iw-operation" aria-label="Run selected pipeline">
              <h4 className="n4ai-h4">Run this pipeline</h4>
              {props.actionInputs}
              <button type="button" className="n4wb-btn n4wb-btn-primary" disabled={props.actionDisabled || !props.datasetId || !props.sourceId.trim()} onClick={() => {
                setResultsMode(null)
                props.onAction({ kind: 'run', label: 'Pipeline run', recipeArtifactId: active.id, datasetArtifactId: props.datasetId, sourceId: props.sourceId })
              }}>Run in browser</button>
              {!props.datasetId && <p className="n4ai-caption">Choose an embedded training dataset or attach a data bundle to run.</p>}
            </section>}
            {definition && <details className="n4ai-details">
              <summary>{definition.kind === 'native' ? 'SDK recipe source' : 'Pipeline source'} · JSON / YAML</summary>
              <SourceEditor source={definition} />
            </details>}
            {definition === null && <p className="n4wb-note">This plan has no embedded native SDK recipe.</p>}
          </> : <>
            {view === 'models' && active.storage === 'embedded' && inspection.entrypoints.some(entry => entry.owner === 'dag-ml' &&
              entry.rootArtifact === active.id && ['predict', 'predict-external'].includes(entry.operation)) && (
              <section className="n4iw-operation" aria-label="Fitted model actions">
                <h4 className="n4ai-h4">Use this fitted model</h4>
                {props.actionInputs}
                <div className="n4iw-card-actions">
                  {props.modelActions(active.id).map(action => <button key={action.kind} type="button" className="n4wb-btn n4wb-btn-primary"
                    disabled={props.actionDisabled} onClick={() => { setResultsMode(null); props.onAction(action) }}>
                    {action.kind === 'replay' ? action.label : 'Retrain in browser'}
                  </button>)}
                </div>
                {!props.datasetId && <p className="n4ai-caption">Choose stored data or attach a compatible data bundle for model actions.</p>}
              </section>
            )}
            <PreviewSlot artifact={active} state={previews[active.id]} onRequestPreview={onRequestPreview} />
          </>}
        </div>
      ) : <p className="n4ai-muted-line">{view === 'models' ? 'No fitted models are stored in this container.'
        : view === 'results' ? 'No results are stored in this container.'
        : view === 'pipelines' ? 'No pipelines are stored in this container.'
        : 'No datasets are declared in this container.'}</p>}
    </div>
  </section>
}

export function InstrumentedWorkspace(props: InstrumentedWorkspaceProps) {
  const { inspection, currentExample } = props
  const containerKey = inspection ? `${inspection.containerSha256}:${inspection.fileName}` : 'none'
  return (
    <div className="n4wb n4iw">
      <details id="public-example-library" className="n4ai-details n4iw-library" open={props.examplesOpen} onToggle={event => { if (event.currentTarget.open !== props.examplesOpen) props.onExamplesOpenChange(event.currentTarget.open) }}>
        <summary tabIndex={0}>Public examples · {props.examples.length}{inspection ? ' · Choose another example' : ''}</summary>
        <Gallery examples={props.examples} loadingExample={props.loadingExample} currentExample={currentExample} onLoadExample={props.onLoadExample} />
        <p className="n4ai-caption">For a small demonstration with three spectra and a masked target: <button type="button" className="n4wb-btn n4wb-btn-outline" onClick={props.onLoadSynthetic}>Load synthetic example</button></p>
      </details>
      {inspection ? (
        <div key={containerKey} className="n4iw-workspace">
          <header className="n4iw-current">
            <span className="n4ai-eyebrow">{currentExample ? currentExample.scenario : 'Opened container'}</span>
            <strong className="n4iw-current-title">{currentExample ? currentExample.title : inspection.fileName}</strong>
            <span className="n4ai-caption">
              {inspection.fileName} · {plural(inspection.artifacts.length, 'artifact')} · storage verified by Core, execution not evaluated
            </span>
            {currentExample ? <ExampleProvenance example={currentExample} /> : null}
          </header>
          <ExploreViews {...props} inspection={inspection} />
        </div>
      ) : null}
    </div>
  )
}
