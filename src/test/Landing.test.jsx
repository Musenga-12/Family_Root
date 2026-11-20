import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  session: { status: "signedOut", me: null },
}));

vi.mock("../lib/session", () => ({
  useSession: () => mocks.session,
}));

vi.mock("../lib/store", async (importOriginal) => ({
  ...(await importOriginal()),
  useStore: () => ({ prefs: { lang: "en", theme: "light" }, dark: false, easy: false, setEasy: vi.fn(), setPref: vi.fn() }),
}));

vi.mock("../components/toastContext", () => ({
  useToast: () => vi.fn(),
}));

vi.mock("../views/public/photos", () => ({
  HeroPhotos: () => null,
  TopicPhotos: () => null,
  PagePhoto: () => null,
}));

import Landing from "../views/Landing.jsx";

function renderLanding() {
  return render(<MemoryRouter initialEntries={["/"]}><Landing /></MemoryRouter>);
}

describe("Landing page for a first-time visitor", () => {
  beforeEach(() => {
    mocks.session = { status: "signedOut", me: null };
  });

  it("says what FamilyRoots is in the main heading", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/every family has a story/i);
  });

  it("offers creating an archive and joining with a code to visitors", () => {
    renderLanding();
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("link", { name: /create your family archive/i })[0]).toHaveAttribute("href", "/register");
    expect(within(main).getAllByRole("link", { name: /family code/i })[0]).toHaveAttribute("href", "/join");
  });

  it("has a header with Log in, Get started and every public page, including privacy", () => {
    renderLanding();
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
    expect(within(header).getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/register");
    const nav = within(header).getByRole("navigation", { name: /main/i });
    const links = within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/", "/about", "/features", "/how-it-works", "/privacy-policy", "/faq", "/contact"]);
  });

  it("explains features, how it works, privacy and common questions", () => {
    renderLanding();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.length).toBeGreaterThanOrEqual(5);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("sends a signed-in member to their dashboard instead of the sign-up buttons", () => {
    mocks.session = { status: "signedIn", me: { id: 1, name: "Ada Ross", family_name: "Ross family", role: "Admin", onboarding_done: true } };
    renderLanding();
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("link", { name: /dashboard/i })[0]).toHaveAttribute("href", "/overview");
    expect(within(main).queryByRole("link", { name: /create your family archive/i })).not.toBeInTheDocument();
  });
});
