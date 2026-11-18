/* Talking to the FamilyRoots API (backend/). Set VITE_API_URL (see .env.example) to use a family server; without it
   the app runs as the on-device demo, exactly as before. The one-file build never uses a server. */
const BASE = import.meta.env.MODE === "single" ? "" : (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

/** True when the app signs in and saves to a family server instead of this device. */
export const connected = !!BASE;

const TOKEN_KEY = "fr-token";
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
};

/** Fired when the server no longer accepts the saved sign-in (expired, password changed, access removed). */
export const SIGNED_OUT_EVENT = "fr:signed-out";

/** An error worth showing to the person: `message` is the server's own plain-language explanation. */
export class ApiError extends Error {
  constructor(message, status, offline = false) {
    super(message);
    this.status = status;
    this.offline = offline;
  }
}

/** FastAPI sends either a sentence or a list of field problems; turn either into one readable line. */
function detailText(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => {
      const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(" ") : "";
      return field ? `${field}: ${d.msg}` : d.msg;
    }).join(". ");
  }
  return null;
}

/**
 * api("/memories")                         GET, returns parsed JSON
 * api("/memories", { body: {...} })        POST JSON (method defaults to POST when there is a body)
 * api("/uploads", { form: formData })      POST multipart
 * api("/events/e1/rsvp", { method: "PUT", body: { answer: "maybe" } })
 */
export async function api(path, { method, body, form, auth = true, signal } = {}) {
  if (!connected) throw new ApiError("No family server is set up for this copy of FamilyRoots.", 0);
  const headers = {};
  const token = auth && getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(BASE + path, {
      method: method || (body !== undefined || form ? "POST" : "GET"),
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    // The browser reports "server not running" and "server refused this page (CORS)" the same way, so during
    // development say what was tried and what to check. Relatives using the built app see only the first sentence.
    const dev = import.meta.env.DEV
      ? ` Developer note: nothing answered at ${BASE}. Start the backend (in backend/: fastapi dev app/main.py). If it is running, `
        + `FRONTEND_ORIGIN in backend/.env must be ${location.origin}.`
      : "";
    throw new ApiError(`Can't reach the family server. Check your connection and try again.${dev}`, 0, true);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    }
    throw new ApiError(detailText(data?.detail) || `Something went wrong (error ${res.status}). Please try again.`, res.status);
  }
  return data;
}

/* ---------- Sign in and account ---------- */
export const authApi = {
  login: (email, password) => api("/auth/login", { body: { email, password }, auth: false }),
  /** body: { name, email, password, easy_mode, family_code? | invite_token? | family_name? }. Resolves { status: "active" | "pending", access_token? }. */
  register: (body) => api("/auth/register", { body, auth: false }),
  verifyCode: (code) => api("/auth/family-code/verify", { body: { code }, auth: false }),
  inviteInfo: (token) => api(`/invites/by-token/${encodeURIComponent(token)}`, { auth: false }),
  forgotPassword: (email) => api("/auth/forgot-password", { body: { email }, auth: false }),
  resetPassword: (token, password) => api("/auth/reset-password", { body: { token, password }, auth: false }),
  me: () => api("/me"),
  /** body: any of { name, email, easy_mode, current_password, onboarding_done }. Resolves the updated account. */
  updateMe: (body) => api("/me", { method: "PATCH", body }),
};

/* ---------- Invitations ---------- */
export const inviteApi = {
  /** body: { name, email, relation?, role? }. Resolves the invitation, including the `link` to send while email is not set up. */
  create: (body) => api("/invites", { body }),
};
