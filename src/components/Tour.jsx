/* First-visit guided tour: spotlights real controls one at a time (learn by doing, not by reading a manual).
   Skippable at any step; restart from the account menu, quick search or Settings. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { Button, Icon } from "./ui";

const STEPS = [
  { icon: "waving_hand", key: "welcome" },
  { icon: "menu", key: "nav", target: "nav" },
  { icon: "search", key: "search", target: "search" },
  { icon: "text_increase", key: "easy", target: "easy" },
  { icon: "undo", key: "undo", target: "undo" },
  { icon: "add", key: "fab", target: "fab" },
  { icon: "celebration", key: "done" },
];

/** Bounding box of the step's target, or null when it is missing or hidden (e.g. the sidebar on a phone). */
function targetRect(step) {
  if (!step.target) return null;
  const el = document.querySelector(`[data-tour="${step.target}"]`);
  if (!el || el.offsetParent === null) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? r : null;
}

export default function Tour({ onClose }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const nextRef = useRef(null);
  const titleId = useId();
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  useLayoutEffect(() => {
    const measure = () => setRect(targetRect(step));
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure); };
  }, [step]);

  useEffect(() => { nextRef.current?.focus(); }, [i]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowRight") setI((x) => Math.min(STEPS.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Place the card below the target when there is room, otherwise above; centre it when there is no target.
  const pad = 8;
  const W = Math.min(340, window.innerWidth - 32);
  let pos = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (rect) {
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - W - 16));
    pos = rect.bottom + 220 < window.innerHeight
      ? { left, top: rect.bottom + pad + 10 }
      : { left, top: Math.max(16, rect.top - pad - 10), transform: "translateY(-100%)" };
  }

  return (
    <div className="fixed inset-0 z-95" data-no-print>
      {/* Spotlight: a transparent box over the target whose huge shadow dims everything else. */}
      {rect ? (
        <div aria-hidden="true" className="pointer-events-none fixed rounded-xl transition-all duration-200"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px color-mix(in oklab, var(--color-scrim) 55%, transparent), 0 0 0 3px var(--color-mint)" }} />
      ) : <div aria-hidden="true" className="fixed inset-0 bg-scrim/55" />}

      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ ...pos, width: W }}
        className="fixed animate-pop rounded-card border border-line bg-surface p-5 shadow-pop">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-[10px] bg-mint text-pine-900"><Icon name={step.icon} /></span>
          <h2 id={titleId} className="text-[1.15rem]!">{t(`tour.${step.key}.title`)}</h2>
        </div>
        <p className="mt-2.5 text-small text-muted">{t(`tour.${step.key}.body`)}</p>
        {/* Progress: where you are and how much is left. */}
        <div className="mt-4 flex items-center gap-1.5" aria-label={t("tour.progress", { i: i + 1, n: STEPS.length })} role="img">
          {STEPS.map((s, k) => <span key={s.key} className={k === i ? "h-1.5 w-5 rounded-full bg-pine-700 dark:bg-mint" : "size-1.5 rounded-full bg-surface-3"} />)}
          <span className="ml-auto text-xsmall text-muted">{i + 1} / {STEPS.length}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!last && <Button variant="ghost" size="sm" onClick={onClose}>{t("tour.skip")}</Button>}
          <span className="flex-1" />
          {i > 0 && <Button size="sm" icon="arrow_back" onClick={() => setI(i - 1)}>{t("common.back")}</Button>}
          <Button ref={nextRef} variant="primary" size="sm" icon={last ? "check" : "arrow_forward"} onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? t("tour.finish") : t("common.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
