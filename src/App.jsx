/* Route table. Each screen loads on first visit, keeping the initial download small. */
import { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import { Button, Icon } from "./components/ui";
import { useT } from "./lib/i18n";
import { useSession } from "./lib/session";

const Auth = lazy(() => import("./views/Auth"));
const Calendar = lazy(() => import("./views/Calendar"));
const Directory = lazy(() => import("./views/Directory"));
const Landing = lazy(() => import("./views/Landing"));
const Memories = lazy(() => import("./views/Memories"));
const Overview = lazy(() => import("./views/Overview"));
const Admin = lazy(() => import("./views/Admin"));
const Legacy = lazy(() => import("./views/Legacy"));
const Messages = lazy(() => import("./views/Messages"));
const NotFound = lazy(() => import("./views/NotFound"));
const Privacy = lazy(() => import("./views/Privacy"));
const Settings = lazy(() => import("./views/Settings"));
const Stories = lazy(() => import("./views/Stories"));
const Timeline = lazy(() => import("./views/Timeline"));
const Tree = lazy(() => import("./views/Tree"));

function Loading({ label }) {
  const t = useT();
  return <div className="grid min-h-[50vh] place-items-center text-muted" role="status">{label || t("common.loading")}</div>;
}
const loading = <Loading />;

/** With a family server, the archive's screens need a signed-in account; the on-device demo needs none. */
function RequireSession({ children }) {
  const { status, error, retry } = useSession();
  const location = useLocation();
  const t = useT();
  if (status === "demo" || status === "signedIn") return children;
  if (status === "signedOut") return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
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

export default function App() {
  return (
    <Routes>
      {/* The public pages (welcome, sign in / join) have their own header; every other screen uses the app shell. */}
      <Route path="/" element={<Suspense fallback={loading}><Landing /></Suspense>} />
      <Route path="/auth" element={<Suspense fallback={loading}><Auth /></Suspense>} />
      <Route element={<RequireSession><Layout><Suspense fallback={loading}><Outlet /></Suspense></Layout></RequireSession>}>
        <Route path="/overview" element={<Overview />} />
        <Route path="/tree" element={<Tree />} />
        <Route path="/directory" element={<Directory />} />
        <Route path="/memories" element={<Memories />} />
        <Route path="/stories" element={<Stories />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/legacy" element={<Legacy />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
