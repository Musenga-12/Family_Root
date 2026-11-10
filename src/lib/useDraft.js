/* Form drafts saved to localStorage as you type, so a closed dialog or a lost tab never loses work. */
import { useCallback, useEffect, useState } from "react";

const KEY = (k) => "fr-draft-" + k;

function read(key) {
  try { return JSON.parse(localStorage.getItem(KEY(key)) || "null"); } catch { return null; }
}

/**
 * const [form, setForm, { restored, savedAt, discard, clear }] = useDraft("memory", initial)
 * `restored` is true when the form opened with a saved draft; `clear()` removes it after a successful save.
 */
export function useDraft(key, initial) {
  const [saved] = useState(() => read(key));
  const [value, setValue] = useState(() => (saved ? { ...initial, ...saved.value } : initial));
  const [restored, setRestored] = useState(!!saved);
  const [savedAt, setSavedAt] = useState(saved?.at || null);
  const [dirty, setDirty] = useState(false);

  // Debounced write: only after the user has changed something.
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => {
      const at = Date.now();
      try { localStorage.setItem(KEY(key), JSON.stringify({ at, value })); setSavedAt(at); } catch { /* storage blocked */ }
    }, 400);
    return () => clearTimeout(id);
  }, [key, value, dirty]);

  const set = useCallback((next) => { setDirty(true); setValue(next); }, []);
  const clear = useCallback(() => { try { localStorage.removeItem(KEY(key)); } catch { /* ignore */ } setDirty(false); }, [key]);
  const discard = useCallback(() => { clear(); setValue(initial); setRestored(false); setSavedAt(null); }, [clear, initial]);

  return [value, set, { restored, savedAt, dirty, discard, clear }];
}
