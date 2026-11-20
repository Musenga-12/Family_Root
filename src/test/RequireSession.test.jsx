import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  session: { status: "signedOut", me: null, retry: vi.fn() },
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
});
