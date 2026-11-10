/* "Install FamilyRoots" as an app (home screen / desktop). Only offered when the browser says installation is possible. */
import { useSyncExternalStore } from "react";

let deferred = null;
let installed = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; installed = true; notify(); });
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => (installed ? "installed" : deferred ? "available" : "unavailable");

/** { status: "available" | "installed" | "unavailable", install(): Promise<boolean> } */
export function useInstall() {
  const status = useSyncExternalStore(subscribe, snapshot, () => "unavailable");
  const install = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome === "accepted";
  };
  return { status, install };
}
