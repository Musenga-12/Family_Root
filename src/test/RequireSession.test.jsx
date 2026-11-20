import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const ready = () => ({ source: "server", archive: { status: "ready", error: null }, retry: vi.fn() });
const mocks = vi.hoisted(() => ({
  session: { status: "signedOut", me: null, retry: vi.fn() },
  server: null,
}));

vi.mock("../lib/store", () => ({
  useStore: () => ({ server: mocks.server }),
}));

vi.mock("../lib/session", async (importOriginal) => ({
  ...(await importOriginal()),
  useSession: () => mocks.session,
}));

vi.mock("../lib/i18n", () => ({
  useT: () => (key) => key,
}));

import RequireSession from "../components/RequireSession.jsx";
import { markWelcomeSeen } from "../lib/session";

function LoginPage() {
  const { state } = useLocation();
  return <p>login page, from {state?.from}</p>;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/welcome" element={<p>welcome steps</p>} />
        <Route path="/overview" element={<RequireSession><p>private overview</p></RequireSession>} />
        <Route path="/memories" element={<RequireSession><p>private memories</p></RequireSession>} />
      </Routes>
    </MemoryRouter>,
  );
}

const account = (extra) => ({ id: 1, name: "Ada Ross", family_name: "Ross family", role: "Admin", ...extra });

describe("Protected screens", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.session = { status: "signedOut", me: null, retry: vi.fn() };
    mocks.server = ready();
  });

  it("send visitors to Log in and remember where they were going", () => {
    renderAt("/memories?q=wedding");
    expect(screen.getByText("login page, from /memories?q=wedding")).toBeInTheDocument();
    expect(screen.queryByText("private memories")).not.toBeInTheDocument();
  });

  it("wait while a saved sign-in is checked, without showing private content", () => {
    mocks.session = { ...mocks.session, status: "loading" };
    renderAt("/overview");
    expect(screen.getByRole("status")).toHaveTextContent("session.checking");
    expect(screen.queryByText("private overview")).not.toBeInTheDocument();
  });

  it("explain an unreachable server and offer Retry", () => {
    mocks.session = { ...mocks.session, status: "error", error: "Can't reach the family server." };
    renderAt("/overview");
    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the family server.");
    screen.getByRole("button", { name: /session.retry/ }).click();
    expect(mocks.session.retry).toHaveBeenCalled();
  });

  it("open for a signed-in member who has finished the welcome steps", () => {
    mocks.session = { ...mocks.session, status: "signedIn", me: account({ onboarding_done: true }) };
    renderAt("/overview");
    expect(screen.getByText("private overview")).toBeInTheDocument();
  });

  it("take a new member back to unfinished welcome steps from the Overview", () => {
    mocks.session = { ...mocks.session, status: "signedIn", me: account({ onboarding_done: false }) };
    renderAt("/overview");
    expect(screen.getByText("welcome steps")).toBeInTheDocument();
  });

  it("only do that once per visit, and never on other screens", () => {
    mocks.session = { ...mocks.session, status: "signedIn", me: account({ onboarding_done: false }) };
    renderAt("/memories");
    expect(screen.getByText("private memories")).toBeInTheDocument();
    markWelcomeSeen();
    renderAt("/overview");
    expect(screen.getByText("private overview")).toBeInTheDocument();
  });

  it("never show the sample family while a member's own archive is still loading", () => {
    mocks.session = { ...mocks.session, status: "signedIn", me: account({ onboarding_done: true }) };
    mocks.server = { source: "demo", archive: { status: "idle", error: null }, retry: vi.fn() };
    renderAt("/overview");
    expect(screen.getByRole("status")).toHaveTextContent("sync.loading");
    expect(screen.queryByText("private overview")).not.toBeInTheDocument();
    mocks.server = { source: "server", archive: { status: "loading", error: null }, retry: vi.fn() };
    renderAt("/memories");
    expect(screen.queryByText("private memories")).not.toBeInTheDocument();
  });

  it("explain an archive that could not be loaded and offer Retry", () => {
    mocks.session = { ...mocks.session, status: "signedIn", me: account({ onboarding_done: true }) };
    mocks.server = { source: "server", archive: { status: "error", error: "The family archive is busy." }, retry: vi.fn() };
    renderAt("/overview");
    expect(screen.getByRole("alert")).toHaveTextContent("The family archive is busy.");
    screen.getByRole("button", { name: /session.retry/ }).click();
    expect(mocks.server.retry).toHaveBeenCalled();
  });
});
