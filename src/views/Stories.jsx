/* 5.5 Stories and Voice Recording Studio */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AudioPlayer from "../components/AudioPlayer";
import { CancelButton, Dialog, DraftNote } from "../components/Modal";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import {
  Avatar, Button, Card, Chip, Chips, Empty, Field, Hero, Icon, IconBox, Input, InputIcon, SectionTitle, Select, Tabs, Tag, Textarea,
} from "../components/ui";
import { ME } from "../data";
import { fmtDate, uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { canSpeak, useSpeech } from "../lib/speech";
import { fullName, useStore } from "../lib/store";
import { useDraft } from "../lib/useDraft";
import RecordingStudio from "./RecordingStudio";

const SORTS = {
  newest: (a, b) => b.recorded.localeCompare(a.recorded),
  oldest: (a, b) => a.recorded.localeCompare(b.recorded),
  mostLoved: (a, b) => b.loves - a.loves,
  longest: (a, b) => (b.duration || 0) - (a.duration || 0),
};
const CATS = ["Elder Oral Histories", "Spoken Audio", "Written Memories", "Traditions & Recipes"];

function ReadDialog({ s }) {
  const { person } = useStore();
  const close = useCloseModal();
  const { toggle, speaking } = useSpeech();
  const text = s.transcript || s.excerpt;
  return (
    <Dialog title={s.title} sub={`${fullName(person(s.by))} • ${fmtDate(s.recorded)}`}
      footer={<>
        {canSpeak && <Button icon={speaking ? "stop_circle" : "volume_up"} aria-pressed={speaking} onClick={() => toggle(`${s.title}. ${text}`)}>{speaking ? "Stop reading" : "Listen to this story"}</Button>}
        <Button variant="primary" onClick={close}>Close</Button>
      </>}>
      <p className="font-serif text-[1.1rem] leading-[1.7]">{s.transcript || s.excerpt}</p>
    </Dialog>
  );
}

function WriteStoryDialog() {
  const { update } = useStore();
  const toast = useToast();
  const close = useCloseModal();
  // Long writing is the easiest thing to lose, so it autosaves as a draft.
  const [form, setForm, draft] = useDraft("story", { title: "", body: "", cat: "Written Memories" });
  const { title, body, cat } = form;
  const set = (k) => (e) => setForm((x) => ({ ...x, [k]: e.target.value }));
  const [tried, setTried] = useState(false);

  const publish = () => {
    setTried(true);
    if (!title.trim() || !body.trim()) {
      toast("Add a title and your story", { error: true, sub: "Both fields are needed to publish." });
      document.getElementById(title.trim() ? "wsB" : "wsT").focus();
      return;
    }
    update((s) => {
      s.stories.unshift({
        id: uid("s"), title: title.trim(), kind: "written", category: cat, by: ME, recorded: new Date().toISOString().slice(0, 10),
        excerpt: body.trim().slice(0, 180) + (body.length > 180 ? "…" : ""), transcript: body.trim(), loves: 0, reflections: 0, isNew: true,
      });
    }, `Published “${title.trim()}”`);
    toast("Story published", { sub: "Visible to the Mackenzie Kinship Circle.", icon: "auto_stories" });
    draft.clear();
    close();
  };

  return (
    <Dialog wide title="Write a family story" sub="A written memory is just as precious as a recording."
      footer={<><DraftNote draft={draft} /><CancelButton /><Button variant="primary" onClick={publish}>Publish to Archive</Button></>}>
      <Field id="wsT" label="Title" hint="Required">
        <Input id="wsT" value={title} onChange={set("title")} invalid={tried && !title.trim()} />
      </Field>
      <Field id="wsB" label="Your story" hint="Required">
        <Textarea id="wsB" rows={8} value={body} onChange={set("body")} invalid={tried && !body.trim()} placeholder="Start wherever feels natural…" />
      </Field>
      <Field id="wsC" label="Category">
        <Select id="wsC" value={cat} onChange={set("cat")}>
          <option>Written Memories</option><option>Traditions & Recipes</option><option>Elder Oral Histories</option>
        </Select>
      </Field>
    </Dialog>
  );
}

function StoryCard({ s }) {
  const { person, update } = useStore();
  const { open } = useModal();
  const by = person(s.by);
  const audio = s.kind === "audio";
  const toggleLove = () => update((st) => {
    const x = st.stories.find((y) => y.id === s.id);
    x.loved = !x.loved;
    x.loves += x.loved ? 1 : -1;
  }, `${s.loved ? "Unloved" : "Loved"} “${s.title}”`);

  return (
    <article className="grid min-w-0 content-start gap-2.5 rounded-[18px] border border-line bg-surface p-4.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone={audio ? "sec" : "default"} icon={audio ? "graphic_eq" : "edit_note"}>
            {audio ? "Audio Story" : "Written Memoir"}{audio && s.duration ? ` · ${Math.round(s.duration / 60)} mins` : ""}
          </Tag>
          {s.verified && <Tag tone="gold" icon="verified">Verified Oral History</Tag>}
          {s.isNew && <Tag tone="dark">Just recorded</Tag>}
        </div>
        <span className="text-xsmall text-muted">{fmtDate(s.recorded)}</span>
      </div>
      <h3>{s.title}</h3>
      <p className="text-small text-muted">{s.excerpt}</p>
      {audio && <AudioPlayer id={s.id} duration={s.duration} label={s.title} />}
      <div className="flex flex-wrap items-center gap-2.5">
        {s.transcript || !audio
          ? <Button size="sm" variant="soft" icon="article" onClick={() => open(<ReadDialog s={s} />)}>{audio ? "View Full Transcript" : "Read Story"}</Button>
          : <span className="text-xsmall text-muted"><Icon name="hourglass_empty" size="xs" /> Transcript being prepared</span>}
      </div>
      <div className="mt-1 flex items-center gap-2.5 border-t border-line pt-3">
        <Avatar p={by} round />
        <div className="min-w-0 flex-1">
          <strong className="text-small">{fullName(by)}</strong>
          <p className="text-xsmall text-muted">{by.role} (Gen {by.gen})</p>
        </div>
        <Button variant="ghost" size="sm" aria-label={`Love this story, ${s.loves} loves`} aria-pressed={!!s.loved} onClick={toggleLove}>
          <Icon name="favorite" size="sm" fill={s.loved} /> {s.loves}
        </Button>
        <span className="text-xsmall text-muted"><Icon name="forum" size="xs" /> {s.reflections}</span>
      </div>
    </article>
  );
}

export default function Stories() {
  const { state: st } = useStore();
  const { open } = useModal();
  const [params, setParams] = useSearchParams();
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState(() => params.get("q") || "");
  const [sort, setSort] = useState("newest");
  const [kind, setKind] = useState("all");
  const t = useT();
  const urlQ = params.get("q") || "";
  const [prevQ, setPrevQ] = useState(urlQ);
  if (urlQ !== prevQ) { setPrevQ(urlQ); setQ(urlQ); }
  const [promptIdx, setPromptIdx] = useState(0);
  const forName = params.get("for");

  const goToStudio = () => {
    document.getElementById("studio").scrollIntoView({ behavior: "smooth" });
    document.getElementById("consent").focus({ preventScroll: true });
  };
  // Arriving via "Record a Story" (?record=1): jump to the studio.
  useEffect(() => { if (params.get("record")) setTimeout(goToStudio, 60); }, [params]);

  const choosePrompt = (i) => { setPromptIdx(i); if (forName) setParams({ record: "1" }); };

  const ql = q.toLowerCase();
  const list = st.stories.filter((s) => (cat === "all" || s.category === cat) && (kind === "all" || s.kind === kind)
    && (!ql || (s.title + s.excerpt + s.transcript).toLowerCase().includes(ql))).sort(SORTS[sort]);

  return (
    <>
      <Hero className="flex flex-wrap items-center gap-6">
        <div className="min-w-65 flex-1">
          <Tag tone="sec" icon="mic">LIVING ORAL HERITAGE VAULT</Tag>
          <h1 className="mt-4">{t("h1.stories")}</h1>
          <p className="mt-2 text-muted">Preserving the voices, inflection, wisdom, and warm memories of the Mackenzie family lineage across four generations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button icon="lightbulb" onClick={() => {
            document.getElementById("promptCard").scrollIntoView({ behavior: "smooth", block: "center" });
            document.querySelector("[data-alt-prompt]")?.focus({ preventScroll: true });
          }}>Browse Prompts</Button>
          <Button icon="edit" onClick={() => open(<WriteStoryDialog />)}>Write a Story</Button>
          <Button variant="primary" icon="mic" onClick={goToStudio}>Record a Voice Story</Button>
        </div>
      </Hero>

      <RecordingStudio promptIdx={promptIdx} setPromptIdx={choosePrompt} forName={forName} />

      <section className="mt-7" aria-labelledby="presH">
        <SectionTitle>
          <div>
            <h2 id="presH">Preserved Stories &amp; Folios</h2>
            <p className="text-small text-muted">{st.stories.length} digitised audio tapes, written journals, and heirloom spoken recordings.</p>
          </div>
          <InputIcon icon="search" className="min-w-60">
            <label className="sr-only" htmlFor="stQ">Search spoken transcripts</label>
            <Input id="stQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search spoken transcripts…" />
          </InputIcon>
        </SectionTitle>
        <Chips scroll role="group" aria-label="Category">
          <Chip pressed={cat === "all"} count={st.stories.length} onClick={() => setCat("all")}>All Stories</Chip>
          {CATS.map((c) => (
            <Chip key={c} pressed={cat === c} count={st.stories.filter((s) => s.category === c).length} onClick={() => setCat(c)}>{c}</Chip>
          ))}
        </Chips>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Tabs role="radiogroup" label={t("stories.kind.all")} value={kind} onChange={setKind}
            items={[["all", t("stories.kind.all")], ["audio", <span key="a" className="inline-flex items-center gap-1"><Icon name="graphic_eq" size="xs" />{t("stories.kind.audio")}</span>], ["written", <span key="w" className="inline-flex items-center gap-1"><Icon name="edit_note" size="xs" />{t("stories.kind.written")}</span>]]} />
          <label htmlFor="stSort" className="ml-auto text-small text-muted">{t("sort.label")}</label>
          <Select id="stSort" className="w-auto!" value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.keys(SORTS).map((k) => <option key={k} value={k}>{t(`sort.${k}`)}</option>)}
          </Select>
        </div>
        <div className="mt-4">
          {list.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4.5">{list.map((s) => <StoryCard key={s.id} s={s} />)}</div>
          ) : (
            <Empty icon="search_off" title="No stories found"><p className="text-small">Try different words, or record the first one yourself.</p></Empty>
          )}
        </div>
      </section>

      <Card tone="soft" className="mt-7 flex flex-wrap items-center gap-2.5">
        <IconBox icon="backup" tone="dark" />
        <div className="min-w-0 flex-1">
          <strong>Permanent Heritage Redundancy Active</strong>
          <p className="text-xsmall text-muted">All Mackenzie voice archives are replicated across offline storage and dual family custodians.</p>
        </div>
      </Card>
    </>
  );
}
