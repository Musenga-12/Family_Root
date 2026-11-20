import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  signIn: vi.fn(),
  retry: vi.fn(),
  session: null,
}));

vi.mock("../lib/api", () => ({
  connected: true,
  authApi: { register: mocks.register, login: mocks.login },
}));

vi.mock("../lib/session", () => ({
  useSession: () => mocks.session,
}));

vi.mock("../lib/store", async (importOriginal) => ({
  ...(await importOriginal()),
  useStore: () => ({ prefs: { lang: "en" }, setEasy: vi.fn() }),
}));

vi.mock("../components/toastContext", () => ({ useToast: () => vi.fn() }));
vi.mock("../components/PublicLayout", () => ({ default: ({ children }) => children }));
vi.mock("../views/public/photos", () => ({ PagePhoto: () => null }));

import Auth from "../views/Auth.jsx";

class Conflict extends Error {
  constructor(message) { super(message); this.status = 409; }
}

function renderAuth(mode, path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path={path} element={<Auth mode={mode} />} /></Routes>
    </MemoryRouter>,
  );
}

function fillRegistration({ family } = {}) {
  fireEvent.change(document.getElementById("ca-name"), { target: { value: "Ada Ross" } });
  fireEvent.change(document.getElementById("ca-email"), { target: { value: "ada@example.org" } });
  fireEvent.change(document.getElementById("ca-pass"), { target: { value: "rose cottage summers" } });
  if (family !== undefined) fireEvent.change(document.getElementById("ca-family"), { target: { value: family } });
  fireEvent.click(document.getElementById("ca-trust"));
}
const submit = () => fireEvent.submit(document.getElementById("ca-name").closest("form"));

describe("Creating an account as a first-time visitor", () => {
  beforeEach(() => {
    mocks.session = { status: "signedOut", me: null, signIn: mocks.signIn, retry: mocks.retry };
    mocks.register.mockReset();
    mocks.signIn.mockReset();
  });

  it("lets the founder name the new family archive", async () => {
    mocks.register.mockResolvedValue({ status: "active", access_token: "t", family_name: "The Ross family" });
    mocks.signIn.mockResolvedValue({ name: "Ada Ross", onboarding_done: false });
    renderAuth("create", "/register");
    expect(screen.getByLabelText(/family archive name/i)).toBeInTheDocument();
    fillRegistration({ family: "  The Ross family " });
    submit();
    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ family_name: "The Ross family" })));
  });

  it("offers Sign in and Reset password when the email already has an account", async () => {
    mocks.register.mockRejectedValue(new Conflict("An account with this email already exists"));
    renderAuth("create", "/register");
    fillRegistration();
    submit();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("already exists");
    expect(within(alert).getByRole("link", { name: /sign in instead/i })).toHaveAttribute("href", "/login");
    expect(within(alert).getByRole("link", { name: /reset my password/i })).toHaveAttribute("href", "/forgot-password");
  });

  it("doesn't offer those links for a join request that is still waiting", async () => {
    mocks.register.mockRejectedValue(new Conflict("You've already asked to join. An Admin will look at your request soon."));
    renderAuth("create", "/register");
    fillRegistration();
    submit();
    const alert = await screen.findByRole("alert");
    expect(within(alert).queryByRole("link", { name: /sign in instead/i })).not.toBeInTheDocument();
  });

  it("names the password field just 'Password', with a separate show / hide button", () => {
    renderAuth("create", "/register");
    const input = screen.getByLabelText(/^password$/i);
    expect(input).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: /show password/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAttribute("aria-controls", input.id);
    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("links each field's error to the field, so screen readers read it", () => {
    renderAuth("create", "/register");
    submit();
    expect(document.getElementById("ca-email")).toHaveAccessibleDescription(/email/i);
    expect(document.getElementById("ca-email").getAttribute("aria-describedby")).toContain("ca-emailErr");
    expect(document.getElementById("ca-pass").getAttribute("aria-describedby")).toContain("ca-passErr");
    expect(document.getElementById("ca-trust").getAttribute("aria-describedby")).toBe("ca-trustErr");
  });
});

describe("Signing in", () => {
  beforeEach(() => {
    mocks.session = { status: "signedOut", me: null, signIn: mocks.signIn, retry: mocks.retry };
  });

  it("uses the same show / hide button", () => {
    renderAuth("signin", "/login");
    const input = screen.getByLabelText(/^password$/i);
    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(input).toHaveAttribute("type", "text");
  });

  it("wires the tabs to their panel", () => {
    renderAuth("signin", "/login");
    const tab = screen.getByRole("tab", { selected: true });
    expect(tab).toHaveAttribute("aria-controls", "authPanel");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName(tab.textContent);
  });

  it("says so when the account couldn't be loaded after signing in, with Try again", () => {
    mocks.session = { ...mocks.session, status: "error", error: "Can't reach the family server." };
    renderAuth("signin", "/login");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Can't reach the family server.");
    fireEvent.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(mocks.retry).toHaveBeenCalled();
  });
});
