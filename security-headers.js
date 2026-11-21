/* The web app's Content-Security-Policy, built from the same VITE_API_URL the app is built with, so the API it may
   talk to can never differ from the one it calls. vite.config.js puts it in index.html at build time (a <meta>);
   vercel.json adds what only a header can say (frame-ancestors) and the other security headers.

   Allowed, and why:
     scripts, styles, fonts, worker, manifest  this site only (the build has no inline scripts or styles)
     one inline style                         the Legacy Archive print window's stylesheet, by its hash
     images and audio                         this site, the API (signed file links: photos, recordings, scans; the
                                              files come through the API, never straight from Supabase Storage),
                                              data: (photos chosen on this device) and blob: (a recording before upload)
     connections (fetch)                      this site and the API
   Nothing else: no other sites, no eval, no plugins, and nobody may put the app in a frame. */
import { createHash } from "node:crypto";
import { PRINT_CSS } from "./src/lib/printStyle.js";

const hash = (s) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

/** The API's origin ("https://api.example.org") from VITE_API_URL ("https://api.example.org/api/v1"), or "". */
export function apiOrigin(apiUrl = "") {
  return apiUrl ? new URL(apiUrl).origin : "";
}

export function contentSecurityPolicy(apiUrl = "") {
  const api = apiOrigin(apiUrl);
  const self = "'self'";
  const directives = {
    "default-src": [self],
    "script-src": [self],
    "style-src": [self, hash(PRINT_CSS)],
    "img-src": [self, api, "data:", "blob:"],
    "media-src": [self, api, "data:", "blob:"],
    "connect-src": [self, api],
    "font-src": [self],
    "worker-src": [self],
    "manifest-src": [self],
    "object-src": ["'none'"],
    "base-uri": [self],
    "form-action": [self],
  };
  const policy = Object.entries(directives).map(([name, sources]) => [name, ...sources.filter(Boolean)].join(" "));
  if (api.startsWith("https:")) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** Problems with VITE_API_URL for a production build: missing (the app would be the on-device demo), not https, or
 *  pointing at this computer. */
export function productionApiProblems(apiUrl = "") {
  if (!apiUrl) return ["VITE_API_URL is not set: the build would be the on-device demo, not the family server's app."];
  let url;
  try { url = new URL(apiUrl); } catch { return [`VITE_API_URL is not a web address: ${apiUrl}`]; }
  const problems = [];
  if (url.protocol !== "https:") problems.push(`VITE_API_URL must start with https:// (${apiUrl})`);
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) problems.push(`VITE_API_URL points at this computer (${apiUrl})`);
  if (!url.pathname.replace(/\/+$/, "").endsWith("/api/v1")) problems.push(`VITE_API_URL should end with /api/v1 (${apiUrl})`);
  return problems;
}
