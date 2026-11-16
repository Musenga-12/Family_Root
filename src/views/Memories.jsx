/* 5.4 Family Memories Keepsake Vault */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CancelButton, Dialog } from "../components/Modal";
import { Menu, MenuDivider, MenuItem } from "../components/Menu";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import {
  Button, Card, Chip, Empty, Eyebrow, Field, Hero, Icon, IconBox, IconButton, Input, InputIcon, Photo, PhotoCorner, PhotoOverlay,
  SectionTitle, Select, Tabs, Tag, Visibility,
} from "../components/ui";
import AddMemoryDialog from "../dialogs/AddMemoryDialog";
import { cx, fmtDate, uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { canSpeak, useSpeech } from "../lib/speech";
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
      <Photo key={m.id} p1={m.p1} p2={m.p2} icon={m.icon} img={m.img} sample={m.id} alt={m.alt} aspect="aspect-16/10" className="animate-fade">
        <PhotoOverlay><strong className="block font-serif text-[1.2rem]">{m.title}</strong><small>{fmtDate(m.date, m.approx)} · {m.place}</small></PhotoOverlay>
      </Photo>
      <p className="text-small text-muted">{m.caption}</p>
      <div className="h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-sec transition-[width]" style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
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
  const t = useT();
  const { confirm } = useModal();
  const toast = useToast();
  const moreRef = useRef(null);
  const { toggle: toggleSpeech, speaking } = useSpeech();
  const copyLink = () => {
    const url = `${location.href.split("#")[0]}#/memories?q=${encodeURIComponent(m.title)}`;
    navigator.clipboard?.writeText(url).then(
      () => toast(t("mem.linkCopied"), { sub: t("mem.linkCopiedSub"), icon: "link", duration: 2500 }),
      () => toast(t("mem.linkFailed"), { error: true, sub: url }),
    );
  };

  const toggleFav = () => {
    update((s) => { const x = s.memories.find((y) => y.id === m.id); x.fav = !x.fav; }, t(m.fav ? "mem.unfavHistory" : "mem.favHistory", { title: m.title }));
    toast(t(m.fav ? "mem.favRemoved" : "mem.favAdded"), { icon: "favorite", duration: 2500 });
  };
  const remove = () => confirm(t("mem.removeQ"), t("mem.removeMsg", { title: m.title }), t("mem.remove"), () => {
      let index = 0;
      update((s) => { index = s.memories.findIndex((x) => x.id === m.id); s.memories.splice(index, 1); }, t("mem.removedHistory", { title: m.title }));
      toast(t("mem.removed"), { sub: m.title, action: t("common.undo"), icon: "delete", onAction: () => update((s) => { s.memories.splice(index, 0, m); }, t("mem.restoredHistory", { title: m.title })) });
    });

  return (
    // Right-click (or the keyboard's Menu key / Shift+F10) opens the same actions as the ⋮ button.
    <article aria-label={m.title} onContextMenu={(e) => { if (e.target.closest("a, input")) return; e.preventDefault(); moreRef.current?.click(); }}
      className="lift group/photo flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface">
      <Photo p1={m.p1} p2={m.p2} icon={m.icon} img={m.img} sample={m.id} alt={m.alt} aspect="aspect-[4/3.3]" flush>
        <PhotoCorner><Tag tone="glass" icon={m.type === "document" ? "description" : "photo_camera"}>{m.label}</Tag></PhotoCorner>
        {m.audio && <PhotoOverlay className="text-xsmall"><Icon name="graphic_eq" size="xs" /> {t("mem.oralClip", { name: "Mary", title: "Crossing the Atlantic in ’68" })}</PhotoOverlay>}
      </Photo>
      <div className="grid flex-1 content-start gap-2 p-3.5">
        <div className="flex items-center justify-between gap-2.5 text-xsmall text-muted">
          <span><Icon name="location_on" size="xs" /> {m.place}</span>
          <span>{m.approx ? <Tag tone="rose" title={t("mem.approxDate")}>{fmtDate(m.date, true)} · {t("mem.approx")}</Tag> : fmtDate(m.date)}</span>
        </div>
        <h3>{m.title}</h3>
        <p className="text-small text-muted">{m.caption}</p>
        <Visibility>{t("mem.addedBy", { vis: t(`vis.${m.visibility}`) === `vis.${m.visibility}` ? m.visibility : t(`vis.${m.visibility}`), name: person(m.owner || "mary")?.first })}</Visibility>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3.5 py-2.5">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-xsmall text-muted">{t("mem.tagged")}</span>
          {m.tagged.slice(0, 3).map((id) => <Tag key={id} tone="outline">{person(id)?.first || "?"}</Tag>)}
          {m.tagged.length > 3 && <Tag tone="outline">+{m.tagged.length - 3}</Tag>}
        </span>
        <IconButton icon="favorite" iconProps={{ fill: !!m.fav, className: m.fav ? "text-rose! [button:active_&]:text-sec-on!" : "" }} aria-pressed={!!m.fav}
          label={t(m.fav ? "mem.favRemove" : "mem.favAdd")} title={t(m.fav ? "mem.favRemove" : "mem.favAdd")} onClick={toggleFav} />
        <Menu label={t("mem.actions", { title: m.title })} trigger={(p) => (
          <IconButton ref={moreRef} icon="more_vert" label={t("mem.moreFor", { title: m.title })} title={t("mem.moreHint")} {...p} />
        )}>
          <MenuItem icon="favorite" onClick={toggleFav}>{t(m.fav ? "mem.favRemove" : "mem.favAdd")}</MenuItem>
          {canSpeak && <MenuItem icon={speaking ? "stop_circle" : "volume_up"} onClick={() => toggleSpeech(`${m.title}. ${m.caption}. ${m.alt || ""}`)}>{speaking ? t("read.stop") : t("mem.readAloud")}</MenuItem>}
          <MenuItem icon="link" onClick={copyLink}>{t("mem.copyLink")}</MenuItem>
          <MenuDivider />
          <MenuItem icon="delete" onClick={remove}>{t("mem.removeMenu")}</MenuItem>
        </Menu>
      </div>
    </article>
  );
}

/** One album: its keepsakes as a grid, a slideshow, and a picker to choose what belongs in it. */
function AlbumDialog({ id }) {
  const { state, update } = useStore();
  const t = useT();
  const count = (n) => (n === 1 ? t("mem.keepsakesOne") : t("mem.keepsakesMany", { n }));
  const { open } = useModal();
  const toast = useToast();
  const a = state.albums.find((x) => x.id === id);
  const items = a?.items || [];
  const [editing, setEditing] = useState(!items.length);
  const [picked, setPicked] = useState(items);
  if (!a) return null;
  const inAlbum = state.memories.filter((m) => items.includes(m.id));
  const save = () => {
    update((s) => { s.albums.find((x) => x.id === id).items = picked; }, t("mem.albumHistory", { title: a.title }));
    toast(t("mem.albumUpdated"), { sub: `${a.title} · ${count(picked.length)}`, icon: "photo_album" });
    setEditing(false);
  };
  return (
    <Dialog wide title={a.title} sub={t("mem.inAlbum", { tag: a.tag, count: count(items.length) })}
      footer={editing
        ? <><Button variant="soft" onClick={() => { setPicked(items); setEditing(false); }} disabled={!items.length}>{t("common.cancel")}</Button><Button variant="primary" icon="check" onClick={save}>{t("mem.saveAlbum")}</Button></>
        : <><Button icon="edit" onClick={() => setEditing(true)}>{t("mem.choose")}</Button><Button variant="primary" icon="slideshow" disabled={!inAlbum.length} onClick={() => open(<Slideshow list={inAlbum} />)}>{t("mem.play")}</Button></>}>
      {editing ? (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-small font-semibold">{t("mem.tick", { n: picked.length })}</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
            {state.memories.map((m) => {
              const on = picked.includes(m.id);
              return (
                <label key={m.id} className={cx("grid cursor-pointer gap-1.5 rounded-xl border-2 p-1.5 text-xsmall", on ? "border-sec bg-sec-soft" : "border-line")}>
                  <Photo p1={m.p1} p2={m.p2} icon={m.icon} img={m.img} sample={m.id} alt={m.alt} aspect="aspect-4/3">
                    <span className="absolute top-1.5 left-1.5 rounded bg-white/90 p-0.5 leading-none"><input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== m.id) : [...picked, m.id])} className="size-4.5" /></span>
                  </Photo>
                  <span className="line-clamp-2 font-semibold">{m.title}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
          {inAlbum.map((m) => (
            <figure key={m.id} className="m-0 grid gap-1.5">
              <Photo p1={m.p1} p2={m.p2} icon={m.icon} img={m.img} sample={m.id} alt={m.alt} aspect="aspect-4/3" />
              <figcaption className="text-xsmall"><strong className="block text-small">{m.title}</strong>{fmtDate(m.date, m.approx)} · {m.place}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function CreateAlbumDialog() {
  const { update } = useStore();
  const { open } = useModal();
  const toast = useToast();
  const close = useCloseModal();
  const [title, setTitle] = useState("");
  const [invalid, setInvalid] = useState(false);
  const t = useT();
  const create = () => {
    const name = title.trim();
    if (!name) { setInvalid(true); toast(t("mem.albumName"), { error: true }); return; }
    const id = uid("a");
    update((s) => { s.albums.unshift({ id, items: [], title: name, tag: t("mem.newAlbumTag"), meta: t("mem.newAlbumMeta"), note: t("mem.justCreated"), p1: "#7fa894", p2: "#2a5140", icon: "photo_album" }); }, t("mem.createdHistory", { title: name }));
    toast(t("mem.created"), { sub: t("mem.createdSub", { title: name }), icon: "photo_album" });
    close();
    open(<AlbumDialog id={id} />);
  };
  return (
    <Dialog title={t("mem.createTitle")} footer={<><CancelButton /><Button variant="primary" onClick={create}>{t("mem.create")}</Button></>}>
      <Field id="alT" label={t("mem.albumLabel")}>
        <Input id="alT" value={title} onChange={(e) => setTitle(e.target.value)} invalid={invalid} placeholder={t("mem.albumPh")} />
      </Field>
    </Dialog>
  );
}

export default function Memories() {
  const { state: st } = useStore();
  const { open } = useModal();
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

  const counts = (type) => st.memories.filter((m) => type === "all" || m.type === type).length;
  const keepsakes = (n) => (n === 1 ? t("mem.keepsakesOne") : t("mem.keepsakesMany", { n }));
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
  // Same items by decade (ignoring the era filter), as a second view that can also set the era.
  const decades = {};
  for (const m of st.memories) if (matches({ ...m, date: String(NOW) })) { const d = Math.floor(+m.date.slice(0, 4) / 10) * 10; decades[d] = (decades[d] || 0) + 1; }
  const decadeKeys = Object.keys(decades).map(Number).sort((a, b) => a - b);
  const maxDecade = Math.max(1, ...Object.values(decades));
  const scrollAlbums = (dir) => strip.current.scrollBy({ left: dir * strip.current.clientWidth * 0.8 });

  return (
    <>
      <Hero className="flex flex-wrap items-center gap-6">
        <div className="min-w-65 flex-1">
          <Tag tone="sec">{t("mem.vault")}</Tag>
          <h1 className="mt-4">{t("h1.memories")}</h1>
          <p className="mt-2 text-muted">{t("mem.intro")}</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {[["photo", t("mem.stat.prints")], ["mic", t("mem.stat.tapes")], ["mail", t("mem.stat.letters")], ["face", t("mem.stat.people", { n: st.people.length })]].map(([i, label]) => (
              <Tag key={i} tone="outline" icon={i}>{label}</Tag>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" icon="cloud_upload" className="px-4.5! py-3.5!" onClick={() => open(<AddMemoryDialog />)}>
            <span className="text-left">{t("mem.upload")}<br /><small className="font-normal opacity-75">{t("mem.uploadSub")}</small></span>
          </Button>
          <Button icon="create_new_folder" onClick={() => open(<CreateAlbumDialog />)}>{t("mem.createAlbum")}</Button>
        </div>
      </Hero>

      <Card tone="soft" className="mt-4 flex flex-wrap items-center gap-2.5">
        <IconBox icon="shield" tone="dark" />
        <div className="min-w-0 flex-1">
          <strong>{t("mem.redundancy")}</strong> <Tag tone="mint">{t("mem.zeroLoss")}</Tag>
          <p className="text-xsmall text-muted">{t("mem.redundancySub")}</p>
        </div>
        <Button size="sm" icon="download" to="/settings">{t("settings.export")}</Button>
      </Card>

      <section className="mt-7" aria-labelledby="albumsH">
        <SectionTitle>
          <div><Eyebrow icon="auto_stories">{t("mem.portfolios")}</Eyebrow><h2 id="albumsH">{t("mem.albums")}</h2></div>
          <div className="flex gap-2.5">
            <IconButton icon="chevron_left" label={t("mem.prevAlbums")} onClick={() => scrollAlbums(-1)} />
            <IconButton icon="chevron_right" label={t("mem.nextAlbums")} onClick={() => scrollAlbums(1)} />
          </div>
        </SectionTitle>
        <div ref={strip} className="grid snap-x snap-mandatory auto-cols-[minmax(200px,1fr)] grid-flow-col gap-3.5 overflow-x-auto scroll-smooth pb-1.5">
          {st.albums.map((a) => (
            <button key={a.id} type="button"
              aria-label={t("mem.openAlbum", { title: a.title })} onClick={() => open(<AlbumDialog id={a.id} />)}
              className="lift group/photo flex cursor-pointer snap-start flex-col overflow-hidden rounded-2xl border border-line bg-surface p-0 text-left">
              <Photo as="span" p1={a.p1} p2={a.p2} icon={a.icon} sample={a.id} alt="" aspect="aspect-[4/3.2]" flush>
                <PhotoCorner><Tag tone="glass">{a.tag}</Tag></PhotoCorner>
                <PhotoOverlay className="text-xsmall">{a.items ? keepsakes(a.items.length) : a.meta}</PhotoOverlay>
              </Photo>
              <span className="grid gap-1.5 p-3">
                <h3 className="text-base!">{a.title}</h3>
                <span className="flex items-center justify-between text-xsmall text-muted">{a.note} <Icon name="arrow_forward" size="xs" /></span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <Card className="mt-7" aria-label={t("mem.filters")}>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs label={t("mem.type")} value={f.type} onChange={(type) => setF({ ...f, type })}
            items={["all", "photo", "document"].map((k) => [k, t(`mem.type.${k}`, { n: counts(k) })])} />
          <InputIcon icon="search" className="min-w-55 flex-1">
            <label className="sr-only" htmlFor="memQ">{t("mem.searchLabel")}</label>
            <Input id="memQ" type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder={t("mem.searchPh")} />
          </InputIcon>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4.5">
          <Field id="memPerson" label={<><Icon name="person" size="xs" /> {t("mem.byPerson")}</>} className="min-w-55">
            <Select id="memPerson" value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })}>
              <option value="all">{t("mem.allRelatives")}</option>
              {st.people.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
            </Select>
          </Field>
          <Field id="memEra" label={<><Icon name="history" size="xs" /> {t("mem.era")}</>} hint={`${f.from} — ${NOW}`} className="min-w-0 flex-1 basis-60">
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="text-xsmall text-muted">1918</span>
              <input type="range" id="memEra" min="1918" max="2026" step="1" value={f.from} aria-valuetext={t("mem.from", { year: f.from })}
                onChange={(e) => setF({ ...f, from: +e.target.value })} className="min-w-40 flex-1" />
              <span className="text-xsmall text-muted">{t("mem.today")}</span>
            </div>
          </Field>
        </div>
        {decadeKeys.length > 1 && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <strong className="text-[.8rem]"><Icon name="bar_chart" size="xs" /> {t("mem.byDecade")}</strong>
              <span className="text-xsmall text-muted">{t("mem.pickBar")}{f.from > 1918 && <> · <button type="button" onClick={() => setF({ ...f, from: 1918 })} className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-sec-ink hover-fill">{t("mem.showAll")}</button></>}</span>
            </div>
            <div role="group" aria-label={t("mem.byDecade")} className="flex h-28 items-end gap-1.5">
              {decadeKeys.map((d) => {
                const on = d + 9 >= f.from;
                return (
                  <button key={d} type="button" aria-pressed={f.from === d} onClick={() => setF({ ...f, from: d })}
                    aria-label={t("mem.decadeLabel", { d, count: keepsakes(decades[d]) })} title={`${d}s · ${decades[d]}`}
                    className="group flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-1 border-0 bg-transparent p-0">
                    <span className="text-[.68rem] font-semibold text-muted">{decades[d]}</span>
                    <span className={cx("w-full max-w-12 rounded-t-md transition-colors", on ? "bg-sec group-hover:brightness-110" : "bg-surface-3 group-hover:bg-sec/60")}
                      style={{ height: `${(decades[d] / maxDecade) * 70}%`, minHeight: 4 }} />
                    <span className={cx("text-[.66rem]", on ? "font-semibold text-ink" : "text-faint")}>{`’${String(d).slice(2)}s`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <section className="mt-7" aria-labelledby="artH">
        <SectionTitle>
          <div><Eyebrow icon="inventory_2">{t("mem.folio")}</Eyebrow><h2 id="artH">{t("mem.artifacts")}</h2></div>
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
            <p className="mb-2.5 text-small text-muted" aria-live="polite">{t("mem.showing", { count: keepsakes(list.length) })}</p>
            <div className={cx("grid gap-4.5", size === "small" && "[&_p]:hidden")} style={{ gridTemplateColumns: `repeat(auto-fill,${SIZES[size]})` }}>{list.map((m) => <MemoryCard key={m.id} m={m} />)}</div>
          </>
        ) : (
          <Empty icon="image_search" title={t("mem.none")}>
            <p className="text-small">{t("mem.noneHelp")}</p>
            <Button className="mt-4" onClick={() => { setF(ALL); setFavOnly(false); }}>{t("mem.clear")}</Button>
          </Empty>
        )}
      </section>
    </>
  );
}
