/* Modal dialogs with focus trap. Open from anywhere: const { open } = useModal(); open(<MyDialog />). */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cx } from "../lib/format";
import { CloseContext, ModalContext, useCloseModal } from "./modalContext";
import { Button, IconButton } from "./ui";

export function ModalProvider({ children }) {
  const [stack, setStack] = useState([]);
  const nextId = useRef(0);

  const open = useCallback((node) => {
    const id = ++nextId.current;
    setStack((s) => [...s, { id, node }]);
    return () => setStack((s) => s.filter((m) => m.id !== id));
  }, []);

  const confirm = useCallback((title, message, confirmLabel, onConfirm) => {
    open(<ConfirmDialog title={title} message={message} confirmLabel={confirmLabel} onConfirm={onConfirm} />);
  }, [open]);

  return (
    <ModalContext.Provider value={{ open, confirm }}>
      {children}
      {stack.map((m) => (
        <CloseContext.Provider key={m.id} value={() => setStack((s) => s.filter((x) => x.id !== m.id))}>
          {m.node}
        </CloseContext.Provider>
      ))}
    </ModalContext.Provider>
  );
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Dialog shell. `footer` holds the action buttons; call useCloseModal() inside to close. */
export function Dialog({ title, sub, wide, footer, children }) {
  const close = useCloseModal();
  const closeRef = useRef(close);
  useLayoutEffect(() => { closeRef.current = close; });
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const close = () => closeRef.current();
    const prev = document.activeElement;
    const dlg = ref.current;
    const first = dlg.querySelector("input:not([type=file]), select, textarea") || dlg.querySelector("footer button:last-child");
    first?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const f = [...dlg.querySelectorAll(FOCUSABLE)].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, []);

  return (
    <div className="fixed inset-0 z-80 grid animate-fade place-items-center bg-[rgba(10,30,24,.45)] p-4"
      onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cx("max-h-[calc(100vh-32px)] w-full animate-pop overflow-auto rounded-card bg-surface shadow-pop", wide ? "max-w-180" : "max-w-140")}>
        <header className="flex items-start justify-between gap-3 px-5.5 pt-5">
          <div>
            <h2 id={titleId}>{title}</h2>
            {sub && <p className="mt-2 text-small text-muted">{sub}</p>}
          </div>
          <IconButton icon="close" label="Close dialog" onClick={close} />
        </header>
        <div className="grid gap-3.5 px-5.5 py-4.5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2.5 px-5.5 pb-5">{footer}</footer>}
      </div>
    </div>
  );
}

/** Standard Cancel button for dialog footers. */
export function CancelButton({ children = "Cancel" }) {
  const close = useCloseModal();
  return <Button variant="soft" onClick={close}>{children}</Button>;
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm }) {
  const close = useCloseModal();
  return (
    <Dialog title={title} footer={<><CancelButton /><Button variant="danger" onClick={() => { onConfirm(); close(); }}>{confirmLabel}</Button></>}>
      <p>{message}</p>
    </Dialog>
  );
}
