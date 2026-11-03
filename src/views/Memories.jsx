/* 5.4 Family Memories Keepsake Vault */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import {
  Button, Card, Chip, Empty, Eyebrow, Field, Hero, Icon, IconBox, IconButton, Input, InputIcon, Photo, PhotoCorner, PhotoOverlay,
  SectionTitle, Select, Tabs, Tag, Visibility,
} from "../components/ui";
import AddMemoryDialog from "../dialogs/AddMemoryDialog";
import { cx, fmtDate, uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { fullName, useStore } from "../lib/store";

const SORTS = {
  newest: (a, b) => b.date.localeCompare(a.date),
  oldest: (a, b) => a.date.localeCompare(b.date),
  title: (a, b) => a.title.localeCompare(b.title),
  favFirst: (a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || b.date.localeCompare(a.date),
};
const SIZES = { small: "minmax(200px,1fr)", medium: "minmax(260px,1fr)", large: "minmax(360px,1fr)" };

/** Full-screen slideshow of the filtered keepsakes, with autoplay and arrow-key navigation. */
function Slideshow({ list }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const n = list.length;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 4000);
    return () => clearInterval(id);
  }, [playing, n]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") setI((x) => (x + 1) % n);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + n) % n);
      if (e.key === " " && e.target.tagName !== "BUTTON") { e.preventDefault(); setPlaying((p) => !p); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [n]);
  const m = list[i];
  return (
    <Dialog wide title={t("mem.slideshow")} sub={t("mem.slide", { i: i + 1, n })}>
      <Photo key={m.id} p1={m.p1} p2={m.p2} icon={m.icon} img={m.img} alt={m.alt} aspect="aspect-16/10" className="animate-fade">
        <PhotoOverlay><strong className="block font-serif text-[1.2rem]">{m.title}</strong><small>{fmtDate(m.date, m.approx)} · {m.place}</small></PhotoOverlay>
      </Photo>
      <p className="text-small text-muted">{m.caption}</p>
      <div className="h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-pine-700 transition-[width] dark:bg-mint" style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
      <div className="flex items-center justify-center gap-2.5">
        <IconButton icon="skip_previous" label={t("common.prev")} onClick={() => setI((i - 1 + n) % n)} />
        <Button variant="primary" icon={playing ? "pause" : "play_arrow"} aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? t("common.pause") : t("common.play")}</Button>
        <IconButton icon="skip_next" label={t("common.next")} onClick={() => setI((i + 1) % n)} />
      </div>
    </Dialog>
  );
}

const NOW = new Date().getFullYear();
const ALL = { type: "all", q: "", person: "all", from: 1918 };

function MemoryCard({ m }) {
  const { person, update } = useStore();
  const { confirm } = useModal();
  const toast = useToast();

  const toggleFav = () => {
    update((s) => { const x = s.memories.find((y) => y.id === m.id); x.fav = !x.fav; });
    toast(m.fav ? "Removed from favourites" : "Added to favourites", { icon: "favorite", duration: 2500 });
  };
  const remove = () => confirm("Remove this keepsake?",
    `“${m.title}” will be removed from the vault for everyone in the family. You can undo straight after.`, "Remove", () => {
      let index = 0;
      update((s) => { index = s.memories.findIndex((x) => x.id === m.id); s.memories.splice(index, 1); });
      toast("Keepsake removed", { sub: m.title, action: "Undo", icon: "delete", onAction: () => update((s) => { s.memories.splice(index, 0, m); }) });
    });

  return (
    <article className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface">
      <Photo p1={m.p1} p2={m.p2} icon={m.icon} img={m.img} alt={m.alt} aspect="aspect-[4/3.3]" flush>
        <PhotoCorner><Tag tone="glass" icon={m.type === "document" ? "description" : "photo_camera"}>{m.label}</Tag></PhotoCorner>
        {m.audio && <PhotoOverlay className="text-xsmall"><Icon name="graphic_eq" size="xs" /> Oral clip by Mary · “Crossing the Atlantic in ’68”</PhotoOverlay>}
      </Photo>
      <div className="grid flex-1 content-start gap-2 p-3.5">
        <div className="flex items-center justify-between gap-2.5 text-xsmall text-muted">
          <span><Icon name="location_on" size="xs" /> {m.place}</span>
          <span>{m.approx ? <Tag tone="rose" title="Approximate / remembered date">{fmtDate(m.date, true)} · approx.</Tag> : fmtDate(m.date)}</span>
        </div>
        <h3>{m.title}</h3>
        <p className="text-small text-muted">{m.caption}</p>
        <Visibility>{m.visibility} · Added by {person(m.owner || "mary")?.first}</Visibility>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3.5 py-2.5">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-xsmall text-muted">TAGGED:</span>
          {m.tagged.slice(0, 3).map((id) => <Tag key={id} tone="outline">{person(id)?.first || "?"}</Tag>)}
          {m.tagged.length > 3 && <Tag tone="outline">+{m.tagged.length - 3}</Tag>}
        </span>
        <IconButton icon="favorite" iconProps={{ fill: !!m.fav }} aria-pressed={!!m.fav}
          label={`${m.fav ? "Remove from" : "Add to"} favourites`} onClick={toggleFav} />
        <IconButton icon="delete" label={`Remove ${m.title}`} onClick={remove} />
      </div>
    </article>
  );
}

function CreateAlbumDialog() {
  const { update } = useStore();
  const toast = useToast();
  const close = useCloseModal();
  const [title, setTitle] = useState("");
  const [invalid, setInvalid] = useState(false);
  const create = () => {
    const t = title.trim();
    if (!t) { setInvalid(true); toast("Give the album a name", { error: true }); return; }
    update((s) => { s.albums.unshift({ id: uid("a"), title: t, tag: "New Album", meta: "0 Items", note: "Just created", p1: "#7fa894", p2: "#2a5140", icon: "photo_album" }); });
    toast("Album created", { sub: t });
    close();
  };
  return (
    <Dialog title="Create a family album" footer={<><CancelButton /><Button variant="primary" onClick={create}>Create</Button></>}>
      <Field id="alT" label="Album name">
        <Input id="alT" value={title} onChange={(e) => setTitle(e.target.value)} invalid={invalid} placeholder="e.g. Christmas at Rose Cottage" />
      </Field>
    </Dialog>
  );
}

export default function Memories() {
  const { state: st } = useStore();
  const { open } = useModal();
  const toast = useToast();
  const [params] = useSearchParams();
  const [f, setF] = useState(() => ({ ...ALL, person: params.get("person") || "all", q: params.get("q") || "" }));
  const [sort, setSort] = useState("newest");
  const [favOnly, setFavOnly] = useState(false);
  const [size, setSize] = useState("medium");
  const t = useT();
  // A new ?q= link (e.g. from quick search) while already on this page.
  const urlQ = params.get("q") || "";
  const [prevQ, setPrevQ] = useState(urlQ);
  if (urlQ !== prevQ) { setPrevQ(urlQ); setF((x) => ({ ...x, q: urlQ })); }
  const strip = useRef(null);

  const counts = (t) => st.memories.filter((m) => t === "all" || m.type === t).length;
  const matches = (m) => {
    const q = f.q.toLowerCase();
    const hay = [m.title, m.caption, m.place, m.label, ...m.tagged.map((id) => fullName(st.people.find((p) => p.id === id)))].join(" ").toLowerCase();
    return (f.type === "all" || m.type === f.type)
      && (!q || hay.includes(q))
      && (f.person === "all" || m.tagged.includes(f.person))
      && +m.date.slice(0, 4) >= f.from
      && (!favOnly || m.fav);
  };
  const list = st.memories.filter(matches).sort(SORTS[sort]);
  const scrollAlbums = (dir) => strip.current.scrollBy({ left: dir * strip.current.clientWidth * 0.8 });

  return (
    <>
      <Hero className="flex flex-wrap items-center gap-6">
        <div className="min-w-65 flex-1">
          <Tag tone="mint">AUTHENTICATED KINSHIP VAULT · 11 Decades Digitised</Tag>
          <h1 className="mt-4">{t("h1.memories")}</h1>
          <p className="mt-2 text-muted">Restored photographs, home cine-films and heirloom keepsakes across 11 decades of the Mackenzie family lineage — each with a caption, date, owner, and who can see it.</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {[["photo", "280 Restored Prints"], ["mic", "42 Voice Oral Tapes"], ["mail", "20 Letters & Parchments"], ["face", `${st.people.length} Relatives Identified`]].map(([i, t]) => (
              <Tag key={t} tone="outline" icon={i}>{t}</Tag>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" icon="cloud_upload" className="px-4.5! py-3.5!" onClick={() => open(<AddMemoryDialog />)}>
            <span className="text-left">+ Upload New Memory<br /><small className="font-normal opacity-75">Drag photos or scans</small></span>
          </Button>
          <Button icon="create_new_folder" onClick={() => open(<CreateAlbumDialog />)}>Create Family Album</Button>
        </div>
      </Hero>

      <Card tone="soft" className="mt-4 flex flex-wrap items-center gap-2.5">
        <IconBox icon="shield" tone="dark" />
        <div className="min-w-0 flex-1">
          <strong>Permanent Archival Redundancy Active</strong> <Tag tone="mint">CERTIFIED ZERO LOSS</Tag>
          <p className="text-xsmall text-muted">Uncompressed copies preserved across 3 family custodians (Edinburgh, Vancouver, Melbourne) with end-to-end encryption.</p>
        </div>
        <Tag tone="outline">Node Health (100%)</Tag>
      </Card>

      <section className="mt-7" aria-labelledby="albumsH">
        <SectionTitle>
          <div><Eyebrow icon="auto_stories">Heirloom portfolios</Eyebrow><h2 id="albumsH">Curated Family Albums</h2></div>
          <div className="flex gap-2.5">
            <IconButton icon="chevron_left" label="Previous albums" onClick={() => scrollAlbums(-1)} />
            <IconButton icon="chevron_right" label="Next albums" onClick={() => scrollAlbums(1)} />
          </div>
        </SectionTitle>
        <div ref={strip} className="grid snap-x snap-mandatory auto-cols-[minmax(200px,1fr)] grid-flow-col gap-3.5 overflow-x-auto scroll-smooth pb-1.5">
          {st.albums.map((a) => (
            <button key={a.id} type="button"
              onClick={() => toast("Album viewer coming soon", { sub: "In this demo, use the filters below to browse keepsakes.", icon: "photo_album" })}
              className="flex cursor-pointer snap-start flex-col overflow-hidden rounded-2xl border border-line bg-surface p-0 text-left">
              <Photo as="span" p1={a.p1} p2={a.p2} icon={a.icon} aspect="aspect-[4/3.2]" flush>
                <PhotoCorner><Tag tone="glass">{a.tag}</Tag></PhotoCorner>
                <PhotoOverlay className="text-xsmall">{a.meta}</PhotoOverlay>
              </Photo>
              <span className="grid gap-1.5 p-3">
                <h3 className="text-base!">{a.title}</h3>
                <span className="flex items-center justify-between text-xsmall text-muted">{a.note} <Icon name="arrow_forward" size="xs" /></span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <Card className="mt-7" aria-label="Filters">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs dark label="Type" value={f.type} onChange={(type) => setF({ ...f, type })}
            items={[["all", "All Items"], ["photo", "Photos"], ["document", "Documents & Letters"]].map(([k, l]) => [k, `${l} (${counts(k)})`])} />
          <InputIcon icon="search" className="min-w-55 flex-1">
            <label className="sr-only" htmlFor="memQ">Search captions and tags</label>
            <Input id="memQ" type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search caption, place, or tagged relative…" />
          </InputIcon>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4.5">
          <Field id="memPerson" label={<><Icon name="person" size="xs" /> Filter by kinsperson</>} className="min-w-55">
            <Select id="memPerson" value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })}>
              <option value="all">All Mackenzie Relatives</option>
              {st.people.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
            </Select>
          </Field>
          <Field id="memEra" label={<><Icon name="history" size="xs" /> Historic era span</>} hint={`${f.from} — ${NOW}`} className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="text-xsmall text-muted">1918</span>
              <input type="range" id="memEra" min="1918" max="2026" step="1" value={f.from} aria-valuetext={`From ${f.from}`}
                onChange={(e) => setF({ ...f, from: +e.target.value })} className="min-w-40 flex-1" />
              <span className="text-xsmall text-muted">Today</span>
            </div>
          </Field>
        </div>
      </Card>

      <section className="mt-7" aria-labelledby="artH">
        <SectionTitle>
          <div><Eyebrow icon="inventory_2">Historical folio</Eyebrow><h2 id="artH">Preserved Family Artifacts</h2></div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Chip icon="favorite" pressed={favOnly} count={st.memories.filter((m) => m.fav).length} onClick={() => setFavOnly(!favOnly)}>{t("filter.favOnly")}</Chip>
            <label className="sr-only" htmlFor="memSort">{t("sort.label")}</label>
            <Select id="memSort" className="w-auto!" value={sort} onChange={(e) => setSort(e.target.value)}>
              {Object.keys(SORTS).map((k) => <option key={k} value={k}>{t("sort.label")}: {t(`sort.${k}`)}</option>)}
            </Select>
            <Tabs role="radiogroup" label={t("view.size")} value={size} onChange={setSize}
              items={[["small", <Icon key="s" name="apps" size="sm" />, t("view.small")], ["medium", <Icon key="m" name="grid_view" size="sm" />, t("view.medium")], ["large", <Icon key="l" name="view_agenda" size="sm" />, t("view.large")]]} />
            <Button variant="primary" icon="slideshow" disabled={!list.length} onClick={() => open(<Slideshow list={list} />)}>{t("mem.slideshow")}</Button>
          </div>
        </SectionTitle>
        {list.length ? (
          <>
            <p className="mb-2.5 text-small text-muted" aria-live="polite">Showing {list.length} keepsake{list.length > 1 ? "s" : ""}</p>
            <div className={cx("grid gap-4.5", size === "small" && "[&_p]:hidden")} style={{ gridTemplateColumns: `repeat(auto-fill,${SIZES[size]})` }}>{list.map((m) => <MemoryCard key={m.id} m={m} />)}</div>
          </>
        ) : (
          <Empty icon="image_search" title="No keepsakes match">
            <p className="text-small">Try another relative, widen the era range, or clear the search.</p>
            <Button className="mt-4" onClick={() => { setF(ALL); setFavOnly(false); }}>Clear filters</Button>
          </Empty>
        )}
      </section>
    </>
  );
}
