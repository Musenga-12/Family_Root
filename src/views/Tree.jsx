/* 5.2 Interactive Family Tree */
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AudioPlayer from "../components/AudioPlayer";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import {
  Avatar, Button, Card, Chip, Chips, Empty, Eyebrow, Field, Icon, IconBox, IconButton, Input, InputIcon, Record, Select, Tag,
} from "../components/ui";
import { ME } from "../data";
import AddPersonDialog from "../dialogs/AddPersonDialog";
import MessageDialog from "../dialogs/MessageDialog";
import { ROMAN, cx, dateWord, fmtDate, fmtDur } from "../lib/format";
import { rich, useT } from "../lib/i18n";
import { age, fullName, useStore, year } from "../lib/store";

const lifeLine = (p, t) => (p.died
  ? t("tree.lifeDied", { from: year(p.born), to: year(p.died), age: age(p) })
  : t("tree.lifeBorn", { year: `${p.bornApprox ? dateWord("approx") + " " : ""}${year(p.born)}`, age: age(p) }));

/** "<b>John</b>, <b>Mary</b>" for the kinship sentences (rendered bold by rich()). */
const boldNames = (arr) => arr.map((x) => `<b>${x.first}</b>`).join(", ");

/** Group a generation into households: a blood relative plus their partner. */
function households(people, person, gen) {
  const inGen = people.filter((p) => p.gen === gen);
  const used = new Set(), out = [];
  inGen.forEach((p) => {
    if (used.has(p.id)) return;
    const spouse = p.spouse && person(p.spouse);
    // Prefer the blood relative as the household "anchor".
    if (spouse && !p.parents.length && spouse.parents.length && !used.has(spouse.id)) return;
    used.add(p.id);
    const members = [p];
    if (spouse && spouse.gen === gen && !used.has(spouse.id)) { used.add(spouse.id); members.push(spouse); }
    out.push(members);
  });
  // Late-arriving partners that were skipped above
  inGen.forEach((p) => { if (!used.has(p.id)) { used.add(p.id); out.push([p]); } });
  return out;
}

function PNode({ p, selected, dim, onSelect }) {
  const { relationToMe, kin } = useStore();
  const t = useT();
  const life = lifeLine(p, t);
  const tag = p.id === ME ? <Tag tone="sec" icon="check_circle">{t("tree.youTag", { role: kin(p.role) })}</Tag>
    : p.died ? <Tag tone="gold" icon="local_florist">{t("tree.memory")}</Tag>
    : selected ? <Tag tone="dark">{t("tree.selected")}</Tag> : null;
  return (
    <button type="button" data-node={p.id} data-dim={dim || undefined} aria-pressed={selected} onClick={() => onSelect(p.id)}
      aria-label={`${fullName(p)}, ${relationToMe(p)}, ${life}`}
      className={cx(
        "lift relative flex w-full min-w-45 cursor-pointer items-center gap-2.5 rounded-[14px] border-2 px-3 py-2.5 text-left",
        p.died ? "border-[#ead49f] bg-[#fffcf5] dark:border-gold/50 dark:bg-gold-100" : "border-[#b7e4cf] bg-surface dark:border-mint-200",
        selected && "border-sec! shadow-[0_0_0_3px_var(--sec-line)]",
        dim && "opacity-30",
      )}>
      {tag && <span className="absolute -top-2.5 left-3">{tag}</span>}
      <Avatar p={p} />
      <span className="min-w-0 flex-1">
        <strong className="block font-serif text-[.98rem]">{fullName(p)}</strong>
        <small className="block text-xsmall text-muted">{life}</small>
        <small className="block text-xsmall text-muted">{kin(p.role)} • {p.occupation}</small>
      </span>
    </button>
  );
}

function Canvas({ genFilter, selected, onSelect, isDim }) {
  const { state, person, children, kin } = useStore();
  const t = useT();
  const gens = [...new Set(state.people.map((p) => p.gen))].sort();
  const node = (p) => <PNode key={p.id} p={p} selected={p.id === selected} dim={isDim(p)} onSelect={onSelect} />;

  return (
    <>
      {gens.filter((g) => genFilter === "all" || +genFilter === g).map((g) => (
        <div key={g}>
          <div className="my-5.5 mb-3.5 flex items-center gap-3 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
            <span className="rounded-full bg-sec-soft px-3 py-1 text-tag font-bold tracking-[.12em] text-sec-ink uppercase ring-1 ring-sec-line ring-inset">
              {t("tree.generation", { n: ROMAN[g] })}{t(`tree.gen.${g}`) !== `tree.gen.${g}` && ` • ${t(`tree.gen.${g}`)}`}
            </span>
          </div>
          <div className="flex flex-nowrap justify-center gap-4.5">
            {households(state.people, person, g).map((h) => {
              const [a, b] = h;
              if (b && !a.parents.length && !b.parents.length) {
                const years = (a.died ? +year(a.died) : new Date().getFullYear()) - a.married;
                return (
                  <div key={a.id} className="flex items-center gap-3.5">
                    {node(a)}
                    <div className="flex flex-col items-center justify-center gap-1 text-center text-[.7rem] text-gold">
                      <span className="grid size-8.5 place-items-center rounded-full bg-gold-100"><Icon name="favorite" size="sm" /></span>
                      {rich(t("tree.golden", { year: a.married, n: years }).replace("<br>", " "))}
                    </div>
                    {node(b)}
                  </div>
                );
              }
              const hl = h.some((m) => m.id === selected);
              const kids = children(a.id).length;
              return (
                <div key={a.id} className={cx("relative grid min-w-47.5 content-start gap-2.5 rounded-2xl p-3", hl ? "bg-sec-soft outline-2 outline-sec" : "bg-surface-2")}>
                  <span className="text-[.64rem] font-bold tracking-widest text-muted uppercase">
                    {a.parents.length ? t("tree.household", { name: a.first }) : kin(a.role)}{a.pending && ` • ${t("tree.unconfirmed")}`}
                  </span>
                  {node(a)}
                  {b && (
                    <>
                      <span className="flex items-center gap-1 pl-1.5 text-[.7rem] text-muted"><Icon name="favorite" size="xs" /> {t("tree.partnerSince", { year: b.married || a.married })}</span>
                      {node(b)}
                    </>
                  )}
                  {g < 4 && a.parents.length > 0 && !kids && <Tag tone="outline" className="justify-self-center">{t("tree.noChildren")}</Tag>}
                  {kids > 0 && <div className="mx-auto my-1.5 h-6.5 w-0.5 bg-sec" />}
                  {a.pending && <div className="mx-auto my-1.5 h-6.5 w-0.5 bg-[repeating-linear-gradient(var(--sec)_0_4px,transparent_4px_8px)]" />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <Empty icon="eco" className="mx-auto mt-7 max-w-65"><p className="text-small">{t("tree.future")}</p></Empty>
    </>
  );
}

function Pedigree({ onSelect, isDim }) {
  const { state, person, children, relationToMe } = useStore();
  const t = useT();
  const item = (p) => {
    const sp = p.spouse && person(p.spouse);
    const kids = children(p.id);
    return (
      <li key={p.id}>
        <button type="button" data-node={p.id} data-dim={isDim(p) || undefined} onClick={() => onSelect(p.id)}
          className={cx("lift flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left", isDim(p) && "opacity-30")}>
          <Avatar p={p} />
          <span className="min-w-0 flex-1">
            <strong>{fullName(p)}</strong>{" "}
            <span className="text-small text-muted">{relationToMe(p)} • {year(p.born)}{p.died && "–" + year(p.died)}</span>
            {sp && <><br /><span className="text-small text-muted">{t("tree.partner", { name: fullName(sp) })}</span></>}
          </span>
        </button>
        {kids.length > 0 && (
          <ul className="my-1 grid list-none gap-1 border-l-2 border-line pl-5.5">{kids.map(item)}</ul>
        )}
      </li>
    );
  };
  const roots = state.people.filter((p) => {
    if (p.parents.length || p.gen > 2) return false;
    const sp = p.spouse && person(p.spouse);
    return !(sp && sp.id < p.id && !sp.parents.length && sp.gen === p.gen);
  });
  return (
    <>
      <p className="mb-3 text-small text-muted">{t("tree.listHelp")}</p>
      <ul className="m-0 grid list-none gap-1 p-0">{roots.map(item)}</ul>
    </>
  );
}

function SuggestEditDialog({ p }) {
  const t = useT();
  const toast = useToast();
  const close = useCloseModal();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const send = () => {
    if (!value.trim()) { setInvalid(true); document.getElementById("sv").focus(); toast(t("tree.sug.err"), { error: true }); return; }
    toast(t("tree.sug.sent"), { sub: t("tree.sug.sentSub"), icon: "fact_check" });
    close();
  };
  return (
    <Dialog title={t("tree.sug.title")} sub={t("tree.sug.sub", { name: fullName(p) })}
      footer={<><CancelButton /><Button variant="primary" onClick={send}>{t("tree.sug.send")}</Button></>}>
      <Field id="sf" label={t("tree.sug.what")}>
        <Select id="sf">{["Birth date", "Birth place", "Relationship", "Occupation", "Other"].map((o) => <option key={o} value={o}>{t(`tree.sug.${o}`)}</option>)}</Select>
      </Field>
      <Field id="sv" label={t("tree.sug.correction")}>
        <Input id="sv" value={value} onChange={(e) => setValue(e.target.value)} invalid={invalid} placeholder={t("tree.sug.correctionPh")} />
      </Field>
      <Field id="ss" label={t("tree.sug.source")} hint={t("common.optional")} help={t("tree.sug.sourceHelp")}>
        <Input id="ss" placeholder={t("tree.sug.sourcePh")} />
      </Field>
    </Dialog>
  );
}

function ReviewProofsDialog({ p }) {
  const { update, kin } = useStore();
  const t = useT();
  const toast = useToast();
  const close = useCloseModal();
  const setPending = (v) => update((s) => { s.people.find((x) => x.id === p.id).pending = v; }, t(v ? "tree.proof.reopened" : "tree.proof.verified", { name: p.first }));
  const confirm = () => {
    setPending(false);
    toast(t("tree.proof.confirmed"), { sub: t("tree.proof.confirmedSub", { name: fullName(p) }), action: t("common.undo"), onAction: () => setPending(true) });
    close();
  };
  return (
    <Dialog title={t("tree.proof.title")} sub={`${fullName(p)} • ${kin(p.role)}`}
      footer={<><CancelButton>{t("tree.proof.keep")}</CancelButton><Button variant="primary" onClick={confirm}>{t("tree.proof.confirm")}</Button></>}>
      <Record><Icon name="description" /><div className="min-w-0 flex-1"><strong>{t("tree.proof.doc1")}</strong><p className="text-xsmall text-muted">{t("tree.proof.doc1Sub")}</p></div></Record>
      <Record><Icon name="description" /><div className="min-w-0 flex-1"><strong>{t("tree.proof.doc2")}</strong><p className="text-xsmall text-muted">{t("tree.proof.doc2Sub")}</p></div></Record>
      <p className="text-small text-muted">{t("tree.proof.note")}</p>
    </Dialog>
  );
}

function Profile({ id, onClose }) {
  const { state, person, children, relationToMe } = useStore();
  const t = useT();
  const { open } = useModal();
  const p = person(id);
  if (!p) {
    return <Empty icon="person_search" title={t("tree.select")}><p className="text-small">{t("tree.selectHelp")}</p></Empty>;
  }
  const parents = p.parents.map(person).filter(Boolean);
  const siblings = state.people.filter((x) => x.id !== p.id && x.parents.length && x.parents.some((pp) => p.parents.includes(pp)));
  const kids = children(p.id);
  const sp = p.spouse && person(p.spouse);
  const mems = state.memories.filter((m) => m.tagged.includes(p.id));
  const story = state.stories.find((s) => s.by === p.id && s.kind === "audio");

  return (
    <>
      <div className="flex items-center justify-between"><Eyebrow icon="badge">{t("tree.profile")}</Eyebrow><IconButton icon="close" label={t("tree.closeProfile")} onClick={onClose} /></div>
      <div className="mt-4 grid justify-items-center gap-1.5 text-center">
        <Avatar p={p} size="xl" />
        <Tag tone="sec">{t("tree.generation", { n: ROMAN[p.gen] })}</Tag>
        <h2>{fullName(p)}</h2>
        <p className="text-small text-muted">{p.occupation} • {p.died ? `${fmtDate(p.born, p.bornApprox)} – ${fmtDate(p.died)}` : t("tree.born", { date: fmtDate(p.born, p.bornApprox) })}</p>
        {p.verified ? <Tag icon="verified">{t("tree.verifiedTag")}</Tag>
          : (p.pending || p.bornApprox) && <Tag tone="rose" icon="help">{t("tree.approxTag")}</Tag>}
      </div>
      <div className="mt-4 rounded-[14px] bg-sec-soft p-3.5 text-[.84rem]">
        <Eyebrow>{t("tree.kinship")}</Eyebrow>
        <p className="mt-2">
          {rich([
            p.id === ME ? t("tree.isYou") : t("tree.isYour", { name: p.first, rel: relationToMe(p).toLowerCase() }),
            parents.length > 0 && t("tree.childOf", { names: boldNames(parents) }),
            siblings.length > 0 && t("tree.siblingOf", { names: boldNames(siblings) }),
            sp && t("tree.partnerOf", { names: boldNames([sp]) }),
            kids.length > 0 && t("tree.parentOf", { names: boldNames(kids) }),
          ].filter(Boolean).join(""))}
        </p>
      </div>
      <Eyebrow className="mt-4 text-muted!">{t("tree.records", { n: mems.length + (p.verified ? 1 : 0) })}</Eyebrow>
      <div className="mt-2 grid gap-2">
        {p.verified && (
          <Record icon="description">
            <div className="min-w-0 flex-1"><strong>{t("tree.register")}</strong><p className="text-xsmall text-muted">{t("tree.registerEntry", { n: `${year(p.born)}-408` })}</p></div>
            <Icon name="verified" size="sm" />
          </Record>
        )}
        <Record as={Link} to={`/memories?person=${p.id}`} icon="photo_camera">
          <div className="min-w-0 flex-1"><strong>{t("tree.linked", { n: mems.length })}</strong><p className="text-xsmall text-muted">{t("tree.linkedSub")}</p></div>
          <Icon name="chevron_right" size="sm" />
        </Record>
      </div>
      {story && (
        <Card tone="dark" className="mt-4 p-4!">
          <div className="flex items-center justify-between text-xsmall">
            <Eyebrow className="text-mint!"><Icon name="mic" size="xs" /> {t("tree.clip")}</Eyebrow><span>{t("tree.mins", { d: fmtDur(story.duration) })}</span>
          </div>
          <h3 className="mt-2 font-sans">“{story.title}”</h3>
          <p className="text-xsmall text-on-dark">{t("tree.recorded", { date: fmtDate(story.recorded) })}</p>
          <div className="mt-2"><AudioPlayer id={story.id} duration={story.duration} label={story.title} dark /></div>
        </Card>
      )}
      <Record className="mt-4 text-small">
        <Icon name="shield" size="sm" />
        <span>{p.minor ? t("tree.minor") : rich(t("tree.contact"))}</span>
      </Record>
      <div className="mt-4 grid gap-2">
        {!p.died && <Button variant="primary" block icon="chat" onClick={() => open(<MessageDialog person={p} placeholder={t("tree.msgPh")} />)}>{t("tree.msgBtn", { name: p.first })}</Button>}
        <Button variant="soft" block icon="edit_note" onClick={() => open(<SuggestEditDialog p={p} />)}>{t("tree.suggestBtn")}</Button>
      </div>
    </>
  );
}

/** Drag-to-pan for a scrollable element; suppresses the click that ends a drag. */
function useDragPan(ref, enabled) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let sx, sy, sl, st, down = false, moved = false;
    const onDown = (e) => { if (e.button) return; down = true; moved = false; sx = e.clientX; sy = e.clientY; sl = el.scrollLeft; st = el.scrollTop; };
    const onMove = (e) => {
      if (!down) return;
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 5) { moved = true; setDragging(true); }
      el.scrollLeft = sl - (e.clientX - sx); el.scrollTop = st - (e.clientY - sy);
    };
    const onUp = () => { down = false; setDragging(false); };
    const onClick = (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, [ref, enabled]);
  return dragging;
}

export default function Tree() {
  const { state, person, kin } = useStore();
  const { open } = useModal();
  const [params] = useSearchParams();
  const fromLink = params.get("person");
  const [selected, setSelected] = useState(() => (fromLink && person(fromLink) ? fromLink : "michael"));
  const [genFilter, setGenFilter] = useState("all");
  const [zoom, setZoom] = useState(1);
  const [listMode, setListMode] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState("none");
  const [full, setFull] = useState(false);
  const fullRef = useRef(null);
  const t = useT();
  const canvasRef = useRef(null);
  const profileRef = useRef(null);
  const dragging = useDragPan(canvasRef, !listMode);

  const gens = [...new Set(state.people.map((p) => p.gen))].sort();
  const pending = state.people.find((p) => p.pending);
  const q = query.trim().toLowerCase();
  const HL = { living: (p) => !p.died, memorial: (p) => !!p.died, mackenzie: (p) => p.branch === "Mackenzie", miller: (p) => p.branch === "Miller" };
  const isDim = (p) => (!!q && !(fullName(p).toLowerCase().includes(q) || p.role.toLowerCase().includes(q) || p.city.toLowerCase().includes(q)))
    || (highlight !== "none" && !HL[highlight](p));

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === fullRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : fullRef.current?.requestFullscreen?.());

  const scrollToNode = (id, opts) => document.querySelector(`[data-node="${id}"]`)?.scrollIntoView({ behavior: "smooth", ...opts });

  const select = (id) => {
    setSelected(id);
    if (window.innerWidth < 1200) profileRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  const changeZoom = (z) => setZoom(Math.min(1.6, Math.max(0.5, Math.round(z * 10) / 10)));
  const centerMe = () => {
    setGenFilter("all");
    setSelected(ME);
    setTimeout(() => {
      scrollToNode(ME, { block: "center", inline: "center" });
      document.querySelector(`[data-node="${ME}"]`)?.focus({ preventScroll: true });
    });
  };

  // Alt+L toggles between the visual canvas and the accessible list.
  useEffect(() => {
    const onKey = (e) => { if (e.altKey && e.key.toLowerCase() === "l") { e.preventDefault(); setListMode((m) => !m); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Arriving from a link (?person=…): bring that relative into view.
  useEffect(() => {
    if (fromLink) document.querySelector(`[data-node="${fromLink}"]`)?.scrollIntoView({ block: "center", inline: "center" });
  }, [fromLink]);

  // Searching: scroll to the first match.
  useEffect(() => {
    if (!q) return;
    const first = document.querySelector("[data-node]:not([data-dim])");
    first?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [q]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <Eyebrow icon="park">{t("tree.canvas")} <Tag tone="outline">{t("tree.branch")}</Tag></Eyebrow>
          <h1 className="mt-2">{t("h1.tree")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button aria-pressed={listMode} icon={listMode ? "account_tree" : "list"} onClick={() => setListMode(!listMode)}>
            {listMode ? t("tree.toCanvas") : t("tree.toList")} <span className="text-xsmall text-muted">(Alt+L)</span>
          </Button>
          <Button variant="primary" icon="person_add" onClick={() => open(<AddPersonDialog />)}>{t("tree.add")}</Button>
        </div>
      </div>

      <div role="toolbar" aria-label={t("tree.controls")} className="mt-4.5 flex flex-wrap items-center gap-2.5 rounded-[14px] border border-line bg-surface p-2.5">
        <Chips role="group" aria-label={t("tree.filterGen")}>
          <Chip pressed={genFilter === "all"} onClick={() => setGenFilter("all")}>{t("tree.allGens", { n: gens.length })}</Chip>
          {gens.map((g) => <Chip key={g} pressed={genFilter === String(g)} onClick={() => setGenFilter(String(g))}>{t("tree.genShort", { n: ROMAN[g] })}</Chip>)}
        </Chips>
        <InputIcon icon="person_search" className="min-w-45 flex-1">
          <label className="sr-only" htmlFor="findRel">{t("tree.find")}</label>
          <Input id="findRel" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("tree.findPh")} />
        </InputIcon>
        <Button variant="tint" size="sm" icon="my_location" onClick={centerMe}>{t("tree.centerMe")}</Button>
        <IconButton icon="zoom_in" label={t("tree.zoomIn")} onClick={() => changeZoom(zoom + 0.1)} />
        <IconButton icon="zoom_out" label={t("tree.zoomOut")} onClick={() => changeZoom(zoom - 0.1)} />
        <IconButton icon="fit_screen" label={t("tree.zoomReset")} onClick={() => changeZoom(1)} />
        <IconButton icon={full ? "fullscreen_exit" : "fullscreen"} label={t(full ? "tree.exitFullscreen" : "tree.fullscreen")} title={t(full ? "tree.exitFullscreen" : "tree.fullscreen")}
          disabled={listMode} onClick={toggleFull} />
        <label htmlFor="treeHl" className="flex items-center gap-1.5 text-small text-muted"><Icon name="highlight" size="sm" />{t("tree.colorBy")}</label>
        <Select id="treeHl" className="w-auto! py-1.5! text-small" value={highlight} onChange={(e) => setHighlight(e.target.value)}>
          {["none", "living", "memorial", "mackenzie", "miller"].map((k) => <option key={k} value={k}>{t(`tree.hl.${k}`)}</option>)}
        </Select>
      </div>

      <div aria-label={t("tree.legend")} className="mt-2.5 flex flex-wrap items-center gap-x-4.5 gap-y-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[.76rem] text-muted">
        <strong className="text-xsmall">{t("tree.legendTitle")}</strong>
        <span><i className="mr-1.5 inline-block size-3 rounded-full border-2 border-pine-600 align-middle" />{t("tree.legendLiving")}</span>
        <span><i className="mr-1.5 inline-block size-3 rounded-full border-2 border-gold align-middle" />{t("tree.legendMemory")}</span>
        <span><i className="mr-1.5 inline-block w-4.5 border-t-2 border-ink align-middle" />{t("tree.legendLine")}</span>
        <span><i className="mr-1.5 inline-block w-4.5 border-t-2 border-dashed border-ink align-middle" />{t("tree.legendPending")}</span>
      </div>

      <div className="mt-4.5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden p-0!" aria-label={listMode ? t("tree.listLabel") : t("tree.canvasLabel")}>
          {listMode ? (
            <div className="p-5.5"><Pedigree onSelect={select} isDim={isDim} /></div>
          ) : (
            <div ref={fullRef} className="bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xsmall text-muted"><span><Icon name="pan_tool" size="xs" /> {t("tree.dragHint")}</span>
                {full && <Button size="sm" icon="fullscreen_exit" onClick={toggleFull}>{t("tree.exitFullscreen")}</Button>}
              </div>
              <div ref={canvasRef} className={cx("relative overflow-auto bg-surface", full ? "h-[calc(100vh-45px)]" : "h-180", dragging ? "cursor-grabbing select-none" : "cursor-grab")}>
                <div className="min-w-190 origin-top-left p-6.5" style={{ zoom }}>
                  <Canvas genFilter={genFilter} selected={selected} onSelect={select} isDim={isDim} />
                </div>
              </div>
            </div>
          )}
        </Card>
        <Card as="aside" aria-live="polite" className="lg:sticky lg:top-21">
          <div ref={profileRef}><Profile id={selected} onClose={() => setSelected(null)} /></div>
        </Card>
      </div>

      {pending && (
        <Card tone="soft" aria-label={t("tree.pendingLabel")} className="mt-7 flex flex-wrap items-center gap-2.5">
          <IconBox icon="menu_book" />
          <div className="min-w-0 flex-1">
            <h3>{t("tree.pendingTitle")}</h3>
            <p className="text-small text-muted">{kin(pending.role)} {fullName(pending)} • {pending.note}</p>
          </div>
          <Button onClick={() => open(<ReviewProofsDialog p={pending} />)}>{t("tree.reviewProofs")}</Button>
        </Card>
      )}
    </>
  );
}
