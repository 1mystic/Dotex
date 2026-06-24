import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Self-heal stale deploys: after a redeploy the hashed chunk filenames change, so
// a browser holding an older index.html requests chunks that no longer exist
// (the SPA redirect then serves index.html, causing a module/MIME error). When a
// lazy chunk fails to load, reload once to pick up the current build. The 10s
// guard prevents a reload loop if the failure is genuinely persistent.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const last = Number(sessionStorage.getItem("chunk-reload-at") || 0);
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem("chunk-reload-at", String(Date.now()));
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
