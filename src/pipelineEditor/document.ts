/** Conversions between the edited document and the canonical pipeline. Pure. */

import { cloneJson, isBypassWrapper, isRecord } from "./json.js";
import type { PipelineChainDocument } from "./types.js";

/**
 * Accept the pipeline forms the SDK loads: a bare list of steps, or a wrapper
 * holding the list under `pipeline` or `steps`. The input is copied.
 */
export function fromCanonicalPipeline(input: unknown): PipelineChainDocument {
  if (Array.isArray(input)) return { pipeline: cloneJson(input) };
  if (isRecord(input)) {
    if (Array.isArray(input.pipeline)) return cloneJson(input) as PipelineChainDocument;
    if (Array.isArray(input.steps)) {
      const { steps, ...rest } = cloneJson(input);
      return { ...rest, pipeline: steps as unknown[] };
    }
  }
  throw new TypeError("A pipeline must be a list of steps or an object with a `pipeline` list.");
}

function stripBypassed(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((item) => !isBypassWrapper(item)).map(stripBypassed);
  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) if (!isBypassWrapper(child)) next[key] = stripBypassed(child);
    // `_weights_` is index-aligned with the `_or_` options: drop the weights of bypassed options too.
    const options = value._or_;
    const weights = value._weights_;
    if (Array.isArray(options) && Array.isArray(weights) && weights.length === options.length) {
      next._weights_ = weights.filter((_, index) => !isBypassWrapper(options[index]));
    }
    return next;
  }
  return value;
}

/**
 * The document as the runtime should receive it: bypassed steps, lanes and
 * groups are left out, everything else is returned unchanged (as a copy).
 */
export function toCanonicalPipeline(document: PipelineChainDocument): PipelineChainDocument {
  return stripBypassed(document) as PipelineChainDocument;
}
