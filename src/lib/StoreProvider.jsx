/* Store: demo state persisted to localStorage (falls back to memory if storage is blocked). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ME, SEED } from "../data";
import { StoreContext } from "./store";

const KEY = "familyroots-demo-v1";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
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
const DEFAULT_PREFS = { theme: "system", accent: "forest", lang: "en", text: "md", motion: "full", sidebar: "full", notify: { birthdays: true, stories: true, digest: "weekly" }, visibility: "All Family Branches" };

function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(pref("prefs") || "{}") }; } catch { return DEFAULT_PREFS; }
}

const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");

function kinHelpers(state) {
  const person = (id) => state.people.find((p) => p.id === id);
  const children = (id) => state.people.filter((p) => (p.parents || []).includes(id));
  /** Human-readable relation of `p` to the signed-in user (Mary). */
  const relationToMe = (p) => {
    if (p.id === ME) return "You";
    if (person(ME).spouse === p.id) return p.died ? "Late husband" : "Husband";
    if ((p.parents || []).includes(ME)) return p.role === "Daughter" ? "Daughter" : "Son";
    return p.role;
  };
  return { person, children, relationToMe };
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);
  const [easy, setEasyState] = useState(() => pref("easy") === "1");
  const [prefs, setPrefs] = useState(loadPrefs);
  const [systemDark, setSystemDark] = useState(() => !!darkQuery()?.matches);
  // Recorded audio blobs can't go into localStorage; keep object URLs for this session only.
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
    pref("prefs", JSON.stringify(prefs));
  }, [prefs, dark]);

  const setPref = useCallback((key, val) => setPrefs((p) => ({ ...p, [key]: val })), []);

  /** Mutate a copy of the state: update((s) => { s.memories.push(m) }). */
  const update = useCallback((fn) => {
    setState((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  const audioUrl = useCallback((id) => audioUrls.current[id], []);
  const setAudioUrl = useCallback((id, url) => { audioUrls.current[id] = url; }, []);

  const reset = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    setState(structuredClone(SEED));
    setPrefs(DEFAULT_PREFS);
  }, []);

  const value = useMemo(
    () => ({ state, update, reset, easy, setEasy: setEasyState, prefs, setPref, dark, audioUrl, setAudioUrl, ...kinHelpers(state) }),
    [state, update, reset, easy, prefs, setPref, dark, audioUrl, setAudioUrl],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
