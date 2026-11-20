/* A brand-new family on a family server has nothing in it yet but its founder. Every screen must open for them, and
   none may show the sample family. The server is stood in for: the account, and an archive with only the founder. */
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT = { id: 7, name: "Ada Ross", email: "ada@example.com", role: "Admin", family_id: 3, family_name: "Ross family",
  person_id: "p-ada", easy_mode: false, family_code: "ROS-1234", onboarding_done: true };
const FOUNDER = { id: "p-ada", first: "Ada", last: "Ross", gen: 1, parents: [], spouse: null, tags: [], born: null, fav: false };

vi.mock("../lib/api", async (importOriginal) => {
  const real = await importOriginal();
  const reply = (path) => {
    if (path.startsWith("/overview")) return { counts: { people: 1, memories: 0, stories: 0, unread_messages: 0 }, upcoming: [], recent_memories: [] };
    if (path.startsWith("/notifications")) return { items: [], unread: 0 };
    if (path.startsWith("/privacy")) return { categories: {}, mine: {}, minors: [], deletion: null };
    if (path === "/people") return [FOUNDER];
    if (path === "/members") return [{ user_id: 7, person_id: "p-ada", name: "Ada Ross", email: ACCOUNT.email, role: "Admin", joined: "2026-11-20T09:00:00Z", last_active: null, is_you: true }];
    if (/^\/(prompts|polls)\/current/.test(path)) return null;
    return [];
  };
  const api = vi.fn(async (path) => reply(path));
  return {
    ...real, connected: true, getToken: () => "token", setToken: () => {}, api,
    authApi: { ...real.authApi, me: async () => ACCOUNT },
    archiveApi: { overview: () => api("/overview"), people: () => api("/people"), records: () => api("/records"), invites: () => api("/invites") },
    notificationApi: { list: () => api("/notifications"), readAll: async () => null },
  };
});

import App from "../App";
import { ModalProvider } from "../components/Modal";
import { ToastProvider } from "../components/Toasts";
import { SessionProvider } from "../lib/SessionProvider";
import { StoreProvider } from "../lib/StoreProvider";

// Names and places from the sample family (src/data.js) that must never appear in someone else's archive.
const SAMPLE = /Mackenzie|Rose Cottage|Gleneagles|Edinburgh|Inverness|\bMary\b|\bSarah\b|\bAnna\b|\bDaniel\b|\bMichael\b|\bJohn\b|MCK-8294|shortbread/i;
const SCREENS = ["/overview", "/tree", "/directory", "/memories", "/stories", "/timeline", "/legacy", "/messages", "/calendar", "/admin", "/privacy", "/settings"];

// Browser features jsdom doesn't have.
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.scrollTo = () => {};
Element.prototype.scrollIntoView ??= () => {};
HTMLCanvasElement.prototype.getContext = () => null;
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StoreProvider><SessionProvider><ToastProvider><ModalProvider><App /></ModalProvider></ToastProvider></SessionProvider></StoreProvider>
    </MemoryRouter>,
  );
}

describe("A new family on a family server", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("fr-pref-prefs", JSON.stringify({ tourDone: true }));
  });

  for (const path of SCREENS) {
    it(`can open ${path} with only the founder`, { timeout: 15000 }, async () => {
      const { container } = renderAt(path);
      // The app shell and the screen's own heading, after the archive has loaded.
      await waitFor(() => expect(container.querySelector("main h1") && container.textContent.includes("Ross family")).toBeTruthy(), { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 200));
      const text = container.textContent;
      const at = text.search(SAMPLE);
      expect(at < 0 ? undefined : text.slice(Math.max(0, at - 30), at + 40), `sample family text on ${path}`).toBeUndefined();
    });
  }
});
