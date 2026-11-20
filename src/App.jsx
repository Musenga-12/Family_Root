/* Route table. Each screen loads on first visit, keeping the initial download small. */
import { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RequireSession, { Loading } from "./components/RequireSession";
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
const PublicNotFound = lazy(() => import("./views/NotFound").then((m) => ({ default: m.PublicNotFound })));
const Privacy = lazy(() => import("./views/Privacy"));
const PrivacyPolicy = lazy(() => import("./views/public/Legal").then((m) => ({ default: m.PrivacyPolicy })));
const Settings = lazy(() => import("./views/Settings"));
const Stories = lazy(() => import("./views/Stories"));
const Terms = lazy(() => import("./views/public/Legal").then((m) => ({ default: m.Terms })));
const Timeline = lazy(() => import("./views/Timeline"));
const Tree = lazy(() => import("./views/Tree"));
const Welcome = lazy(() => import("./views/Welcome"));

const loading = <Loading />;

/** An address that doesn't exist: visitors get the public "not found" page instead of being asked to log in. */
function Unknown() {
  const { status } = useSession();
  if (status === "signedOut") return <Suspense fallback={loading}><PublicNotFound /></Suspense>;
  return <RequireSession><Layout><Suspense fallback={loading}><NotFound /></Suspense></Layout></RequireSession>;
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
      </Route>
      <Route path="*" element={<Unknown />} />
    </Routes>
  );
}
