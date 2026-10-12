import { useCallback, useMemo, useRef, useState } from "react";

import { Playground, type PlaygroundResult, type PlaygroundRunRequest, type PlaygroundStatus } from "../../../src/playground/index.js";
import { DEMO_OPERATORS, DEMO_STARTER_PIPELINE, makeWheatDataset, runDemoRequest } from "./mockEngine.js";

/**
 * Showroom host for the Playground capsule: owns the (synthetic) dataset and
 * answers run requests with the demo engine, exactly like Studio or Web would
 * with a real runtime.
 */
export function PlaygroundDemo({ locale = "en" }: { locale?: "en" | "fr" }) {
  const dataset = useMemo(() => makeWheatDataset(), []);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [status, setStatus] = useState<PlaygroundStatus>("idle");
  const latest = useRef<string | null>(null);

  const onRunRequest = useCallback(
    (request: PlaygroundRunRequest) => {
      latest.current = request.id;
      setStatus("running");
      // Yield to the browser so the UI stays responsive, like an async host.
      setTimeout(() => {
        if (latest.current !== request.id) return;
        const next = runDemoRequest(dataset, request);
        if (latest.current !== request.id) return;
        setResult(next);
        setStatus(next.steps?.some((s) => s.status === "error") ? "error" : "idle");
      }, 16);
    },
    [dataset],
  );

  return (
    <Playground
      dataset={dataset}
      operators={DEMO_OPERATORS}
      defaultPipeline={DEMO_STARTER_PIPELINE}
      result={result}
      status={status}
      onRunRequest={onRunRequest}
      onOpenInEditor={() => undefined}
      onExportPipeline={(steps) => console.info("export pipeline", steps)}
      onExportSelection={(_, ids) => console.info("export selection", ids)}
      locale={locale}
    />
  );
}
