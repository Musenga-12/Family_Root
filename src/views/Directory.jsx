/* 5.3 Family Directory and Kinship Roster */
import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import {
  Avatar, Button, Card, Chip, Chips, Empty, Eyebrow, Hero, Icon, IconBox, IconButton, Input, InputIcon, Photo, Record, SectionTitle, Select, Stat, Tabs, Tag,
} from "../components/ui";
import { ME } from "../data";
import InviteDialog from "../dialogs/InviteDialog";
import MessageDialog from "../dialogs/MessageDialog";
import { THIS_YEAR, cx, fmtDate } from "../lib/format";
import { useT } from "../lib/i18n";
import { age, daysToBirthday, fullName, initials, useStore, year } from "../lib/store";

const SORTS = {
  generation: (a, b) => a.gen - b.gen || a.born.localeCompare(b.born),
  nameAZ: (a, b) => fullName(a).localeCompare(fullName(b)),
  nameZA: (a, b) => fullName(b).localeCompare(fullName(a)),
  birthday: (a, b) => (a.died ? 999 : daysToBirthday(a)) - (b.died ? 999 : daysToBirthday(b)),
  oldestPerson: (a, b) => a.born.localeCompare(b.born),
  youngestPerson: (a, b) => b.born.localeCompare(a.born),
};

const ALL = { branch: "all", status: "all", gen: "all" };

function PersonCard({ p, selected, list, onOpen }) {
  const { children, relationToMe, update, kin } = useStore();
  const t = useT();
  const toggleFav = () => update((s) => { const x = s.people.find((y) => y.id === p.id); x.fav = !x.fav; }, t(p.fav ? "dir.unstarred" : "dir.starred", { name: p.first }));
  const { open } = useModal();
  const navigate = useNavigate();
  const kids = children(p.id);
  const days = !p.died && daysToBirthday(p);
  const status = p.id === ME ? <Tag tone="sec">{t("dir.youTag", { role: kin(p.role).toUpperCase() })}</Tag>
    : p.died ? <Tag tone="gold" icon="local_florist">{t("dir.memoriam")}</Tag>
    : p.pending ? <Tag tone="rose">{t("dir.proofs")}</Tag>
    : days <= 14 ? <Tag tone="gold" icon="cake">{t("dir.days", { n: days })}</Tag>
    : <Tag>{kin(p.role).toUpperCase()}</Tag>;
  const life = p.died ? `${year(p.born)} – ${year(p.died)}` : t("dir.life", { year: year(p.born), age: age(p) });
  const primary = p.died ? <Button wrap variant="soft" size="sm" icon="play_circle" onClick={() => navigate("/stories")}>{t("dir.listen")}</Button>
    : p.id === ME ? <Button wrap variant="soft" size="sm" icon="badge" to={`/tree?person=${p.id}`}>{t("dir.profile")}</Button>
    : p.minor ? <Button wrap variant="soft" size="sm" icon="folder_shared" onClick={() => onOpen(p.id)}>{t("dir.folio")}</Button>
    : <Button wrap variant="primary" size="sm" icon="chat"
        onClick={() => open(<MessageDialog person={p} title={t("dir.msgTitle", { name: p.first })} sub={t("dir.msgSub")} label={t("dir.msgLabel")} sendLabel={t("dir.send")} />)}>
        {t("dir.message")}
      </Button>;

  return (
    <article aria-label={fullName(p)}
      className={cx(
        "relative grid content-start gap-2.5 overflow-hidden rounded-[18px] border bg-surface p-4.5 transition-[border-color,box-shadow] hover:border-sec-edge hover:shadow-card",
        list ? "grid-cols-[auto_minmax(0,1fr)] items-center sm:grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)]",
        selected ? "border-sec shadow-[0_0_0_3px_var(--sec-line)]" : "border-line",
      )}>
      <div className={cx("grid justify-items-end gap-1 text-right", list ? "col-start-2 row-start-1 justify-items-start text-left sm:col-start-3 sm:justify-items-end" : "absolute top-4 right-4")}>
        {status}<span className="text-xsmall text-muted">{t("dir.generation", { n: p.gen })}</span>
      </div>
      <Avatar p={p} size="lg" />
      <div>
        <h3 className="text-[1.1rem]!">{fullName(p)}</h3>
        <div className="flex items-center gap-1 text-[.76rem] text-muted"><Icon name="location_on" size="xs" /> {p.city} • {life}</div>
        {!list && (
          <div className="mt-2 flex flex-wrap gap-1.5">{(p.tags || []).slice(0, 2).map((tag) => <Tag key={tag} tone="outline">{tag}</Tag>)}</div>
        )}
      </div>
      {!list && (
        <div className="flex justify-between gap-2 rounded-[10px] bg-surface-2 p-2.5 text-[.74rem]">
          <span>{kids.length ? t(kids.length > 1 ? "dir.childrenMany" : "dir.childrenOne", { n: kids.length, names: kids.map((k) => k.first).join(", ") }) : p.occupation}</span>
          <span className="text-sec-ink">{t("dir.kinship", { rel: relationToMe(p) })}</span>
        </div>
      )}
      <div className={cx("flex gap-2 [&>*:first-child]:flex-1", list ? "col-span-full sm:col-span-1 sm:col-start-3" : "mt-1")}>
        {primary}
        <Button size="sm" icon="person_search" aria-label={t("dir.openDossier", { name: p.first })} onClick={() => onOpen(p.id)}>{t("dir.details")}</Button>
        <IconButton icon="star" iconProps={{ fill: !!p.fav, className: p.fav ? "text-gold! [button:active_&]:text-sec-on!" : "" }} aria-pressed={!!p.fav} className="size-8.5!"
          label={t(p.fav ? "fav.remove" : "fav.add", { name: p.first })} title={t(p.fav ? "fav.remove" : "fav.add", { name: p.first })} onClick={toggleFav} />
      </div>
    </article>
  );
}

function Dossier({ id, onClose }) {
  const { state, person, children, relationToMe, kin } = useStore();
  const t = useT();
  const { open } = useModal();
  const toast = useToast();
  const p = person(id);
  if (!p) return <Empty icon="badge" title={t("dir.none")}><p className="text-small">{t("dir.noneHelp")}</p></Empty>;

  const me = person(ME);
  const mems = state.memories.filter((m) => m.tagged.includes(p.id));
  const stories = state.stories.filter((s) => s.by === p.id);
  const degree = p.id === ME ? 0 : p.parents.includes(ME) || me.spouse === p.id ? 1 : p.gen === 4 ? 2 : p.gen === 3 ? 1 : 3;

  const downloadExtract = () => {
    const parents = p.parents.map((x) => fullName(person(x))).join(" & ") || "—";
    const txt = t("dir.extract", {
      name: fullName(p), born: fmtDate(p.born, p.bornApprox), died: p.died ? t("dir.extractDied", { date: fmtDate(p.died) }) : "",
      gen: p.gen, parents, children: children(p.id).map(fullName).join(", ") || "—", rel: relationToMe(p),
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
    a.download = t("dir.extractFile", { first: p.first, last: p.last });
    a.click();
    toast(t("dir.extractDone"), { icon: "download" });
  };

  return (
    <>
      <div className="flex items-center justify-between"><Eyebrow>{t("dir.dossier")}</Eyebrow><IconButton icon="close" label={t("dir.closeDossier")} onClick={onClose} /></div>
      <div className="mt-4 flex items-center gap-2.5">
        <Avatar p={p} size="lg" />
        <div>
          <h2>{fullName(p)}</h2>
          <p className="text-small text-muted">{p.parents.length ? t("dir.childOf", { names: p.parents.map((x) => person(x).first).join(" & ") }) : kin(p.role)}</p>
        </div>
      </div>
      <Card tone="soft" as="div" className="mt-4 p-3.5!">
        <div className="flex items-center justify-between">
          <strong className="text-small">{t("dir.how")}</strong>
          <Tag tone="dark">{degree ? t(`dir.degree.${degree}`) : t("dir.self")}</Tag>
        </div>
        <div className="my-2.5 flex items-center justify-center gap-2">
          <span className="grid size-9 place-items-center rounded-full bg-sec text-[.7rem] font-bold text-sec-on">{t("dir.youShort")}</span>
          <span className="h-0.5 w-12.5 bg-sec" />
          <span className="grid size-9 place-items-center rounded-full bg-sec-soft text-[.7rem] font-bold text-sec-ink ring-2 ring-sec">{initials(p)}</span>
        </div>
        <p className="text-center text-xsmall text-muted">{t("dir.path", { name: p.first, rel: relationToMe(p) })}</p>
      </Card>
      <div className="mt-4 rounded-[14px] bg-sec-soft p-3.5 text-small">
        <strong><Icon name="shield" size="xs" /> {t("dir.boundary", { who: t(p.minor ? "dir.boundaryMinor" : "dir.boundaryDirect") })}</strong>
        <p className="mt-2">{t("dir.boundaryHelp")}</p>
        <div className="mt-2 flex items-center justify-between text-xsmall">
          <span><Icon name="call" size="xs" /> {t("dir.phone", { v: t(p.minor || p.died ? "dir.hidden" : "dir.allowed") })}</span><span><Icon name="mail" size="xs" /> {t("dir.email")}</span>
        </div>
      </div>
      <SectionTitle className="mt-4"><h3>{t("dir.shared")}</h3><Link className="text-xsmall" to={`/memories?person=${p.id}`}>{t("dir.viewAll", { n: mems.length })}</Link></SectionTitle>
      <div className="grid gap-2">
        {stories.slice(0, 1).map((s) => (
          <Record key={s.id} as={Link} to="/stories" icon="mic">
            <div className="min-w-0 flex-1"><strong className="text-small">{s.title}</strong><p className="text-xsmall text-muted">{t("dir.recorded", { date: fmtDate(s.recorded) })}</p></div>
          </Record>
        ))}
        {mems.slice(0, 2).map((m) => (
          <Record key={m.id} as={Link} to={`/memories?person=${p.id}`} icon="photo">
            <div className="min-w-0 flex-1"><strong className="text-small">{m.title}</strong><p className="text-xsmall text-muted">{fmtDate(m.date, m.approx)}</p></div>
          </Record>
        ))}
        {!mems.length && !stories.length && <p className="text-small text-muted">{t("dir.noMemories")}</p>}
      </div>
      {mems.length > 0 && (
        <>
          <h3 className="mt-4">{t("dir.artifacts")}</h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {mems.slice(0, 3).map((m) => <Photo key={m.id} p1={m.p1} p2={m.p2} icon={m.icon} img={m.img} sample={m.id} alt={m.alt} aspect="aspect-square" />)}
          </div>
        </>
      )}
      <div className="mt-4 grid gap-2">
        {!p.died && (
          <Button variant="primary" block icon="forum"
            onClick={() => open(<MessageDialog person={p} title={t("dir.msgTitle", { name: p.first })} sub={t("dir.msgSub")} label={t("dir.msgLabel")} sendLabel={t("dir.send")} />)}>
            {t("dir.dialogue")}
          </Button>
        )}
        <Button variant="soft" block icon="download" onClick={downloadExtract}>{t("dir.downloadExtract", { name: p.first })}</Button>
      </div>
    </>
  );
}

/** Table view: the same roster as rows and columns. Column headers sort; a row opens the dossier. */
function PeopleTable({ list, selected, sort, onSort, onOpen }) {
  const { relationToMe } = useStore();
  const t = useT();
  // [label, sort key for ascending, sort key for descending]
  const cols = [["Name", "nameAZ", "nameZA"], ["Kinship to you"], ["Generation", "generation"], ["Home"], ["Born", "oldestPerson", "youngestPerson"], ["Next birthday", "birthday"]];
  const ariaSort = (c) => (sort === c[1] ? "ascending" : sort === c[2] ? "descending" : undefined);
  return (
    <div className="relative overflow-x-auto rounded-[18px] border border-line bg-surface">
      <table className="w-full min-w-170 border-collapse text-left text-small">
        <caption className="sr-only">{t("dir.caption", { n: list.length })}</caption>
        <thead className="bg-surface-2 text-xsmall tracking-wide text-muted uppercase">
          <tr>
            {cols.map((c) => (
              <th key={c[0]} scope="col" aria-sort={ariaSort(c)} className="px-3.5 py-2.5 font-semibold">
                {c[1] ? (
                  <button type="button" onClick={() => onSort(sort === c[1] && c[2] ? c[2] : c[1])}
                    className="inline-flex cursor-pointer items-center gap-1 rounded border-0 bg-transparent p-0 font-semibold tracking-wide text-inherit uppercase hover-fill">
                    {t(`dir.col.${c[0]}`)}
                    <Icon size="xs" name={sort === c[1] ? "arrow_upward" : sort === c[2] ? "arrow_downward" : "unfold_more"} className={ariaSort(c) ? "text-sec-ink" : "opacity-60"} />
                  </button>
                ) : t(`dir.col.${c[0]}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((p) => {
            const days = !p.died && daysToBirthday(p);
            return (
              <tr key={p.id} onClick={() => onOpen(p.id)}
                className={cx("cursor-pointer border-t border-line hover-tint", p.id === selected && "bg-sec-soft shadow-[inset_4px_0_0_var(--sec)]")}>
                <th scope="row" className="px-3.5 py-2 font-normal">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(p.id); }} aria-pressed={p.id === selected}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent p-0 text-left text-ink">
                    <Avatar p={p} className="size-8! rounded-lg! text-[.7rem]!" />
                    <span><strong className="block font-semibold">{fullName(p)}</strong>{p.fav && <span className="text-xsmall text-gold-ink"><Icon name="star" size="xs" fill /> {t("dir.starredTag")}</span>}</span>
                  </button>
                </th>
                <td className="px-3.5 py-2">{relationToMe(p)}</td>
                <td className="px-3.5 py-2">{t("dir.genShort", { n: p.gen })}</td>
                <td className="px-3.5 py-2">{p.city}</td>
                <td className="px-3.5 py-2 whitespace-nowrap">{fmtDate(p.born, p.bornApprox)}{p.died && <span className="block text-xsmall text-muted">{t("dir.diedShort", { year: year(p.died) })}</span>}</td>
                <td className="px-3.5 py-2 whitespace-nowrap">{p.died ? <span className="text-muted"><Icon name="local_florist" size="xs" /> {t("dir.inMemoriam")}</span> : days === 0 ? <strong><Icon name="cake" size="xs" /> {t("dir.today")}</strong> : days > 1 ? t("dir.inDays", { n: days }) : t("dir.inDaysOne")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Directory() {
  const { state, relationToMe, kin } = useStore();
  const { open } = useModal();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const urlQ = params.get("q") || "";
  const [q, setQ] = useState(urlQ);
  // A new search from the top bar while already on this page.
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  if (urlQ !== prevUrlQ) { setPrevUrlQ(urlQ); setQ(urlQ); }
  const [f, setF] = useState(ALL);
  const [view, setView] = useState("grid");
  const [selected, setSelected] = useState("michael");
  const [sort, setSort] = useState("generation");
  const [favOnly, setFavOnly] = useState(false);
  const t = useT();
  const dossierRef = useRef(null);

  const people = state.people;
  const living = people.filter((p) => !p.died).length;
  const gens = [...new Set(people.map((p) => p.gen))].sort();
  const branches = [...new Set(people.map((p) => p.branch))];

  const matches = (p) => {
    // Matches the role in English and in the chosen language ("Granddaughter" or "Petite-fille").
    const hay = [fullName(p), p.city, p.role, kin(p.role), p.occupation, p.branch, "gen " + p.gen, ...(p.tags || [])].join(" ").toLowerCase();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return words.every((w) => hay.includes(w))
      && (f.branch === "all" || p.branch === f.branch)
      && (f.status === "all" || (f.status === "living" ? !p.died : !!p.died))
      && (f.gen === "all" || p.gen === +f.gen)
      && (!favOnly || p.fav);
  };
  const list = people.filter(matches).sort(SORTS[sort]);
  const favCount = people.filter((p) => p.fav).length;

  const openDossier = (id) => {
    setSelected(id);
    if (window.innerWidth < 1200) dossierRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  // The roster as a spreadsheet file, in the order and filters currently shown.
  const exportCsv = () => {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Name", "Kinship to you", "Generation", "Branch", "Home", "Born", "Died", "Occupation"].map((c) => t(`dir.col.${c}`)),
      ...list.map((p) => [fullName(p), relationToMe(p), p.gen, p.branch, p.city, fmtDate(p.born, p.bornApprox), p.died ? fmtDate(p.died) : "", p.occupation])];
    // The BOM makes Excel read accented names (e.g. née) correctly.
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: t("dir.csvFile") });
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t("dir.exported"), { sub: t("dir.exportedSub", { n: list.length }), icon: "download" });
  };
  const clearAll = () => { setF(ALL); setQ(""); setParams({}); setFavOnly(false); };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <Tag tone="sec">{t("dir.verified", { year: THIS_YEAR })}</Tag><span className="text-small text-muted">{t("dir.synced", { n: branches.length })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button icon="download" onClick={exportCsv}>{t("dir.export")}</Button>
          <Button variant="primary" icon="person_add" onClick={() => open(<InviteDialog />)}>{t("dir.invite")}</Button>
        </div>
      </div>

      <Hero className="mt-4 flex flex-wrap items-center gap-6">
        <div className="min-w-65 flex-1">
          <Eyebrow icon="menu_book">{t("dir.roll")}</Eyebrow>
          <h1 className="mt-2">{t("h1.directory")}</h1>
          <p className="mt-2 text-muted">
            {t("dir.intro", { n: people.length, g: gens.length })}
          </p>
        </div>
        <div className="flex gap-2.5">
          <Stat value={living} label={t("dir.living")} />
          <Stat value={people.length - living} label={t("dir.memorial")} />
        </div>
      </Hero>

      <Card className="mt-4" aria-label={t("dir.filters")}>
        <div className="flex flex-wrap items-center gap-3">
          <form role="search" className="min-w-55 flex-1" onSubmit={(e) => e.preventDefault()}>
            <InputIcon icon="search">
              <label className="sr-only" htmlFor="dirQ">{t("dir.search")}</label>
              <Input id="dirQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dir.searchPh")} />
            </InputIcon>
          </form>
          <Tabs label={t("dir.branchLabel")} value={f.branch} onChange={(branch) => setF({ ...f, branch })}
            items={[["all", <span key="all" className="inline-flex items-center gap-1"><Icon name="hub" size="xs" /> {t("dir.allBranches")}</span>], ...branches.map((b) => [b, t("dir.stem", { b })])]} />
          <Tabs label={t("dir.statusLabel")} value={f.status} onChange={(status) => setF({ ...f, status })}
            items={[["all", t("dir.everyone")], ["living", t("dir.livingN", { n: living })], ["memorial", t("dir.memorialN", { n: people.length - living })]]} />
          <Tabs role="group" label={t("dir.layout")} value={view} onChange={setView}
            items={[["grid", <Icon key="grid" name="grid_view" size="sm" />, t("dir.grid")], ["list", <Icon key="list" name="view_list" size="sm" />, t("dir.list")], ["table", <Icon key="table" name="table_rows" size="sm" />, t("dir.table")]]} />
        </div>
        <Chips scroll className="mt-4" role="group" aria-label={t("dir.genLabel")}>
          <Chip pressed={f.gen === "all"} count={people.length} onClick={() => setF({ ...f, gen: "all" })}>{t("dir.allGens")}</Chip>
          {gens.map((g) => (
            <Chip key={g} pressed={f.gen === String(g)} count={people.filter((p) => p.gen === g).length} onClick={() => setF({ ...f, gen: String(g) })}>
              {t("dir.genChip", { n: g, name: t(`dir.gen.${g}`) })}
            </Chip>
          ))}
        </Chips>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <Chip icon="star" pressed={favOnly} count={favCount} onClick={() => setFavOnly(!favOnly)}>{t("filter.favOnly")}</Chip>
          <label htmlFor="dirSort" className="ml-auto text-small text-muted">{t("sort.label")}</label>
          <Select id="dirSort" className="w-auto!" value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.keys(SORTS).map((k) => <option key={k} value={k}>{t(`sort.${k}`)}</option>)}
          </Select>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {list.length ? (
            <>
              <p className="mb-2.5 text-small text-muted" aria-live="polite">{t("common.showing", { n: list.length, total: people.length })}</p>
              {view === "table" ? <PeopleTable list={list} selected={selected} sort={sort} onSort={setSort} onOpen={openDossier} /> : (
                <div className={cx("grid gap-4", view === "list" ? "grid-cols-1" : "grid-cols-[repeat(auto-fill,minmax(250px,1fr))]")}>
                  {list.map((p) => <PersonCard key={p.id} p={p} selected={p.id === selected} list={view === "list"} onOpen={openDossier} />)}
                </div>
              )}
            </>
          ) : (
            <Empty icon="person_off" title={q ? t("dir.noMatchQ", { q }) : t("dir.noMatch")}>
              <p className="text-small">{t("dir.noMatchHelp")}</p>
              <div className="mt-4 flex justify-center gap-2.5">
                <Button icon="filter_alt_off" onClick={clearAll}>{t("dir.clearAll")}</Button>
                <Button variant="primary" icon="person_add" onClick={() => open(<InviteDialog />)}>{t("dir.inviteOne")}</Button>
              </div>
            </Empty>
          )}
        </div>
        <Card as="aside" aria-live="polite" className="lg:sticky lg:top-21">
          <div ref={dossierRef}><Dossier id={selected} onClose={() => setSelected(null)} /></div>
        </Card>
      </div>

      <Card tone="soft" className="mt-7 flex flex-wrap items-center gap-2.5">
        <IconBox icon="print" />
        <div className="min-w-0 flex-1">
          <h3>{t("dir.print")}</h3>
          <p className="text-small text-muted">{t("dir.printSub")}</p>
        </div>
        <Button onClick={() => window.print()}>{t("dir.printBtn")}</Button>
      </Card>
    </>
  );
}
