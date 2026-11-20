/* Keeps the store's archive in step with the family server while someone is signed in (see serverArchive.js).
   Used by StoreProvider only. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEMO_ME, ME, setMe } from "../data";
import { api } from "./api";
import { idsOf, loadArchive, loadThread, planSync } from "./serverArchive";
import { accountPerson } from "./session";

/** What a brand-new family starts with before the server's answer is added: empty lists everywhere. */
export const EMPTY_ARCHIVE = {
  people: [], memories: [], albums: [], stories: [], milestones: [], events: [], records: [], threads: [], members: [],
  requests: [], invites: [], consents: [], accessLog: [], replies: [], prompt: null, poll: null,
  privacy: { categories: {}, minors: {}, mine: {}, deletion: null },
};

/** Replace every string equal to `from` with `to`, anywhere in `v` (unchanged parts keep their identity). */
function swap(v, from, to) {
  if (v === from) return to;
  if (!v || typeof v !== "object") return v;
  let changed = false;
  const out = Array.isArray(v) ? [] : {};
  for (const [k, x] of Object.entries(v)) {
    const y = swap(x, from, to);
    if (y !== x) changed = true;
    out[k] = y;
  }
  return changed ? out : v;
}

const mapDoc = (d, fn) => ({
  state: fn(d.state), past: d.past.map((s) => ({ ...s, state: fn(s.state) })), future: d.future.map((s) => ({ ...s, state: fn(s.state) })),
});

/**
 * `state` / `setDoc` are the store's archive and its history. Returns
 *   source       "demo" | "server"
 *   archive      { status: "idle" | "loading" | "ready" | "error", error }
 *   saving       changes still on their way to the server
 *   failure      the last change the server refused ({ message, at }), shown by the app shell
 *   connect(me)  load the account's family and start syncing; disconnect() goes back to the on-device demo
 *   refresh(keys?)  reload from the server: everything, or only e.g. ["threads"]
 *   adopt(key, item)  take an item the server already has, without sending it again
 */
export function useServerSync({ state, setDoc, demoState, setAudioUrl, moveAudio }) {
  const [source, setSource] = useState("demo");
  const [archive, setArchive] = useState({ status: "idle", error: null });
  const [saving, setSaving] = useState(0);
  const [failure, setFailure] = useState(null);
  const sourceRef = useRef("demo");
  const synced = useRef(null); // the archive as the server last knew it
  const known = useRef(new Set()); // ids the server has told us about
  const ids = useRef(new Map()); // temporary id → server id
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const epoch = useRef(0); // bumps on every (re)load, so calls queued for an older archive are dropped
  const account = useRef(null);

  const publishAudio = useCallback((stories) => {
    for (const s of stories || []) if (s.audio_url) setAudioUrl(s.id, s.audio_url);
  }, [setAudioUrl]);

  const install = useCallback((loaded, me) => {
    const next = { ...structuredClone(EMPTY_ARCHIVE), ...loaded };
    let meId = me.person_id;
    // An account not yet placed in the tree (welcome steps unfinished) still needs a "you" on this device.
    if (!meId || !next.people.some((p) => p.id === meId)) {
      const p = accountPerson(me);
      meId = p.id;
      next.people.push({ ...p, gen: 1, parents: [], spouse: null, tags: [], role: "You", local: true });
    }
    setMe(meId);
    known.current = idsOf(next);
    ids.current = new Map();
    synced.current = next;
    publishAudio(next.stories);
    setDoc({ state: next, past: [], future: [] });
  }, [setDoc, publishAudio]);

  const load = useCallback(async (me) => {
    const mine = ++epoch.current;
    queue.current = Promise.resolve();
    pending.current = 0;
    setSaving(0);
    try {
      const loaded = await loadArchive();
      if (mine !== epoch.current) return;
      install(loaded, me);
      setArchive({ status: "ready", error: null });
    } catch (e) {
      if (mine === epoch.current) setArchive({ status: "error", error: e.message });
    }
  }, [install]);

  const connect = useCallback((me) => {
    // The same account again (e.g. after a name change) keeps its archive; a new place in the tree reloads it.
    if (sourceRef.current === "server" && account.current?.id === me.id && account.current?.person_id === me.person_id) return;
    account.current = me;
    sourceRef.current = "server";
    synced.current = null;
    setSource("server");
    setArchive({ status: "loading", error: null });
    load(me);
  }, [load]);

  const disconnect = useCallback(() => {
    if (sourceRef.current === "demo") return;
    epoch.current++;
    account.current = null;
    sourceRef.current = "demo";
    synced.current = null;
    setSource("demo");
    setArchive({ status: "idle", error: null });
    setMe(DEMO_ME);
    setDoc({ state: demoState(), past: [], future: [] });
  }, [setDoc, demoState]);

  const retry = useCallback(() => {
    if (!account.current) return;
    setArchive({ status: "loading", error: null });
    load(account.current);
  }, [load]);

  /** Reload `keys` (default: everything) from the server once nothing is waiting to be saved. Refreshed lists are
   *  rewritten in the Undo history too, so stepping back never "un-does" a relative's change. */
  const refresh = useCallback(async (keys) => {
    if (sourceRef.current !== "server" || !account.current) return;
    const mine = epoch.current;
    await queue.current;
    if (mine !== epoch.current || pending.current) return;
    if (!keys) { await load(account.current); return; }
    try {
      const fresh = {};
      if (keys.includes("threads")) fresh.threads = await Promise.all((await api("/threads")).map(loadThread));
      if (mine !== epoch.current || pending.current) return;
      for (const t of fresh.threads || []) { known.current.add(t.id); for (const m of t.messages) known.current.add(m.id); }
      const put = (s) => ({ ...s, ...fresh });
      synced.current = put(synced.current);
      setDoc((d) => mapDoc(d, put));
    } catch { /* stays as it is; the next refresh tries again */ }
  }, [load, setDoc]);

  /** Put an item the server just made or changed (e.g. an invitation created with a direct API call, so the screen
   *  can say whether its email went out) into the archive without sending it again. Adds it, or replaces it by id. */
  const adopt = useCallback((key, item) => {
    if (sourceRef.current !== "server" || !synced.current) return;
    known.current.add(item.id);
    const put = (s) => {
      const list = s[key] || [];
      return { ...s, [key]: list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [...list, item] };
    };
    synced.current = put(synced.current);
    setDoc((d) => mapDoc(d, put));
  }, [setDoc]);

  // After every change: work out the server calls and run them one at a time, in order.
  useEffect(() => {
    if (sourceRef.current !== "server" || !synced.current || state === synced.current) return;
    const ops = planSync(synced.current, state, { me: ME, known: known.current });
    synced.current = state;
    if (!ops.length) return;
    const mine = epoch.current;
    const ctx = {
      id: (x) => ids.current.get(x) ?? x,
      userId: (x) => synced.current.members?.find((m) => m.id === ctx.id(x))?.userId,
      remap: (from, to) => {
        if (!from || !to || from === to) return;
        ids.current.set(from, to);
        known.current.add(to);
        if (ME === from) setMe(to);
        moveAudio(from, to);
        synced.current = swap(synced.current, from, to);
        setDoc((d) => mapDoc(d, (s) => swap(s, from, to)));
      },
      merge: (key, id, item) => {
        const put = (s) => ({ ...s, [key]: (s[key] || []).map((x) => (x.id === id ? { ...x, ...item } : x)) });
        synced.current = put(synced.current);
        if (key === "stories") publishAudio([item]);
        setDoc((d) => ({ ...d, state: put(d.state) }));
      },
    };
    pending.current += ops.length;
    setSaving(pending.current);
    for (const op of ops) {
      queue.current = queue.current.then(async () => {
        if (mine !== epoch.current) return;
        try {
          await op(ctx);
        } catch (e) {
          if (mine !== epoch.current) return;
          // The server said no or can't be reached: say why, then reload so the screen matches what is really saved.
          setFailure({ message: e.message, offline: !!e.offline, at: Date.now() });
          load(account.current);
        } finally {
          if (mine === epoch.current) { pending.current = Math.max(0, pending.current - 1); setSaving(pending.current); }
        }
      });
    }
  }, [state, setDoc, load, publishAudio, moveAudio]);

  return useMemo(() => ({ source, archive, saving, failure, connect, disconnect, refresh, retry, adopt }),
    [source, archive, saving, failure, connect, disconnect, refresh, retry, adopt]);
}
