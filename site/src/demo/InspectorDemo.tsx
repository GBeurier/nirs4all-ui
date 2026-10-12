import { useCallback, useMemo, useState } from "react";

import { Inspector, type ChainPredictions } from "../../../src/inspector/index.js";
import { DEMO_SCORE_REFS, makeDemoChains, makeDemoPredictions } from "./inspectorDemo.js";

/**
 * Showroom host for the Inspector capsule: owns a synthetic chain corpus and
 * answers prediction requests asynchronously, like a workspace-backed host.
 */
export function InspectorDemo({ locale = "en" }: { locale?: "en" | "fr" }) {
  const chains = useMemo(() => makeDemoChains(), []);
  const [predictions, setPredictions] = useState<Record<string, ChainPredictions>>({});
  const [loading, setLoading] = useState<string[]>([]);

  const onRequestPredictions = useCallback(
    (ids: readonly string[]) => {
      setLoading((current) => [...new Set([...current, ...ids])]);
      setTimeout(() => {
        setPredictions((current) => {
          const next = { ...current };
          for (const id of ids) {
            const chain = chains.find((c) => c.id === id);
            if (chain) next[id] = makeDemoPredictions(chain);
          }
          return next;
        });
        setLoading((current) => current.filter((id) => !ids.includes(id)));
      }, 350);
    },
    [chains],
  );

  return (
    <Inspector
      chains={chains}
      scoreRefs={DEMO_SCORE_REFS}
      predictions={predictions}
      loadingPredictions={loading}
      onRequestPredictions={onRequestPredictions}
      onOpenChain={(chain) => console.info("open chain", chain.id)}
      onOpenInPlayground={(chain) => console.info("open in playground", chain.id)}
      onExportSamples={(keys) => console.info("export samples", keys)}
      locale={locale}
    />
  );
}
