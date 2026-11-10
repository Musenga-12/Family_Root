/* Speech output (read aloud) and speech input (voice search), both via the Web Speech API. */
import { useCallback, useEffect, useRef, useState } from "react";
import { localeOf } from "./i18n";
import { useStore } from "./store";

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
export const SpeechRec = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/** Read text aloud. `speaking` is true while this hook's utterance plays; calling toggle again stops it. */
export function useSpeech() {
  const { prefs } = useStore();
  const [speaking, setSpeaking] = useState(false);
  const mine = useRef(null);

  const stop = useCallback(() => {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text) => {
    if (!canSpeak || !text?.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = localeOf(prefs.lang);
    u.rate = prefs.speechRate || 1;
    u.onend = u.onerror = () => { if (mine.current === u) setSpeaking(false); };
    mine.current = u;
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, [prefs.lang, prefs.speechRate]);

  const toggle = useCallback((text) => (speaking ? stop() : speak(text)), [speaking, speak, stop]);

  // Stop when the component that started speaking goes away (e.g. its dialog closes).
  useEffect(() => () => { if (mine.current && canSpeak) window.speechSynthesis.cancel(); }, []);
  return { speak, stop, toggle, speaking };
}

/** Text of the current page's main content, for "Read this page aloud". Prefers a user selection. */
export function pageText() {
  const sel = window.getSelection?.().toString().trim();
  if (sel) return sel;
  const main = document.getElementById("main");
  if (!main) return "";
  return [...main.querySelectorAll("h1, h2, h3, p")]
    .filter((el) => el.offsetParent !== null)
    .map((el) => el.textContent.trim())
    .filter(Boolean)
    .slice(0, 40)
    .join(". ");
}

/** One-shot speech recognition. onResult(text) receives the final transcript. */
export function useVoiceInput(onResult) {
  const { prefs } = useStore();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef(null);
  const cb = useRef(onResult);
  useEffect(() => { cb.current = onResult; });

  const stop = useCallback(() => { rec.current?.stop(); setListening(false); }, []);
  const start = useCallback(() => {
    if (!SpeechRec) { setError("unsupported"); return; }
    try {
      const r = new SpeechRec();
      r.lang = localeOf(prefs.lang);
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (e) => cb.current(e.results[0][0].transcript.trim());
      r.onerror = (e) => setError(e.error || "error");
      r.onend = () => setListening(false);
      rec.current = r;
      setError("");
      setListening(true);
      r.start();
    } catch { setListening(false); setError("error"); }
  }, [prefs.lang]);

  useEffect(() => () => rec.current?.abort?.(), []);
  return { listening, error, start, stop, supported: !!SpeechRec };
}
