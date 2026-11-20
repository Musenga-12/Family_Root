/* The gate in front of the archive's screens: with a family server they need a signed-in account and that family's
   archive, loaded from the server (never the sample family, not even for a moment); the on-device demo needs neither.
   Also takes someone with unfinished welcome steps back to them, once per visit. */
import { Navigate, useLocation } from "react-router-dom";
import { useT } from "../lib/i18n";
import { useSession, welcomeSeen } from "../lib/session";
import { useStore } from "../lib/store";
import { Button, Icon } from "./ui";

export function Loading({ label }) {
  const t = useT();
  return <div className="grid min-h-[50vh] place-items-center text-muted" role="status">{label || t("common.loading")}</div>;
}

function Problem({ title, error, onRetry }) {
  const t = useT();
  return (
    <main id="main" className="grid min-h-screen place-items-center p-6">
      <div role="alert" className="grid max-w-110 justify-items-center gap-3 text-center">
        <Icon name="cloud_off" className="text-[44px]! text-sec-ink" />
        <h1 className="text-[1.6rem]!">{title}</h1>
        <p className="text-muted">{error}</p>
        <Button variant="primary" icon="restart_alt" onClick={onRetry}>{t("session.retry")}</Button>
      </div>
    </main>
  );
}

export default function RequireSession({ children, archive = true }) {
  const { status, me, error, retry } = useSession();
  const { server } = useStore();
  const location = useLocation();
  const t = useT();
  // Unfinished welcome steps come first, once per visit (see welcomeSeen in session.js).
  if (status === "signedIn" && me?.onboarding_done === false && location.pathname === "/overview" && !welcomeSeen()) {
    return <Navigate to="/welcome" replace />;
  }
  if (status === "demo") return children;
  if (status === "signedIn") {
    // `archive={false}` (the welcome steps) only needs the account, not the whole archive.
    if (!archive || (server.source === "server" && server.archive.status === "ready")) return children;
    if (server.archive.status === "error") return <Problem title={t("sync.loadFailed")} error={server.archive.error} onRetry={server.retry} />;
    return <Loading label={t("sync.loading", { family: me?.family_name || "" })} />;
  }
  if (status === "signedOut") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (status === "loading") return <Loading label={t("session.checking")} />;
  return <Problem title={t("session.errorTitle")} error={error} onRetry={retry} />;
}
