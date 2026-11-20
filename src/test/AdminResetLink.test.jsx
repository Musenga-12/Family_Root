/* Family Administration → Reset link: how an Admin gets a relative back in when the server can't email them. */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain stand-in for the API (not vi.fn: its wrapper reports a rejected promise as unhandled even when it's caught).
const mocks = vi.hoisted(() => ({ calls: [], reply: null }));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  api: (...args) => { mocks.calls.push(args); return mocks.reply(); },
}));

import { ToastProvider } from "../components/Toasts";
import { StoreProvider } from "../lib/StoreProvider";
import { ResetLinkDialog } from "../views/Admin";

const member = { id: "p-ben", userId: 12, name: "Ben Ross", role: "Contributor" };

function renderDialog() {
  return render(
    <MemoryRouter><StoreProvider><ToastProvider><ResetLinkDialog member={member} name="Ben Ross" /></ToastProvider></StoreProvider></MemoryRouter>,
  );
}

describe("Admin reset link", () => {
  beforeEach(() => { mocks.calls = []; });

  it("makes a one-time link for that member and shows it with its expiry", async () => {
    mocks.reply = async () => ({ link: "https://app.example.org/#/reset-password?token=abc", expires: "2026-11-23T10:00:00Z" });
    renderDialog();
    expect(mocks.calls).toEqual([]); // nothing is made until the Admin asks
    fireEvent.click(screen.getByRole("button", { name: /make the link/i }));
    expect(await screen.findByDisplayValue("https://app.example.org/#/reset-password?token=abc")).toBeInTheDocument();
    expect(mocks.calls).toEqual([["/members/12/reset-link", { method: "POST" }]]);
    expect(screen.getByText(/works once, until/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("shows the server's reason when a link can't be made", async () => {
    mocks.reply = () => Promise.reject(new Error("This member's access was removed"));
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /make the link/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This member's access was removed");
  });
});
