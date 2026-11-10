/* Privacy & Consent: who can see each kind of information, protections for minors, consent records, an access log, and your own data. */
import { useState } from "react";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Avatar, Button, Card, Chip, Chips, Eyebrow, Field, Hero, Icon, IconBox, Input, Record, Switch, Tabs, Tag } from "../components/ui";
import { ME } from "../data";
import { fmtDate, fmtWhen, todayISO } from "../lib/format";
import { useT } from "../lib/i18n";
import { age, fullName, useStore } from "../lib/store";

const LEVELS = [["All Family Branches", "Whole family"], ["Immediate Family", "Close family"], ["Only Me (draft)", "Only me"]];
const CATEGORIES = [
  ["memories", "photo_library", "Photos & memories", "Pictures and keepsakes you upload"],
  ["stories", "mic", "Stories & recordings", "Your voice recordings and written stories"],
  ["contact", "call", "Contact details", "Email address and phone number"],
  ["birthdays", "cake", "Birthday", "Shown on the calendar and birthday reminders"],
  ["location", "location_on", "Town or city", "Where you live, shown in the directory"],
];
const STATUS = {
  given: ["mint", "check_circle", "Consent given"],
  pending: ["gold", "pending", "Waiting for reply"],
  withdrawn: ["rose", "block", "Withdrawn · hidden"],
};
const GRACE_DAYS = 30;

function DeleteDialog({ onConfirm }) {
  const close = useCloseModal();
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toUpperCase() === "DELETE";
  return (
    <Dialog title="Delete your account?" sub={`Your account closes after ${GRACE_DAYS} days. Until then you can cancel and nothing is lost.`}
      footer={<><CancelButton>Keep my account</CancelButton><Button variant="danger" icon="delete_forever" disabled={!ok} onClick={() => { onConfirm(); close(); }}>Request deletion</Button></>}>
      <ul className="m-0 grid gap-1.5 pl-5 text-small">
        <li>Your profile, messages and settings will be removed.</li>
        <li>Memories and stories you added can be kept for the family, or removed. A custodian will ask you which.</li>
        <li>Download your data first if you want a copy.</li>
      </ul>
      <Field id="delType" label={<>Type <strong>DELETE</strong> to confirm</>} help="This extra step prevents deleting by accident.">
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

  const label = (v) => LEVELS.find(([k]) => k === v)?.[1] || v;
  const setCategory = (key, v) => {
    const name = CATEGORIES.find(([k]) => k === key)[2];
    update((s) => { s.privacy.categories[key] = v; }, `${name}: visible to ${label(v).toLowerCase()}`);
    toast(`${name}: ${label(v)}`, { icon: "shield_lock", duration: 2500 });
  };
  const setMinor = (id, key, v) => update((s) => { s.privacy.minors[id] = { ...(s.privacy.minors[id] || {}), [key]: v }; },
    `${person(id).first}: ${key === "hide" ? "hidden from wider family" : "guardian approval"} ${v ? "on" : "off"}`);
  const setMine = (key, v, text) => update((s) => { s.privacy.mine[key] = v; }, `${text} ${v ? "on" : "off"}`);
  const remind = (c) => {
    update((s) => { s.consents.find((x) => x.id === c.id).date = todayISO(); }, `Asked ${person(c.person).first} again for consent`);
    toast(`Reminder sent to ${person(c.person).first}`, { sub: c.item, icon: "notifications_active" });
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
    toast("Your data is downloading", { sub: "my-familyroots-data.json · readable in any text editor", icon: "download" });
  };
  const requestDeletion = () => {
    update((s) => { s.privacy.deletion = { requested: todayISO() }; }, "Requested account deletion");
    toast("Deletion requested", { sub: `Your account closes in ${GRACE_DAYS} days unless you cancel.`, icon: "schedule", persist: true });
  };
  const cancelDeletion = () => {
    update((s) => { s.privacy.deletion = null; }, "Cancelled account deletion");
    toast("Deletion cancelled", { sub: "Your account stays open.", icon: "check_circle" });
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
          <p className="min-w-0 flex-1 basis-60"><strong>Your account is scheduled to close on {fmtDate(closesOn)}.</strong> You can cancel any time before then.</p>
          <Button variant="primary" icon="undo" onClick={cancelDeletion}>Cancel deletion</Button>
        </div>
      )}
      <Hero className="flex flex-wrap items-center gap-6">
        <div className="min-w-65 flex-1">
          <Eyebrow icon="verified_user">You decide</Eyebrow>
          <h1 className="mt-2">{t("nav.privacy")}</h1>
          <p className="mt-2 max-w-160 text-muted">Choose who can see each kind of information, protect the youngest relatives, and keep a record of who agreed to be shared.</p>
        </div>
        <Card className="w-full max-w-85 p-4!" aria-labelledby="cousinH">
          <h2 id="cousinH" className="flex items-center gap-2 text-base!"><Icon name="visibility" size="sm" /> What a cousin can see</h2>
          <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-small">
            {CATEGORIES.map(([k, , name]) => {
              const yes = cousinSees.some(([c]) => c === k);
              return <li key={k} className="flex items-center gap-2"><Icon name={yes ? "check" : "visibility_off"} size="xs" className={yes ? "text-sec-ink" : "text-faint"} /><span className={yes ? "" : "text-muted line-through"}>{name}</span><span className="sr-only">{yes ? " visible" : " hidden"}</span></li>;
            })}
          </ul>
        </Card>
      </Hero>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-5 [&>*]:min-w-0 lg:grid-cols-2">
        <Card aria-labelledby="visH" className="grid gap-4">
          <h2 id="visH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="shield_lock" /> Who can see your information</h2>
          {CATEGORIES.map(([k, icon, name, help]) => (
            <div key={k} className="grid gap-2 border-t border-line pt-3.5 first-of-type:border-0 first-of-type:pt-0">
              <div className="flex items-start gap-2.5"><Icon name={icon} className="text-sec-ink" /><div><strong className="block text-[.9rem]">{name}</strong><span className="text-xsmall text-muted">{help}</span></div></div>
              <Tabs role="radiogroup" label={`${name}: who can see it`} value={pv.categories[k]} onChange={(v) => setCategory(k, v)} className="grid! grid-cols-3"
                items={LEVELS.map(([v, l]) => [v, l])} itemClassName="text-[.78rem]! px-2!" />
            </div>
          ))}
          <p className="text-xsmall text-muted">New uploads start as <strong>{label(prefs.visibility)}</strong>.{" "}
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-sec-ink underline"
              onClick={() => { setPref("visibility", pv.categories.memories); toast("Default updated", { sub: `New uploads: ${label(pv.categories.memories)}`, icon: "check_circle", duration: 2500 }); }}>
              Match the Photos setting
            </button>
          </p>
        </Card>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 [&>*]:min-w-0">
          <Card aria-labelledby="minH" className="grid gap-4">
            <h2 id="minH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="child_care" /> Relatives under 18</h2>
            {minors.map((p) => {
              const m = pv.minors[p.id] || {};
              return (
                <div key={p.id} className="grid gap-3 rounded-2xl bg-surface-2 p-3.5">
                  <div className="flex items-center gap-2.5"><Avatar p={p} /><div><strong>{fullName(p)}</strong><p className="text-xsmall text-muted">Age {age(p)} · guardians: {p.parents.map((id) => person(id)?.first).join(" & ")}</p></div></div>
                  <Switch id={`mh-${p.id}`} checked={!!m.hide} onChange={(v) => setMinor(p.id, "hide", v)} label="Only close family can see them" help="Hides photos, stories and profile from cousins and the wider family." />
                  <Switch id={`mg-${p.id}`} checked={!!m.guardian} onChange={(v) => setMinor(p.id, "guardian", v)} label="A guardian approves new tags" help="Nobody can tag them in a photo until a parent agrees." />
                </div>
              );
            })}
          </Card>
          <Card aria-labelledby="mineH" className="grid gap-4">
            <h2 id="mineH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="person" /> Your own consent</h2>
            {[["tagging", "Relatives can tag me in photos", "You'll be told each time, and can remove a tag."],
              ["voice", "My recordings can be used in family slideshows", "Only within the family archive."],
              ["books", "Include me in printed family books", "Printed copies are made only on request."],
              ["age", "Show my age on my profile", "When off, only your birthday (day and month) is shown."]].map(([k, l, h]) => (
              <Switch key={k} id={`my-${k}`} checked={!!pv.mine[k]} onChange={(v) => setMine(k, v, l)} label={l} help={h} />
            ))}
          </Card>
        </div>

        <Card aria-labelledby="conH" className="grid gap-3">
          <h2 id="conH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="handshake" /> Consent records</h2>
          <p className="text-small text-muted">Everyone pictured or recorded is asked before anything is shared. A withdrawn item is hidden automatically.</p>
          <Chips role="group" aria-label="Filter by status">
            <Chip pressed={filter === "all"} count={state.consents.length} onClick={() => setFilter("all")}>All</Chip>
            {Object.entries(STATUS).map(([k, [, icon, l]]) => (
              <Chip key={k} icon={icon} pressed={filter === k} count={state.consents.filter((c) => c.status === k).length} onClick={() => setFilter(k)}>{l.split(" ·")[0]}</Chip>
            ))}
          </Chips>
          <ul className="m-0 grid list-none gap-2 p-0">
            {consents.map((c) => {
              const [tone, icon, l] = STATUS[c.status];
              const p = person(c.person);
              return (
                <li key={c.id}>
                  <Record className="flex-wrap">
                    <Avatar p={p} />
                    <div className="min-w-0 flex-1 basis-45">
                      <strong className="text-small">{c.item}</strong>
                      <p className="text-xsmall text-muted">{c.kind} · {p?.first}{c.guardian ? ` (guardian: ${person(c.guardian)?.first})` : ""} · {fmtDate(c.date)}</p>
                    </div>
                    <Tag tone={tone} icon={icon}>{l}</Tag>
                    {c.status === "pending" && <Button size="sm" icon="notifications_active" onClick={() => remind(c)}>Remind</Button>}
                  </Record>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 [&>*]:min-w-0">
          <Card aria-labelledby="logH">
            <h2 id="logH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="manage_search" /> Who looked at your things</h2>
            <ol className="m-0 mt-3 grid list-none gap-2 p-0">
              {state.accessLog.map((l) => (
                <li key={l.id} className="flex items-start gap-2.5 text-small">
                  <Avatar p={person(l.who)} className="size-8! rounded-lg! text-[.66rem]!" />
                  <span><strong>{person(l.who)?.first}</strong> {l.what}<small className="block text-xsmall text-muted">{fmtWhen(l.at)}</small></span>
                </li>
              ))}
            </ol>
          </Card>
          <Card aria-labelledby="dataH" className="grid gap-3">
            <h2 id="dataH" className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon="database" /> Your data</h2>
            <p className="text-small text-muted">Download everything about you in a readable file, or close your account.</p>
            <div className="flex flex-wrap gap-2.5">
              <Button icon="download" onClick={download}>Download my data</Button>
              {pv.deletion
                ? <Button variant="primary" icon="undo" onClick={cancelDeletion}>Cancel deletion</Button>
                : <Button variant="danger" icon="delete_forever" onClick={() => open(<DeleteDialog onConfirm={requestDeletion} />)}>Delete my account…</Button>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
