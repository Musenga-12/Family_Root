/* Live check of the family-server sync against a real backend loaded with the sample family. Skipped unless FR_LIVE_API
   is set (the API address, e.g. http://127.0.0.1:8765/api/v1, also given as VITE_API_URL). backend/scripts/live_sync_check.py
   starts a throwaway backend and runs this file. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import * as data from "../data";
import { api, setToken } from "../lib/api";
import { useStore } from "../lib/store";
import { StoreProvider } from "../lib/StoreProvider";

const LIVE = !!process.env.FR_LIVE_API;
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function signedIn(email, password = "familyroots123") {
  setToken(null);
  const { access_token } = await api("/auth/login", { body: { email, password }, auth: false });
  setToken(access_token);
  return api("/me");
}

function renderArchive() {
  return renderHook(() => useStore(), { wrapper: StoreProvider });
}

/** Run a change the way a screen does, then wait until the server has it. */
async function change(result, fn) {
  act(() => result.current.update(fn, "test"));
  await waitFor(() => expect(result.current.server.saving).toBe(0), { timeout: 8000 });
  expect(result.current.server.failure).toBeNull();
}

describe.skipIf(!LIVE)("family server sync (live)", () => {
  // Under jsdom, a FormData of files can't be sent by Node's fetch the way a browser sends it (one body with a length).
  // Here uploads are encoded as a browser would encode them: a multipart body built in memory.
  beforeAll(() => {
    class TestFormData {
      constructor() { this.parts = []; }
      append(name, value, filename) { this.parts.push([name, value, filename]); }
    }
    globalThis.FormData = TestFormData;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts = {}) => {
      const data = typeof url === "string" && url.match(/^data:([^;,]+);base64,(.*)$/);
      if (data) return { blob: async () => ({ type: data[1], bytes: Buffer.from(data[2], "base64") }) };
      if (!(opts.body instanceof TestFormData)) return realFetch(url, opts);
      const b = `----fr${Date.now()}`;
      const chunks = [];
      for (const [name, value, filename] of opts.body.parts) {
        const file = value && typeof value === "object";
        chunks.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${name}"${file ? `; filename="${filename}"\r\nContent-Type: ${value.type}` : ""}\r\n\r\n`));
        chunks.push(file ? (value.bytes || Buffer.from(await value.arrayBuffer())) : Buffer.from(String(value)));
        chunks.push(Buffer.from("\r\n"));
      }
      chunks.push(Buffer.from(`--${b}--\r\n`));
      return realFetch(url, { ...opts, body: Buffer.concat(chunks), headers: { ...opts.headers, "Content-Type": `multipart/form-data; boundary=${b}` } });
    };
  });

  it("loads the family and saves every kind of change", { timeout: 60000 }, async () => {
    const me = await signedIn("mary@example.com");
    const { result } = renderArchive();
    act(() => result.current.server.connect(me));
    await waitFor(() => expect(result.current.server.archive.status).toBe("ready"), { timeout: 8000 });
    const s = () => result.current.state;
    expect(data.ME).toBe("mary");
    expect(s().people.length).toBeGreaterThan(5);
    expect(s().threads[0].messages.length).toBeGreaterThan(0);

    // A new grandchild: created, then linked to both parents, under the server's id.
    await change(result, (d) => { d.people.push({ id: "ptemp1", first: "Lily", last: "Miller", born: "2024-03-14", gen: 4, parents: ["sarah", "david"], spouse: null, tags: [] }); });
    const lily = s().people.find((p) => p.first === "Lily");
    expect(lily.id).not.toBe("ptemp1");
    expect((await api(`/people/${lily.id}`)).parents).toEqual(["sarah", "david"]);

    // Undo deletes it on the server; Redo restores the same person.
    act(() => result.current.undo());
    await waitFor(() => expect(result.current.server.saving).toBe(0));
    expect((await api("/people")).some((p) => p.id === lily.id)).toBe(false);
    act(() => result.current.redo());
    await waitFor(() => expect(result.current.server.saving).toBe(0));
    expect((await api("/people")).some((p) => p.id === lily.id)).toBe(true);

    // Edits, verification and stars.
    await change(result, (d) => { d.people.find((p) => p.id === lily.id).occupation = "Nursery"; d.people.find((p) => p.id === "robert").pending = false; d.people.find((p) => p.id === "anna").fav = true; });
    expect((await api(`/people/${lily.id}`)).occupation).toBe("Nursery");
    expect((await api("/people/robert")).pending).toBe(false);
    expect((await api("/people/anna")).fav).toBe(true);

    // A memory with a photo chosen on the device.
    await change(result, (d) => { d.memories.push({ id: "mtemp1", title: "Lily's first steps", date: "2025-05", approx: false, type: "photo", place: "Inverness", label: "New upload", tagged: ["james"], visibility: "All Family Branches", caption: "Garden", alt: "A toddler walking on grass", p1: "#7fa894", p2: "#2a5140", icon: "image", owner: "mary", img: PIXEL }); });
    const mem = s().memories.find((m) => m.title === "Lily's first steps");
    expect(mem.id).not.toBe("mtemp1");
    expect(mem.img).toMatch(/^http/);
    expect((await api(`/memories/${mem.id}`)).tagged).toEqual(["james"]);
    await change(result, (d) => { d.memories.find((m) => m.id === mem.id).fav = true; });
    expect((await api(`/memories/${mem.id}`)).fav).toBe(true);
    await change(result, (d) => { d.albums.unshift({ id: "atemp1", items: [mem.id], title: "Lily", tag: "New", meta: "", note: "", p1: "#7fa894", p2: "#2a5140", icon: "photo_album" }); });
    expect((await api("/albums")).find((a) => a.title === "Lily").items).toEqual([mem.id]);

    // Stories, timeline, legacy archive, gatherings.
    await change(result, (d) => { d.stories.unshift({ id: "stemp1", title: "Lily's song", kind: "written", category: "Written Memories", by: "mary", recorded: "2026-11-20", excerpt: "La la", transcript: "La la la", loves: 0, reflections: 0 }); });
    const story = s().stories.find((x) => x.title === "Lily's song");
    await change(result, (d) => { const x = d.stories.find((y) => y.id === story.id); x.loved = true; x.loves = 1; });
    expect((await api(`/stories/${story.id}`)).loved).toBe(true);
    await change(result, (d) => { d.milestones.push({ id: "ttemp1", type: "Births", icon: "child_care", title: "Birth of Lily", date: "2024-03-14", place: "Inverness", text: "", people: ["sarah", "david"] }); });
    expect((await api("/milestones")).find((m) => m.title === "Birth of Lily").people).toEqual(["sarah", "david"]);
    await change(result, (d) => { d.records.unshift({ id: "rtemp1", title: "Lily's birth certificate", category: "Certificates", date: "2024-03-14", custodian: "sarah", status: "review", visibility: "All Family Branches", source: "NRS", icon: "badge", text: "Registered in Inverness." }); });
    expect((await api("/records")).some((r) => r.title === "Lily's birth certificate")).toBe(true);
    await change(result, (d) => { d.events.push({ id: "etemp1", title: "Lily's party", date: "2027-03-14", sub: "Inverness", attending: 1, going: true }); });
    const ev = (await api("/events")).find((e) => e.title === "Lily's party");
    expect(ev.place).toBe("Inverness");
    expect(ev.going).toBe(true);

    // Messages: a reply in an existing chat, a reaction, a star.
    const thread = s().threads.find((t) => t.id === "c2");
    await change(result, (d) => { d.threads.find((t) => t.id === "c2").messages.push({ id: "xtemp1", by: "mary", at: "2026-11-20T10:00", text: "Lily is walking!", status: "delivered" }); });
    const sent = (await api("/threads/c2/messages")).messages.at(-1);
    expect(sent.text).toBe("Lily is walking!");
    expect(s().threads.find((t) => t.id === "c2").messages.at(-1).id).toBe(sent.id);
    await change(result, (d) => { const m = d.threads.find((t) => t.id === "c2").messages[0]; m.reactions = { ...(m.reactions || {}), mary: "❤️" }; m.starred = true; });
    const first = (await api("/threads/c2/messages")).messages[0];
    expect(first.reactions.mary).toBe("❤️");
    expect(first.starred).toBe(true);
    expect(thread).toBeTruthy();

    // Administration: approve a request, change a role, invite someone.
    const req = s().requests[0];
    await change(result, (d) => { d.requests = d.requests.filter((x) => x.id !== req.id); d.members.push({ id: "utemp1", name: req.name, role: "Viewer", lastActive: null }); });
    expect((await api("/members")).some((m) => m.name === req.name && m.role === "Viewer")).toBe(true);
    await change(result, (d) => { d.members.find((m) => m.id === "anna").role = "Contributor"; });
    expect((await api("/members")).find((m) => m.person_id === "anna").role).toBe("Contributor");
    await change(result, (d) => { d.invites.push({ id: "itemp1", name: "Ruth Ross", email: "ruth.ross@example.com", relation: "Cousin", sent: "2026-11-20", by: "mary" }); });
    expect(s().invites.find((i) => i.name === "Ruth Ross").link).toMatch(/invite=/);

    // Privacy, the poll and the week's prompt.
    await change(result, (d) => { d.privacy.categories.location = "Only Me (draft)"; d.privacy.mine.age = true; });
    expect((await api("/privacy")).categories.location).toBe("Only Me (draft)");
    await change(result, (d) => { d.poll.mine = 2; d.poll.votes[2]++; });
    expect((await api("/polls/current")).mine).toBe(2);
    await change(result, (d) => { d.replies.push({ id: "retemp1", by: "mary", text: "Hogmanay ceilidhs!" }); });
    expect((await api("/prompts/current")).replies.some((r) => r.text === "Hogmanay ceilidhs!")).toBe(true);

    // Deleting a memory, then Undo, restores it.
    await change(result, (d) => { d.memories = d.memories.filter((m) => m.id !== mem.id); });
    await expect(api(`/memories/${mem.id}`)).rejects.toThrow();
    act(() => result.current.undo());
    await waitFor(() => expect(result.current.server.saving).toBe(0));
    expect((await api(`/memories/${mem.id}`)).title).toBe("Lily's first steps");
  });

  it("starts a brand-new family with only its founder, never the sample family", { timeout: 30000 }, async () => {
    setToken(null);
    const email = `founder${Date.now()}@example.com`;
    const reg = await api("/auth/register", { body: { name: "Ada Ross", email, password: "a long passphrase 123", family_name: "Ross family" }, auth: false });
    setToken(reg.access_token);
    const me = await api("/me");
    const { result } = renderArchive();
    act(() => result.current.server.connect(me));
    await waitFor(() => expect(result.current.server.archive.status).toBe("ready"), { timeout: 8000 });
    const s = result.current.state;
    expect(s.people.map((p) => p.first)).toEqual(["Ada"]);
    expect(data.ME).toBe(me.person_id);
    for (const k of ["memories", "stories", "milestones", "records", "threads", "events", "albums"]) expect(s[k]).toEqual([]);
    expect(result.current.relationToMe(s.people[0])).toBeTruthy();

    await change(result, (d) => { d.people.push({ id: "ptemp9", first: "Ben", last: "Ross", born: "2015-01-02", gen: 2, parents: [me.person_id], spouse: null, tags: [] }); });
    expect((await api("/people")).find((p) => p.first === "Ben").parents).toEqual([me.person_id]);
  });
});
