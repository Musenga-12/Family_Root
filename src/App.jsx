/* Route table. Each screen loads on first visit, keeping the initial download small. */
import { Suspense, lazy } from "react";
import { Outlet, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";

const Auth = lazy(() => import("./views/Auth"));
const Calendar = lazy(() => import("./views/Calendar"));
const Directory = lazy(() => import("./views/Directory"));
const Landing = lazy(() => import("./views/Landing"));
const Memories = lazy(() => import("./views/Memories"));
const Overview = lazy(() => import("./views/Overview"));
const Placeholder = lazy(() => import("./views/Placeholder"));
const Settings = lazy(() => import("./views/Settings"));
const Stories = lazy(() => import("./views/Stories"));
const Timeline = lazy(() => import("./views/Timeline"));
const Tree = lazy(() => import("./views/Tree"));

const loading = <div className="grid min-h-[50vh] place-items-center text-muted" role="status">Loading…</div>;

export default function App() {
  return (
    <Routes>
      {/* The public welcome page has its own header; every other screen uses the app shell. */}
      <Route path="/" element={<Suspense fallback={loading}><Landing /></Suspense>} />
      <Route element={<Layout><Suspense fallback={loading}><Outlet /></Suspense></Layout>}>
        <Route path="/overview" element={<Overview />} />
        <Route path="/tree" element={<Tree />} />
        <Route path="/directory" element={<Directory />} />
        <Route path="/memories" element={<Memories />} />
        <Route path="/stories" element={<Stories />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/:route" element={<Placeholder />} />
        <Route path="*" element={<Placeholder />} />
      </Route>
    </Routes>
  );
}
