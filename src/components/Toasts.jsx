import { useCallback, useRef, useState } from "react";
import { ToastContext } from "./toastContext";
import { Icon } from "./ui";

/**
 * toast(title, { sub, icon, error, action, onAction, duration })
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((title, opts = {}) => {
    const id = ++nextId.current;
    setToasts((t) => [...t, { id, title, ...opts }]);
    setTimeout(() => dismiss(id), opts.duration || 5000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" aria-atomic="false"
        className="fixed bottom-5 left-1/2 z-90 grid w-[min(480px,calc(100%-32px))] -translate-x-1/2 gap-2">
        {toasts.map((t) => (
          <div key={t.id} role={t.error ? "alert" : "status"}
            className="flex animate-pop items-center gap-3 rounded-[14px] bg-pine-950 px-3.5 py-3 text-white shadow-pop">
            <Icon name={t.icon || (t.error ? "error" : "check_circle")} className={t.error ? "text-[#ffb4ab]" : "text-mint"} />
            <div className="min-w-0 flex-1">
              <strong>{t.title}</strong>
              {t.sub && <small className="block text-[.76rem] text-on-dark">{t.sub}</small>}
            </div>
            {t.action && (
              <button type="button" onClick={() => { t.onAction?.(); dismiss(t.id); }}
                className="cursor-pointer rounded-lg border-0 bg-mint px-2.5 py-1.5 text-[.76rem] font-bold text-pine-900">
                {t.action}
              </button>
            )}
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}
              className="cursor-pointer rounded-lg border-0 bg-transparent p-1 text-on-dark">
              <Icon name="close" size="sm" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
