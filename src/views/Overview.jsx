/* 5.1 Overview Dashboard */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AudioPlayer from "../components/AudioPlayer";
import { useToggleEasy } from "../lib/useToggleEasy";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal, useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import {
  Avatar, Button, Card, Check, Chip, Chips, Eyebrow, Hero, Icon, IconBox, IconButton, Input, Photo, PhotoOverlay, Record, SectionTitle, Tag, Visibility,
} from "../components/ui";
import { ME } from "../data";
import AddMemoryDialog from "../dialogs/AddMemoryDialog";
import InviteDialog from "../dialogs/InviteDialog";
import { MONTHS, THIS_YEAR, fmtDate, fmtDur } from "../lib/format";
import { useT } from "../lib/i18n";
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
    }, "Voted in the family poll");
    setEditing(false);
    toast(t("poll.thanks"), { icon: "how_to_vote", duration: 2500 });
  };
  return (
    <Card aria-labelledby="pollH">
      <Eyebrow icon="how_to_vote">{t("poll.eyebrow")}</Eyebrow>
      <h2 id="pollH" className="mt-1 text-[1.1rem]!">{t("poll.title")}</h2>
      {editing ? (
        <form onSubmit={vote} className="mt-3 grid gap-2">
          {options.map((o, i) => (
            <Check key={o} type="radio" name="poll" checked={choice === i} onChange={() => setChoice(i)}
              className="rounded-xl border border-line bg-surface-2 p-2.5">{o}</Check>
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
                  <div className="h-full rounded-full bg-pine-700 transition-[width] duration-700 dark:bg-mint" style={{ width: `${pct}%` }} />
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
    <Card aria-labelledby="moodH">
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
    <Card aria-labelledby="otdH">
      <div className="flex items-center justify-between gap-2">
        <div><Eyebrow icon="auto_awesome">{t("otd.eyebrow")}</Eyebrow><h2 id="otdH" className="mt-1 text-[1.1rem]!">{t("otd.title")}</h2></div>
        <IconButton icon="shuffle" label={t("otd.shuffle")} title={t("otd.shuffle")} onClick={() => setI(i + 1 + Math.floor(Math.random() * (list.length - 1)))} />
      </div>
      <Photo key={m.id} as={Link} to={`/memories?q=${encodeURIComponent(m.title)}`} p1={m.p1} p2={m.p2} icon={m.icon} img={m.img} aria-label={m.alt}
        aspect="aspect-video" className="mt-3 animate-fade">
        <PhotoOverlay><strong className="block font-serif">{m.title}</strong><small>{fmtDate(m.date, m.approx)} · {m.place}</small></PhotoOverlay>
      </Photo>
      <Link to={`/memories?q=${encodeURIComponent(m.title)}`} className="mt-2 inline-block text-small">{t("otd.open")} ›</Link>
    </Card>
  );
}

function MiniNode({ p, tag }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/tree?person=${p.id}`)}
      className="flex min-w-40 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-left hover:border-pine-600">
      <Avatar p={p} round />
      <span>
        <strong className="block text-[.86rem]">{p.first}{p.id === ME && " (You)"}</strong>
        <small className="text-[.7rem] text-pine-700">{tag}</small>
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

const RSVP_TEXT = { yes: "You & Sarah are registered", maybe: "You marked maybe", no: "You declined — Sarah is registered" };

function RsvpDialog({ value, onSave }) {
  const close = useCloseModal();
  const [v, setV] = useState(value);
  return (
    <Dialog title="Annual Summer Reunion RSVP" sub="Lake Highlands • 14 Aug • 2:00 PM"
      footer={<><CancelButton /><Button variant="primary" onClick={() => { onSave(v); close(); }}>Save RSVP</Button></>}>
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="text-small text-muted">Will you attend?</legend>
        {[["yes", "Yes, I'll be there"], ["maybe", "Maybe"], ["no", "Can't make it this year"]].map(([k, l]) => (
          <Check key={k} type="radio" name="rsvp" checked={v === k} onChange={() => setV(k)}>{l}</Check>
        ))}
      </fieldset>
    </Dialog>
  );
}

export default function Overview() {
  const { state: st, update, person, easy } = useStore();
  const toast = useToast();
  const { open } = useModal();
  const navigate = useNavigate();
  const toggleEasy = useToggleEasy();
  const [reply, setReply] = useState("");
  const [rsvp, setRsvp] = useState("yes");
  const t = useT();
  const [hour] = useState(() => new Date().getHours());
  const greet = hour < 12 ? "greet.morning" : hour < 18 ? "greet.afternoon" : "greet.evening";

  const me = person(ME);
  const p = person;
  const nb = st.people.filter((x) => !x.died && x.id !== ME).sort((a, b) => daysToBirthday(a) - daysToBirthday(b))[0];
  const nbDate = new Date(nb.born);
  const story = st.stories.find((s) => s.id === "s1") || st.stories[0];
  const recipe = st.stories.slice(1, 5).filter((s) => s.kind === "audio").slice(-1)[0];
  const recentMem = st.memories[st.memories.length - 1];

  const postReply = (e) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text) { toast("Write a short recollection first", { error: true, sub: "Your reply can't be empty." }); document.getElementById("replyInput").focus(); return; }
    update((s) => { s.replies.push({ by: ME, when: "Just now", text }); }, "Shared a recollection");
    setReply("");
    toast("Recollection shared with the family", {
      sub: "Visible to the Mackenzie Kinship Circle.", action: "Undo", onAction: () => update((s) => { s.replies.pop(); }, "Removed your recollection"),
    });
  };

  return (
    <>
      <Hero aria-labelledby="welcome">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar p={me} size="xl" round />
          <div className="min-w-0 flex-1 max-sm:basis-full">
            <div className="flex flex-wrap items-center gap-2.5"><Tag tone="mint">MATRIARCH LINE</Tag><span className="text-small text-muted">● Living Archive Synced</span></div>
            <h1 id="welcome" className="mt-2">{t(greet)}, {me.first}</h1>
            <p className="mt-1 font-serif text-[1.1rem] text-pine-700 italic">{t("h1.overview", { name: me.first })}</p>
            <p className="mt-2 text-muted">
              4 Generations Active · {st.people.length} Relatives Connected · <span className="text-pine-700">Kinship circle in peace &amp; privacy</span>
            </p>
          </div>
          <div className="grid justify-items-start gap-2 sm:justify-items-end">
            <button type="button" onClick={toggleEasy}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[.78rem] font-medium easy:min-h-12">
              <Icon name="visibility" size="sm" /> {easy ? "Easy-to-Read mode active (18pt)" : "Turn on Easy-to-Read (18pt)"}
            </button>
            <span className="text-small text-muted">Heritage Years: 1918 — {THIS_YEAR}</span>
          </div>
        </div>
        <div role="group" aria-label="Primary actions"
          className="mt-5.5 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-4">
          <Button variant="primary" icon="add_photo_alternate" onClick={() => open(<AddMemoryDialog />)}>Add a Memory</Button>
          <Button variant="mint" icon="mic" to="/stories?record=1">Record a Story</Button>
          <Button variant="soft" icon="account_tree" to="/tree">Explore Tree</Button>
          <Button variant="soft" icon="person_add" onClick={() => open(<InviteDialog />)}>Invite Relative</Button>
        </div>
      </Hero>

      <div className="mt-5.5 grid gap-5.5 md:grid-cols-2 xl:grid-cols-3">
        <FamilyPoll />
        <MoodCheck />
        <MemoryShuffle />
      </div>

      <div className="mt-5.5 grid grid-cols-[minmax(0,1fr)] gap-5.5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5.5">
          <Card aria-labelledby="lin">
            <SectionTitle>
              <h2 id="lin" className="flex flex-wrap items-center gap-2.5"><Icon name="account_tree" /> Direct Lineage Preview</h2>
              <Tag tone="outline">4 Generations Preserved</Tag>
            </SectionTitle>
            <Record className="text-small">
              <Icon name="info" />
              <span className="min-w-0 flex-1">Kinship Guide: <strong>Michael</strong> is your son • <strong>Grace</strong> is your granddaughter (Michael's daughter)</span>
              <Eyebrow>Direct descendant</Eyebrow>
            </Record>
            <div className="mt-3.5 overflow-x-auto rounded-2xl bg-surface-2 p-4.5">
              <MiniRow><MiniNode p={me} tag="b. 1946 • Matriarch" /><MiniNode p={p("john")} tag="1942 — 2021" /></MiniRow>
              <MiniLink />
              <MiniRow>
                <MiniNode p={p("sarah")} tag="Daughter • b. 1971" /><MiniNode p={p("michael")} tag="Son • b. 1975" /><MiniNode p={p("james")} tag="Son • b. 1980" />
              </MiniRow>
              <MiniLink />
              <MiniRow>
                <MiniNode p={p("daniel")} tag={`Grandson (${age(p("daniel"))})`} />
                <MiniNode p={p("anna")} tag={`Birthday in ${daysToBirthday(p("anna"))}d`} />
                <MiniNode p={p("grace")} tag="Granddaughter" />
              </MiniRow>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
              <span className="text-small text-muted">Tap any relative to open their lineage profile.</span>
              <Button variant="primary" to="/tree">Open Full Interactive Tree <Icon name="arrow_forward" size="sm" /></Button>
            </div>
          </Card>

          <Card aria-labelledby="oral">
            <SectionTitle>
              <div>
                <h2 id="oral" className="flex flex-wrap items-center gap-2.5"><Icon name="record_voice_over" /> Living Oral Archive</h2>
                <p className="mt-2 text-small text-muted">Preserved spoken words, folk tales, and family memories</p>
              </div>
              <Button variant="mint" size="sm" icon="mic" to="/stories?record=1">Record or Dictate New Story</Button>
            </SectionTitle>
            <Card as="article" tone="soft">
              <div className="flex items-start gap-2.5">
                <IconBox icon="radio_button_checked" tone="dark" />
                <div className="min-w-0 flex-1">
                  <h3>{story.title}</h3>
                  <Tag tone="gold" className="mt-2">{story.tag}</Tag>
                  <p className="mt-2 text-small text-muted">
                    Narrated by <strong>{fullName(p(story.by))}</strong> • Recorded on {fmtDate(story.recorded)} • {fmtDur(story.duration)}
                  </p>
                </div>
              </div>
              <div className="mt-4"><AudioPlayer id={story.id} duration={story.duration} label={story.title} /></div>
              <div className="mt-4 rounded-xl bg-surface p-3.5">
                <Eyebrow>Preserved transcript preview</Eyebrow>
                <p className="mt-2 font-serif italic">“{story.transcript}”</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 text-small">
                  <span className="text-muted">Archived with speech-to-text transcript backup</span><Link to="/stories">Read Full Transcript</Link>
                </div>
              </div>
            </Card>
            {recipe && (
              <Record icon="restaurant" className="mt-4">
                <div className="min-w-0 flex-1"><strong>{recipe.title}</strong><p className="text-small text-muted">{recipe.excerpt} • {fmtDur(recipe.duration)}</p></div>
                <Button size="sm" icon="play_arrow" to="/stories">Listen</Button>
              </Record>
            )}
          </Card>

          <Card aria-labelledby="prompt">
            <div className="flex items-center justify-between gap-2.5">
              <Eyebrow icon="lightbulb">Prompt of the week</Eyebrow><Tag tone="outline">{st.replies.length} Kin Contributed</Tag>
            </div>
            <Card tone="soft" className="mt-4">
              <h3 id="prompt">“What was your favorite childhood tradition during the winter holidays?”</h3>
              <p className="mt-2 text-small text-muted">Prompted by Sarah Mackenzie to preserve seasonal memories.</p>
            </Card>
            <div className="mt-4">{st.replies.map((r, i) => <Reply key={i} r={r} />)}</div>
            <form className="mt-4 flex items-center gap-2.5" onSubmit={postReply}>
              <label htmlFor="replyInput" className="sr-only">Share your own recollection</label>
              <Input id="replyInput" className="flex-1" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={400}
                placeholder={`Share your own recollection, ${me.first}…`} />
              <Button variant="primary" type="submit">Post Reply</Button>
            </form>
          </Card>
        </div>

        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5.5">
          <Card aria-labelledby="gath">
            <SectionTitle><h2 id="gath" className="flex items-center gap-2.5 text-[1.2rem]!"><Icon name="event" /> Kin Gatherings &amp; Milestones</h2></SectionTitle>
            <div className="grid gap-3.5">
              <div className="flex gap-3 rounded-[14px] bg-surface-2 p-3.5">
                <DateBadge month={MONTHS[nbDate.getMonth()].toUpperCase()} day={nbDate.getDate()} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2.5"><strong>{nb.first}'s {age(nb) + 1}th Birthday</strong><Tag tone="rose" className="shrink-0">In {daysToBirthday(nb)} Days</Tag></div>
                  <p className="text-small text-muted">{nb.role}</p>
                  <div className="mt-2 flex flex-wrap gap-2.5">
                    <Button size="sm" icon="mic" iconSize="xs" onClick={() => navigate(`/stories?record=1&for=${encodeURIComponent(nb.first)}`)}>Send Voice Card</Button>
                    <Button size="sm" icon="attach_file" iconSize="xs" onClick={() => open(<AddMemoryDialog />)}>Attach Memory</Button>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 rounded-[14px] bg-surface-2 p-3.5">
                <DateBadge month="AUG" day="14" mint />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2.5"><strong>Annual Summer Reunion</strong><Tag tone="dark" className="shrink-0">18 Attending</Tag></div>
                  <p className="text-small text-muted">Lake Highlands • Park Veranda • 2:00 PM</p>
                  <div className="mt-2 flex items-center justify-between gap-2.5 text-small">
                    <span className="text-pine-700"><Icon name="check_circle" size="xs" /> {RSVP_TEXT[rsvp]}</span>
                    <Button variant="ghost" size="sm"
                      onClick={() => open(<RsvpDialog value={rsvp} onSave={(v) => { setRsvp(v); toast("RSVP saved", { sub: RSVP_TEXT[v] }); }} />)}>
                      Review RSVP
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card aria-labelledby="alb">
            <SectionTitle>
              <h2 id="alb" className="flex items-center gap-2.5 text-[1.2rem]!"><Icon name="photo_library" /> Recent Memory Albums</h2>
              <Link className="text-small" to="/memories">View all</Link>
            </SectionTitle>
            <Photo as={Link} to="/memories" p1={recentMem.p1} p2={recentMem.p2} icon={recentMem.icon} img={recentMem.img}
              aria-label={recentMem.alt} aspect="aspect-16/10">
              <PhotoOverlay>
                <Tag tone="gold">FEATURED KEEPSAKE</Tag>
                <strong className="mt-1.5 block font-serif text-[1.15rem]">{recentMem.title}</strong>
              </PhotoOverlay>
            </Photo>
            <div className="mt-2 flex items-center justify-between gap-2.5 text-small">
              <span className="text-muted">14 Restored Photographs • 3 Audio Clips</span><Tag>Tagged: {recentMem.tagged.length} Relatives</Tag>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2.5 text-small">
              <Visibility>{recentMem.visibility}</Visibility><Link to="/memories">Open Album ›</Link>
            </div>
          </Card>

          <Card tone="dark" aria-labelledby="priv">
            <div className="flex items-start gap-2.5">
              <IconBox icon="shield_lock" />
              <div>
                <h3 id="priv">Private Family Sanctuary</h3>
                <p className="mt-2 text-small text-on-dark">This living archive is completely private. No public indexing, no advertising, no data brokers. You decide who sees each story, photo and record.</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2.5 border-t border-white/10 pt-3 text-small">
              <span><Icon name="lock" size="xs" /> 0 Public Access</span><span>Guardian: <strong>Sarah Mackenzie</strong></span>
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
      <small className="block text-[.62rem] font-bold tracking-[.08em]">{month}</small>
      <strong className="font-serif text-[1.2rem]">{day}</strong>
    </div>
  );
}

