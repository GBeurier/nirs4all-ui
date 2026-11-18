// Standalone trial page for the pipeline chain editor. Served by the showroom
// dev server only (`npm run demo:pipeline-editor`); it is not part of the
// published site build.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PipelineChainDemo } from "./demo/PipelineChainDemo.js";
import "../../assets/theme.css";
import "../../assets/pipelineEditor.css";
import "./demo/pipelineChainDemo.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <PipelineChainDemo />
  </StrictMode>,
);
