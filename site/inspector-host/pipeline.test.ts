import { describe, expect, it } from "vitest"
import { GENERATOR_EXAMPLES, sourceText } from "./pipeline"

describe("showroom recipe export", () => {
  it("preserves the stored GraphSpec text in the JSON export", () => {
    const originalJson = "{\"nodes\":[],\"edges\":[]}\n"
    expect(sourceText({ kind: "graph", fileName: "graph", originalJson, document: { nodes: [], edges: [] } }, "json"))
      .toBe(originalJson)
  })

  it("exports coordinates and scalars with their JSON types in YAML", () => {
    const source = { kind: "native", fileName: "pipeline", document: {
      steps: [{ method_id: "yes", params: { epsilon: 1e-10, axis: [1, 0], enabled: false, mask: null } }],
      candidates: [{}],
    } } as const
    expect(sourceText({ ...source, document: JSON.parse(JSON.stringify(source.document)) }, "yaml")).toBe(
      '"steps":\n  - "method_id": "yes"\n    "params":\n      "epsilon": 1.0e-10\n      "axis":\n        - 1\n        - 0\n      "enabled": false\n      "mask": null\n"candidates":\n  - {}\n',
    )
  })

  it("exports generator directives without expanding or replacing them", () => {
    for (const example of GENERATOR_EXAMPLES) {
      const text = sourceText(example.source, "json")
      expect(text).toContain(`"${example.key}"`)
      expect(JSON.parse(text)).toEqual(example.source.document)
    }
  })
})
