/* 5.6 Family Timeline and Milestones */
import { useState } from "react";
import AudioPlayer from "../components/AudioPlayer";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import {
  Avatar, Button, Card, Check, Chip, Chips, Empty, Eyebrow, Field, Hero, Icon, IconButton, Input, PeopleChecks, Photo, PhotoOverlay, Record, Select, Stat, Tabs, Tag, Textarea,
} from "../components/ui";
import { cx, dateWord, fmtDate, monthName, uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";

const TYPES = [["Births", "child_care"], ["Weddings", "favorite"], ["Journeys", "sailing"], ["Memorials", "local_florist"], ["Milestones", "celebration"]];
const ERAS = [
  { id: "era2020", from: 2020, to: 9999, badge: "20s", label: "2020s: Present Day & Legacy Matriarchy" },
  { id: "era2000", from: 2000, to: 2019, badge: "00s", label: "2000s–2010s: The Grandchildren & 4th Generation" },
  { id: "era1960", from: 1960, to: 1999, badge: "60s", label: "1960s–1990s: The New Generation" },
  { id: "era1900", from: 1900, to: 1959, badge: "1900", label: "1900s–1950s: Early Roots" },
];
const NOW = new Date().getFullYear();

function FilterRow({ label, children }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2.5 first:mt-0"><span className="min-w-20 text-xsmall text-muted">{label}</span>{children}</div>
  );
}

function Item({ t, compact }) {
  const { person } = useStore();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const details = !compact || open;
  const [y, m] = t.date.split("-");
  return (
    <li className="relative mb-4.5">
      <span className="absolute top-4.5 -left-12 grid size-7.5 place-items-center rounded-full border-2 border-sec-line bg-surface text-sec-ink sm:-left-14.5 sm:size-8.5">
        <Icon name={t.icon} className="text-[17px]!" />
      </span>
      <span className="absolute top-14 -left-16.5 hidden w-12.5 text-center text-[.62rem] font-bold tracking-[.06em] text-muted sm:block">
        {t.approx ? `${dateWord("approx")} ${y}` : monthName(+m - 1).toUpperCase()}
      </span>
      <article className={cx("grid min-w-0 gap-2.5 rounded-[18px] border border-line bg-surface p-4.5", t.approx && "border-dashed")}>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5"><Tag tone="sec" icon={t.icon}>{t.type}</Tag><Tag tone="outline">{t.place}</Tag></div>
          <time className="text-small" dateTime={t.date}>{fmtDate(t.date, t.approx)}</time>
        </div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[1.15rem]!">{t.title}</h3>
          {compact && <IconButton icon="expand_more" label={tr(open ? "view.compact" : "view.detailed")} aria-expanded={open}
            className="size-8!" iconProps={{ className: open ? "rotate-180 transition-transform" : "transition-transform" }} onClick={() => setOpen(!open)} />}
        </div>
        {details && <p className="animate-fade text-small text-muted">{t.text}</p>}
        {details && t.hasPhoto && (
          <>
            <Photo p1={t.p1} p2={t.p2} icon="groups" alt="Family members gathered at the celebration" aspect="aspect-16/8" className="max-h-70 w-full">
              <PhotoOverlay className="text-xsmall"><Icon name="photo_camera" size="xs" /> 28 Family Members in Attendance</PhotoOverlay>
            </Photo>
            <AudioPlayer id={"tl-" + t.id} duration={286} label="Grandma Mary's 80th reflection" />
          </>
        )}
        {details && <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1">{t.people.map(person).filter(Boolean).map((p) => <Avatar key={p.id} p={p} round />)}</div>
          {t.approx ? <Tag tone="rose" icon="help" title="Date is approximate">Approximate — remembered or estimated</Tag>
            : t.verified ? <Tag icon="verified">Confirmed by record{t.source ? ": " + t.source : ""}</Tag>
            : <Tag tone="outline" icon="person">Family-reported</Tag>}
        </div>}
      </article>
    </li>
  );
}

function AddMilestoneDialog() {
  const { state, update } = useStore();
  const toast = useToast();
  const close = useCloseModal();
  const [f, setF] = useState({ title: "", type: "Births", date: "", cert: "confirmed", source: "", place: "", text: "", people: [] });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = () => {
    const e = {
      title: f.title.trim() ? "" : "Please describe the milestone in a few words.",
      date: f.date ? "" : "Pick a date. If you're unsure, choose your best guess and mark it approximate.",
    };
    setErrors(e);
    if (e.title || e.date) { document.getElementById(e.title ? "msT" : "msD").focus(); return; }
    const approx = f.cert === "approx";
    const m = {
      id: uid("t"), type: f.type, icon: TYPES.find((x) => x[0] === f.type)[1], title: f.title.trim(), date: f.date, approx, verified: !approx,
      source: f.source.trim(), place: f.place.trim() || "—", text: f.text.trim(), people: f.people,
    };
    update((s) => { s.milestones.push(m); }, `Added milestone “${m.title}”`);
    toast("Milestone added to the chronicle", {
      sub: `${m.title} · ${fmtDate(m.date, m.approx)}`, icon: "event_available",
      action: "Undo", onAction: () => update((s) => { s.milestones = s.milestones.filter((x) => x.id !== m.id); }, `Removed milestone “${m.title}”`),
    });
    close();
  };

  return (
    <Dialog wide title="Add a milestone" sub="Births, weddings, journeys, achievements — anything worth remembering."
      footer={<><CancelButton /><Button variant="primary" icon="add" onClick={save}>Add to timeline</Button></>}>
      <Field id="msT" label="What happened?" hint="Required" error={errors.title}>
        <Input id="msT" value={f.title} onChange={set("title")} invalid={!!errors.title} placeholder="e.g. Grace's first school concert" />
      </Field>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field id="msType" label="Type">
          <Select id="msType" value={f.type} onChange={set("type")}>{TYPES.map(([t]) => <option key={t}>{t}</option>)}</Select>
        </Field>
        <Field id="msD" label="Date" hint="Required" error={errors.date}>
          <Input id="msD" type="date" value={f.date} onChange={set("date")} invalid={!!errors.date} />
        </Field>
      </div>
      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-small font-semibold">How sure are we about this date?</legend>
        <Check type="radio" name="cert" checked={f.cert === "confirmed"} onChange={() => setF({ ...f, cert: "confirmed" })}>Confirmed — from a certificate, register or document</Check>
        <Check type="radio" name="cert" checked={f.cert === "approx"} onChange={() => setF({ ...f, cert: "approx" })}>Approximate — remembered or estimated (shown as “c. year”)</Check>
      </fieldset>
      <Field id="msSrc" label="Source" hint="Optional">
        <Input id="msSrc" value={f.source} onChange={set("source")} placeholder="e.g. Birth certificate, parish record, Gran's diary" />
      </Field>
      <Field id="msP" label="Place"><Input id="msP" value={f.place} onChange={set("place")} placeholder="e.g. Edinburgh" /></Field>
      <Field id="msX" label="Description"><Textarea id="msX" rows={3} value={f.text} onChange={set("text")} /></Field>
      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-small font-semibold">Who was involved?</legend>
        <PeopleChecks people={state.people} value={f.people} onChange={(people) => setF({ ...f, people })} />
      </fieldset>
    </Dialog>
  );
}

export default function Timeline() {
  const { state, person } = useStore();
  const { open } = useModal();
  const toast = useToast();
  const [f, setF] = useState({ type: "all", branch: "all", certainty: "all" });
  const [order, setOrder] = useState("newest");
  const [compact, setCompact] = useState(false);
  const tr = useT();

  const ms = state.milestones;
  const n = (type) => ms.filter((t) => t.type === type).length;
  const branches = [...new Set(state.people.map((p) => p.branch))];
  const span = NOW - Math.min(...ms.map((t) => +t.date.slice(0, 4)));
  const confirmedPct = Math.round((ms.filter((t) => !t.approx).length / ms.length) * 100);

  const list = ms.filter((t) => (f.type === "all" || t.type === f.type)
    && (f.branch === "all" || t.people.some((id) => person(id)?.branch === f.branch))
    && (f.certainty === "all" || (f.certainty === "confirmed" ? !t.approx : !!t.approx)))
    .sort((a, b) => (order === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  const eras = order === "newest" ? ERAS : [...ERAS].reverse();

  const jump = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else toast("No milestones in that era with the current filters", { icon: "info" });
  };

  return (
    <>
      <Hero>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-140">
            <Tag tone="sec">LIVING CHRONICLE · 1918 — {NOW}</Tag>
            <h1 className="mt-4">{tr("h1.timeline")}</h1>
            <p className="mt-2 text-muted">Tracing our lineage through {span} years of weddings, births, voyages, achievements, and family gatherings — with confirmed records clearly separated from remembered dates.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="sr-only" htmlFor="tlBranch">Filter by branch</label>
            <Select id="tlBranch" className="w-auto!" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>
              <option value="all">Filter by Branch: All Lineages</option>
              {branches.map((b) => <option key={b} value={b}>{b} branch</option>)}
            </Select>
            <Button icon="print" onClick={() => window.print()}>Print Lineage Chronicle</Button>
            <Button variant="primary" icon="add" onClick={() => open(<AddMilestoneDialog />)}>Add Milestone</Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Stat value={ms.length} label="Total milestones" />
          <Stat value={4} label="Generations" />
          {TYPES.map(([t]) => <Stat key={t} value={n(t)} label={t} />)}
        </div>
      </Hero>

      <Card className="mt-4 p-3.5!">
        <FilterRow label="ERA JUMPS:">
          <Chips>{ERAS.map((e) => <Chip key={e.id} onClick={() => jump(e.id)}>{e.label.split(":")[0]}</Chip>)}</Chips>
        </FilterRow>
        <FilterRow label="FILTER TYPE:">
          <Chips role="group" aria-label="Milestone type">
            <Chip pressed={f.type === "all"} count={ms.length} onClick={() => setF({ ...f, type: "all" })}>All Events</Chip>
            {TYPES.map(([t, i]) => <Chip key={t} icon={i} pressed={f.type === t} count={n(t)} onClick={() => setF({ ...f, type: t })}>{t}</Chip>)}
          </Chips>
        </FilterRow>
        <FilterRow label="CERTAINTY:">
          <Chips role="group" aria-label="Date certainty">
            {[["all", "All dates"], ["confirmed", "Confirmed dates"], ["approx", "Approximate dates"]].map(([k, l]) => (
              <Chip key={k} pressed={f.certainty === k} onClick={() => setF({ ...f, certainty: k })}>{l}</Chip>
            ))}
          </Chips>
        </FilterRow>
        <FilterRow label={tr("tl.order").toUpperCase() + ":"}>
          <Tabs role="radiogroup" label={tr("tl.order")} value={order} onChange={setOrder}
            items={[["newest", <span key="n" className="inline-flex items-center gap-1"><Icon name="arrow_downward" size="xs" />{tr("sort.newest")}</span>], ["oldest", <span key="o" className="inline-flex items-center gap-1"><Icon name="arrow_upward" size="xs" />{tr("sort.oldest")}</span>]]} />
          <Tabs role="radiogroup" label="Density" value={compact ? "compact" : "detailed"} onChange={(v) => setCompact(v === "compact")}
            items={[["detailed", <span key="d" className="inline-flex items-center gap-1"><Icon name="view_agenda" size="xs" />{tr("view.detailed")}</span>], ["compact", <span key="c" className="inline-flex items-center gap-1"><Icon name="density_small" size="xs" />{tr("view.compact")}</span>]]} />
        </FilterRow>
      </Card>

      <div className="mt-5 grid items-start gap-5.5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {list.length ? (
            <div className="relative pl-13 before:absolute before:top-0 before:bottom-0 before:left-4.5 before:w-0.5 before:bg-line sm:pl-17.5 sm:before:left-6.75">
              {eras.map((e) => {
                const items = list.filter((t) => +t.date.slice(0, 4) >= e.from && +t.date.slice(0, 4) <= e.to);
                if (!items.length) return null;
                return (
                  <div key={e.id}>
                    <section id={e.id} aria-labelledby={`${e.id}-h`} className="relative mt-2 mb-4.5 scroll-mt-24">
                      <span className="absolute -top-1 -left-13 grid size-10 place-items-center rounded-[14px] bg-sec font-serif text-[.75rem] font-bold text-sec-on sm:-left-17.5 sm:size-14 sm:text-[.95rem]">
                        {e.badge}
                      </span>
                      <Eyebrow>Era chapter</Eyebrow>
                      <h2 id={`${e.id}-h`}>{e.label}</h2>
                    </section>
                    <ol className="m-0 list-none p-0">{items.map((t) => <Item key={t.id} t={t} compact={compact} />)}</ol>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon="event_busy" title="No milestones match these filters"><p className="text-small">Try “All” types or another branch.</p></Empty>
          )}
        </div>

        <aside className="grid content-start gap-3.5 lg:sticky lg:top-21">
          <Card>
            <div className="flex items-center justify-between gap-2.5"><Eyebrow>Lineage custodian</Eyebrow><Tag tone="mint">Verified Circle</Tag></div>
            <h3 className="mt-2">The Mackenzie Lineage Archive</h3>
            <p className="mt-2 text-small text-muted">Covers four generations spanning Scotland, Atlantic crossings, and {span} years of documented history.</p>
            <div className="mt-4 flex items-center gap-2.5">
              <div className="grid size-17.5 shrink-0 place-items-center rounded-full"
                style={{ background: `conic-gradient(var(--sec) 0 ${confirmedPct}%, var(--color-surface-3) 0)` }}>
                <span className="grid size-13 place-items-center rounded-full bg-surface text-[.8rem] font-bold">{confirmedPct}%</span>
              </div>
              <div>
                <strong className="text-small">Records confirmed</strong>
                <p className="text-xsmall text-muted">{ms.filter((t) => t.approx).length} approximate date(s) awaiting proof</p>
              </div>
            </div>
            <Eyebrow className="mt-4 text-muted!">Branch focus</Eyebrow>
            <div className="mt-2 grid gap-2">
              {branches.map((b) => (
                <Record key={b} className="text-small">
                  <span className="min-w-0 flex-1">{b} branch</span><Tag tone="outline">{state.people.filter((p) => p.branch === b).length}</Tag>
                </Record>
              ))}
            </div>
          </Card>
          <Card tone="dark">
            <Eyebrow className="text-mint!"><Icon name="mic" size="xs" /> Oral history spotlight</Eyebrow>
            <h3 className="mt-2">Crossing the Atlantic (1968)</h3>
            <p className="mt-2 text-small text-on-dark">Mary recalls the rolling waves of the Grand Banks and John serenading the passengers with his highland bagpipes on the sundeck.</p>
            <Button variant="mint" block to="/stories" className="mt-4">Open All Oral Recordings</Button>
          </Card>
          <Card tone="soft" className="text-small">
            <strong><Icon name="workspace_premium" size="sm" /> Chronicle Verification Seal</strong>
            <p className="mt-2 text-xsmall text-muted">Dates marked “Confirmed by record” are cross-referenced against official registers. Dashed cards are remembered or estimated dates and can be corrected by any family member.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
