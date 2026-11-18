/* Legacy Archive: certificates, wills, letters and sealed time capsules, each with a source, a custodian and who can see it. */
import { useState } from "react";
import { CancelButton, Dialog, DraftNote } from "../components/Modal";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Avatar, Button, Card, Check, Chip, Chips, Empty, Field, Icon, IconBox, IconButton, Input, InputIcon, PageHeader, Select, Stat, Tag, Textarea, Visibility } from "../components/ui";
import { ME } from "../data";
import { cx, fmtDate, todayISO, uid } from "../lib/format";
import { rich, useT } from "../lib/i18n";
import { canSpeak, useSpeech } from "../lib/speech";
import { fullName, useStore } from "../lib/store";
import { useDraft } from "../lib/useDraft";

const CATEGORIES = [["Certificates", "badge"], ["Wills & Legal", "gavel"], ["Letters", "mail"], ["Time capsules", "hourglass_top"]];
const CAT_ICON = Object.fromEntries(CATEGORIES);
const VIS = ["All Family Branches", "Immediate Family", "Only Me (draft)"];
const SORTS = {
  newest: ["sort.newest", (a, b) => b.date.localeCompare(a.date)],
  oldest: ["sort.oldest", (a, b) => a.date.localeCompare(b.date)],
  title: ["sort.title", (a, b) => a.title.localeCompare(b.title)],
};

/** Escape text before writing it into the print window's HTML. */
const esc = (x = "") => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const isSealed = (r) => r.sealedUntil && r.sealedUntil > todayISO();
const daysUntil = (iso) => Math.ceil((new Date(iso) - new Date(todayISO())) / 86400000);
/** "in 12 days", "in 5 months", "in 4 years": long waits in units people can picture. */
const opensIn = (iso, t) => {
  const d = daysUntil(iso);
  if (d < 60) return d === 1 ? t("lg.inDay") : t("lg.inDays", { n: d });
  if (d < 730) return t("lg.inMonths", { n: Math.round(d / 30.4) });
  return t("lg.inYears", { n: Math.round(d / 365.25) });
};

/** Status shown with an icon and words, never colour alone. */
function Status({ r }) {
  const t = useT();
  if (isSealed(r)) return <Tag tone="dark" icon="lock_clock">{t("lg.sealedUntil", { date: fmtDate(r.sealedUntil) })}</Tag>;
  if (r.status === "review") return <Tag tone="gold" icon="pending">{t("lg.awaiting")}</Tag>;
  return <Tag tone="mint" icon="verified">{t("lg.verified")}</Tag>;
}

function RecordDialog({ r }) {
  const { person, update } = useStore();
  const toast = useToast();
  const close = useCloseModal();
  const { toggle, speaking } = useSpeech();
  const t = useT();
  const sealed = isSealed(r);
  const category = t(`lgcat.${r.category}`);
  const verify = () => {
    update((s) => { s.records.find((x) => x.id === r.id).status = "verified"; }, t("lg.historyVerify", { title: r.title }));
    toast(t("lg.verifiedToast"), { sub: r.title, icon: "verified" });
    close();
  };
  const print = () => {
    // Print just this record: a clean window with the record text, so nothing else on the page is printed.
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) { toast(t("lg.popups"), { error: true, sub: t("lg.popupsSub") }); return; }
    w.document.write(`<!doctype html><title>${esc(r.title)}</title><style>body{font:16px/1.6 Georgia,serif;max-width:640px;margin:40px auto;color:#111}h1{font-size:22px}small{color:#555}</style>
      <h1>${esc(r.title)}</h1><small>${esc(category)} · ${fmtDate(r.date, r.approx)} · ${esc(t("lg.custodian"))}: ${esc(fullName(person(r.custodian)))}</small><p>${esc(r.text)}</p><small>${esc(t("lg.source"))}: ${esc(r.source)}</small>`);
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Dialog wide title={r.title} sub={`${category} · ${fmtDate(r.date, r.approx)}${r.approx ? t("lg.approxSuffix") : ""}`}
      footer={<>
        {!sealed && canSpeak && <Button icon={speaking ? "stop_circle" : "volume_up"} aria-pressed={speaking} onClick={() => toggle(`${r.title}. ${r.text}`)}>{speaking ? t("read.stop") : t("lg.readAloud")}</Button>}
        {!sealed && <Button icon="print" onClick={print}>{t("lg.print")}</Button>}
        {r.status === "review" && !sealed ? <Button variant="primary" icon="verified" onClick={verify}>{t("lg.markVerified")}</Button> : <Button variant="primary" onClick={close}>{t("common.close")}</Button>}
      </>}>
      <div className="flex flex-wrap items-center gap-2"><Status r={r} /><Visibility>{r.visibility}</Visibility></div>
      {sealed ? (
        <div className="grid justify-items-center gap-2 rounded-2xl bg-surface-2 p-6 text-center">
          <Icon name="lock_clock" className="text-[44px]! text-sec-ink" />
          <strong>{t("lg.capsuleOpens", { date: fmtDate(r.sealedUntil) })}</strong>
          <p className="text-small text-muted">{t("lg.capsuleWait", { when: opensIn(r.sealedUntil, t) })}</p>
        </div>
      ) : (
        <blockquote className="m-0 rounded-2xl border-l-4 border-sec bg-surface-2 p-4.5 font-serif text-[1.08rem] leading-[1.7]">{r.text}</blockquote>
      )}
      <dl className="m-0 grid gap-2 text-small sm:grid-cols-2">
        <div><dt className="text-xsmall font-semibold text-muted uppercase">{t("lg.source")}</dt><dd className="m-0">{r.source || t("lg.notRecorded")}</dd></div>
        <div><dt className="text-xsmall font-semibold text-muted uppercase">{t("lg.custodian")}</dt>
          <dd className="m-0 flex items-center gap-2"><Avatar p={person(r.custodian)} className="size-7! rounded-lg! text-tag!" />{fullName(person(r.custodian))}</dd></div>
      </dl>
      {r.status === "review" && <p className="flex items-start gap-2 rounded-xl bg-gold-100 p-3 text-small text-gold-ink"><Icon name="info" size="sm" /> {t("lg.reviewHint")}</p>}
    </Dialog>
  );
}

const BLANK = { title: "", category: "Certificates", date: "", approx: false, custodian: ME, source: "", text: "", visibility: "All Family Branches", seal: false, sealedUntil: "" };

function AddRecordDialog() {
  const { state, update } = useStore();
  const toast = useToast();
  const close = useCloseModal();
  const t = useT();
  const [f, setF, draft] = useDraft("record", BLANK);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const save = () => {
    const e = {
      title: f.title.trim() ? "" : t("lg.errTitle"),
      date: f.date ? "" : t("lg.errDate"),
      text: f.text.trim() ? "" : t("lg.errText"),
      sealedUntil: f.seal && !(f.sealedUntil > todayISO()) ? t("lg.errSeal") : "",
    };
    setErrors(e);
    const bad = ["title", "date", "text", "sealedUntil"].find((k) => e[k]);
    if (bad) { document.getElementById("rec-" + bad)?.focus(); return; }
    const r = {
      id: uid("r"), title: f.title.trim(), category: f.seal ? "Time capsules" : f.category, date: f.date, approx: f.approx, custodian: f.custodian,
      status: "review", visibility: f.visibility, source: f.source.trim(), text: f.text.trim(), icon: CAT_ICON[f.seal ? "Time capsules" : f.category],
      ...(f.seal ? { sealedUntil: f.sealedUntil } : {}),
    };
    update((s) => { s.records.unshift(r); }, t("lg.historyAdd", { title: r.title }));
    toast(t("lg.added"), { sub: t("lg.addedSub", { title: r.title }), icon: "library_add", action: t("common.undo"),
      onAction: () => update((s) => { s.records = s.records.filter((x) => x.id !== r.id); }, t("lg.historyRemove", { title: r.title })) });
    draft.clear();
    close();
  };

  return (
    <Dialog wide title={t("lg.dlgTitle")} sub={t("lg.dlgSub")}
      footer={<><DraftNote draft={draft} /><CancelButton /><Button variant="primary" icon="library_add" onClick={save}>{t("lg.addTo")}</Button></>}>
      <Field id="rec-title" label={t("lg.title")} hint={t("common.required")} error={errors.title}>
        <Input id="rec-title" value={f.title} onChange={set("title")} invalid={!!errors.title} placeholder={t("lg.titlePh")} />
      </Field>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field id="rec-cat" label={t("lg.type")}>
          <Select id="rec-cat" value={f.seal ? "Time capsules" : f.category} disabled={f.seal} onChange={set("category")}>
            {CATEGORIES.filter(([c]) => c !== "Time capsules").map(([c]) => <option key={c} value={c}>{t(`lgcat.${c}`)}</option>)}
            {f.seal && <option value="Time capsules">{t("lgcat.Time capsules")}</option>}
          </Select>
        </Field>
        <Field id="rec-date" label={t("lg.date")} hint={t("common.required")} error={errors.date}>
          <Input id="rec-date" type="date" value={f.date} max={todayISO()} onChange={set("date")} invalid={!!errors.date} />
          <Check className="mt-2" checked={f.approx} onChange={set("approx")}>{t("lg.approx")}</Check>
        </Field>
      </div>
      <Field id="rec-text" label={t("lg.text")} hint={t("common.required")} error={errors.text}>
        <Textarea id="rec-text" rows={4} value={f.text} onChange={set("text")} invalid={!!errors.text} placeholder={t("lg.textPh")} />
      </Field>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field id="rec-source" label={t("lg.where")} help={t("lg.whereHelp")}>
          <Input id="rec-source" value={f.source} onChange={set("source")} />
        </Field>
        <Field id="rec-cust" label={t("lg.custodian")}>
          <Select id="rec-cust" value={f.custodian} onChange={set("custodian")}>
            {state.people.filter((p) => !p.died && !p.minor).map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
          </Select>
        </Field>
      </div>
      <Field id="rec-vis" label={t("lg.who")}>
        <Select id="rec-vis" value={f.visibility} onChange={set("visibility")}>{VIS.map((v) => <option key={v} value={v}>{t(`vis.${v}`)}</option>)}</Select>
      </Field>
      <div className="grid gap-2 rounded-2xl border border-line p-3.5">
        <Check checked={f.seal} onChange={set("seal")}>{rich(t("lg.seal"))}</Check>
        {f.seal && (
          <Field id="rec-sealedUntil" label={t("lg.opensOn")} error={errors.sealedUntil}>
            <Input id="rec-sealedUntil" type="date" min={todayISO()} value={f.sealedUntil} onChange={set("sealedUntil")} invalid={!!errors.sealedUntil} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

export default function Legacy() {
  const { state, person, update } = useStore();
  const { open, confirm } = useModal();
  const toast = useToast();
  const t = useT();
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [reviewOnly, setReviewOnly] = useState(false);
  const records = state.records;

  const list = records
    .filter((r) => (cat === "all" || r.category === cat) && (!reviewOnly || r.status === "review"))
    .filter((r) => { const hay = [r.title, r.text, r.source, r.category, t(`lgcat.${r.category}`), fullName(person(r.custodian))].join(" ").toLowerCase(); return q.trim().toLowerCase().split(/\s+/).every((w) => hay.includes(w)); })
    .sort(SORTS[sort][1]);
  const review = records.filter((r) => r.status === "review").length;
  const capsules = records.filter(isSealed).length;

  const remove = (r) => confirm(t("lg.removeQ"), t("lg.removeBody", { title: r.title }), t("lg.remove"), () => {
    let index = 0;
    update((s) => { index = s.records.findIndex((x) => x.id === r.id); s.records.splice(index, 1); }, t("lg.historyRemove", { title: r.title }));
    toast(t("lg.removed"), { sub: r.title, icon: "delete", action: t("common.undo"), onAction: () => update((s) => { s.records.splice(index, 0, r); }, t("lg.historyRestore", { title: r.title })) });
  });

  return (
    <>
      <PageHeader icon="menu_book" eyebrow={t("lg.eyebrow")} title={t("nav.legacy")} description={t("lg.sub")}
        actions={<>
          <Button variant="primary" icon="library_add" onClick={() => open(<AddRecordDialog />)}>{t("lg.add")}</Button>
          {review > 0 && <Button icon="pending" onClick={() => { setReviewOnly(true); setCat("all"); }}>{review > 1 ? t("lg.reviewMany", { n: review }) : t("lg.reviewOne")}</Button>}
        </>}
        aside={<div className="flex flex-wrap gap-2.5">
          <Stat value={records.length} label={t("lg.records")} />
          <Stat value={review} label={t("lg.awaiting")} />
          <Stat value={capsules} label={t("lg.capsules")} />
        </div>} />

      <Card className="mt-4" aria-label={t("lg.filters")}>
        <div className="flex flex-wrap items-center gap-3">
          <InputIcon icon="search" className="min-w-55 flex-1">
            <label className="sr-only" htmlFor="recQ">{t("lg.search")}</label>
            <Input id="recQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("lg.searchPh")} />
          </InputIcon>
          <label htmlFor="recSort" className="text-small text-muted">{t("sort.label")}</label>
          <Select id="recSort" className="w-auto!" value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{t(label)}</option>)}
          </Select>
        </div>
        <Chips scroll className="mt-4" role="group" aria-label={t("lg.type")}>
          <Chip pressed={cat === "all"} count={records.length} onClick={() => setCat("all")}>{t("lg.all")}</Chip>
          {CATEGORIES.map(([c, icon]) => <Chip key={c} icon={icon} pressed={cat === c} count={records.filter((r) => r.category === c).length} onClick={() => setCat(c)}>{t(`lgcat.${c}`)}</Chip>)}
          <Chip icon="pending" pressed={reviewOnly} count={review} onClick={() => setReviewOnly(!reviewOnly)}>{t("lg.awaiting")}</Chip>
        </Chips>
      </Card>

      <section className="mt-5" aria-label={t("lg.records")}>
        <p className="mb-2.5 text-small text-muted" aria-live="polite">{t("common.showing", { n: list.length, total: records.length })}</p>
        {list.length ? (
          <ul className="m-0 grid list-none gap-3 p-0">
            {list.map((r) => {
              const sealed = isSealed(r);
              return (
                <li key={r.id}>
                  <article className={cx("lift flex flex-wrap items-center gap-3.5 rounded-[18px] border bg-surface p-4", r.status === "review" ? "border-gold/50" : "border-line")}>
                    <IconBox icon={sealed ? "lock_clock" : r.icon || CAT_ICON[r.category]} tone={sealed ? "dark" : r.status === "review" ? "gold" : "sec"} />
                    <div className="min-w-0 flex-1 basis-60">
                      <h2 className="text-[1.05rem]!">
                        <button type="button" onClick={() => open(<RecordDialog r={r} />)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-serif font-semibold text-ink decoration-sec decoration-2 underline-offset-4 rounded-md hover-tint hover:text-sec-ink hover:underline">{r.title}</button>
                      </h2>
                      <p className="mt-0.5 text-small text-muted">{t(`lgcat.${r.category}`)} · {fmtDate(r.date, r.approx)} · {t("lg.keptBy", { name: person(r.custodian)?.first })}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2"><Status r={r} /><Visibility>{r.visibility}</Visibility></div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" icon={sealed ? "lock_clock" : "visibility"} onClick={() => open(<RecordDialog r={r} />)}>{sealed ? t("lg.opens", { when: opensIn(r.sealedUntil, t) }) : t("lg.open")}</Button>
                      <IconButton icon="delete" label={t("lg.removeLabel", { title: r.title })} title={t("lg.remove")} onClick={() => remove(r)} />
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon="search_off" title={t("lg.none")}>
            <p className="text-small">{t("lg.noneHelp")}</p>
            <Button className="mt-4" icon="filter_alt_off" onClick={() => { setQ(""); setCat("all"); setReviewOnly(false); }}>{t("lg.clear")}</Button>
          </Empty>
        )}
      </section>
    </>
  );
}
