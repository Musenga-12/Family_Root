import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  me: null,
  overview: vi.fn(),
  records: vi.fn(),
  invites: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  archiveApi: { overview: mocks.overview, records: mocks.records, invites: mocks.invites },
}));

vi.mock("../lib/session", () => ({
  useSession: () => ({ me: mocks.me }),
}));

vi.mock("../lib/store", async (importOriginal) => ({
  ...(await importOriginal()),
  useStore: () => ({ prefs: { lang: "en" } }),
}));

import GettingStarted from "../components/GettingStarted.jsx";

const counts = (c = {}) => ({ counts: { people: 1, memories: 0, stories: 0, unread_messages: 0, ...c } });

function renderPanel() {
  return render(<MemoryRouter><GettingStarted /></MemoryRouter>);
}

describe("Getting started checklist", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.me = { id: 7, name: "Ada Ross", family_name: "Ross family", role: "Admin", person_id: "p1" };
    mocks.overview.mockReset().mockResolvedValue(counts());
    mocks.records.mockReset().mockResolvedValue([]);
    mocks.invites.mockReset().mockResolvedValue([]);
  });

  it("shows a loading state, then honest progress for a brand-new family", async () => {
    renderPanel();
    expect(screen.getByRole("status")).toHaveTextContent(/checking your family archive/i);
    // Only the founder's own link to the tree is done; nothing else is pretended.
    expect(await screen.findByText("1 of 6 done")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /getting started with ross family/i })).toBeInTheDocument();
    expect(screen.getByText(/no memories yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no stories yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no historical records yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /invite someone/i })).toHaveAttribute("href", "/welcome?step=family");
  });

  it("ticks steps off from the server's real counts", async () => {
    mocks.overview.mockResolvedValue(counts({ people: 5, memories: 2, stories: 1 }));
    mocks.records.mockResolvedValue([{ id: "r1" }]);
    mocks.invites.mockResolvedValue([{ id: "i1" }, { id: "i2" }]);
    renderPanel();
    expect(await screen.findByText("6 of 6 done")).toBeInTheDocument();
    expect(screen.getByText("5 people in your family tree.")).toBeInTheDocument();
    expect(screen.getByText("2 invitations sent so far.")).toBeInTheDocument();
    expect(screen.getByText(/every first step is complete/i)).toBeInTheDocument();
  });

  it("asks an account that isn't linked to the tree to say who they are", async () => {
    mocks.me = { ...mocks.me, person_id: null };
    renderPanel();
    expect(await screen.findByText("0 of 6 done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /choose who you are/i })).toHaveAttribute("href", "/welcome?step=profile");
  });

  it("gives Viewers what has been shared instead of tasks, and doesn't ask for invitations", async () => {
    mocks.me = { ...mocks.me, role: "Viewer" };
    renderPanel();
    expect(await screen.findByText("1 of 5 done")).toBeInTheDocument();
    expect(mocks.invites).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /invite someone/i })).not.toBeInTheDocument();
    // Relatives, memories, stories and records: all still empty.
    expect(screen.getAllByText(/nothing has been added here yet/i)).toHaveLength(4);
  });

  it("explains a failure and loads again on Retry", async () => {
    mocks.overview.mockRejectedValueOnce(new Error("Server busy"));
    renderPanel();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server busy");
    fireEvent.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("1 of 6 done")).toBeInTheDocument();
  });

  it("can be hidden and brought back, remembered for this account", async () => {
    const first = renderPanel();
    await screen.findByText("1 of 6 done");
    fireEvent.click(screen.getByRole("button", { name: /hide getting started/i }));
    expect(screen.getByText(/getting started is hidden/i)).toBeInTheDocument();
    first.unmount();
    renderPanel();
    expect(screen.getByText(/getting started is hidden/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Getting started" }));
    await waitFor(() => expect(screen.getByText("1 of 6 done")).toBeInTheDocument());
  });
});
