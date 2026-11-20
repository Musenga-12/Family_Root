import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  resetStatus: vi.fn(),
  verifyCode: vi.fn(),
  signIn: vi.fn(),
  toast: vi.fn(),
  setEasy: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  connected: true,
  authApi: {
    forgotPassword: mocks.forgotPassword,
    resetPassword: mocks.resetPassword,
    resetStatus: mocks.resetStatus,
    verifyCode: mocks.verifyCode,
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
  useStore: () => ({ setEasy: mocks.setEasy }),
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

function renderAuth(mode, path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Auth mode={mode} />
    </MemoryRouter>
  );
}

function submitForm(inputId) {
  fireEvent.submit(document.getElementById(inputId).closest("form"));
}

describe("Authentication - Recovery and Family Code", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.resetStatus.mockResolvedValue({ status: "valid" });
    mocks.signIn.mockResolvedValue({
      name: "Jane Doe",
      family_name: "Doe Family",
      onboarding_done: false,
    });
  });

  it("rejects an invalid email in the forgot-password form", () => {
    renderAuth("forgot", "/forgot-password");

    fireEvent.change(document.getElementById("fpEmail"), {
      target: { value: "invalid-email" },
    });

    submitForm("fpEmail");

    expect(screen.getByText("au.forgotNeedEmail")).toBeInTheDocument();
    expect(mocks.forgotPassword).not.toHaveBeenCalled();
  });

  it("sends a password recovery request successfully", async () => {
    mocks.forgotPassword.mockResolvedValue({
      detail: "Recovery instructions sent.",
    });

    renderAuth("forgot", "/forgot-password");

    fireEvent.change(document.getElementById("fpEmail"), {
      target: { value: "jane@example.com" },
    });

    submitForm("fpEmail");

    await waitFor(() => {
      expect(mocks.forgotPassword).toHaveBeenCalledWith(
        "jane@example.com"
      );
    });

    expect(
      await screen.findByText("Recovery instructions sent.")
    ).toBeInTheDocument();
  });

  it("rejects a password shorter than 10 characters during reset", async () => {
    renderAuth("reset", "/reset-password?token=reset-token");
    await screen.findByText("au.resetTitle");
    expect(mocks.resetStatus).toHaveBeenCalledWith("reset-token");

    fireEvent.change(document.getElementById("rpPass"), {
      target: { value: "short123" },
    });

    submitForm("rpPass");

    expect(screen.getByText("au.errPass")).toBeInTheDocument();
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("resets the password and signs in successfully", async () => {
    mocks.resetPassword.mockResolvedValue({
      access_token: "reset-access-token",
    });

    renderAuth("reset", "/reset-password?token=reset-token");
    await screen.findByText("au.resetTitle");

    fireEvent.change(document.getElementById("rpPass"), {
      target: { value: "NewStrongPass123" },
    });
    fireEvent.change(document.getElementById("rpAgain"), {
      target: { value: "NewStrongPass123" },
    });

    submitForm("rpPass");

    await waitFor(() => {
      expect(mocks.resetPassword).toHaveBeenCalledWith(
        "reset-token",
        "NewStrongPass123"
      );

      expect(mocks.signIn).toHaveBeenCalledWith(
        "reset-access-token"
      );
    });
  });

  it("asks for the same password twice", async () => {
    renderAuth("reset", "/reset-password?token=reset-token");
    await screen.findByText("au.resetTitle");
    fireEvent.change(document.getElementById("rpPass"), { target: { value: "NewStrongPass123" } });
    fireEvent.change(document.getElementById("rpAgain"), { target: { value: "NewStrongPass124" } });
    submitForm("rpPass");
    expect(screen.getByText("auth.reset.mismatch")).toBeInTheDocument();
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  for (const kind of ["expired", "used", "invalid"]) {
    it(`explains a ${kind} link and offers a new one, with no password form`, async () => {
      mocks.resetStatus.mockResolvedValue({ status: kind });
      renderAuth("reset", "/reset-password?token=reset-token");
      expect(await screen.findByText(`auth.reset.${kind}.title`)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /auth.reset.newLink/ })).toHaveAttribute("href", "/forgot-password");
      expect(document.getElementById("rpPass")).toBeNull();
    });
  }

  it("switches to the expired message when the link runs out while typing", async () => {
    renderAuth("reset", "/reset-password?token=reset-token");
    await screen.findByText("au.resetTitle");
    mocks.resetPassword.mockRejectedValue(Object.assign(new Error("This link has expired."), { status: 400 }));
    mocks.resetStatus.mockResolvedValue({ status: "expired" });
    fireEvent.change(document.getElementById("rpPass"), { target: { value: "NewStrongPass123" } });
    fireEvent.change(document.getElementById("rpAgain"), { target: { value: "NewStrongPass123" } });
    submitForm("rpPass");
    expect(await screen.findByText("auth.reset.expired.title")).toBeInTheDocument();
  });

  it("doesn't claim an email was sent when the server couldn't send it", async () => {
    mocks.forgotPassword.mockRejectedValue(new Error("This server can't send emails yet. Ask an Admin."));
    renderAuth("forgot", "/forgot-password");
    fireEvent.change(document.getElementById("fpEmail"), { target: { value: "jane@example.com" } });
    submitForm("fpEmail");
    expect(await screen.findByText("This server can't send emails yet. Ask an Admin.")).toBeInTheDocument();
    expect(screen.queryByText("auth.forgotSent")).not.toBeInTheDocument();
  });

  it("rejects an incorrectly formatted family code", () => {
    renderAuth("code", "/join");

    fireEvent.change(document.getElementById("fcCode"), {
      target: { value: "AB12" },
    });

    submitForm("fcCode");

    expect(screen.getByText("au.errCodeFormat")).toBeInTheDocument();
    expect(mocks.verifyCode).not.toHaveBeenCalled();
  });

  it("normalizes a family code before verifying it", async () => {
    mocks.verifyCode.mockResolvedValue({
      family_name: "Doe Family",
    });

    renderAuth("code", "/join");

    fireEvent.change(document.getElementById("fcCode"), {
      target: { value: "mck8294" },
    });

    submitForm("fcCode");

    await waitFor(() => {
      expect(mocks.verifyCode).toHaveBeenCalledWith("MCK-8294");
    });

    expect(mocks.toast).toHaveBeenCalled();
  });

  it("displays an error when family-code verification fails", async () => {
    mocks.verifyCode.mockRejectedValue(
      new Error("Unable to verify family code.")
    );

    renderAuth("code", "/join");

    fireEvent.change(document.getElementById("fcCode"), {
      target: { value: "ABC1234" },
    });

    submitForm("fcCode");

    expect(
      await screen.findByText("Unable to verify family code.")
    ).toBeInTheDocument();
  });
});

