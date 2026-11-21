import { useCallback, useEffect, useRef, useState } from "react";
import { cue } from "../lib/feedback";
import { useT } from "../lib/i18n";
import { ToastContext } from "./toastContext";
import { Icon } from "./ui";

/**
 * toast(title, { sub, icon, error, action, onAction, duration, persist })
 * Errors and `persist` toasts stay until dismissed. Others wait while hovered or focused, so they can always be read.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((title, opts = {}) => {
    const id = ++nextId.current;
    // Toasts with an action (e.g. Undo) get longer, so there is time to use it.
    const duration = opts.error || opts.persist ? null : opts.duration || (opts.action ? 8000 : 5000);
    setToasts((t) => [...t.slice(-3), { id, title, ...opts, duration }]);
    cue(opts.error ? "error" : opts.action || !opts.duration ? "success" : "info");
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" aria-atomic="false"
        className="fixed bottom-5 left-1/2 z-90 grid w-[min(480px,calc(100%-32px))] -translate-x-1/2 gap-2">
        {toasts.map((t) => <Toast key={t.id} t={t} onDismiss={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ t, onDismiss }) {
  const tr = useT();
  const [paused, setPaused] = useState(false);
  const [left, setLeft] = useState(t.duration);
  const startedAt = useRef(0);
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; });

  useEffect(() => {
    if (left == null || paused) return;
    startedAt.current = Date.now();
    const id = setTimeout(() => dismissRef.current(), left);
    return () => { clearTimeout(id); setLeft((l) => Math.max(0, l - (Date.now() - startedAt.current))); };
  }, [paused, left == null]); // eslint-disable-line react-hooks/exhaustive-deps

  const hold = { onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false), onFocus: () => setPaused(true), onBlur: () => setPaused(false) };
  return (
    <div role={t.error ? "alert" : "status"} {...hold}
      className="relative flex animate-pop items-center gap-3 overflow-hidden rounded-[14px] bg-pine-950 px-3.5 py-3 text-white shadow-pop dark:bg-surface-3 dark:ring-1 dark:ring-sec-line">
      <Icon name={t.icon || (t.error ? "error" : "check_circle")} className={t.error ? "text-[#ffb4ab]" : "text-mint"} />
      <div className="min-w-0 flex-1">
        <strong>{t.title}</strong>
        {t.sub && <small className="block text-xsmall text-on-dark">{t.sub}</small>}
        {paused && t.duration != null && <small className="block text-tag text-on-dark/80">{tr("toast.paused")}</small>}
      </div>
      {t.action && (
        <button type="button" onClick={() => { t.onAction?.(); onDismiss(); }}
          className="pressable min-h-9 cursor-pointer rounded-lg border-0 bg-mint px-3 py-1.5 text-[.8rem] font-bold text-pine-900 hover:bg-mint-hover">
          {t.action}
        </button>
      )}
      <button type="button" aria-label={tr("common.dismiss")} onClick={onDismiss}
        className="grid size-9 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-on-dark hover:bg-white/10 hover:text-white">
        <Icon name="close" size="sm" />
      </button>
      {/* Time-left bar, so users can see the message will go away (and that hovering holds it). */}
      {t.duration != null && (
        <span aria-hidden="true" className="absolute bottom-0 left-0 h-0.75 bg-mint/70"
          style={{ animation: `toast-life ${t.duration}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }} />
      )}
    </div>
  );
}
