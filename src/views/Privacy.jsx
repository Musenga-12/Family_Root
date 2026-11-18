/* Privacy & Consent: who can see each kind of information, protections for minors, consent records, an access log, and your own data. */
import { useState } from "react";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Avatar, Button, Card, Chip, Chips, Field, Icon, IconBox, Input, PageHeader, Record, Switch, Tabs, Tag } from "../components/ui";
import { ME } from "../data";
import { fmtDate, fmtWhen, todayISO } from "../lib/format";
import { rich, useT } from "../lib/i18n";
import { age, fullName, useStore } from "../lib/store";

const LEVELS = [["All Family Branches", "pv.level.all"], ["Immediate Family", "pv.level.immediate"], ["Only Me (draft)", "pv.level.me"]];
// Names and help text are pv.cat.<key> and pv.cat.<key>Help.
const CATEGORIES = [["memories", "photo_library"], ["stories", "mic"], ["contact", "call"], ["birthdays", "cake"], ["location", "location_on"]];
const STATUS = { given: ["mint", "check_circle"], pending: ["gold", "pending"], withdrawn: ["rose", "block"] };
const GRACE_DAYS = 30;

function DeleteDialog({ onConfirm }) {
  const close = useCloseModal();
  const t = useT();
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toUpperCase() === "DELETE";
  return (
    <Dialog title={t("pv.del.title")} sub={t("pv.del.sub", { n: GRACE_DAYS })}
      footer={<><CancelButton>{t("pv.del.keep")}</CancelButton><Button variant="danger" icon="delete_forever" disabled={!ok} onClick={() => { onConfirm(); close(); }}>{t("pv.del.request")}</Button></>}>
      <ul className="m-0 grid gap-1.5 pl-5 text-small">
        <li>{t("pv.del.l1")}</li>
        <li>{t("pv.del.l2")}</li>
        <li>{t("pv.del.l3")}</li>
      </ul>
      <Field id="delType" label={<>{rich(t("pv.del.type"))}</>} help={t("pv.del.typeHelp")}>
        <Input id="delType" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
    </Dialog>
  );
}

export default function Privacy() {
  const { state, person, update, prefs, setPref } = useStore();
  const { open } = useModal();
  const toast = useToast();
  const t = useT();
  const pv = state.privacy;
  const [filter, setFilter] = useState("all");
  const minors = state.people.filter((p) => !p.died && age(p) < 18);
  const consents = state.consents.filter((c) => filter === "all" || c.status === filter);

  const label = (v) => { const k = LEVELS.find(([x]) => x === v)?.[1]; return k ? t(k) : v; };
  const onOff = (v) => t(v ? "pv.on" : "pv.off");
  const setCategory = (key, v) => {
    const name = t(`pv.cat.${key}`);
    update((s) => { s.privacy.categories[key] = v; }, t("pv.historyCategory", { name, level: label(v).toLowerCase() }));
    toast(t("pv.toastCategory", { name, level: label(v) }), { icon: "shield_lock", duration: 2500 });
  };
  const setMinor = (id, key, v) => update((s) => { s.privacy.minors[id] = { ...(s.privacy.minors[id] || {}), [key]: v }; },
    t(key === "hide" ? "pv.historyHide" : "pv.historyGuardian", { name: person(id).first, state: onOff(v) }));
  const setMine = (key, v, text) => update((s) => { s.privacy.mine[key] = v; }, t("pv.historyMine", { setting: text, state: onOff(v) }));
  const remind = (c) => {
    update((s) => { s.consents.find((x) => x.id === c.id).date = todayISO(); }, t("pv.historyRemind", { name: person(c.person).first }));
    toast(t("pv.reminded", { name: person(c.person).first }), { sub: c.item, icon: "notifications_active" });
  };

  const download = () => {
    const mine = {
      exported: new Date().toISOString(), profile: person(ME),
      memories: state.memories.filter((m) => m.owner === ME || m.tagged.includes(ME)),
      stories: state.stories.filter((s) => s.by === ME),
      messages: state.threads.map((th) => ({ conversation: th.title, messages: th.messages.filter((m) => m.by === ME) })).filter((x) => x.messages.length),
      records: state.records.filter((r) => r.custodian === ME), privacy: pv, consents: state.consents,
    };
    const blob = new Blob([JSON.stringify(mine, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "my-familyroots-data.json" });
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t("pv.downloading"), { sub: t("pv.downloadingSub", { file: "my-familyroots-data.json" }), icon: "download" });
  };
  const requestDeletion = () => {
    update((s) => { s.privacy.deletion = { requested: todayISO() }; }, t("pv.historyDelete"));
    toast(t("pv.deleteRequested"), { sub: t("pv.deleteRequestedSub", { n: GRACE_DAYS }), icon: "schedule", persist: true });
  };
  const cancelDeletion = () => {
    update((s) => { s.privacy.deletion = null; }, t("pv.historyCancel"));
    toast(t("pv.deleteCancelled"), { sub: t("pv.deleteCancelledSub"), icon: "check_circle" });
  };
  // Local date arithmetic (not UTC), so the closing day never shifts by one.
  const closesOn = pv.deletion && (() => {
    const d = new Date(`${pv.deletion.requested}T00:00`);
    d.setDate(d.getDate() + GRACE_DAYS);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const cousinSees = CATEGORIES.filter(([k]) => pv.categories[k] === "All Family Branches");

  return (
    <>
      {pv.deletion && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-rose/40 bg-rose-100 p-4 text-rose">
          <Icon name="schedule" />
          <p className="min-w-0 flex-1 basis-60">{rich(t("pv.scheduled", { date: fmtDate(closesOn) }))}</p>
          <Button variant="primary" icon="undo" onClick={cancelDeletion}>{t("pv.cancelDeletion")}</Button>
        </div>
      )}
      <PageHeader icon="verified_user" eyebrow={t("pv.eyebrow")} title={t("nav.privacy")} description={t("pv.sub")} aside={
        <Card className="w-full max-w-85 p-4!" aria-labelledby="cousinH">
          <h2 id="cousinH" className="flex items-center gap-2 text-base!"><Icon name="visibility" size="sm" /> {t("pv.cousin")}</h2>
          <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-small">
            {CATEGORIES.map(([k]) => {
              const yes = cousinSees.some(([c]) => c === k);
              return <li key={k} className="flex items-center gap-2"><Icon name={yes ? "check" : "visibility_off"} size="xs" className={yes ? "text-sec-ink" : "text-faint"} /><span className={yes ? "" : "text-muted line-through"}>{t(`pv.cat.${k}`)}</span><span className="sr-only">{t(yes ? "pv.visible" : "pv.hidden")}</span></li>;
            })}
          </ul>
        </Card>} />

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-5 [&>*]:min-w-0 lg:grid-cols-2">
        <Card aria-labelledby="visH" className="grid gap-4">
          <h2 id="visH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="shield_lock" /> {t("pv.whoSees")}</h2>
          {CATEGORIES.map(([k, icon]) => (
            <div key={k} className="grid gap-2 border-t border-line pt-3.5 first-of-type:border-0 first-of-type:pt-0">
              <div className="flex items-start gap-2.5"><Icon name={icon} className="text-sec-ink" /><div><strong className="block text-[.9rem]">{t(`pv.cat.${k}`)}</strong><span className="text-xsmall text-muted">{t(`pv.cat.${k}Help`)}</span></div></div>
              <Tabs role="radiogroup" label={t("pv.whoSeesIt", { name: t(`pv.cat.${k}`) })} value={pv.categories[k]} onChange={(v) => setCategory(k, v)} className="grid! grid-cols-3"
                items={LEVELS.map(([v, l]) => [v, t(l)])} itemClassName="text-xsmall! px-2!" />
            </div>
          ))}
          <p className="text-xsmall text-muted">{rich(t("pv.newUploads", { level: label(prefs.visibility) }))}{" "}
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-sec-ink underline"
              onClick={() => { setPref("visibility", pv.categories.memories); toast(t("pv.defaultUpdated"), { sub: t("pv.defaultUpdatedSub", { level: label(pv.categories.memories) }), icon: "check_circle", duration: 2500 }); }}>
              {t("pv.matchPhotos")}
            </button>
          </p>
        </Card>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 [&>*]:min-w-0">
          <Card aria-labelledby="minH" className="grid gap-4">
            <h2 id="minH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="child_care" /> {t("pv.minors")}</h2>
            {minors.map((p) => {
              const m = pv.minors[p.id] || {};
              return (
                <div key={p.id} className="grid gap-3 rounded-2xl bg-surface-2 p-3.5">
                  <div className="flex items-center gap-2.5"><Avatar p={p} /><div><strong>{fullName(p)}</strong><p className="text-xsmall text-muted">{t("pv.minorAge", { age: age(p), names: p.parents.map((id) => person(id)?.first).join(" & ") })}</p></div></div>
                  <Switch id={`mh-${p.id}`} checked={!!m.hide} onChange={(v) => setMinor(p.id, "hide", v)} label={t("pv.hide")} help={t("pv.hideHelp")} />
                  <Switch id={`mg-${p.id}`} checked={!!m.guardian} onChange={(v) => setMinor(p.id, "guardian", v)} label={t("pv.guardian")} help={t("pv.guardianHelp")} />
                </div>
              );
            })}
          </Card>
          <Card aria-labelledby="mineH" className="grid gap-4">
            <h2 id="mineH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="person" /> {t("pv.mine")}</h2>
            {["tagging", "voice", "books", "age"].map((k) => (
              <Switch key={k} id={`my-${k}`} checked={!!pv.mine[k]} onChange={(v) => setMine(k, v, t(`pv.mine.${k}`))} label={t(`pv.mine.${k}`)} help={t(`pv.mine.${k}Help`)} />
            ))}
          </Card>
        </div>

        <Card aria-labelledby="conH" className="grid gap-3">
          <h2 id="conH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="handshake" /> {t("pv.consents")}</h2>
          <p className="text-small text-muted">{t("pv.consentsSub")}</p>
          <Chips role="group" aria-label={t("pv.filterStatus")}>
            <Chip pressed={filter === "all"} count={state.consents.length} onClick={() => setFilter("all")}>{t("common.all")}</Chip>
            {Object.entries(STATUS).map(([k, [, icon]]) => (
              <Chip key={k} icon={icon} pressed={filter === k} count={state.consents.filter((c) => c.status === k).length} onClick={() => setFilter(k)}>{t(`pv.statusShort.${k}`)}</Chip>
            ))}
          </Chips>
          <ul className="m-0 grid list-none gap-2 p-0">
            {consents.map((c) => {
              const [tone, icon] = STATUS[c.status];
              const p = person(c.person);
              return (
                <li key={c.id}>
                  <Record className="flex-wrap">
                    <Avatar p={p} />
                    <div className="min-w-0 flex-1 basis-45">
                      <strong className="text-small">{c.item}</strong>
                      <p className="text-xsmall text-muted">{t(`ckind.${c.kind}`)} · {p?.first}{c.guardian ? t("pv.guardianOf", { name: person(c.guardian)?.first }) : ""} · {fmtDate(c.date)}</p>
                    </div>
                    <Tag tone={tone} icon={icon}>{t(`pv.status.${c.status}`)}</Tag>
                    {c.status === "pending" && <Button size="sm" icon="notifications_active" onClick={() => remind(c)}>{t("pv.remind")}</Button>}
                  </Record>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 [&>*]:min-w-0">
          <Card aria-labelledby="logH">
            <h2 id="logH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="manage_search" /> {t("pv.log")}</h2>
            <ol className="m-0 mt-3 grid list-none gap-2 p-0">
              {state.accessLog.map((l) => (
                <li key={l.id} className="flex items-start gap-2.5 text-small">
                  <Avatar p={person(l.who)} className="size-8! rounded-lg! text-tag!" />
                  <span><strong>{person(l.who)?.first}</strong> {l.action ? t(`pv.log.${l.action}`, { title: l.title }) : l.what}<small className="block text-xsmall text-muted">{fmtWhen(l.at)}</small></span>
                </li>
              ))}
            </ol>
          </Card>
          <Card aria-labelledby="dataH" className="grid gap-3">
            <h2 id="dataH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="database" /> {t("pv.data")}</h2>
            <p className="text-small text-muted">{t("pv.dataSub")}</p>
            <div className="flex flex-wrap gap-2.5">
              <Button icon="download" onClick={download}>{t("pv.download")}</Button>
              {pv.deletion
                ? <Button variant="primary" icon="undo" onClick={cancelDeletion}>{t("pv.cancelDeletion")}</Button>
                : <Button variant="danger" icon="delete_forever" onClick={() => open(<DeleteDialog onConfirm={requestDeletion} />)}>{t("pv.deleteAccount")}</Button>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
