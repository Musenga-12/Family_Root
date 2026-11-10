/* Modal dialogs with focus trap. Open from anywhere: const { open } = useModal(); open(<MyDialog />). */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cx } from "../lib/format";
import { useT } from "../lib/i18n";
import { CloseContext, ModalContext, useCloseModal } from "./modalContext";
import { Button, Icon, IconButton } from "./ui";

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
/** `sec` gives the dialog a section colour (e.g. sec="memories" for "Upload a new memory"). */
export function Dialog({ title, sub, wide, sec, footer, children }) {
  const t = useT();
  const close = useCloseModal();
  const closeRef = useRef(close);
  useLayoutEffect(() => { closeRef.current = close; });
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const close = () => closeRef.current();
    const prev = document.activeElement;
    const dlg = ref.current;
    // First field, else the main footer action, else the Close button: focus always lands inside the dialog.
    const first = dlg.querySelector("input:not([type=file]), select, textarea") || dlg.querySelector("footer button:last-child") || dlg.querySelector("button");
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
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} data-sec={sec}
        className={cx("max-h-[calc(100vh-32px)] w-full animate-pop overflow-auto rounded-card border-t-6 border-sec bg-surface shadow-pop", wide ? "max-w-180" : "max-w-140")}>
        <header className="flex items-start justify-between gap-3 px-5.5 pt-5">
          <div>
            <h2 id={titleId}>{title}</h2>
            {sub && <p className="mt-2 text-small text-muted">{sub}</p>}
          </div>
          <IconButton icon="close" label={t("common.closeDialog")} onClick={close} />
        </header>
        <div className="grid gap-3.5 px-5.5 py-4.5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2.5 px-5.5 pb-5">{footer}</footer>}
      </div>
    </div>
  );
}

/** Standard Cancel button for dialog footers. */
export function CancelButton({ children }) {
  const t = useT();
  const close = useCloseModal();
  return <Button variant="soft" onClick={close}>{children ?? t("common.cancel")}</Button>;
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm }) {
  const close = useCloseModal();
  return (
    <Dialog title={title} footer={<><CancelButton /><Button variant="danger" onClick={() => { onConfirm(); close(); }}>{confirmLabel}</Button></>}>
      <p>{message}</p>
    </Dialog>
  );
}

/** Footer note for forms that autosave: "Draft restored … Start over" or "Draft saved 10:42". */
export function DraftNote({ draft }) {
  const t = useT();
  const { restored, savedAt, discard } = draft;
  if (!savedAt) return <span className="mr-auto self-center text-xsmall text-muted"><Icon name="cloud_sync" size="xs" /> {t("draft.auto")}</span>;
  const time = new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <span role="status" className="mr-auto flex flex-wrap items-center gap-1.5 self-center text-xsmall text-muted">
      <Icon name={restored ? "restore" : "cloud_done"} size="xs" className="text-sec-ink" />
      {restored ? t("draft.restored", { time }) : t("draft.saved", { time })}
      <button type="button" onClick={discard} className="cursor-pointer rounded border-0 bg-transparent px-1 font-semibold text-sec-ink hover-fill">{t("draft.startOver")}</button>
    </span>
  );
}
