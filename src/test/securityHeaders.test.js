import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { apiOrigin, contentSecurityPolicy, productionApiProblems } from "../../security-headers.js";
import { PRINT_CSS } from "../lib/printStyle";

const API = "https://api.family.example/api/v1";
const directives = (policy) => Object.fromEntries(policy.split("; ").map((d) => { const [k, ...v] = d.split(" "); return [k, v]; }));

describe("Content-Security-Policy", () => {
  const csp = directives(contentSecurityPolicy(API));

  it("allows the API (and only the API) beyond this site, for data, photos and recordings", () => {
    expect(apiOrigin(API)).toBe("https://api.family.example");
    for (const d of ["connect-src", "img-src", "media-src"]) expect(csp[d]).toContain("https://api.family.example");
    const outside = Object.values(csp).flat().filter((s) => /^https?:/.test(s));
    expect(new Set(outside)).toEqual(new Set(["https://api.family.example"]));
  });

  it("has no wildcard, eval or blanket inline allowance", () => {
    const all = Object.values(csp).flat();
    expect(all).not.toContain("*");
    expect(all.some((s) => /unsafe-(eval|inline)/.test(s))).toBe(false);
    expect(csp["script-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
  });

  it("allows exactly the print window's stylesheet, by its hash", () => {
    const hash = `'sha256-${createHash("sha256").update(PRINT_CSS).digest("base64")}'`;
    expect(csp["style-src"]).toEqual(["'self'", hash]);
  });

  it("upgrades insecure requests only when the API is https", () => {
    expect(contentSecurityPolicy(API)).toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy("http://127.0.0.1:8000/api/v1")).not.toContain("upgrade-insecure-requests");
    expect(directives(contentSecurityPolicy(""))["connect-src"]).toEqual(["'self'"]); // the demo build: no server at all
  });
});

describe("A production build's API address", () => {
  it("is accepted when it is the deployed https API", () => {
    expect(productionApiProblems(API)).toEqual([]);
  });

  it.each([
    ["", /not set/],
    ["http://api.family.example/api/v1", /https/],
    ["https://localhost:8000/api/v1", /this computer/],
    ["https://api.family.example", /\/api\/v1/],
    ["not a url", /not a web address/],
  ])("refuses %j", (url, problem) => {
    expect(productionApiProblems(url).join(" ")).toMatch(problem);
  });
});

describe("vercel.json", () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")); // tests run from the project root
  // Vercel's "source": a path whose parenthesised parts are regular expressions (these rules have no other special parts).
  const forPath = (path) => Object.assign({}, ...config.headers
    .filter((r) => new RegExp(`^${r.source}$`).test(path))
    .map((r) => Object.fromEntries(r.headers.map((h) => [h.key, h.value]))));

  it("builds the Vite app into dist with a clean install", () => {
    expect(config).toMatchObject({ framework: "vite", installCommand: "npm ci", buildCommand: "npm run build", outputDirectory: "dist" });
  });

  it("sends the security headers on every page", () => {
    const h = forPath("/");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(h["Permissions-Policy"]).toContain("microphone=(self)"); // Recording Studio and voice search
  });

  it("caches hashed assets for a year but always revalidates the page, service worker and manifest", () => {
    expect(forPath("/assets/index-abc123.js")["Cache-Control"]).toContain("immutable");
    for (const p of ["/", "/index.html", "/sw.js", "/manifest.webmanifest"]) expect(forPath(p)["Cache-Control"]).toBe("no-cache");
  });
});
