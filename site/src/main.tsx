import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PackageGraphDemo } from "./demo/PackageGraphDemo.js";
import { App } from "./App.js";
import "../../assets/theme.css";
import "../../assets/viz.css";
import "../../assets/dag.css";
import "../../assets/chains.css";
import "../../assets/datasetBuilder.css";
import "../../assets/conformal.css";
import "../../assets/workbench.css";
import "../../assets/multimodal.css";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    {new URLSearchParams(location.search).get("view") === "package-graph"
      ? <main><PackageGraphDemo /></main> : <App />}
  </StrictMode>,
);
