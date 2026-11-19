import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  signIn: vi.fn(),
  toast: vi.fn(),
  setEasy: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  connected: true,
  authApi: {
    register: mocks.register,
  },
}));

vi.mock("../lib/session", () => ({
  useSession: () => ({
    status: "signedOut",
    me: null,
    signIn: mocks.signIn,
  }),
}));

vi.mock("../lib/store", () => ({
  useStore: () => ({
    setEasy: mocks.setEasy,
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

function renderRegistration() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route
          path="/register"
          element={<Auth mode="create" />}
        />
      </Routes>
    </MemoryRouter>
  );
}

function submitRegistration() {
  const button = screen.getByRole("button", {
    name: /au\.create/,
  });

  fireEvent.submit(button.closest("form"));
}

function fillRegistrationForm() {
  fireEvent.change(document.getElementById("ca-name"), {
    target: { value: "Jane Doe" },
  });

  fireEvent.change(document.getElementById("ca-email"), {
    target: { value: "jane@example.com" },
  });

  fireEvent.change(document.getElementById("ca-pass"), {
    target: { value: "StrongPass123" },
  });
}

describe("Authentication - Registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.signIn.mockResolvedValue({
      name: "Jane Doe",
      family_name: "Doe Family",
      onboarding_done: false,
    });
  });

  it("renders the registration form", () => {
    renderRegistration();

    expect(
      screen.getByRole("heading", { name: "au.joinTitle" })
    ).toBeInTheDocument();

    expect(document.getElementById("ca-name")).toBeInTheDocument();
    expect(document.getElementById("ca-email")).toBeInTheDocument();
    expect(document.getElementById("ca-pass")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });

  it("rejects an empty registration form", () => {
    renderRegistration();

    submitRegistration();

    expect(screen.getByText("au.errName")).toBeInTheDocument();
    expect(screen.getByText("au.errEmailEmpty")).toBeInTheDocument();
    expect(screen.getByText("au.errPass")).toBeInTheDocument();
    expect(screen.getByText("au.errTrust")).toBeInTheDocument();

    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("rejects an invalid email and a password shorter than 10 characters", () => {
    renderRegistration();

    fireEvent.change(document.getElementById("ca-name"), {
      target: { value: "Jane Doe" },
    });

    fireEvent.change(document.getElementById("ca-email"), {
      target: { value: "invalid-email" },
    });

    fireEvent.change(document.getElementById("ca-pass"), {
      target: { value: "short123" },
    });

    submitRegistration();

    expect(screen.getByText("au.errEmail")).toBeInTheDocument();
    expect(screen.getByText("au.errPass")).toBeInTheDocument();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("requires privacy consent before registration", () => {
    renderRegistration();

    fillRegistrationForm();
    submitRegistration();

    expect(screen.getByText("au.errTrust")).toBeInTheDocument();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("creates an account and signs in successfully", async () => {
    mocks.register.mockResolvedValue({
      status: "active",
      access_token: "test-registration-token",
      family_name: "Doe Family",
    });

    renderRegistration();

    fillRegistrationForm();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    submitRegistration();

    expect(mocks.register).toHaveBeenCalledWith({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "StrongPass123",
      easy_mode: true,
    });

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith(
        "test-registration-token"
      );
    });

    expect(await screen.findByText("au.joinTitle")).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalled();
  });
});


