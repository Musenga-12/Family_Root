/* The family archive on the family server. Signed in, the screens read and change the same `state` they use in the
   demo; this file fills it from the API (loadArchive) and turns each change into the matching API calls (planSync),
   so nothing a relative adds stays only on one device.

   How a change reaches the server: StoreProvider compares the archive before and after every change, planSync lists
   the calls (create, edit, delete, restore, favourite…), and they run one at a time in order. New items get a temporary
   id on the device; once the server answers, `remap` swaps it for the server's id everywhere (including Undo history).
   Deleting is a soft delete on the server, so Undo after a delete restores the same item. */
import { api } from "./api";
import { loadAudio } from "./audioStore";

/* ---------- Server → archive ---------- */

const pad = (n) => String(n).padStart(2, "0");
/** "2026-11-09T09:30:00Z" → "2026-11-09T11:30" in local time: the screens read dates and clock times from the string. */
export function localTime(z) {
  if (!z) return z;
  const d = new Date(z);
  if (Number.isNaN(d.getTime())) return z;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const day = (z) => (z ? localTime(z).slice(0, 10) : null);

/** A list the account may not be allowed to see (Admin-only lists for other roles) is simply empty. */
const maybe = (p, fallback) => p.catch((e) => { if (e?.status === 403 || e?.status === 404) return fallback; throw e; });

const message = (m) => ({
  id: m.id, by: m.by, at: localTime(m.at), text: m.text || "", ...(m.reply_to ? { replyTo: m.reply_to } : {}),
  ...(m.img ? { img: m.img } : {}), ...(Object.keys(m.reactions || {}).length ? { reactions: m.reactions } : {}),
  ...(m.starred ? { starred: true } : {}), ...(m.deleted ? { deleted: true } : {}), ...(m.status ? { status: m.status } : {}),
});

export async function loadThread(t) {
  const page = await api(`/threads/${t.id}/messages?limit=200`);
  return {
    id: t.id, title: t.title, group: !!t.group, members: t.members, pinned: !!t.pinned, muted: !!t.muted, unread: t.unread || 0,
    names: Object.fromEntries((t.member_details || []).map((d) => [d.key, d.name])), messages: page.messages.map(message),
  };
}

/** An invitation from the API, shaped for the archive. `byUser` maps account ids to people in the tree. */
export const inviteOf = (i, byUser = {}) => ({
  id: i.id, name: i.name, email: i.email, relation: i.relation, role: i.role, sent: day(i.sent), by: byUser[i.by] ?? null, link: i.link,
  ...(i.emailed != null ? { emailed: i.emailed } : {}),
});

const member = (m) => ({
  id: m.person_id || `u${m.user_id}`, userId: m.user_id, name: m.name, email: m.email, role: m.role,
  lastActive: day(m.last_active), joined: day(m.joined), you: !!m.is_you,
});

/** The whole archive as the signed-in account may see it, shaped like the demo's SEED (src/data.js). */
export async function loadArchive() {
  const [people, memories, albums, stories, milestones, events, records, threads, privacy, consents, accessLog, prompt, poll,
    members, requests, invites] = await Promise.all([
    api("/people"), api("/memories"), api("/albums"), api("/stories"), api("/milestones"), api("/events"), api("/records"),
    api("/threads"), api("/privacy"), api("/consents"), maybe(api("/access-log"), []), api("/prompts/current"),
    api("/polls/current"), api("/members"), maybe(api("/join-requests"), []), maybe(api("/invites"), []),
  ]);
  const byUser = Object.fromEntries(members.map((m) => [m.user_id, m.person_id || `u${m.user_id}`]));
  return {
    people: people.map(({ age: _a, ...p }) => p),
    memories, albums,
    stories: stories.map((s) => ({ ...s, audience: s.visibility })),
    milestones, events,
    records,
    threads: await Promise.all(threads.map(loadThread)),
    members: members.map(member),
    requests: requests.filter((r) => r.status === "pending").map((r) => ({
      id: r.id, name: r.name, email: r.email, relation: r.relation, note: r.note, vouchedBy: r.vouched_by, date: day(r.date),
    })),
    invites: invites.filter((i) => i.status === "pending").map((i) => inviteOf(i, byUser)),
    privacy: {
      categories: privacy.categories, mine: privacy.mine, deletion: privacy.deletion,
      minors: Object.fromEntries(privacy.minors.map((m) => [m.person_id, { hide: m.hide, guardian: m.guardian }])),
      minorInfo: privacy.minors,
    },
    consents,
    accessLog: accessLog.map((l) => ({ ...l, at: localTime(l.at) })),
    prompt: prompt && { id: prompt.id, question: prompt.question, by: prompt.by },
    replies: (prompt?.replies || []).map((r) => ({ id: r.id, by: r.by, at: r.created_at, text: r.text })),
    poll: poll && { id: poll.id, question: poll.question, options: poll.options, votes: poll.votes, mine: poll.mine ?? null },
  };
}

/* ---------- Archive changes → server calls ---------- */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const index = (list) => new Map((list || []).map((x) => [x.id, x]));

/** Items added, removed and changed between two versions of a list (compared by id). */
function diff(before, after) {
  const a = index(before);
  const b = index(after);
  return {
    added: [...b.values()].filter((x) => !a.has(x.id)),
    removed: [...a.values()].filter((x) => !b.has(x.id)),
    changed: [...b.values()].filter((x) => a.has(x.id) && !same(a.get(x.id), x)).map((x) => [a.get(x.id), x]),
  };
}

/** The listed fields that differ, as a PATCH body (undefined becomes null so a cleared field is cleared on the server). */
function changes(before, after, fields) {
  const out = {};
  for (const f of fields) if (!same(before[f], after[f])) out[f] = after[f] ?? null;
  return Object.keys(out).length ? out : null;
}

const PERSON_FIELDS = ["first", "last", "born", "died", "gen", "city", "role", "occupation", "branch", "color", "note", "married",
  "bornApprox", "minor", "tags", "parents", "spouse"];
const MEMORY_FIELDS = ["title", "date", "approx", "type", "place", "label", "visibility", "caption", "alt", "tagged"];
const ALBUM_FIELDS = ["title", "tag", "meta", "note", "p1", "p2", "icon"];
const MILESTONE_FIELDS = ["type", "title", "date", "approx", "source", "place", "text", "people"];
const RECORD_FIELDS = ["title", "category", "date", "approx", "custodian", "source", "text", "visibility", "sealedUntil"];
const EVENT_FIELDS = ["title", "date", "time", "place", "note"];

/** A photo chosen on this device (a data: URL) uploaded as a file. Resolves the upload id. */
async function upload(dataUrl, name) {
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append("file", blob, `${name}.${(blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`);
  return (await api("/uploads", { form })).id;
}
const isLocalImage = (img) => typeof img === "string" && img.startsWith("data:");

/** Soft-deletable collections: removed → DELETE, put back by Undo → POST …/restore. */
function lifecycle(ops, path, { removed, added }, known) {
  for (const x of removed) ops.push(async (c) => { await api(`${path}/${c.id(x.id)}`, { method: "DELETE" }); });
  return added.filter((x) => {
    if (!known.has(x.id)) return true;
    ops.push(async (c) => { await api(`${path}/${c.id(x.id)}/restore`, { method: "POST" }); });
    return false;
  });
}

/** Toggle endpoints such as PUT/DELETE /memories/{id}/favorite. */
const toggle = (ops, url, on) => ops.push(async (c) => { await api(url(c), { method: on ? "PUT" : "DELETE" }); });

/**
 * The server calls that turn archive `prev` into `next`, in order. Each is `async (ctx) => …` where
 *   ctx.id(x)              the server id for an id that may still be a temporary one
 *   ctx.remap(temp, real)  replace a temporary id everywhere once the server has given the real one
 *   ctx.merge(list, id, item)  take the server's version of a just-created item (signed photo link, counts…)
 * `known` holds every id the server has ever told us about, so Undo of a delete restores instead of creating a copy.
 */
export function planSync(prev, next, { me, known }) {
  const ops = [];

  /* People: the tree and directory. */
  {
    const d = diff(prev.people, next.people);
    for (const p of lifecycle(ops, "/people", d, known)) {
      if (p.local) continue;
      ops.push(async (c) => {
        const { parents, spouse, ...rest } = Object.fromEntries(PERSON_FIELDS.filter((f) => p[f] !== undefined).map((f) => [f, p[f]]));
        const made = await api("/people", { body: { ...rest, pending: !!p.pending, verified: !!p.verified } });
        c.remap(p.id, made.id);
        const links = { parents: (parents || []).map(c.id), spouse: spouse ? c.id(spouse) : null };
        // Relatives are linked once both people exist on the server.
        c.merge("people", made.id, links.parents.length || links.spouse ? await api(`/people/${made.id}`, { method: "PATCH", body: links }) : made);
      });
    }
    for (const [a, b] of d.changed) {
      if (b.local) continue;
      const body = changes(a, b, PERSON_FIELDS);
      if (body) ops.push(async (c) => {
        if (body.parents) body.parents = body.parents.map(c.id);
        if (body.spouse) body.spouse = c.id(body.spouse);
        await api(`/people/${c.id(b.id)}`, { method: "PATCH", body });
      });
      if (!!a.pending !== !!b.pending) ops.push(async (c) => { await api(`/people/${c.id(b.id)}/${b.pending ? "reopen" : "verify"}`, { method: "POST" }); });
      if (!!a.fav !== !!b.fav) toggle(ops, (c) => `/people/${c.id(b.id)}/favorite`, b.fav);
    }
  }

  /* Memories and albums. */
  {
    const d = diff(prev.memories, next.memories);
    for (const m of lifecycle(ops, "/memories", d, known)) {
      ops.push(async (c) => {
        const upload_ids = isLocalImage(m.img) ? [await upload(m.img, m.title)] : [];
        const body = Object.fromEntries(MEMORY_FIELDS.filter((f) => m[f] != null).map((f) => [f, m[f]]));
        const [made] = await api("/memories", { body: { ...body, tagged: (m.tagged || []).map(c.id), p1: m.p1, p2: m.p2, icon: m.icon, upload_ids, consent: true } });
        c.remap(m.id, made.id);
        c.merge("memories", made.id, made);
      });
    }
    for (const [a, b] of d.changed) {
      const body = changes(a, b, MEMORY_FIELDS);
      if (body) ops.push(async (c) => { await api(`/memories/${c.id(b.id)}`, { method: "PATCH", body: { ...body, consent: true } }); });
      if (!!a.fav !== !!b.fav) toggle(ops, (c) => `/memories/${c.id(b.id)}/favorite`, b.fav);
    }
  }
  {
    const d = diff(prev.albums, next.albums);
    for (const x of d.removed) ops.push(async (c) => { await api(`/albums/${c.id(x.id)}`, { method: "DELETE" }); });
    for (const a of d.added) {
      ops.push(async (c) => {
        const made = await api("/albums", { body: { ...Object.fromEntries(ALBUM_FIELDS.map((f) => [f, a[f] ?? null])), items: (a.items || []).map(c.id) } });
        c.remap(a.id, made.id);
        c.merge("albums", made.id, made);
      });
    }
    for (const [a, b] of d.changed) {
      const body = changes(a, b, ALBUM_FIELDS);
      if (body) ops.push(async (c) => { await api(`/albums/${c.id(b.id)}`, { method: "PATCH", body }); });
      if (!same(a.items, b.items)) ops.push(async (c) => { await api(`/albums/${c.id(b.id)}/items`, { method: "PUT", body: { items: b.items.map(c.id) } }); });
    }
  }

  /* Stories: written ones as text, recordings with the audio kept on this device. */
  {
    const d = diff(prev.stories, next.stories);
    for (const s of lifecycle(ops, "/stories", d, known)) {
      ops.push(async (c) => {
        const visibility = s.audience || s.visibility;
        const blob = s.kind === "audio" ? await loadAudio(s.id) : null;
        let made;
        if (blob) {
          const form = new FormData();
          form.append("file", blob, `recording.${(blob.type.split("/")[1] || "webm").split(";")[0]}`);
          for (const [k, v] of Object.entries({ title: s.title, duration: String(s.duration || 1), transcript: s.transcript || "",
            visibility, prompt: s.prompt || "" })) if (v) form.append(k, v);
          made = await api("/stories/audio", { form });
        } else {
          made = await api("/stories", { body: { title: s.title, text: s.transcript || s.excerpt || "", category: s.category, visibility, tag: s.tag || null,
            ...(s.kind === "audio" && s.duration ? { duration: s.duration } : {}) } });
        }
        c.remap(s.id, made.id);
        c.merge("stories", made.id, { ...made, isNew: true, audience: made.visibility });
      });
    }
    for (const [a, b] of d.changed) {
      const body = changes(a, b, ["title", "category", "tag", "excerpt"]) || {};
      if (!same(a.transcript, b.transcript)) body.text = b.transcript;
      if (!same(a.audience, b.audience)) body.visibility = b.audience;
      if (Object.keys(body).length) ops.push(async (c) => { await api(`/stories/${c.id(b.id)}`, { method: "PATCH", body }); });
      if (!!a.loved !== !!b.loved) toggle(ops, (c) => `/stories/${c.id(b.id)}/love`, b.loved);
      if (!!a.verified !== !!b.verified) ops.push(async (c) => { await api(`/stories/${c.id(b.id)}/${b.verified ? "verify" : "reopen"}`, { method: "POST" }); });
    }
  }

  /* Timeline, Legacy Archive and gatherings. */
  const simple = (key, path, fields, { create, verify } = {}) => {
    const d = diff(prev[key], next[key]);
    for (const x of lifecycle(ops, path, d, known)) {
      ops.push(async (c) => {
        const made = await api(path, { body: create(x, c) });
        c.remap(x.id, made.id);
        c.merge(key, made.id, made);
      });
    }
    for (const [a, b] of d.changed) {
      const body = changes(a, b, fields);
      if (body) ops.push(async (c) => {
        if (body.people) body.people = body.people.map(c.id);
        if (body.custodian) body.custodian = c.id(body.custodian);
        await api(`${path}/${c.id(b.id)}`, { method: "PATCH", body });
      });
      if (verify) verify(a, b);
    }
  };
  simple("milestones", "/milestones", MILESTONE_FIELDS, {
    create: (m, c) => ({ ...Object.fromEntries(MILESTONE_FIELDS.filter((f) => m[f] != null).map((f) => [f, m[f]])), people: (m.people || []).map(c.id) }),
    verify: (a, b) => { if (!!a.verified !== !!b.verified) ops.push(async (c) => { await api(`/milestones/${c.id(b.id)}/${b.verified ? "verify" : "reopen"}`, { method: "POST" }); }); },
  });
  simple("records", "/records", RECORD_FIELDS, {
    create: (r, c) => ({ ...Object.fromEntries(RECORD_FIELDS.filter((f) => r[f] != null).map((f) => [f, r[f]])), custodian: r.custodian ? c.id(r.custodian) : null }),
    verify: (a, b) => { if (a.status !== b.status) ops.push(async (c) => { await api(`/records/${c.id(b.id)}/${b.status === "verified" ? "verify" : "reopen"}`, { method: "POST" }); }); },
  });
  simple("events", "/events", EVENT_FIELDS, {
    // The Add gathering dialog keeps the place in `sub`; the server counts the organiser as going.
    create: (e) => ({ title: e.title, date: e.date, time: e.time || null, place: e.place || e.sub || null, note: e.note || null }),
    verify: (a, b) => { if (!!a.going !== !!b.going) ops.push(async (c) => { await api(`/events/${c.id(b.id)}/rsvp`, b.going ? { method: "PUT", body: { answer: "yes" } } : { method: "DELETE" }); }); },
  });

  /* Messages. */
  {
    const d = diff(prev.threads, next.threads);
    for (const t of lifecycle(ops, "/threads", d, known)) {
      const [first, ...rest] = t.messages || [];
      if (!first) continue;
      ops.push(async (c) => {
        const upload_id = isLocalImage(first.img) ? await upload(first.img, "photo") : null;
        const made = await api("/threads", { body: { to: t.members.filter((m) => m !== me).map(c.id), title: t.group ? t.title : null, text: first.text || "", upload_id } });
        c.remap(t.id, made.id);
        if (made.last?.id) c.remap(first.id, made.last.id);
      });
      for (const m of rest) ops.push(sendMessage(t, m));
    }
    for (const [a, b] of d.changed) {
      const body = changes(a, b, ["pinned", "muted"]);
      if (body) ops.push(async (c) => { await api(`/threads/${c.id(b.id)}`, { method: "PATCH", body }); });
      if (a.unread !== b.unread) {
        if (!b.unread) ops.push(async (c) => { await api(`/threads/${c.id(b.id)}/read`, { method: "POST" }); });
        else if (!a.unread) ops.push(async (c) => { await api(`/threads/${c.id(b.id)}`, { method: "PATCH", body: { unread: true } }); });
      }
      // "Clear chat" empties the list; its Undo puts the messages back.
      if (a.messages.length && !b.messages.length) { ops.push(async (c) => { await api(`/threads/${c.id(b.id)}/messages`, { method: "DELETE" }); }); continue; }
      if (!a.messages.length && b.messages.length && b.messages.every((m) => known.has(m.id))) {
        ops.push(async (c) => { await api(`/threads/${c.id(b.id)}/messages/restore`, { method: "POST" }); });
        continue;
      }
      const md = diff(a.messages, b.messages);
      for (const m of md.added) if (!known.has(m.id)) ops.push(sendMessage(b, m));
      for (const [x, y] of md.changed) {
        const path = (c) => `/threads/${c.id(b.id)}/messages/${c.id(y.id)}`;
        if (!!x.deleted !== !!y.deleted) ops.push(async (c) => { await api(y.deleted ? path(c) : `${path(c)}/restore`, { method: y.deleted ? "DELETE" : "POST" }); });
        if (!!x.starred !== !!y.starred) toggle(ops, (c) => `${path(c)}/star`, y.starred);
        const mine = y.reactions?.[me];
        if ((x.reactions?.[me]) !== mine) {
          ops.push(async (c) => { await api(`${path(c)}/reaction`, mine ? { method: "PUT", body: { emoji: mine } } : { method: "DELETE" }); });
        }
      }
    }
  }

  /* Family administration. */
  {
    const rd = diff(prev.requests, next.requests);
    const md = diff(prev.members, next.members);
    for (const r of rd.removed) {
      // Approving moves the request into the members list under the same name; declining just removes it.
      const joined = md.added.find((m) => m.name === r.name && !known.has(m.id));
      ops.push(async (c) => {
        if (!joined) { await api(`/join-requests/${r.id}/decline`, { method: "POST" }); return; }
        const made = await api(`/join-requests/${r.id}/approve`, { body: { role: joined.role } });
        c.remap(joined.id, made.person_id || `u${made.user_id}`);
        c.merge("members", made.person_id || `u${made.user_id}`, member(made));
      });
    }
    for (const r of rd.added) ops.push(async () => { await api(`/join-requests/${r.id}/reopen`, { method: "POST" }); });
    for (const m of md.removed) ops.push(async (c) => { await api(`/members/${userOf(c, m)}`, { method: "DELETE" }); });
    for (const m of md.added) if (known.has(m.id)) ops.push(async (c) => { await api(`/members/${userOf(c, m)}/restore`, { method: "POST" }); });
    for (const [a, b] of md.changed) {
      if (a.role !== b.role) ops.push(async (c) => { await api(`/members/${userOf(c, b)}`, { method: "PATCH", body: { role: b.role } }); });
    }
    const id = diff(prev.invites, next.invites);
    for (const inv of lifecycle(ops, "/invites", id, known)) {
      ops.push(async (c) => {
        const made = await api("/invites", { body: { name: inv.name, email: inv.email, relation: inv.relation || null, role: inv.role || null } });
        c.remap(inv.id, made.id);
        c.merge("invites", made.id, { sent: day(made.sent), link: made.link, role: made.role });
      });
    }
    for (const [a, b] of id.changed) if (a.sent !== b.sent) ops.push(async (c) => { await api(`/invites/${c.id(b.id)}/resend`, { method: "POST" }); });
  }

  /* Privacy & Consent. */
  {
    const a = prev.privacy || {};
    const b = next.privacy || {};
    const cats = changes(a.categories || {}, b.categories || {}, Object.keys(b.categories || {}));
    if (cats) ops.push(async () => { await api("/privacy/categories", { method: "PATCH", body: cats }); });
    const mine = changes(a.mine || {}, b.mine || {}, Object.keys(b.mine || {}));
    if (mine) ops.push(async () => { await api("/privacy/mine", { method: "PATCH", body: mine }); });
    for (const [pid, v] of Object.entries(b.minors || {})) {
      const body = changes(a.minors?.[pid] || {}, v, ["hide", "guardian"]);
      if (body) ops.push(async () => { await api(`/privacy/minors/${pid}`, { method: "PATCH", body }); });
    }
    if (!a.deletion && b.deletion) ops.push(async () => { await api("/me/deletion-request", { method: "POST" }); });
    if (a.deletion && !b.deletion) ops.push(async () => { await api("/me/deletion-request", { method: "DELETE" }); });
    for (const [x, y] of diff(prev.consents, next.consents).changed) {
      if (x.status !== y.status && y.status !== "pending") ops.push(async () => { await api(`/consents/${y.id}`, { method: "PATCH", body: { status: y.status } }); });
      else if (x.date !== y.date) ops.push(async () => { await api(`/consents/${y.id}/remind`, { method: "POST" }); });
    }
  }

  /* Overview: the week's prompt and the family poll. */
  if (next.prompt) {
    const d = diff(prev.replies, next.replies);
    for (const r of d.added) ops.push(async (c) => {
      const made = await api(`/prompts/${next.prompt.id}/replies`, { body: { text: r.text } });
      c.remap(r.id, made.id);
    });
    for (const r of d.removed) ops.push(async (c) => { await api(`/prompts/${next.prompt.id}/replies/${c.id(r.id)}`, { method: "DELETE" }); });
  }
  if (next.poll && prev.poll?.mine !== next.poll.mine) {
    ops.push(async () => { await api(`/polls/${next.poll.id}/vote`, next.poll.mine == null ? { method: "DELETE" } : { method: "PUT", body: { choice: next.poll.mine } }); });
  }
  return ops;
}

const userOf = (c, m) => m.userId ?? c.userId(m.id);

function sendMessage(t, m) {
  return async (c) => {
    const upload_id = isLocalImage(m.img) ? await upload(m.img, "photo") : null;
    const made = await api(`/threads/${c.id(t.id)}/messages`, { body: { text: m.text || "", reply_to: m.replyTo ? c.id(m.replyTo) : null, upload_id } });
    c.remap(m.id, made.id);
  };
}

/** Every id in an archive, so a later re-add can be recognised as an Undo of a delete. */
export function idsOf(state) {
  const out = new Set();
  for (const key of ["people", "memories", "albums", "stories", "milestones", "events", "records", "threads", "members", "invites", "replies"]) {
    for (const x of state[key] || []) out.add(x.id);
  }
  for (const t of state.threads || []) for (const m of t.messages || []) out.add(m.id);
  return out;
}
