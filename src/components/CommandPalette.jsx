/* Quick search (Ctrl/⌘ + K): jump to any page, relative, memory or story, or run a common action.
   With an empty query it lists recently visited places first (recognition over recall). */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cx } from "../lib/format";
import { useT } from "../lib/i18n";
import { NAV } from "../lib/nav";
import { fullName, useStore } from "../lib/store";
import { Icon } from "./ui";

export default function CommandPalette({ onClose, actions }) {
  const { state, recent, addRecent, clearRecent } = useStore();
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const match = (...s) => !ql || s.join(" ").toLowerCase().includes(ql);
    const go = (to) => () => navigate(to);
    // Opening a relative, memory or story also remembers it under "Recent".
    const remember = (x) => ({ ...x, run: () => { addRecent({ id: x.id, label: x.label, sub: x.sub, icon: x.icon, to: x.to }); navigate(x.to); } });
    const pages = NAV.flatMap((g) => g.items)
      .map(([id, label, icon]) => ({ id: "p-" + id, label: t(`nav.${id}`), sub: label, icon, sec: id, run: go(`/${id}`) }))
      .filter((x) => match(x.label, x.sub));
    const acts = actions.map((a) => ({ ...a, id: "a-" + a.key })).filter((x) => match(x.label));
    if (!ql) {
      const rec = recent.map((r) => ({ ...r, id: "recent-" + r.id, label: r.page ? t(`nav.${r.page}`) : r.label, sec: r.page, sub: r.page ? t("palette.page") : r.sub, run: go(r.to) }));
      return [[t("palette.recent"), rec], [t("palette.pages"), pages], [t("palette.actions"), acts]];
    }
    const people = state.people.filter((p) => match(fullName(p), p.role, p.city))
      .map((p) => remember({ id: "r-" + p.id, label: fullName(p), sub: `${p.role} · ${p.city}`, icon: p.died ? "local_florist" : "person", to: `/tree?person=${p.id}` }));
    const mems = state.memories.filter((m) => match(m.title, m.place, m.caption))
      .map((m) => remember({ id: "m-" + m.id, label: m.title, sub: m.place, icon: "photo_library", to: `/memories?q=${encodeURIComponent(m.title)}` }));
    const stories = state.stories.filter((s) => match(s.title, s.excerpt))
      .map((s) => remember({ id: "s-" + s.id, label: s.title, sub: s.category, icon: s.kind === "audio" ? "graphic_eq" : "edit_note", to: `/stories?q=${encodeURIComponent(s.title)}` }));
    return [[t("palette.pages"), pages], [t("palette.people"), people], [t("palette.memories"), mems], [t("palette.stories"), stories], [t("palette.actions"), acts]]
      .map(([g, items]) => [g, items.slice(0, 6)]);
  }, [q, state, t, navigate, actions, recent, addRecent]);

  const flat = groups.flatMap(([, items]) => items);
  const current = Math.min(active, Math.max(0, flat.length - 1));

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const run = (item) => { onClose(); item?.run(); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((current + 1) % Math.max(1, flat.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((current - 1 + flat.length) % Math.max(1, flat.length)); }
    else if (e.key === "Enter") { e.preventDefault(); run(flat[current]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  let index = -1;
  return (
    <div className="fixed inset-0 z-85 grid animate-fade place-items-start justify-center bg-scrim/45 px-4 pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("palette.title")}
        className="w-full max-w-155 animate-pop overflow-hidden rounded-card border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Icon name="search" className="text-muted" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey}
            role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={flat[current]?.id}
            aria-label={t("palette.placeholder")} placeholder={t("palette.placeholder")}
            className="w-full border-0 bg-transparent py-4 text-[1rem] text-ink outline-0" />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 text-xsmall text-muted">Esc</kbd>
        </div>
        <div ref={listRef} id={listId} role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {flat.length === 0 && <p className="px-3 py-8 text-center text-small text-muted">{t("palette.empty", { q })}</p>}
          {groups.map(([g, items]) => items.length > 0 && (
            <div key={g} role="group" aria-label={g}>
              <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1 text-tag font-semibold tracking-[.12em] text-muted uppercase">
                {g}
                {g === t("palette.recent") && (
                  <button type="button" onClick={() => { clearRecent(); inputRef.current?.focus(); }}
                    className="cursor-pointer rounded border-0 bg-transparent px-1 text-tag font-semibold tracking-normal text-sec-ink normal-case hover-fill">
                    {t("common.clear")}
                  </button>
                )}
              </div>
              {items.map((item) => {
                index++;
                const i = index;
                return (
                  <div key={item.id} id={item.id} role="option" aria-selected={i === current} data-index={i}
                    onMouseMove={() => setActive(i)} onClick={() => run(item)}
                    className={cx("flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2", i === current && "bg-sec-hover ring-1 ring-sec-hover-line ring-inset")}>
                    <span data-sec={item.sec} className={cx("grid size-8 shrink-0 place-items-center rounded-lg", i === current ? "bg-sec text-sec-on ring-2 ring-sec-on" : "bg-sec-soft text-sec-ink")}>
                      <Icon name={item.icon} size="sm" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[.9rem]">{item.label}</span>
                      {item.sub && item.sub !== item.label && <span className="block truncate text-xsmall text-muted">{item.sub}</span>}
                    </span>
                    {i === current && <Icon name="keyboard_return" size="sm" className="text-muted" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="border-t border-line px-4 py-2 text-xsmall text-muted">{t("palette.hint")}</div>
      </div>
    </div>
  );
}
