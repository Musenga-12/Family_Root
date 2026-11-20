/* The gate in front of the archive's screens: with a family server they need a signed-in account; the on-device demo
   needs none. Also takes someone with unfinished welcome steps back to them, once per visit. */
import { Navigate, useLocation } from "react-router-dom";
import { useT } from "../lib/i18n";
import { useSession, welcomeSeen } from "../lib/session";
import { Button, Icon } from "./ui";

export function Loading({ label }) {
  const t = useT();
  return <div className="grid min-h-[50vh] place-items-center text-muted" role="status">{label || t("common.loading")}</div>;
}

export default function RequireSession({ children }) {
  const { status, me, error, retry } = useSession();
  const location = useLocation();
  const t = useT();
  // Unfinished welcome steps come first, once per visit (see welcomeSeen in session.js).
  if (status === "signedIn" && me?.onboarding_done === false && location.pathname === "/overview" && !welcomeSeen()) {
    return <Navigate to="/welcome" replace />;
  }
  if (status === "demo" || status === "signedIn") return children;
  if (status === "signedOut") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (status === "loading") return <Loading label={t("session.checking")} />;
  return (
    <main id="main" className="grid min-h-screen place-items-center p-6">
      <div role="alert" className="grid max-w-110 justify-items-center gap-3 text-center">
        <Icon name="cloud_off" className="text-[44px]! text-sec-ink" />
        <h1 className="text-[1.6rem]!">{t("session.errorTitle")}</h1>
        <p className="text-muted">{error}</p>
        <Button variant="primary" icon="restart_alt" onClick={retry}>{t("session.retry")}</Button>
      </div>
    </main>
  );
}
