/* Store: the family archive, persisted to localStorage (falls back to memory if storage is blocked). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ME, SEED } from "../data";
import { loadAllAudio } from "./audioStore";
import { setFeedbackPrefs } from "./feedback";
import { setDateLang } from "./format";
import { translateValue } from "./i18n";
import { StoreContext } from "./store";

const KEY = "familyroots-demo-v1";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    // Archives saved by an older version gain any sections added since (e.g. Messages), without losing their own data.
    if (raw) return { ...structuredClone(SEED), ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return structuredClone(SEED);
}

function pref(key, val) {
  try {
    if (val === undefined) return localStorage.getItem("fr-pref-" + key);
    localStorage.setItem("fr-pref-" + key, val);
  } catch { return null; }
}

/* Display preferences (theme, accent, language, text size…), stored together as JSON. */
const DEFAULT_PREFS = {
  theme: "system", accent: "heritage", accentV: 3, lang: "en", text: "md", motion: "full", sidebar: "full",
  notify: { birthdays: true, stories: true, digest: "weekly" }, visibility: "All Family Branches",
  sound: false, haptics: false, speechRate: 1, tourDone: false,
};
const HISTORY_LIMIT = 30;
const RECENT_LIMIT = 6;

function loadRecent() {
  try { return JSON.parse(pref("recent") || "[]"); } catch { return []; }
}

function loadPrefs() {
  try {
    const saved = JSON.parse(pref("prefs") || "{}");
    if (!saved.accentV && saved.accent === "forest") delete saved.accent;
    // v3: heritage orange replaced blue as the default, so a stored "blue" (the old default) moves to it.
    if ((saved.accentV || 0) < 3 && saved.accent === "blue") delete saved.accent;
    return { ...DEFAULT_PREFS, ...saved, accentV: 3 };
  } catch { return DEFAULT_PREFS; }
}

const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");

function kinHelpers(state, lang) {
  const person = (id) => state.people.find((p) => p.id === id);
  const children = (id) => state.people.filter((p) => (p.parents || []).includes(id));
  /** A relationship or role label ("Son", "Matriarch", "Custodian") in the interface language. */
  const kin = (label) => translateValue(lang, "kin", label);
  /** Human-readable relation of `p` to the signed-in user (Mary), in the interface language. */
  const relationToMe = (p) => {
    if (p.id === ME) return kin("You");
    if (person(ME).spouse === p.id) return kin(p.died ? "Late husband" : "Husband");
    if ((p.parents || []).includes(ME)) return kin(p.role === "Daughter" ? "Daughter" : "Son");
    return kin(p.role);
  };
  return { person, children, relationToMe, kin };
}

export function StoreProvider({ children }) {
  // The archive plus its undo/redo history, kept together so every change is recorded exactly once.
  const [doc, setDoc] = useState(() => ({ state: load(), past: [], future: [] }));
  const state = doc.state;
  const [recent, setRecent] = useState(loadRecent);
  const [easy, setEasyState] = useState(() => pref("easy") === "1");
  const [prefs, setPrefs] = useState(loadPrefs);
  const [systemDark, setSystemDark] = useState(() => !!darkQuery()?.matches);
  // Playable URLs for recorded audio. The audio itself is kept in IndexedDB (see audioStore.js).
  const audioUrls = useRef({});

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota or blocked */ }
  }, [state]);

  useEffect(() => {
    document.documentElement.classList.toggle("easy", easy);
    pref("easy", easy ? "1" : "0");
  }, [easy]);

  useEffect(() => {
    const mq = darkQuery();
    if (!mq) return;
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const dark = prefs.theme === "dark" || (prefs.theme === "system" && systemDark);
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark", dark);
    html.classList.toggle("reduce-motion", prefs.motion === "reduced");
    html.dataset.accent = prefs.accent;
    html.dataset.text = prefs.text;
    html.lang = prefs.lang;
    setFeedbackPrefs(prefs);
    pref("prefs", JSON.stringify(prefs));
  }, [prefs, dark]);

  const setPref = useCallback((key, val) => setPrefs((p) => ({ ...p, [key]: val })), []);

  /** Mutate a copy of the state: update((s) => { s.memories.push(m) }, "Added a memory"). The label names the step in Undo and History;
   *  pass null for bookkeeping that should not appear there (e.g. marking a conversation as read). */
  const update = useCallback((fn, label = "Edited the archive") => {
    setDoc((d) => {
      const draft = structuredClone(d.state);
      fn(draft);
      if (label === null) return { ...d, state: draft };
      return { state: draft, past: [...d.past, { state: d.state, label, at: Date.now() }].slice(-HISTORY_LIMIT), future: [] };
    });
  }, []);

  /** Step back `n` changes (default 1). Each undone step can be redone. */
  const undo = useCallback((n = 1) => {
    setDoc((d) => {
      let { state: cur, past, future } = d;
      for (let i = 0; i < n && past.length; i++) {
        const last = past[past.length - 1];
        future = [{ state: cur, label: last.label, at: last.at }, ...future];
        cur = last.state;
        past = past.slice(0, -1);
      }
      return { state: cur, past, future };
    });
  }, []);
  const redo = useCallback(() => {
    setDoc((d) => {
      if (!d.future.length) return d;
      const [next, ...future] = d.future;
      return { state: next.state, past: [...d.past, { state: d.state, label: next.label, at: next.at }], future };
    });
  }, []);

  /** Remember a visited page or opened item for "Recent" in quick search. item: { id, label, sub, icon, to } */
  const addRecent = useCallback((item) => {
    setRecent((r) => {
      const next = [item, ...r.filter((x) => x.id !== item.id)].slice(0, RECENT_LIMIT);
      pref("recent", JSON.stringify(next));
      return next;
    });
  }, []);
  const clearRecent = useCallback(() => { setRecent([]); pref("recent", "[]"); }, []);

  // Recordings saved on this device in earlier sessions become playable again.
  useEffect(() => {
    loadAllAudio().then((clips) => {
      for (const [id, blob] of Object.entries(clips)) audioUrls.current[id] ??= URL.createObjectURL(blob);
    });
  }, []);

  const audioUrl = useCallback((id) => audioUrls.current[id], []);
  const setAudioUrl = useCallback((id, url) => { audioUrls.current[id] = url; }, []);

  const reset = useCallback((label = "Restored the sample family") => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    // Undoable like any other change; preferences are kept apart from the archive.
    setDoc((d) => ({ state: structuredClone(SEED), past: [...d.past, { state: d.state, label, at: Date.now() }].slice(-HISTORY_LIMIT), future: [] }));
    setPrefs({ ...DEFAULT_PREFS, tourDone: true });
  }, []);

  // Dates and relationship words follow the interface language; set it before anything below renders.
  setDateLang(prefs.lang);

  const value = useMemo(
    () => ({
      state, update, reset, undo, redo, past: doc.past, future: doc.future, recent, addRecent, clearRecent,
      easy, setEasy: setEasyState, prefs, setPref, dark, audioUrl, setAudioUrl, ...kinHelpers(state, prefs.lang),
    }),
    [state, doc.past, doc.future, update, reset, undo, redo, recent, addRecent, clearRecent, easy, prefs, setPref, dark, audioUrl, setAudioUrl],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
