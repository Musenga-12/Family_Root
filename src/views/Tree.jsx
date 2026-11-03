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
import { ROMAN, cx, fmtDate, fmtDur } from "../lib/format";
import { useT } from "../lib/i18n";
import { age, fullName, useStore, year } from "../lib/store";

const GEN_LABEL = { 1: "Great-Grand Elders", 2: "Grandparents", 3: "Children & Partners", 4: "The Grandchildren" };

const lifeLine = (p) => (p.died
  ? `${year(p.born)} – ${year(p.died)} (Aged ${age(p)})`
  : `b. ${p.bornApprox ? "c. " : ""}${year(p.born)} (Age ${age(p)})`);

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
  const { relationToMe } = useStore();
  const life = lifeLine(p);
  const tag = p.id === ME ? <Tag tone="mint" icon="check_circle">You • Matriarch</Tag>
    : p.died ? <Tag tone="gold" icon="local_florist">In Loving Memory</Tag>
    : selected ? <Tag tone="dark">Selected</Tag> : null;
  return (
    <button type="button" data-node={p.id} data-dim={dim || undefined} aria-pressed={selected} onClick={() => onSelect(p.id)}
      aria-label={`${fullName(p)}, ${relationToMe(p)}, ${life}`}
      className={cx(
        "relative flex w-full min-w-45 cursor-pointer items-center gap-2.5 rounded-[14px] border-2 px-3 py-2.5 text-left hover:border-pine-600",
        p.died ? "border-[#ead49f] bg-[#fffcf5] dark:border-gold/50 dark:bg-gold-100" : "border-[#b7e4cf] bg-surface dark:border-mint-200",
        selected && "border-pine-800! shadow-[0_0_0_3px_var(--color-mint)]",
        dim && "opacity-30",
      )}>
      {tag && <span className="absolute -top-2.5 left-3">{tag}</span>}
      <Avatar p={p} />
      <span className="min-w-0 flex-1">
        <strong className="block font-serif text-[.98rem]">{fullName(p)}</strong>
        <small className="block text-xsmall text-muted">{life}</small>
        <small className="block text-xsmall text-muted">{p.role} • {p.occupation}</small>
      </span>
    </button>
  );
}

function Canvas({ genFilter, selected, onSelect, isDim }) {
  const { state, person, children } = useStore();
  const gens = [...new Set(state.people.map((p) => p.gen))].sort();
  const node = (p) => <PNode key={p.id} p={p} selected={p.id === selected} dim={isDim(p)} onSelect={onSelect} />;

  return (
    <>
      {gens.filter((g) => genFilter === "all" || +genFilter === g).map((g) => (
        <div key={g}>
          <div className="my-5.5 mb-3.5 flex items-center gap-3 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
            <span className="rounded-full bg-mint-100 px-3 py-1 text-tag font-bold tracking-[.12em] text-pine-700 uppercase">
              Generation {ROMAN[g]} • {GEN_LABEL[g] || ""}
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
                      m. {a.married}<br />{years} Golden Years
                    </div>
                    {node(b)}
                  </div>
                );
              }
              const hl = h.some((m) => m.id === selected);
              const kids = children(a.id).length;
              return (
                <div key={a.id} className={cx("relative grid min-w-47.5 content-start gap-2.5 rounded-2xl p-3", hl ? "bg-mint-100 outline-2 outline-mint" : "bg-surface-2")}>
                  <span className="text-[.64rem] font-bold tracking-widest text-muted uppercase">
                    {a.parents.length ? `${a.first}'s household` : a.role}{a.pending && " • unconfirmed"}
                  </span>
                  {node(a)}
                  {b && (
                    <>
                      <span className="flex items-center gap-1 pl-1.5 text-[.7rem] text-muted"><Icon name="favorite" size="xs" /> Partner • m. {b.married || a.married}</span>
                      {node(b)}
                    </>
                  )}
                  {g < 4 && a.parents.length > 0 && !kids && <Tag tone="outline" className="justify-self-center">No children listed yet</Tag>}
                  {kids > 0 && <div className="mx-auto my-1.5 h-6.5 w-0.5 bg-pine-700" />}
                  {a.pending && <div className="mx-auto my-1.5 h-6.5 w-0.5 bg-[repeating-linear-gradient(var(--color-pine-700)_0_4px,transparent_4px_8px)]" />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <Empty icon="eco" className="mx-auto mt-7 max-w-65"><p className="text-small">Future branch expansions</p></Empty>
    </>
  );
}

function Pedigree({ onSelect, isDim }) {
  const { state, person, children, relationToMe } = useStore();
  const item = (p) => {
    const sp = p.spouse && person(p.spouse);
    const kids = children(p.id);
    return (
      <li key={p.id}>
        <button type="button" data-node={p.id} data-dim={isDim(p) || undefined} onClick={() => onSelect(p.id)}
          className={cx("flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left hover:border-pine-600", isDim(p) && "opacity-30")}>
          <Avatar p={p} />
          <span className="min-w-0 flex-1">
            <strong>{fullName(p)}</strong>{" "}
            <span className="text-small text-muted">{relationToMe(p)} • {year(p.born)}{p.died && "–" + year(p.died)}</span>
            {sp && <><br /><span className="text-small text-muted">Partner: {fullName(sp)}</span></>}
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
      <p className="mb-3 text-small text-muted">Accessible pedigree list — each relative is listed under their parents. Use Tab to move between people and Enter to open a profile.</p>
      <ul className="m-0 grid list-none gap-1 p-0">{roots.map(item)}</ul>
    </>
  );
}

function SuggestEditDialog({ p }) {
  const toast = useToast();
  const close = useCloseModal();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const send = () => {
    if (!value.trim()) { setInvalid(true); document.getElementById("sv").focus(); toast("Add the suggested correction", { error: true }); return; }
    toast("Suggestion sent to custodian", { sub: "Sarah Mackenzie will review it. Nothing changes until it's approved.", icon: "fact_check" });
    close();
  };
  return (
    <Dialog title="Suggest a lineage or fact edit" sub={`About ${fullName(p)}. A family custodian reviews every change before it's published.`}
      footer={<><CancelButton /><Button variant="primary" onClick={send}>Send for review</Button></>}>
      <Field id="sf" label="What should change?">
        <Select id="sf">{["Birth date", "Birth place", "Relationship", "Occupation", "Other"].map((o) => <option key={o}>{o}</option>)}</Select>
      </Field>
      <Field id="sv" label="Suggested correction">
        <Input id="sv" value={value} onChange={(e) => setValue(e.target.value)} invalid={invalid} placeholder="e.g. Born 15 Nov 1975, not 14 Nov" />
      </Field>
      <Field id="ss" label="Source" hint="Optional" help="Sources help others tell confirmed facts from remembered ones.">
        <Input id="ss" placeholder="e.g. Birth certificate, family bible, Gran's memory" />
      </Field>
    </Dialog>
  );
}

function ReviewProofsDialog({ p }) {
  const { update } = useStore();
  const toast = useToast();
  const close = useCloseModal();
  const setPending = (v) => update((s) => { s.people.find((x) => x.id === p.id).pending = v; });
  const confirm = () => {
    setPending(false);
    toast("Branch link confirmed", { sub: `${fullName(p)} is now part of the verified tree.`, action: "Undo", onAction: () => setPending(true) });
    close();
  };
  return (
    <Dialog title="Review pending proofs" sub={`${fullName(p)} • ${p.role}`}
      footer={<><CancelButton>Keep pending</CancelButton><Button variant="primary" onClick={confirm}>Confirm branch link</Button></>}>
      <Record><Icon name="description" /><div className="min-w-0 flex-1"><strong>Aberdeen parish baptism register</strong><p className="text-xsmall text-muted">Lists “Robt. Dunbar”, baptised spring 1918</p></div></Record>
      <Record><Icon name="description" /><div className="min-w-0 flex-1"><strong>1921 Scotland census extract</strong><p className="text-xsmall text-muted">Age recorded as 3 — consistent with c. 1918</p></div></Record>
      <p className="text-small text-muted">Confirming keeps the year as approximate (“c. 1918”) but links Robert into the Dunbar branch for everyone.</p>
    </Dialog>
  );
}

function Profile({ id, onClose }) {
  const { state, person, children, relationToMe } = useStore();
  const { open } = useModal();
  const p = person(id);
  if (!p) {
    return <Empty icon="person_search" title="Select a relative"><p className="text-small">Choose anyone on the canvas to see their lineage profile.</p></Empty>;
  }
  const parents = p.parents.map(person).filter(Boolean);
  const siblings = state.people.filter((x) => x.id !== p.id && x.parents.length && x.parents.some((pp) => p.parents.includes(pp)));
  const kids = children(p.id);
  const sp = p.spouse && person(p.spouse);
  const mems = state.memories.filter((m) => m.tagged.includes(p.id));
  const story = state.stories.find((s) => s.by === p.id && s.kind === "audio");
  const names = (arr) => arr.map((x, i) => <span key={x.id}>{i > 0 && ", "}<strong>{x.first}</strong></span>);

  return (
    <>
      <div className="flex items-center justify-between"><Eyebrow icon="badge">Lineage Profile</Eyebrow><IconButton icon="close" label="Close profile" onClick={onClose} /></div>
      <div className="mt-4 grid justify-items-center gap-1.5 text-center">
        <Avatar p={p} size="xl" />
        <Tag tone="mint">Generation {ROMAN[p.gen]}</Tag>
        <h2>{fullName(p)}</h2>
        <p className="text-small text-muted">{p.occupation} • {p.died ? `${fmtDate(p.born, p.bornApprox)} – ${fmtDate(p.died)}` : `Born ${fmtDate(p.born, p.bornApprox)}`}</p>
        {p.verified ? <Tag icon="verified">Birth Record Verified</Tag>
          : (p.pending || p.bornApprox) && <Tag tone="rose" icon="help">Approximate date — awaiting proof</Tag>}
      </div>
      <div className="mt-4 rounded-[14px] bg-mint-100 p-3.5 text-[.84rem]">
        <Eyebrow>Kinship relationship</Eyebrow>
        <p className="mt-2">
          {p.id === ME ? <>This is <strong>you</strong>.</> : <>{p.first} is your <strong>{relationToMe(p).toLowerCase()}</strong>.</>}
          {parents.length > 0 && <> Child of {names(parents)}.</>}
          {siblings.length > 0 && <> Sibling of {names(siblings)}.</>}
          {sp && <> Partner of {names([sp])}.</>}
          {kids.length > 0 && <> Parent of {names(kids)}.</>}
        </p>
      </div>
      <Eyebrow className="mt-4 text-muted!">Archival records • {mems.length + (p.verified ? 1 : 0)} items</Eyebrow>
      <div className="mt-2 grid gap-2">
        {p.verified && (
          <Record icon="description">
            <div className="min-w-0 flex-1"><strong>Scottish General Register</strong><p className="text-xsmall text-muted">Civil Birth Entry #{year(p.born)}-408</p></div>
            <Icon name="verified" size="sm" />
          </Record>
        )}
        <Record as={Link} to={`/memories?person=${p.id}`} icon="photo_camera">
          <div className="min-w-0 flex-1"><strong>{mems.length} Linked Keepsakes</strong><p className="text-xsmall text-muted">Photos, letters & documents</p></div>
          <Icon name="chevron_right" size="sm" />
        </Record>
      </div>
      {story && (
        <Card tone="dark" className="mt-4 p-4!">
          <div className="flex items-center justify-between text-xsmall">
            <Eyebrow className="text-mint!"><Icon name="mic" size="xs" /> Oral history clip</Eyebrow><span>{fmtDur(story.duration)} mins</span>
          </div>
          <h3 className="mt-2 font-sans">“{story.title}”</h3>
          <p className="text-xsmall text-on-dark">Recorded {fmtDate(story.recorded)}</p>
          <div className="mt-2"><AudioPlayer id={story.id} duration={story.duration} label={story.title} dark /></div>
        </Card>
      )}
      <Record className="mt-4 text-small">
        <Icon name="shield" size="sm" />
        <span>{p.minor ? "Protected minor: profile details are visible to parents and verified guardians only."
          : <>Contact information &amp; home address are shared only with verified <strong>Immediate Mackenzie Family</strong>.</>}</span>
      </Record>
      <div className="mt-4 grid gap-2">
        {!p.died && <Button variant="primary" block icon="chat" onClick={() => open(<MessageDialog person={p} placeholder="Write something kind…" />)}>Send Private Message to {p.first}</Button>}
        <Button variant="soft" block icon="edit_note" onClick={() => open(<SuggestEditDialog p={p} />)}>Suggest Lineage or Fact Edit</Button>
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
  const { state, person } = useStore();
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
          <Eyebrow icon="park">Lineage Canvas <Tag tone="outline">Branch: Mackenzie-Dunbar</Tag></Eyebrow>
          <h1 className="mt-2">{t("h1.tree")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button aria-pressed={listMode} icon={listMode ? "account_tree" : "list"} onClick={() => setListMode(!listMode)}>
            {listMode ? "Switch to Visual Canvas" : "Switch to Accessible Pedigree List"} <span className="text-xsmall text-muted">(Alt+L)</span>
          </Button>
          <Button variant="primary" icon="person_add" onClick={() => open(<AddPersonDialog />)}>Add Family Member</Button>
        </div>
      </div>

      <div role="toolbar" aria-label="Tree controls" className="mt-4.5 flex flex-wrap items-center gap-2.5 rounded-[14px] border border-line bg-surface p-2.5">
        <Chips role="group" aria-label="Filter by generation">
          <Chip pressed={genFilter === "all"} onClick={() => setGenFilter("all")}>All Generations ({gens.length} Tiers)</Chip>
          {gens.map((g) => <Chip key={g} pressed={genFilter === String(g)} onClick={() => setGenFilter(String(g))}>Gen {ROMAN[g]}</Chip>)}
        </Chips>
        <InputIcon icon="person_search" className="min-w-45 flex-1">
          <label className="sr-only" htmlFor="findRel">Find relative in tree</label>
          <Input id="findRel" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find relative in tree…" />
        </InputIcon>
        <Button variant="mint" size="sm" icon="my_location" onClick={centerMe}>Center on Me</Button>
        <IconButton icon="zoom_in" label="Zoom in" onClick={() => changeZoom(zoom + 0.1)} />
        <IconButton icon="zoom_out" label="Zoom out" onClick={() => changeZoom(zoom - 0.1)} />
        <IconButton icon="fit_screen" label="Reset zoom" onClick={() => changeZoom(1)} />
        <IconButton icon={full ? "fullscreen_exit" : "fullscreen"} label={t(full ? "tree.exitFullscreen" : "tree.fullscreen")} title={t(full ? "tree.exitFullscreen" : "tree.fullscreen")}
          disabled={listMode} onClick={toggleFull} />
        <label htmlFor="treeHl" className="flex items-center gap-1.5 text-small text-muted"><Icon name="highlight" size="sm" />{t("tree.colorBy")}</label>
        <Select id="treeHl" className="w-auto! py-1.5! text-small" value={highlight} onChange={(e) => setHighlight(e.target.value)}>
          {["none", "living", "memorial", "mackenzie", "miller"].map((k) => <option key={k} value={k}>{t(`tree.hl.${k}`)}</option>)}
        </Select>
      </div>

      <div aria-label="Legend" className="mt-2.5 flex flex-wrap items-center gap-x-4.5 gap-y-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[.76rem] text-muted">
        <strong className="text-xsmall">LEGEND:</strong>
        <span><i className="mr-1.5 inline-block size-3 rounded-full border-2 border-pine-600 align-middle" />Living Relative (emerald border)</span>
        <span><i className="mr-1.5 inline-block size-3 rounded-full border-2 border-gold align-middle" />In Loving Memory (gold border + flower icon)</span>
        <span><i className="mr-1.5 inline-block w-4.5 border-t-2 border-ink align-middle" />Direct biological line</span>
        <span><i className="mr-1.5 inline-block w-4.5 border-t-2 border-dashed border-ink align-middle" />Unconfirmed / pending proof</span>
      </div>

      <div className="mt-4.5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden p-0!" aria-label={listMode ? "Pedigree list" : "Family tree canvas"}>
          {listMode ? (
            <div className="p-5.5"><Pedigree onSelect={select} isDim={isDim} /></div>
          ) : (
            <div ref={fullRef} className="bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xsmall text-muted"><span><Icon name="pan_tool" size="xs" /> Drag or scroll the canvas freely • Use zoom buttons to resize</span>
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
        <Card tone="soft" aria-label="Pending discovery" className="mt-7 flex flex-wrap items-center gap-2.5">
          <IconBox icon="menu_book" />
          <div className="min-w-0 flex-1">
            <h3>Unconfirmed Branch Discovery Pending</h3>
            <p className="text-small text-muted">{pending.role} {fullName(pending)} • {pending.note}</p>
          </div>
          <Button onClick={() => open(<ReviewProofsDialog p={pending} />)}>Review Pending Proofs</Button>
        </Card>
      )}
    </>
  );
}
