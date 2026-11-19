import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  signIn: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  connected: true,
  authApi: {
    login: mocks.login,
  },
}));

vi.mock("../lib/session", () => ({
  useSession: () => ({
    status: "signedOut",
    me: null,
    signIn: mocks.signIn,
  }),
}));

vi.mock("../components/toastContext", () => ({
  useToast: () => mocks.toast,
}));

vi.mock("../lib/i18n", () => ({
  useT: () => (key) => key,
  rich: (value) => value,
}));

vi.mock("../components/PublicLayout", () => ({
  default: ({ children }) => children,
}));

vi.mock("../views/public/photos", () => ({
  PagePhoto: () => null,
}));

import Auth from "../views/Auth.jsx";

function renderSignIn() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route
          path="/login"
          element={<Auth mode="signin" />}
        />
      </Routes>
    </MemoryRouter>
  );
}

function submitForm() {
  const button = screen.getByRole("button", {
    name: /au\.signIn/,
  });

  fireEvent.submit(button.closest("form"));
}

describe("Authentication - Sign in", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.signIn.mockResolvedValue({
      name: "Jane Doe",
      family_name: "Doe Family",
      onboarding_done: true,
    });
  });

  it("renders the sign-in form", () => {
    renderSignIn();

    expect(
      screen.getByRole("heading", { name: "au.welcomeBack" })
    ).toBeInTheDocument();

    expect(screen.getByLabelText("au.email")).toBeInTheDocument();
    expect(screen.getByLabelText("au.passphrase")).toBeInTheDocument();
  });

  it("rejects an empty email and password", () => {
    renderSignIn();

    submitForm();

    expect(screen.getByText("au.errSiEmail")).toBeInTheDocument();
    expect(screen.getByText("au.errSiPass")).toBeInTheDocument();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("rejects an invalid email address", () => {
    renderSignIn();

    fireEvent.change(screen.getByLabelText("au.email"), {
      target: { value: "invalid-email" },
    });

    fireEvent.change(screen.getByLabelText("au.passphrase"), {
      target: { value: "password123" },
    });

    submitForm();

    expect(screen.getByText("au.errSiEmail")).toBeInTheDocument();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("submits valid credentials and signs in successfully", async () => {
    mocks.login.mockResolvedValue({
      access_token: "test-access-token",
    });

    renderSignIn();

    fireEvent.change(screen.getByLabelText("au.email"), {
      target: { value: "  jane@example.com  " },
    });

    fireEvent.change(screen.getByLabelText("au.passphrase"), {
      target: { value: "password123" },
    });

    submitForm();

    expect(mocks.login).toHaveBeenCalledWith(
      "jane@example.com",
      "password123"
    );

    expect(await screen.findByText("au.welcomeBack")).toBeInTheDocument();

    expect(mocks.signIn).toHaveBeenCalledWith("test-access-token");
    expect(mocks.toast).toHaveBeenCalled();
  });

  it("displays an API error when login fails", async () => {
    mocks.login.mockRejectedValue(
      new Error("Invalid email or password")
    );

    renderSignIn();

    fireEvent.change(screen.getByLabelText("au.email"), {
      target: { value: "jane@example.com" },
    });

    fireEvent.change(screen.getByLabelText("au.passphrase"), {
      target: { value: "wrongpassword" },
    });

    submitForm();

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Invalid email or password");

    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
