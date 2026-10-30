import snapshot from "./studio-presets.json" with { type: "json" };
import type { PipelinePreset } from "./presets.js";

/** Authoritative Studio YAML provenance, used by host freshness checks. */
export const STUDIO_PRESET_SOURCE = {
  source: snapshot.source,
  commit: snapshot.commit,
  files_sha256: { ...snapshot.files_sha256 },
};

/** Each host receives independent recipe objects; editing cannot change the defaults. */
export function getStudioPipelinePresets(): PipelinePreset[] {
  return JSON.parse(JSON.stringify(snapshot.presets)) as PipelinePreset[];
}
