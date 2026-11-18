/* Route table. Each screen loads on first visit, keeping the initial download small. */
import { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import { Button, Icon } from "./components/ui";
import { useT } from "./lib/i18n";
import { useSession } from "./lib/session";

const About = lazy(() => import("./views/public/About"));
const Auth = lazy(() => import("./views/Auth"));
const Contact = lazy(() => import("./views/public/Contact"));
const Calendar = lazy(() => import("./views/Calendar"));
const Directory = lazy(() => import("./views/Directory"));
const Faq = lazy(() => import("./views/public/Faq"));
const Features = lazy(() => import("./views/public/Features"));
const HowItWorks = lazy(() => import("./views/public/HowItWorks"));
const Landing = lazy(() => import("./views/Landing"));
const Memories = lazy(() => import("./views/Memories"));
const Overview = lazy(() => import("./views/Overview"));
const Admin = lazy(() => import("./views/Admin"));
const Legacy = lazy(() => import("./views/Legacy"));
const Messages = lazy(() => import("./views/Messages"));
const NotFound = lazy(() => import("./views/NotFound"));
const Privacy = lazy(() => import("./views/Privacy"));
const PrivacyPolicy = lazy(() => import("./views/public/Legal").then((m) => ({ default: m.PrivacyPolicy })));
const Settings = lazy(() => import("./views/Settings"));
const Stories = lazy(() => import("./views/Stories"));
const Terms = lazy(() => import("./views/public/Legal").then((m) => ({ default: m.Terms })));
const Timeline = lazy(() => import("./views/Timeline"));
const Tree = lazy(() => import("./views/Tree"));
const Welcome = lazy(() => import("./views/Welcome"));

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

export default function App() {
  return (
    <Routes>
      {/* Public pages: open to everyone, signed in or not, with the site header and footer instead of the app shell. */}
      <Route element={<Suspense fallback={loading}><Outlet /></Suspense>}>
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
        <Route path="/features" element={<Features />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/contact" element={<Contact />} />
        {/* /privacy is the members' Privacy & Consent screen, so the public policy has its own address. */}
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        {/* Sign in and join. /auth is kept for older links (?reset=…, ?invite=…). */}
        <Route path="/login" element={<Auth mode="signin" />} />
        <Route path="/register" element={<Auth mode="create" />} />
        <Route path="/join" element={<Auth mode="code" />} />
        <Route path="/forgot-password" element={<Auth mode="forgot" />} />
        <Route path="/reset-password" element={<Auth mode="reset" />} />
        <Route path="/auth" element={<Auth />} />
        {/* Welcome steps after creating an account: signed in, but outside the app shell. */}
        <Route path="/welcome" element={<RequireSession><Welcome /></RequireSession>} />
        <Route path="/onboarding" element={<Navigate to="/welcome" replace />} />
        <Route path="/complete-profile" element={<Navigate to="/welcome" replace />} />
        <Route path="/signin" element={<Navigate to="/login" replace />} />
        <Route path="/signup" element={<Navigate to="/register" replace />} />
      </Route>
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
