/* Calendar & Gatherings: birthdays, anniversaries and family gatherings on a month grid or an agenda list. */
import { useMemo, useState } from "react";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Avatar, Button, Card, Chip, Chips, Empty, Eyebrow, Field, Hero, Icon, IconButton, Input, Tabs, Tag } from "../components/ui";
import { cx, uid } from "../lib/format";
import { localeOf, useT } from "../lib/i18n";
import { useStore } from "../lib/store";

const KINDS = { birthday: ["cake", "gold"], anniversary: ["favorite", "rose"], gathering: ["groups", "mint"] };
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** All events that fall in `year`, keyed by ISO date. Recurring ones (birthdays, anniversaries) repeat yearly. */
function eventsForYear(state, year, t) {
  const out = [];
  for (const p of state.people) {
    if (p.died || !p.born) continue;
    out.push({ id: `b-${p.id}-${year}`, kind: "birthday", date: `${year}${p.born.slice(4)}`, title: t("cal.bdayOf", { name: p.first }), person: p, sub: p.role });
  }
  for (const m of state.milestones) {
    if (m.approx || !/^\d{4}-\d\d-\d\d$/.test(m.date) || !["Weddings", "Memorials"].includes(m.type)) continue;
    const years = year - +m.date.slice(0, 4);
    if (years > 0) out.push({ id: `a-${m.id}-${year}`, kind: "anniversary", date: `${year}${m.date.slice(4)}`, title: t("cal.annivOf", { title: m.title, years }), sub: m.place });
  }
  for (const e of state.events) {
    if (e.date?.startsWith(String(year))) out.push({ ...e, kind: "gathering" });
  }
  return out;
}

function AddGatheringDialog({ initialDate }) {
  const { update } = useStore();
  const close = useCloseModal();
  const toast = useToast();
  const t = useT();
  const [f, setF] = useState({ title: "", date: initialDate, place: "" });
  const [errors, setErrors] = useState({});
  const save = () => {
    const e = { title: f.title.trim() ? "" : t("cal.titleErr"), date: f.date ? "" : t("cal.dateErr") };
    setErrors(e);
    if (e.title || e.date) return;
    update((s) => { s.events.push({ id: uid("e"), title: f.title.trim(), date: f.date, sub: f.place.trim(), attending: 1, going: true }); }, `Added event “${f.title.trim()}”`);
    toast(t("cal.added"), { sub: f.title.trim(), icon: "event_available" });
    close();
  };
  return (
    <Dialog title={t("cal.add")} footer={<><CancelButton>{t("common.cancel")}</CancelButton><Button variant="primary" onClick={save}>{t("common.save")}</Button></>}>
      <Field id="gTitle" label={t("cal.title")} error={errors.title}>
        <Input id="gTitle" value={f.title} invalid={!!errors.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("cal.titlePh")} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="gDate" label={t("cal.date")} error={errors.date}>
          <Input id="gDate" type="date" value={f.date} invalid={!!errors.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field id="gPlace" label={t("cal.place")}>
          <Input id="gPlace" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="Stirling" />
        </Field>
      </div>
    </Dialog>
  );
}

function EventRow({ e, locale, showDate }) {
  const { update } = useStore();
  const t = useT();
  const [icon, tone] = KINDS[e.kind];
  return (
    <li className="flex items-start gap-3 rounded-[14px] bg-surface-2 p-3">
      {e.person ? <Avatar p={e.person} round /> : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-sec-ink"><Icon name={icon} /></span>}
      <div className="min-w-0 flex-1">
        <strong className="block text-[.92rem]">{e.title}</strong>
        <span className="text-xsmall text-muted">
          {showDate && new Date(e.date + "T00:00").toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }) + " · "}{e.sub}
        </span>
        {e.kind === "gathering" && (
          <div className="mt-2">
            <Button size="sm" variant={e.going ? "primary" : "default"} icon={e.going ? "check_circle" : "event_available"} aria-pressed={!!e.going}
              onClick={() => update((s) => { const x = s.events.find((y) => y.id === e.id); x.going = !x.going; x.attending = (x.attending || 0) + (x.going ? 1 : -1); }, `${e.going ? "Left" : "Joined"} “${e.title}”`)}>
              {e.going ? t("cal.going") : t("cal.rsvp")} · {e.attending || 0}
            </Button>
          </div>
        )}
      </div>
      <Tag tone={tone} icon={icon}>{t(`cal.${e.kind}`)}</Tag>
    </li>
  );
}

export default function Calendar() {
  const { state, prefs } = useStore();
  const { open } = useModal();
  const t = useT();
  const locale = localeOf(prefs.lang);
  const [today] = useState(() => iso(new Date()));
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState("month");
  const [show, setShow] = useState({ birthday: true, anniversary: true, gathering: true });

  const byDate = useMemo(() => {
    const map = {};
    for (const y of [cursor.y - 1, cursor.y, cursor.y + 1]) {
      for (const e of eventsForYear(state, y, t)) if (show[e.kind]) (map[e.date] ||= []).push(e);
    }
    return map;
  }, [state, cursor.y, t, show]);

  const first = new Date(cursor.y, cursor.m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
    const d = i - offset + 1;
    return d >= 1 && d <= days ? iso(new Date(cursor.y, cursor.m, d)) : null;
  });
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" }));
  const move = (n) => setCursor(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setSelected(iso(d)); };

  const upcoming = Object.keys(byDate).filter((d) => d >= today).sort().slice(0, 30).flatMap((d) => byDate[d]);
  const counts = Object.fromEntries(Object.keys(KINDS).map((k) => [k, eventsForYear(state, cursor.y, t).filter((e) => e.kind === k).length]));

  // Arrow keys move the selected day around the grid.
  const onGridKey = (e) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const d = new Date(selected + "T00:00");
    d.setDate(d.getDate() + delta);
    const next = iso(d);
    setSelected(next);
    if (d.getMonth() !== cursor.m) setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setTimeout(() => document.querySelector(`[data-day="${next}"]`)?.focus());
  };

  return (
    <>
      <Hero className="flex flex-wrap items-center gap-6">
        <div className="min-w-65 flex-1">
          <Eyebrow icon="calendar_month">{t("cal.eyebrow")}</Eyebrow>
          <h1 className="mt-2">{t("h1.calendar")}</h1>
          <p className="mt-2 text-muted">{t("cal.sub")}</p>
        </div>
        <Button variant="primary" icon="add" onClick={() => open(<AddGatheringDialog initialDate={selected} />)}>{t("cal.add")}</Button>
      </Hero>

      <Card className="mt-4 flex flex-wrap items-center gap-3 p-3.5!">
        <Tabs label={t("cal.view")} value={view} onChange={setView} items={[["month", t("cal.month")], ["agenda", t("cal.agenda")]]} />
        <Chips role="group" aria-label={t("cal.types")}>
          {Object.entries(KINDS).map(([k, [icon]]) => (
            <Chip key={k} icon={icon} pressed={show[k]} count={counts[k]} onClick={() => setShow({ ...show, [k]: !show[k] })}>{t(`cal.${k}`)}</Chip>
          ))}
        </Chips>
      </Card>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {view === "month" ? (
          <Card className="p-4!">
            <div className="mb-3 flex items-center gap-2">
              <IconButton icon="chevron_left" label={t("common.prev")} onClick={() => move(-1)} />
              <h2 className="min-w-0 flex-1 text-center text-[1.25rem]! capitalize" aria-live="polite">
                {first.toLocaleDateString(locale, { month: "long", year: "numeric" })}
              </h2>
              <Button size="sm" onClick={goToday}>{t("common.today")}</Button>
              <IconButton icon="chevron_right" label={t("common.next")} onClick={() => move(1)} />
            </div>
            <div role="grid" aria-label={first.toLocaleDateString(locale, { month: "long", year: "numeric" })} onKeyDown={onGridKey}
              className="grid grid-cols-7 gap-1">
              {weekdays.map((w) => <div key={w} role="columnheader" className="pb-1 text-center text-[.7rem] font-semibold tracking-wider text-muted uppercase">{w}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div key={`x${i}`} />;
                const evs = byDate[d] || [];
                const sel = d === selected;
                return (
                  <button key={d} type="button" role="gridcell" data-day={d} aria-selected={sel} tabIndex={sel ? 0 : -1}
                    aria-label={`${new Date(d + "T00:00").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}${evs.length ? `, ${evs.length}` : ""}`}
                    onClick={() => setSelected(d)}
                    className={cx("relative grid min-h-16 cursor-pointer content-start justify-items-start gap-1 rounded-xl border p-1.5 text-left text-ink sm:min-h-21",
                      sel ? "border-sec bg-sec-soft ring-2 ring-sec-line" : "lift border-line bg-surface")}>
                    <span className={cx("grid size-7 place-items-center rounded-full text-small font-semibold", d === today && "bg-sec text-sec-on")}>{+d.slice(8)}</span>
                    <span className="flex flex-wrap gap-0.5">
                      {evs.slice(0, 3).map((e) => (
                        <span key={e.id} title={e.title} className={cx("hidden max-w-full truncate rounded px-1 text-[.62rem] font-semibold sm:block",
                          e.kind === "birthday" ? "bg-gold-100 text-gold-ink" : e.kind === "anniversary" ? "bg-rose-100 text-rose" : "bg-mint-200 text-pine-900")}>
                          {e.person?.first || e.title}
                        </span>
                      ))}
                      {evs.length > 0 && <span className="size-1.5 rounded-full bg-sec sm:hidden" />}
                      {evs.length > 3 && <span className="hidden text-[.62rem] text-muted sm:inline">+{evs.length - 3}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        ) : (
          <Card>
            <h2 className="text-[1.25rem]!">{t("cal.upcoming")}</h2>
            {upcoming.length ? (
              <ul className="m-0 mt-3 grid list-none gap-2 p-0">{upcoming.map((e) => <EventRow key={e.id} e={e} locale={locale} showDate />)}</ul>
            ) : <Empty icon="event_busy" className="mt-3">{t("cal.noEvents")}</Empty>}
          </Card>
        )}

        <Card as="aside" aria-live="polite" className="lg:sticky lg:top-21">
          <Eyebrow>{t("cal.selected")}</Eyebrow>
          <h2 className="mt-1 text-[1.2rem]! capitalize">{new Date(selected + "T00:00").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
          {(byDate[selected] || []).length ? (
            <ul className="m-0 mt-3 grid list-none gap-2 p-0">{byDate[selected].map((e) => <EventRow key={e.id} e={e} locale={locale} />)}</ul>
          ) : (
            <p className="mt-3 text-small text-muted">{t("cal.noEvents")}</p>
          )}
          <Button className="mt-4" block icon="add" onClick={() => open(<AddGatheringDialog initialDate={selected} />)}>{t("cal.add")}</Button>
        </Card>
      </div>
    </>
  );
}
