import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { ModalProvider } from "./components/Modal";
import { ToastProvider } from "./components/Toasts";
import "./index.css";
import { StoreProvider } from "./lib/StoreProvider";

// HashRouter keeps the original "#/overview" style URLs and works from any static host.
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
