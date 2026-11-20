import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  me: null,
  updateMe: vi.fn(),
  people: vi.fn(),
  toast: vi.fn(),
  setPref: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  archiveApi: { people: mocks.people },
  inviteApi: { create: vi.fn() },
}));

vi.mock("../lib/session", async (importOriginal) => ({
  ...(await importOriginal()),
  useSession: () => ({ me: mocks.me, updateMe: mocks.updateMe }),
}));

vi.mock("../lib/store", async (importOriginal) => ({
  ...(await importOriginal()),
  useStore: () => ({ prefs: { lang: "en", theme: "light" }, dark: false, easy: false, setEasy: vi.fn(), setPref: mocks.setPref, state: { people: [] } }),
}));

vi.mock("../components/toastContext", () => ({ useToast: () => mocks.toast }));
vi.mock("../components/modalContext", () => ({ useModal: () => ({ open: vi.fn() }) }));
vi.mock("../components/PublicLayout", () => ({ default: ({ children }) => <main>{children}</main> }));
vi.mock("../views/public/photos", () => ({ PagePhoto: () => null }));

import Welcome from "../views/Welcome.jsx";
import { welcomeSeen } from "../lib/session";

function renderWelcome(path = "/welcome") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/overview" element={<p>dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const next = () => fireEvent.click(screen.getByRole("button", { name: /^(let's begin|continue)/i }));

describe("Welcome steps after creating an account", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.me = { id: 3, name: "Isla Mackenzie", family_name: "Mackenzie family", role: "Contributor", person_id: null, easy_mode: false, onboarding_done: false };
    mocks.updateMe.mockReset().mockImplementation(async (body) => { mocks.me = { ...mocks.me, ...body }; return mocks.me; });
    mocks.people.mockReset().mockResolvedValue([{ id: "john", first: "John", last: "Mackenzie", born: "1942-03-01" }, { id: "grace", first: "Grace", last: "Mackenzie" }]);
  });

  it("greets the new member by name and family, and counts as seen for this visit", () => {
    renderWelcome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Isla");
    expect(screen.getByText(/mackenzie family/i)).toBeInTheDocument();
    expect(welcomeSeen()).toBe(true);
  });

  it("can be skipped at any step, which is remembered on the account", async () => {
    renderWelcome();
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => expect(mocks.updateMe).toHaveBeenCalledWith({ onboarding_done: true }));
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
  });

  it("lets a relative who joined an existing tree say which person they are", async () => {
    renderWelcome("/welcome?step=profile");
    const select = await screen.findByLabelText(/which person in the tree is you/i);
    expect(screen.getByRole("option", { name: "John Mackenzie (1942)" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "john" } });
    fireEvent.click(screen.getByRole("button", { name: /this is me/i }));
    await waitFor(() => expect(mocks.updateMe).toHaveBeenCalledWith({ person_id: "john" }));
    expect(mocks.toast).toHaveBeenCalledWith("Linked to John Mackenzie in the tree", expect.anything());
  });

  it("shows the server's reason when a person can't be claimed", async () => {
    mocks.updateMe.mockRejectedValueOnce(new Error("Another account is already linked to this person"));
    renderWelcome("/welcome?step=profile");
    fireEvent.change(await screen.findByLabelText(/which person in the tree is you/i), { target: { value: "grace" } });
    fireEvent.click(screen.getByRole("button", { name: /this is me/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Another account is already linked");
  });

  it("doesn't ask a member who is already linked", () => {
    mocks.me = { ...mocks.me, person_id: "p9" };
    renderWelcome("/welcome?step=profile");
    expect(screen.getByText(/your account is linked/i)).toBeInTheDocument();
    expect(mocks.people).not.toHaveBeenCalled();
  });

  it("explains privacy before going in, then finishes on the dashboard", async () => {
    renderWelcome("/welcome?step=discover");
    expect(screen.getByRole("heading", { name: /your family's privacy/i })).toBeInTheDocument();
    expect(screen.getByText(/children's details are hidden by default/i)).toBeInTheDocument();
    next();
    fireEvent.click(screen.getByRole("button", { name: /go to my dashboard/i }));
    await waitFor(() => expect(mocks.updateMe).toHaveBeenCalledWith({ onboarding_done: true }));
  });
});
