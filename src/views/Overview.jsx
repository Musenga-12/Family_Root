/* 5.1 Overview Dashboard */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AudioPlayer from "../components/AudioPlayer";
import GettingStarted from "../components/GettingStarted";
import { useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import {
  Avatar, Button, Card, Check, Chip, Chips, Eyebrow, Hero, Icon, IconBox, IconButton, Input, Photo, PhotoOverlay, Record, SectionTitle, Tag, Visibility,
} from "../components/ui";
import { ME } from "../data";
import AddMemoryDialog from "../dialogs/AddMemoryDialog";
import AddPersonDialog from "../dialogs/AddPersonDialog";
import InviteDialog from "../dialogs/InviteDialog";
import { api } from "../lib/api";
import { cx, fmtDate, fmtDur, fmtWhen, monthName, todayISO, uid } from "../lib/format";
import { rich, useT } from "../lib/i18n";
import { accountPerson, useSession } from "../lib/session";
import { age, daysToBirthday, fullName, nextBirthday, useStore, year } from "../lib/store";

const POLL_SEED = [7, 4, 9, 3];
const MODERATORS = ["Admin", "Custodian"];

/** Admins and Custodians start polls and set the week's question. */
function useModerator() {
  const { me } = useSession();
  return !me || MODERATORS.includes(me.role);
}

/** "Ask the family to choose": a question and two to four choices (family server; one poll at a time). */
function NewPoll() {
  const { update } = useStore();
  const t = useT();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const start = async (e) => {
    e.preventDefault();
    const options = opts.map((o) => o.trim()).filter(Boolean);
    if (!q.trim() || options.length < 2 || new Set(options).size !== options.length) { toast(t("poll.needTwo"), { error: true }); return; }
    setBusy(true);
    try {
      const made = await api("/polls", { body: { question: q.trim(), options } });
      update((s) => { s.poll = { id: made.id, question: made.question, options: made.options, votes: made.votes, mine: null }; }, null);
      toast(t("poll.created"), { icon: "how_to_vote" });
    } catch (err) { toast(err.message, { error: true }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={start} className="mt-3 grid gap-2">
      <label className="grid gap-1 text-small font-semibold" htmlFor="npQ">{t("poll.createQ")}
        <Input id="npQ" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} placeholder={t("poll.createQPh")} />
      </label>
      {opts.map((o, i) => (
        <Input key={i} aria-label={t("poll.createOpt", { n: i + 1 })} value={o} maxLength={80} placeholder={t("poll.createOpt", { n: i + 1 })}
          onChange={(e) => setOpts(opts.map((x, k) => (k === i ? e.target.value : x)))} />
      ))}
      <Button variant="primary" type="submit" icon="how_to_vote" busy={busy}>{t("poll.createBtn")}</Button>
    </form>
  );
}

/** A one-question family poll with live result bars. The demo has a sample poll; a family's own comes from its server. */
function FamilyPoll() {
  const { state, update, server } = useStore();
  const t = useT();
  const toast = useToast();
  const moderator = useModerator();
  const onServer = server.source === "server";
  const poll = state.poll || (onServer ? null : { votes: POLL_SEED, mine: null });
  const [choice, setChoice] = useState(poll?.mine ?? 0);
  const [editing, setEditing] = useState(poll?.mine === null || poll?.mine === undefined);
  if (!poll) {
    if (!moderator) return null;
    return (
      <Card sec="overview" aria-labelledby="pollH">
        <Eyebrow icon="how_to_vote">{t("poll.eyebrow")}</Eyebrow>
        <h2 id="pollH" className="mt-1 text-[1.1rem]!">{t("poll.create")}</h2>
        <p className="mt-1 text-small text-muted">{t("poll.createSub")}</p>
        <NewPoll />
      </Card>
    );
  }
  const options = poll.options || t("poll.options");
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
      <h2 id="pollH" className="mt-1 text-[1.1rem]!">{poll.question || t("poll.title")}</h2>
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

const MOODS = ["joyful", "nostalgic", "grateful", "tired", "missing"]; // the order of mood.options
const MOOD_ICONS = ["sentiment_very_satisfied", "history_edu", "volunteer_activism", "bedtime", "favorite"];

function MoodCheck() {
  const t = useT();
  const toast = useToast();
  const { server } = useStore();
  const [mood, setMood] = useState(null);
  // Today's answer on the family server (one per person per day; choosing again changes it).
  const choose = (i, o) => {
    setMood(i);
    toast(t("mood.thanks", { mood: o.toLowerCase() }), { icon: MOOD_ICONS[i], duration: 3000 });
    if (server.source === "server") api("/mood", { method: "PUT", body: { mood: MOODS[i] } }).catch(() => { /* the check-in is optional */ });
  };
  const options = t("mood.options");
  return (
    <Card sec="stories" aria-labelledby="moodH">
      <Eyebrow icon="mood">{t("poll.eyebrow")}</Eyebrow>
      <h2 id="moodH" className="mt-1 text-[1.1rem]!">{t("mood.title")}</h2>
      <Chips className="mt-3" role="radiogroup" aria-label={t("mood.title")}>
        {options.map((o, i) => (
          <Chip key={o} icon={MOOD_ICONS[i]} pressed={mood === i}
            onClick={() => choose(i, o)}>{o}</Chip>
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
  if (!p) return null;
  return (
    <div className="flex gap-3 border-t border-line py-3.5">
      <Avatar p={p} round />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2.5">
          <strong>{p.first} ({relationToMe(p)})</strong><span className="text-xsmall text-muted">{r.when || (r.at && fmtWhen(r.at))}</span>
        </div>
        <p className="mt-2 text-small text-muted">“{r.text}”</p>
      </div>
    </div>
  );
}

/** Your closest family, drawn from the tree: your parents, you and your partner, your children, their children. */
function ClosestFamily() {
  const { state, person, children, relationToMe } = useStore();
  const t = useT();
  const { open } = useModal();
  const me = person(ME);
  const partner = me?.spouse && person(me.spouse);
  const unique = (list) => [...new Map(list.map((p) => [p.id, p])).values()];
  const kids = unique([...children(ME), ...(partner ? children(partner.id) : [])]);
  const grandkids = unique(kids.flatMap((k) => children(k.id)));
  const parents = (me?.parents || []).map(person).filter(Boolean);
  const tag = (p) => {
    if (p.died) return `${year(p.born)} — ${year(p.died)}`;
    const rel = p.id === ME ? t("common.you") : relationToMe(p);
    return year(p.born) ? t("ov.tag.rel", { rel, y: year(p.born) }) : rel;
  };
  const real = state.people.filter((p) => !p.local);
  const gens = new Set(real.map((p) => p.gen)).size;
  const [kid] = kids;
  const [grandkid] = grandkids;
  return (
    <Card sec="tree" aria-labelledby="lin">
      <SectionTitle>
        <h2 id="lin" className="flex flex-wrap items-center gap-2.5"><Icon name="account_tree" /> {t("ov.lineage")}</h2>
        {gens > 1 && <Tag tone="outline">{t("ov.gensN", { n: gens })}</Tag>}
      </SectionTitle>
      {kid && (
        <Record className="text-small">
          <Icon name="info" />
          <span className="min-w-0 flex-1">{rich(grandkid
            ? t("ov.guideN", { a: kid.first, ra: relationToMe(kid).toLowerCase(), b: grandkid.first, rb: relationToMe(grandkid).toLowerCase() })
            : t("ov.guide1", { a: kid.first, ra: relationToMe(kid).toLowerCase() }))}</span>
        </Record>
      )}
      <div className="mt-3.5 overflow-x-auto rounded-2xl bg-surface-2 p-4.5">
        {parents.length > 0 && <><MiniRow>{parents.map((p) => <MiniNode key={p.id} p={p} tag={tag(p)} />)}</MiniRow><MiniLink /></>}
        <MiniRow>{[me, partner].filter(Boolean).map((p) => <MiniNode key={p.id} p={p} tag={tag(p)} />)}</MiniRow>
        {kids.length > 0 && <><MiniLink /><MiniRow>{kids.map((p) => <MiniNode key={p.id} p={p} tag={tag(p)} />)}</MiniRow></>}
        {grandkids.length > 0 && <><MiniLink /><MiniRow>{grandkids.map((p) => <MiniNode key={p.id} p={p} tag={tag(p)} />)}</MiniRow></>}
      </div>
      {real.length <= 1 && <p className="mt-3 text-small text-muted">{t("ov.treeEmpty")}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-small text-muted">{t("ov.tapRelative")}</span>
        <span className="flex flex-wrap gap-2">
          <Button icon="group_add" onClick={() => open(<AddPersonDialog />)}>{t("ov.addRelative")}</Button>
          <Button variant="primary" to="/tree">{t("ov.openTree")} <Icon name="arrow_forward" size="sm" /></Button>
        </span>
      </div>
    </Card>
  );
}

/** The week's question for everyone to answer. The demo has a sample one; on a server, Admins and Custodians ask it. */
function WeeklyPrompt() {
  const { state: st, update, person, server } = useStore();
  const t = useT();
  const toast = useToast();
  const moderator = useModerator();
  const [reply, setReply] = useState("");
  const [ask, setAsk] = useState("");
  const onServer = server.source === "server";
  const prompt = onServer ? st.prompt : { question: t("ov.promptQ"), byLine: t("ov.promptBy") };
  const me = person(ME);

  const postReply = (e) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text) { toast(t("ov.reply.empty"), { error: true, sub: t("ov.reply.emptySub") }); document.getElementById("replyInput").focus(); return; }
    const id = uid("re");
    update((s) => { s.replies.push({ id, by: ME, when: t("common.justNow"), text }); }, t("ov.reply.history"));
    setReply("");
    toast(t("ov.reply.shared"), {
      sub: t("ov.reply.sharedSub"), action: t("common.undo"), onAction: () => update((s) => { s.replies = s.replies.filter((r) => r.id !== id); }, t("ov.reply.removed")),
    });
  };
  const askFamily = async (e) => {
    e.preventDefault();
    if (!ask.trim()) return;
    try {
      const made = await api("/prompts", { body: { question: ask.trim() } });
      update((s) => { s.prompt = { id: made.id, question: made.question, by: made.by }; s.replies = []; }, null);
      setAsk("");
      toast(t("ov.promptAsked"), { icon: "lightbulb" });
    } catch (err) { toast(err.message, { error: true }); }
  };

  if (!prompt) {
    if (!moderator) return null;
    return (
      <Card sec="messages" aria-labelledby="prompt">
        <Eyebrow icon="lightbulb">{t("ov.prompt")}</Eyebrow>
        <h2 id="prompt" className="mt-1 text-[1.1rem]!">{t("ov.promptAsk")}</h2>
        <p className="mt-1 text-small text-muted">{t("ov.promptAskSub")}</p>
        <form className="mt-4 flex flex-wrap items-center gap-2.5" onSubmit={askFamily}>
          <label htmlFor="askInput" className="sr-only">{t("ov.promptAsk")}</label>
          <Input id="askInput" className="min-w-60 flex-1" value={ask} maxLength={300} onChange={(e) => setAsk(e.target.value)} placeholder={t("ov.promptAskPh")} />
          <Button variant="primary" type="submit" icon="send">{t("ov.promptAskBtn")}</Button>
        </form>
      </Card>
    );
  }
  const asker = prompt.by && person(prompt.by);
  return (
    <Card sec="messages" aria-labelledby="prompt">
      <div className="flex items-center justify-between gap-2.5">
        <Eyebrow icon="lightbulb">{t("ov.prompt")}</Eyebrow><Tag tone="outline">{t("ov.contributed", { n: st.replies.length })}</Tag>
      </div>
      <Card tone="soft" className="mt-4">
        <h3 id="prompt">{onServer ? `“${prompt.question}”` : prompt.question}</h3>
        {(prompt.byLine || asker) && <p className="mt-2 text-small text-muted">{prompt.byLine || t("ov.promptByName", { name: fullName(asker) })}</p>}
      </Card>
      <div className="mt-4">{st.replies.map((r, i) => <Reply key={r.id || i} r={r} />)}</div>
      <form className="mt-4 flex items-center gap-2.5" onSubmit={postReply}>
        <label htmlFor="replyInput" className="sr-only">{t("ov.shareOwn")}</label>
        <Input id="replyInput" className="flex-1" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={400}
          placeholder={t("ov.sharePh", { name: me?.first || "" })} />
        <Button variant="primary" type="submit">{t("ov.post")}</Button>
      </form>
    </Card>
  );
}

/** The next gathering on the calendar, with the RSVP; or a way to plan the first one. */
function NextGathering() {
  const { state, update } = useStore();
  const t = useT();
  const today = todayISO();
  const e = state.events.filter((x) => x.date && x.date >= today && !x.cancelled).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!e) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] border border-dashed border-line p-3.5">
        <span className="text-small text-muted">{t("ov.noGathering")}</span>
        <Button size="sm" icon="event" to="/calendar">{t("ov.planGathering")}</Button>
      </div>
    );
  }
  const d = new Date(`${e.date}T00:00`);
  const toggle = () => update((s) => { const x = s.events.find((y) => y.id === e.id); x.going = !x.going; x.attending = (x.attending || 0) + (x.going ? 1 : -1); },
    `${e.going ? "Left" : "Joined"} “${e.title}”`);
  return (
    <div className="flex gap-3 rounded-[14px] border border-sec-line bg-sec-soft p-3.5">
      <DateBadge month={monthName(d.getMonth()).toUpperCase()} day={d.getDate()} mint />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2.5"><strong>{e.title}</strong><Tag tone="dark" className="shrink-0">{t("ov.attending", { n: e.attending || 0 })}</Tag></div>
        {e.sub && <p className="text-small text-muted">{e.sub}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 text-small">
          {e.going && <span className="text-pine-700"><Icon name="check_circle" size="xs" /> {t("ov.rsvp.yes")}</span>}
          <Button variant={e.going ? "ghost" : "primary"} size="sm" wrap onClick={toggle}>{e.going ? t("ov.rsvp.notGoing") : t("cal.rsvp")}</Button>
        </div>
      </div>
    </div>
  );
}

export default function Overview() {
  const { state: st, person, kin } = useStore();
  const { open } = useModal();
  const navigate = useNavigate();
  const t = useT();
  const [hour] = useState(() => new Date().getHours());
  const greet = hour < 12 ? "greet.morning" : hour < 18 ? "greet.afternoon" : "greet.evening";

  const { me: account } = useSession();
  const me = person(ME);
  // Signed in to a family server: greet the account itself.
  const greeted = account ? accountPerson(account) : me;
  const p = person;
  // The next birthday among living relatives; there may be none (e.g. a newly started archive).
  const nb = st.people.filter((x) => !x.died && x.id !== ME && daysToBirthday(x) !== null).sort((a, b) => daysToBirthday(a) - daysToBirthday(b))[0];
  const nbDays = nb ? daysToBirthday(nb) : null;
  const nbDate = nb && nextBirthday(nb);
  const nbAge = nb ? age(nb) : null;
  const story = st.stories.find((s) => s.id === "s1") || st.stories[0];
  const recipe = st.stories.filter((s) => s.kind === "audio" && s.id !== story?.id).slice(0, 4).slice(-1)[0];
  const recentMem = st.memories[st.memories.length - 1];
  const admins = st.members.filter((m) => m.role === "Admin").map((m) => m.name || fullName(person(m.id))).filter(Boolean);

  return (
    <>
      <Hero aria-labelledby="welcome">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar p={greeted} size="xl" round />
          <div className="min-w-0 flex-1 max-sm:basis-full">
            <h1 id="welcome">{t(greet)}, {greeted.first}</h1>
            <p className="mt-2 text-muted">{t("ov.stats", { n: st.people.filter((x) => !x.local).length })}</p>
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

      {account && <GettingStarted />}

      <div className="mt-5.5 grid gap-5.5 md:grid-cols-2 xl:grid-cols-3">
        <FamilyPoll />
        <MoodCheck />
        <MemoryShuffle />
      </div>

      <div className="mt-5.5 grid grid-cols-[minmax(0,1fr)] gap-5.5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5.5">
          <ClosestFamily />

          <Card sec="stories" aria-labelledby="oral">
            <SectionTitle>
              <div>
                <h2 id="oral" className="flex flex-wrap items-center gap-2.5"><Icon name="record_voice_over" /> {t("ov.oral")}</h2>
                <p className="mt-2 text-small text-muted">{t("ov.oralSub")}</p>
              </div>
              <Button variant="primary" size="sm" icon="mic" to="/stories?record=1">{t("ov.recordNew")}</Button>
            </SectionTitle>
            {!story && <p className="rounded-xl border border-dashed border-line p-4 text-small text-muted">{t("ov.storyNone")}</p>}
            {story && <Card as="article" tone="soft">
              <div className="flex items-start gap-2.5">
                <IconBox icon="radio_button_checked" tone="solid" />
                <div className="min-w-0 flex-1">
                  <h3>{story.title}</h3>
                  {story.tag && <Tag tone="gold" className="mt-2">{story.tag}</Tag>}
                  <p className="mt-2 text-small text-muted">
                    {rich(t("ov.narrated", { name: fullName(p(story.by)), date: fmtDate(story.recorded), dur: fmtDur(story.duration || 0) }))}
                  </p>
                </div>
              </div>
              {story.kind === "audio" && <div className="mt-4"><AudioPlayer id={story.id} duration={story.duration} label={story.title} /></div>}
              {(story.transcript || story.excerpt) && (
                <div className="mt-4 rounded-xl bg-surface p-3.5">
                  <Eyebrow>{t("ov.transcript")}</Eyebrow>
                  <p className="mt-2 font-serif italic">“{story.transcript || story.excerpt}”</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 text-small">
                    <span className="text-muted">{t("ov.transcriptNote")}</span><Link to="/stories">{t("ov.readTranscript")}</Link>
                  </div>
                </div>
              )}
            </Card>}
            {recipe && (
              <Record icon="restaurant" className="mt-4">
                <div className="min-w-0 flex-1"><strong>{recipe.title}</strong><p className="text-small text-muted">{recipe.excerpt} • {fmtDur(recipe.duration || 0)}</p></div>
                <Button size="sm" icon="play_arrow" to="/stories">{t("ov.listen")}</Button>
              </Record>
            )}
          </Card>

          <WeeklyPrompt />
        </div>

        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5.5 [&>*]:min-w-0">
          <Card sec="calendar" aria-labelledby="gath">
            <SectionTitle><h2 id="gath" className="flex items-center gap-2.5 text-[1.2rem]!"><Icon name="event" /> {t("ov.gatherings")}</h2></SectionTitle>
            {/* Longer languages (e.g. Kinyarwanda) wrap inside the narrow side column instead of widening it. */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5">
              {nb && <div className="flex gap-3 rounded-[14px] border border-sec-line bg-sec-soft p-3.5">
                <DateBadge month={monthName(nbDate.getMonth()).toUpperCase()} day={nbDate.getDate()} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2.5">
                    <strong>{nbAge !== null ? t("ov.birthday", { name: nb.first, n: nbAge + 1 }) : t("cal.bdayOf", { name: nb.first })}</strong>
                    <Tag tone="terra" icon="cake" className="shrink-0">{t("ov.inDays", { n: nbDays })}</Tag>
                  </div>
                  {nb.role && <p className="text-small text-muted">{kin(nb.role)}</p>}
                  <div className="mt-2 flex flex-wrap gap-2.5">
                    <Button size="sm" wrap icon="mic" iconSize="xs" onClick={() => navigate(`/stories?record=1&for=${encodeURIComponent(nb.first)}`)}>{t("ov.voiceCard")}</Button>
                    <Button size="sm" wrap icon="attach_file" iconSize="xs" onClick={() => open(<AddMemoryDialog />)}>{t("ov.attach")}</Button>
                  </div>
                </div>
              </div>}
              <NextGathering />
            </div>
          </Card>

          <Card sec="memories" aria-labelledby="alb">
            <SectionTitle>
              <h2 id="alb" className="flex items-center gap-2.5 text-[1.2rem]!"><Icon name="photo_library" /> {t("ov.albums")}</h2>
              <Link className="text-small" to="/memories">{t("ov.viewAll")}</Link>
            </SectionTitle>
            {!recentMem && (
              <div className="grid justify-items-start gap-2.5 rounded-xl border border-dashed border-line p-4">
                <p className="text-small text-muted">{t("ov.noMemories")}</p>
                <Button size="sm" icon="add_photo_alternate" onClick={() => open(<AddMemoryDialog />)}>{t("ov.addMemory")}</Button>
              </div>
            )}
            {recentMem && <>
            <Photo as={Link} to="/memories" p1={recentMem.p1} p2={recentMem.p2} icon={recentMem.icon} img={recentMem.img} sample={recentMem.id}
              alt={recentMem.alt} aspect="aspect-16/10">
              <PhotoOverlay>
                <Tag tone="gold">{t("ov.featured")}</Tag>
                <strong className="mt-1.5 block font-serif text-[1.15rem]">{recentMem.title}</strong>
              </PhotoOverlay>
            </Photo>
            <div className="mt-2 flex items-center justify-between gap-2.5 text-small">
              <span className="text-muted">{t("ov.albumStatsN", { photos: st.memories.length, audio: st.stories.filter((s) => s.kind === "audio").length })}</span>
              <Tag>{t("ov.tagged", { n: recentMem.tagged.length })}</Tag>
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-white/10 pt-3 text-small">
              <span><Icon name="lock" size="xs" /> {t("ov.publicAccess")}</span>
              {admins.length > 0 && <span>{rich(t("ov.admins", { names: admins.join(", ") }))}</span>}
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

