import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./assets/fonts/fonts.css";
import { ModalProvider } from "./components/Modal";
import { ToastProvider } from "./components/Toasts";
import "./index.css";
import { StoreProvider } from "./lib/StoreProvider";

// HashRouter keeps the original "#/overview" style URLs and works from any static host, or from a double-clicked file.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <StoreProvider>
        <ToastProvider>
          <ModalProvider>
            <App />
          </ModalProvider>
        </ToastProvider>
      </StoreProvider>
    </HashRouter>
  </StrictMode>,
);

// Offline support and "Install app" for the hosted build. Not in development, and not for the single-file version (file://).
if (import.meta.env.PROD && import.meta.env.MODE !== "single" && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => { /* app still works online */ }));
}
