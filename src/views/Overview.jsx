/* 5.1 Overview Dashboard */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AudioPlayer from "../components/AudioPlayer";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import {
  Avatar, Button, Card, Check, Chip, Chips, Eyebrow, Hero, Icon, IconBox, IconButton, Input, Photo, PhotoOverlay, Record, SectionTitle, Tag, Visibility,
} from "../components/ui";
import { ME } from "../data";
import AddMemoryDialog from "../dialogs/AddMemoryDialog";
import InviteDialog from "../dialogs/InviteDialog";
import { cx, fmtDate, fmtDur, monthName } from "../lib/format";
import { rich, useT } from "../lib/i18n";
import { age, daysToBirthday, fullName, useStore } from "../lib/store";

const POLL_SEED = [7, 4, 9, 3];

/** A one-question family poll with live result bars. Votes persist in the demo store. */
function FamilyPoll() {
  const { state, update } = useStore();
  const t = useT();
  const toast = useToast();
  const poll = state.poll || { votes: POLL_SEED, mine: null };
  const [choice, setChoice] = useState(poll.mine ?? 0);
  const [editing, setEditing] = useState(poll.mine === null || poll.mine === undefined);
  const options = t("poll.options");
  const total = poll.votes.reduce((a, b) => a + b, 0);
  const vote = (e) => {
    e.preventDefault();
    update((s) => {
      const p = s.poll || { votes: [...POLL_SEED], mine: null };
      if (p.mine !== null && p.mine !== undefined) p.votes[p.mine]--;
      p.votes[choice]++;
      p.mine = choice;
      s.poll = p;
    }, t("ov.pollHistory"));
    setEditing(false);
    toast(t("poll.thanks"), { icon: "how_to_vote", duration: 2500 });
  };
  return (
    <Card sec="overview" aria-labelledby="pollH">
      <Eyebrow icon="how_to_vote">{t("poll.eyebrow")}</Eyebrow>
      <h2 id="pollH" className="mt-1 text-[1.1rem]!">{t("poll.title")}</h2>
      {editing ? (
        <form onSubmit={vote} className="mt-3 grid gap-2">
          {options.map((o, i) => (
            <Check key={o} type="radio" name="poll" checked={choice === i} onChange={() => setChoice(i)}
              className={cx("rounded-xl border p-3", choice === i ? "border-sec bg-sec-soft font-semibold" : "hover-tint border-line bg-surface-2")}>{o}</Check>
          ))}
          <Button variant="primary" type="submit" icon="how_to_vote">{t("poll.vote")}</Button>
        </form>
      ) : (
        <div className="mt-3 grid gap-2.5" aria-live="polite">
          {options.map((o, i) => {
            const pct = total ? Math.round((poll.votes[i] / total) * 100) : 0;
            return (
              <div key={o}>
                <div className="flex justify-between gap-2 text-small">
                  <span className={i === poll.mine ? "font-semibold" : ""}>{o}{i === poll.mine && <Icon name="check_circle" size="xs" className="ml-1 text-pine-700" />}</span>
                  <span className="text-muted">{pct}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-sec transition-[width] duration-700" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between text-xsmall text-muted">
            <span>{t("poll.votes", { n: total })}</span>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>{t("poll.change")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function MoodCheck() {
  const t = useT();
  const toast = useToast();
  const [mood, setMood] = useState(null);
  const icons = ["sentiment_very_satisfied", "history_edu", "volunteer_activism", "bedtime", "favorite"];
  const options = t("mood.options");
  return (
    <Card sec="stories" aria-labelledby="moodH">
      <Eyebrow icon="mood">{t("poll.eyebrow")}</Eyebrow>
      <h2 id="moodH" className="mt-1 text-[1.1rem]!">{t("mood.title")}</h2>
      <Chips className="mt-3" role="radiogroup" aria-label={t("mood.title")}>
        {options.map((o, i) => (
          <Chip key={o} icon={icons[i]} pressed={mood === i}
            onClick={() => { setMood(i); toast(t("mood.thanks", { mood: o.toLowerCase() }), { icon: icons[i], duration: 3000 }); }}>{o}</Chip>
        ))}
      </Chips>
      {mood !== null && <p className="mt-3 animate-fade rounded-xl bg-surface-2 p-3 text-small" aria-live="polite">{t("mood.thanks", { mood: options[mood].toLowerCase() })}</p>}
    </Card>
  );
}

function MemoryShuffle() {
  const { state } = useStore();
  const t = useT();
  const [i, setI] = useState(0);
  const list = state.memories;
  if (!list.length) return null;
  const m = list[i % list.length];
  return (
    <Card sec="memories" aria-labelledby="otdH">
      <div className="flex items-center justify-between gap-2">
        <div><Eyebrow icon="auto_awesome">{t("otd.eyebrow")}</Eyebrow><h2 id="otdH" className="mt-1 text-[1.1rem]!">{t("otd.title")}</h2></div>
        <IconButton icon="shuffle" label={t("otd.shuffle")} title={t("otd.shuffle")} onClick={() => setI(i + 1 + Math.floor(Math.random() * (list.length - 1)))} />
      </div>
      <Photo key={m.id} as={Link} to={`/memories?q=${encodeURIComponent(m.title)}`} p1={m.p1} p2={m.p2} icon={m.icon} img={m.img} sample={m.id} alt={m.alt}
        aspect="aspect-video" className="mt-3 animate-fade">
        <PhotoOverlay><strong className="block font-serif">{m.title}</strong><small>{fmtDate(m.date, m.approx)} · {m.place}</small></PhotoOverlay>
      </Photo>
      <Link to={`/memories?q=${encodeURIComponent(m.title)}`} className="mt-2 inline-block text-small">{t("otd.open")} ›</Link>
    </Card>
  );
}

function MiniNode({ p, tag }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/tree?person=${p.id}`)}
      className="lift flex min-w-40 cursor-pointer items-center gap-2.5 rounded-xl border border-sec-line bg-surface px-3 py-2 text-left">
      <Avatar p={p} round />
      <span>
        <strong className="block text-[.86rem]">{p.first}{p.id === ME && ` (${t("common.you")})`}</strong>
        <small className="text-xsmall text-pine-700">{tag}</small>
      </span>
    </button>
  );
}
const MiniRow = ({ children }) => <div className="flex min-w-max justify-center gap-3">{children}</div>;
const MiniLink = () => <div className="mx-auto h-5.5 w-0.5 bg-line" />;

function Reply({ r }) {
  const { person, relationToMe } = useStore();
  const p = person(r.by);
  return (
    <div className="flex gap-3 border-t border-line py-3.5">
      <Avatar p={p} round />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2.5">
          <strong>{p.first} ({relationToMe(p)})</strong><span className="text-xsmall text-muted">{r.when}</span>
        </div>
        <p className="mt-2 text-small text-muted">“{r.text}”</p>
      </div>
    </div>
  );
}


function RsvpDialog({ value, onSave }) {
  const t = useT();
  const close = useCloseModal();
  const [v, setV] = useState(value);
  return (
    <Dialog title={t("ov.rsvp.title")} sub={t("ov.rsvp.when")}
      footer={<><CancelButton /><Button variant="primary" onClick={() => { onSave(v); close(); }}>{t("ov.rsvp.save")}</Button></>}>
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="text-small text-muted">{t("ov.rsvp.q")}</legend>
        {[["yes", t("ov.rsvp.optYes")], ["maybe", t("ov.rsvp.optMaybe")], ["no", t("ov.rsvp.optNo")]].map(([k, l]) => (
          <Check key={k} type="radio" name="rsvp" checked={v === k} onChange={() => setV(k)}>{l}</Check>
        ))}
      </fieldset>
    </Dialog>
  );
}

export default function Overview() {
  const { state: st, update, person, kin } = useStore();
  const toast = useToast();
  const { open } = useModal();
  const navigate = useNavigate();
  const [reply, setReply] = useState("");
  const [rsvp, setRsvp] = useState("yes");
  const t = useT();
  const [hour] = useState(() => new Date().getHours());
  const greet = hour < 12 ? "greet.morning" : hour < 18 ? "greet.afternoon" : "greet.evening";

  const me = person(ME);
  const p = person;
  // The next birthday among living relatives; there may be none (e.g. a newly started archive).
  const nb = st.people.filter((x) => !x.died && x.id !== ME && x.born).sort((a, b) => daysToBirthday(a) - daysToBirthday(b))[0];
  const nbDate = nb && new Date(nb.born);
  const story = st.stories.find((s) => s.id === "s1") || st.stories[0];
  const recipe = st.stories.slice(1, 5).filter((s) => s.kind === "audio").slice(-1)[0];
  const recentMem = st.memories[st.memories.length - 1];

  const postReply = (e) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text) { toast(t("ov.reply.empty"), { error: true, sub: t("ov.reply.emptySub") }); document.getElementById("replyInput").focus(); return; }
    update((s) => { s.replies.push({ by: ME, when: t("common.justNow"), text }); }, t("ov.reply.history"));
    setReply("");
    toast(t("ov.reply.shared"), {
      sub: t("ov.reply.sharedSub"), action: t("common.undo"), onAction: () => update((s) => { s.replies.pop(); }, t("ov.reply.removed")),
    });
  };

  return (
    <>
      <Hero aria-labelledby="welcome">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar p={me} size="xl" round />
          <div className="min-w-0 flex-1 max-sm:basis-full">
            <h1 id="welcome">{t(greet)}, {me.first}</h1>
            <p className="mt-2 text-muted">{t("ov.stats", { n: st.people.length })}</p>
          </div>
        </div>
        <div role="group" aria-label={t("ov.primary")}
          className="mt-5.5 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-4">
          {/* Each shortcut wears the colour of the section it leads to. */}
          <Button variant="primary" sec="memories" size="lg" icon="add_photo_alternate" onClick={() => open(<AddMemoryDialog />)}>{t("ov.addMemory")}</Button>
          <Button sec="stories" size="lg" icon="mic" to="/stories?record=1">{t("ov.recordStory")}</Button>
          <Button sec="tree" size="lg" icon="account_tree" to="/tree">{t("ov.exploreTree")}</Button>
          <Button sec="directory" size="lg" icon="person_add" onClick={() => open(<InviteDialog />)}>{t("ov.invite")}</Button>
        </div>
      </Hero>

      <div className="mt-5.5 grid gap-5.5 md:grid-cols-2 xl:grid-cols-3">
        <FamilyPoll />
        <MoodCheck />
        <MemoryShuffle />
      </div>

      <div className="mt-5.5 grid grid-cols-[minmax(0,1fr)] gap-5.5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5.5">
          <Card sec="tree" aria-labelledby="lin">
            <SectionTitle>
              <h2 id="lin" className="flex flex-wrap items-center gap-2.5"><Icon name="account_tree" /> {t("ov.lineage")}</h2>
              <Tag tone="outline">{t("ov.gens")}</Tag>
            </SectionTitle>
            <Record className="text-small">
              <Icon name="info" />
              <span className="min-w-0 flex-1">{rich(t("ov.guide"))}</span>
              <Eyebrow>{t("ov.descendant")}</Eyebrow>
            </Record>
            <div className="mt-3.5 overflow-x-auto rounded-2xl bg-surface-2 p-4.5">
              <MiniRow><MiniNode p={me} tag={t("ov.tag.me")} /><MiniNode p={p("john")} tag="1942 — 2021" /></MiniRow>
              <MiniLink />
              <MiniRow>
                <MiniNode p={p("sarah")} tag={t("ov.tag.daughter", { y: 1971 })} /><MiniNode p={p("michael")} tag={t("ov.tag.son", { y: 1975 })} /><MiniNode p={p("james")} tag={t("ov.tag.son", { y: 1980 })} />
              </MiniRow>
              <MiniLink />
              <MiniRow>
                <MiniNode p={p("daniel")} tag={t("ov.tag.grandson", { age: age(p("daniel")) })} />
                <MiniNode p={p("anna")} tag={t("ov.tag.bday", { n: daysToBirthday(p("anna")) })} />
                <MiniNode p={p("grace")} tag={t("ov.tag.granddaughter")} />
              </MiniRow>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
              <span className="text-small text-muted">{t("ov.tapRelative")}</span>
              <Button variant="primary" to="/tree">{t("ov.openTree")} <Icon name="arrow_forward" size="sm" /></Button>
            </div>
          </Card>

          <Card sec="stories" aria-labelledby="oral">
            <SectionTitle>
              <div>
                <h2 id="oral" className="flex flex-wrap items-center gap-2.5"><Icon name="record_voice_over" /> {t("ov.oral")}</h2>
                <p className="mt-2 text-small text-muted">{t("ov.oralSub")}</p>
              </div>
              <Button variant="primary" size="sm" icon="mic" to="/stories?record=1">{t("ov.recordNew")}</Button>
            </SectionTitle>
            {story && <Card as="article" tone="soft">
              <div className="flex items-start gap-2.5">
                <IconBox icon="radio_button_checked" tone="solid" />
                <div className="min-w-0 flex-1">
                  <h3>{story.title}</h3>
                  <Tag tone="gold" className="mt-2">{story.tag}</Tag>
                  <p className="mt-2 text-small text-muted">
                    {rich(t("ov.narrated", { name: fullName(p(story.by)), date: fmtDate(story.recorded), dur: fmtDur(story.duration) }))}
                  </p>
                </div>
              </div>
              <div className="mt-4"><AudioPlayer id={story.id} duration={story.duration} label={story.title} /></div>
              <div className="mt-4 rounded-xl bg-surface p-3.5">
                <Eyebrow>{t("ov.transcript")}</Eyebrow>
                <p className="mt-2 font-serif italic">“{story.transcript}”</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 text-small">
                  <span className="text-muted">{t("ov.transcriptNote")}</span><Link to="/stories">{t("ov.readTranscript")}</Link>
                </div>
              </div>
            </Card>}
            {recipe && (
              <Record icon="restaurant" className="mt-4">
                <div className="min-w-0 flex-1"><strong>{recipe.title}</strong><p className="text-small text-muted">{recipe.excerpt} • {fmtDur(recipe.duration)}</p></div>
                <Button size="sm" icon="play_arrow" to="/stories">{t("ov.listen")}</Button>
              </Record>
            )}
          </Card>

          <Card sec="messages" aria-labelledby="prompt">
            <div className="flex items-center justify-between gap-2.5">
              <Eyebrow icon="lightbulb">{t("ov.prompt")}</Eyebrow><Tag tone="outline">{t("ov.contributed", { n: st.replies.length })}</Tag>
            </div>
            <Card tone="soft" className="mt-4">
              <h3 id="prompt">{t("ov.promptQ")}</h3>
              <p className="mt-2 text-small text-muted">{t("ov.promptBy")}</p>
            </Card>
            <div className="mt-4">{st.replies.map((r, i) => <Reply key={i} r={r} />)}</div>
            <form className="mt-4 flex items-center gap-2.5" onSubmit={postReply}>
              <label htmlFor="replyInput" className="sr-only">{t("ov.shareOwn")}</label>
              <Input id="replyInput" className="flex-1" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={400}
                placeholder={t("ov.sharePh", { name: me.first })} />
              <Button variant="primary" type="submit">{t("ov.post")}</Button>
            </form>
          </Card>
        </div>

        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5.5 [&>*]:min-w-0">
          <Card sec="calendar" aria-labelledby="gath">
            <SectionTitle><h2 id="gath" className="flex items-center gap-2.5 text-[1.2rem]!"><Icon name="event" /> {t("ov.gatherings")}</h2></SectionTitle>
            {/* Longer languages (e.g. Kinyarwanda) wrap inside the narrow side column instead of widening it. */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5">
              {nb && <div className="flex gap-3 rounded-[14px] border border-sec-line bg-sec-soft p-3.5">
                <DateBadge month={monthName(nbDate.getMonth()).toUpperCase()} day={nbDate.getDate()} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2.5"><strong>{t("ov.birthday", { name: nb.first, n: age(nb) + 1 })}</strong><Tag tone="terra" icon="cake" className="shrink-0">{t("ov.inDays", { n: daysToBirthday(nb) })}</Tag></div>
                  <p className="text-small text-muted">{kin(nb.role)}</p>
                  <div className="mt-2 flex flex-wrap gap-2.5">
                    <Button size="sm" wrap icon="mic" iconSize="xs" onClick={() => navigate(`/stories?record=1&for=${encodeURIComponent(nb.first)}`)}>{t("ov.voiceCard")}</Button>
                    <Button size="sm" wrap icon="attach_file" iconSize="xs" onClick={() => open(<AddMemoryDialog />)}>{t("ov.attach")}</Button>
                  </div>
                </div>
              </div>}
              <div className="flex gap-3 rounded-[14px] border border-sec-line bg-sec-soft p-3.5">
                <DateBadge month={monthName(7).toUpperCase()} day="14" mint />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2.5"><strong>{t("ov.reunion")}</strong><Tag tone="dark" className="shrink-0">{t("ov.attending", { n: 18 })}</Tag></div>
                  <p className="text-small text-muted">{t("ov.reunionWhere")}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 text-small">
                    <span className="text-pine-700"><Icon name="check_circle" size="xs" /> {t(`ov.rsvp.${rsvp}`)}</span>
                    <Button variant="ghost" size="sm" wrap
                      onClick={() => open(<RsvpDialog value={rsvp} onSave={(v) => { setRsvp(v); toast(t("ov.rsvp.saved"), { sub: t(`ov.rsvp.${v}`) }); }} />)}>
                      {t("ov.rsvp.review")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card sec="memories" aria-labelledby="alb">
            <SectionTitle>
              <h2 id="alb" className="flex items-center gap-2.5 text-[1.2rem]!"><Icon name="photo_library" /> {t("ov.albums")}</h2>
              <Link className="text-small" to="/memories">{t("ov.viewAll")}</Link>
            </SectionTitle>
            {recentMem && <>
            <Photo as={Link} to="/memories" p1={recentMem.p1} p2={recentMem.p2} icon={recentMem.icon} img={recentMem.img} sample={recentMem.id}
              alt={recentMem.alt} aspect="aspect-16/10">
              <PhotoOverlay>
                <Tag tone="gold">{t("ov.featured")}</Tag>
                <strong className="mt-1.5 block font-serif text-[1.15rem]">{recentMem.title}</strong>
              </PhotoOverlay>
            </Photo>
            <div className="mt-2 flex items-center justify-between gap-2.5 text-small">
              <span className="text-muted">{t("ov.albumStats")}</span><Tag>{t("ov.tagged", { n: recentMem.tagged.length })}</Tag>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2.5 text-small">
              <Visibility>{recentMem.visibility}</Visibility><Link to="/memories">{t("ov.openAlbum")}</Link>
            </div>
            </>}
          </Card>

          <Card tone="dark" sec="privacy" aria-labelledby="priv">
            <div className="flex items-start gap-2.5">
              <IconBox icon="shield_lock" tone="mint" />
              <div>
                <h3 id="priv">{t("ov.sanctuary")}</h3>
                <p className="mt-2 text-small text-on-dark">{t("ov.sanctuarySub")}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2.5 border-t border-white/10 pt-3 text-small">
              <span><Icon name="lock" size="xs" /> {t("ov.publicAccess")}</span><span>{rich(t("ov.guardian", { name: "Sarah Mackenzie" }))}</span>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

function DateBadge({ month, day, mint }) {
  return (
    <div className={`h-fit w-12 shrink-0 rounded-[10px] py-1.5 text-center ${mint ? "bg-mint-200 text-pine-900" : "bg-gold-100 text-gold-ink"}`}>
      <small className="block text-tag font-bold tracking-[.08em]">{month}</small>
      <strong className="font-serif text-[1.2rem]">{day}</strong>
    </div>
  );
}

