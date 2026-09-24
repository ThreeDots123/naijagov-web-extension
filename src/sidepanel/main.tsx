import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/sidepanel/App";
import "@/sidepanel/styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Side panel root is missing from index.html.");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
