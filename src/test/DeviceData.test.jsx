import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  clearRecent: vi.fn(),
  clearAudio: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../lib/audioStore", () => ({ clearAudio: mocks.clearAudio }));

vi.mock("../lib/api", () => ({
  connected: true,
  SIGNED_OUT_EVENT: "fr:signed-out",
  ApiError: class ApiError extends Error {},
  authApi: { me: mocks.me },
  getToken: () => localStorage.getItem("fr-token"),
  setToken: (t) => (t ? localStorage.setItem("fr-token", t) : localStorage.removeItem("fr-token")),
}));

vi.mock("../lib/store", () => ({
  useStore: () => ({
    setEasy: vi.fn(),
    clearRecent: mocks.clearRecent,
    server: { connect: vi.fn(), disconnect: vi.fn() },
  }),
}));

import { claimDevice, clearAccountData, releaseDevice } from "../lib/deviceData";
import { SessionProvider } from "../lib/SessionProvider";
import { useSession } from "../lib/session";

/** What a signed-in relative leaves behind, plus device-wide things that must survive. */
function fillDevice() {
  localStorage.setItem("fr-draft-memory", JSON.stringify({ value: { caption: "Grandad's last letter" } }));
  localStorage.setItem("fr-draft-chat-c1", JSON.stringify({ value: { text: "private reply" } }));
  localStorage.setItem("fr-pref-recent", JSON.stringify([{ id: "sarah", label: "Sarah Mackenzie" }]));
  localStorage.setItem("fr-pref-prefs", JSON.stringify({ theme: "dark" }));
  localStorage.setItem("familyroots-demo-v1", "{}");
}
const drafts = () => Object.keys(localStorage).filter((k) => k.startsWith("fr-draft-"));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("Account data on this device", () => {
  it("clears drafts, Recent and recordings, and keeps the device's own settings and the demo", async () => {
    fillDevice();
    await clearAccountData();
    expect(drafts()).toEqual([]);
    expect(localStorage.getItem("fr-pref-recent")).toBeNull();
    expect(mocks.clearAudio).toHaveBeenCalledOnce();
    expect(localStorage.getItem("fr-pref-prefs")).toBe(JSON.stringify({ theme: "dark" }));
    expect(localStorage.getItem("familyroots-demo-v1")).toBe("{}");
  });

  it("keeps an account's own drafts when the same account signs in again", () => {
    claimDevice(7);  // the device is now known to be account 7's
    mocks.clearAudio.mockClear();
    fillDevice();
    expect(claimDevice(7)).toBe(false);
    expect(drafts()).toHaveLength(2);
    expect(mocks.clearAudio).not.toHaveBeenCalled();
  });

  it("clears another account's drafts when someone else signs in", () => {
    claimDevice(7);  // the device is now known to be account 7's
    mocks.clearAudio.mockClear();
    fillDevice();
    expect(claimDevice(8)).toBe(true);
    expect(drafts()).toEqual([]);
    expect(mocks.clearAudio).toHaveBeenCalledOnce();
  });

  it("clears drafts whose owner is unknown (saved before owners were recorded)", () => {
    fillDevice();
    expect(claimDevice(7)).toBe(true);
    expect(drafts()).toEqual([]);
  });

  it("forgets the owner on sign-out, so the next sign-in starts clean", () => {
    claimDevice(7);
    releaseDevice();
    expect(localStorage.getItem("fr-account")).toBeNull();
  });
});

function SignOutButton() {
  const { status, signOut } = useSession();
  return <><p>status: {status}</p><button type="button" onClick={signOut}>Sign out</button></>;
}

const renderSession = () => render(<SessionProvider><SignOutButton /></SessionProvider>);

describe("Signing out", () => {
  it("removes what the account left on this device", async () => {
    localStorage.setItem("fr-token", "t");
    mocks.me.mockResolvedValue({ id: 7, name: "Ada Ross" });
    renderSession();
    await screen.findByText("status: signedIn");
    fillDevice();

    act(() => screen.getByRole("button", { name: "Sign out" }).click());

    expect(screen.getByText("status: signedOut")).toBeInTheDocument();
    expect(drafts()).toEqual([]);
    expect(localStorage.getItem("fr-pref-recent")).toBeNull();
    expect(mocks.clearRecent).toHaveBeenCalled();
    expect(mocks.clearAudio).toHaveBeenCalled();
    expect(localStorage.getItem("fr-token")).toBeNull();
    expect(localStorage.getItem("fr-pref-prefs")).not.toBeNull();
  });

  it("leaving the demo keeps the demo's drafts", () => {
    sessionStorage.setItem("fr-trying-demo", "1");
    renderSession();
    fillDevice();

    act(() => screen.getByRole("button", { name: "Sign out" }).click());

    expect(drafts()).toHaveLength(2);
    expect(mocks.clearAudio).not.toHaveBeenCalled();
  });

  it("a sign-in that ran out keeps the drafts until a different account signs in", async () => {
    localStorage.setItem("fr-token", "t");
    mocks.me.mockResolvedValue({ id: 7, name: "Ada Ross" });
    renderSession();
    await screen.findByText("status: signedIn");
    fillDevice();

    // The server refused the saved sign-in (api.js clears the token and announces it).
    act(() => { localStorage.removeItem("fr-token"); window.dispatchEvent(new Event("fr:signed-out")); });
    await screen.findByText("status: signedOut");
    expect(drafts()).toHaveLength(2);

    // Someone else signs in on this device.
    localStorage.setItem("fr-token", "t2");
    mocks.me.mockResolvedValue({ id: 8, name: "Ben Ross" });
    renderSession();
    await waitFor(() => expect(drafts()).toEqual([]));
    expect(mocks.clearRecent).toHaveBeenCalled();
  });
});
