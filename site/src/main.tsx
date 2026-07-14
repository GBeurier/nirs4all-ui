import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "../../assets/theme.css";
import "../../assets/viz.css";
import "../../assets/dag.css";
import "../../assets/datasetBuilder.css";
import "../../assets/conformal.css";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
