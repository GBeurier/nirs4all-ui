import { useState } from "react"
import { GENERATOR_EXAMPLES, sourceText, type PipelineDefinition, type PipelineSource } from "./pipeline"

function downloadSource(text: string, fileName: string, format: "json" | "yaml") {
  const url = URL.createObjectURL(new Blob([text], { type: `application/${format};charset=utf-8` }))
  const link = document.createElement("a")
  link.href = url
  link.download = `${fileName}.${format}`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function SourceEditor({ source }: { source: PipelineSource }) {
  const [format, setFormat] = useState<"json" | "yaml">("yaml")
  const [feedback, setFeedback] = useState("")
  const text = sourceText(source, format)
  const file = source.fileName + "." + format
  const usage = source.kind === "native"
    ? `nirs4all.run("${file}", "io-record.json", engine="native",\n             native_profile="nirs4all.n4a.container.v1", source_id="spectra")`
    : `nirs4all.run("${file}", dataset)`
  return <div className="n4iw-source">
    <div className="n4iw-card-actions">
      <label>Format <select aria-label="Recipe format" value={format} onChange={event => { setFormat(event.target.value as typeof format); setFeedback("") }}>
        <option value="yaml">YAML</option><option value="json">JSON</option>
      </select></label>
      <button type="button" className="n4wb-btn n4wb-btn-primary" onClick={() => downloadSource(text, source.fileName, format)}>Download {format.toUpperCase()}</button>
      <button type="button" className="n4wb-btn n4wb-btn-outline" onClick={async () => {
        try { await navigator.clipboard.writeText(text); setFeedback("Copied") }
        catch { setFeedback("Clipboard unavailable. Select the source or download the file.") }
      }}>Copy source</button>
      <span className="n4ai-caption" role="status">{feedback}</span>
    </div>
    <pre tabIndex={0} aria-label={`Recipe source (${format.toUpperCase()})`}><code>{text}</code></pre>
    {source.kind === "graph" ? <p className="n4ai-caption">DAG GraphSpec source. SDK execution requires a supported SDK recipe.</p> : <>
      <h4 className="n4ai-h4">Use in the Python SDK</h4>
      <pre tabIndex={0}><code>{usage}</code></pre>
      {source.kind === "native" && <p className="n4ai-caption">Pass the IO record and its source ID. The SDK uses the canonical native profile for this recipe.</p>}
    </>}
  </div>
}

export function Generation({ definition }: { definition: PipelineDefinition }) {
  const generation = definition.generation
  return <>
    {definition.steps?.length ? <ol className="n4iw-steps" aria-label="Pipeline steps">
      {definition.steps.map((step, index) => <li key={index}><strong>{step.method_id}</strong><span>{step.role}</span>
        {step.params && Object.keys(step.params).length > 0 && <code>{JSON.stringify(step.params)}</code>}
      </li>)}
    </ol> : null}
    {generation && <div className="n4iw-generation">
      <h4 className="n4ai-h4">Variant generation</h4>
      <p>{generation.strategy} · {definition.variantCount ?? "Unspecified"} variants
        {definition.foldCount ? ` · ${definition.foldCount} stored CV folds` : ""}</p>
      {generation.dimensions.map(dimension => <details className="n4ai-details" key={dimension.name}>
        <summary>{dimension.name} · {dimension.choices.length} choices</summary>
        <ul>{dimension.choices.map((choice, index) => <li key={index}><strong>{choice.label}</strong>
          {choice.param_overrides?.map((override, i) => <div key={i}><code>{override.node_id} {JSON.stringify(override.params)}</code></div>)}
        </li>)}</ul>
      </details>)}
    </div>}
  </>
}

export function GeneratorExamples() {
  const [selected, setSelected] = useState(0)
  const example = GENERATOR_EXAMPLES[selected]!
  return <section className="n4iw-detail" aria-label="SDK generator examples">
    <label>Generator <select aria-label="Generator" value={selected} onChange={event => setSelected(Number(event.target.value))}>
      {GENERATOR_EXAMPLES.map((item, index) => <option key={item.key} value={index}>{item.title} ({item.key})</option>)}
    </select></label>
    <p>{example.description} Expand this recipe with the Python SDK.</p>
    <SourceEditor key={example.key} source={example.source} />
  </section>
}
