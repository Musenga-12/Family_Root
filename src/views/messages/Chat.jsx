/* One conversation: header (who, search, info), the message body (day separators, bubbles, replies, reactions) and the composer. */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Menu, MenuDivider, MenuItem, MenuLabel } from "../../components/Menu";
import { Dialog } from "../../components/Modal";
import { useModal } from "../../components/modalContext";
import { useToast } from "../../components/toastContext";
import { Avatar, Chip, Chips, Icon, IconButton, Spinner } from "../../components/ui";
import { ME } from "../../data";
import { cx, fmtDate } from "../../lib/format";
import { shrinkImage } from "../../lib/images";
import { chatSubtitle, clock, dayLabel, nameTone, postMessage, snippet } from "../../lib/messages";
import { canSpeak, useSpeech, useVoiceInput } from "../../lib/speech";
import { fullName, useStore } from "../../lib/store";
import { useDraft } from "../../lib/useDraft";
import { ChatAvatar, ChatInfoDialog } from "./parts";

const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
const EMOJI = ["😀", "😂", "🥰", "😍", "😊", "😉", "🤗", "😢", "😮", "🙏", "👍", "👏", "🎉", "❤️", "💐", "🎂", "🍪", "☕", "🏴", "🌧️", "🌳", "📷", "🎻", "✈️"];
const QUICK = ["Thank you! ❤️", "Lovely to hear from you", "I'll call you later", "Can't wait to see you"];
/** Messages from the same person within 5 minutes are grouped: one name and one bubble tail. */
const GROUP_GAP = 5 * 60 * 1000;
const sameGroup = (a, b) => a && b && a.by === b.by && a.at.slice(0, 10) === b.at.slice(0, 10) && new Date(b.at) - new Date(a.at) < GROUP_GAP;

/** Wraps search matches in <mark> so they stand out in the bubble. */
function Highlight({ text, q }) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded-sm bg-gold-100 px-0.5 text-gold-ink">{p}</mark> : <Fragment key={i}>{p}</Fragment>));
}

/** Delivery ticks, always with words for screen readers. "read" only when a relative has opened it. */
function Ticks({ status }) {
  const read = status === "read";
  return (
    <span className="inline-flex" title={read ? "Read" : "Delivered"}>
      <Icon name={status === "sent" ? "check" : "done_all"} className={cx("text-[15px]!", read ? "text-sec-on" : "opacity-70")} />
      <span className="sr-only">{read ? "Read" : "Delivered"}</span>
    </span>
  );
}

/** The quoted message inside a reply (and above the composer). Tapping it jumps to the original. */
function Quote({ t, m, mine, onClick, onClose }) {
  const { person } = useStore();
  const who = m.by === ME ? "You" : person(m.by)?.first;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={cx("flex w-full min-w-0 items-stretch gap-2 overflow-hidden rounded-lg border-0 p-0 text-left",
        mine ? "bg-white/12 text-white" : "bg-surface-2 text-ink", onClick && "cursor-pointer hover:brightness-95")}>
      <span aria-hidden="true" className={cx("w-1 shrink-0", mine ? "bg-sec-on/70" : "bg-sec")} />
      <span className="min-w-0 flex-1 py-1.5 pr-2">
        <strong className={cx("block text-xsmall", mine ? "text-sec-on" : nameTone(t, m.by))}>{onClose ? `Replying to ${who}` : who}</strong>
        <span className={cx("line-clamp-2 text-small", mine ? "text-white/85" : "text-muted")}>{m.img && !m.deleted && <Icon name="photo_camera" size="xs" />} {snippet(m)}</span>
      </span>
      {m.img && !m.deleted && <img src={m.img} alt="" className="size-12 shrink-0 object-cover" />}
      {onClose && <IconButton icon="close" label="Cancel reply" className="m-1 size-8! self-center border-0! bg-transparent! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" onClick={onClose} />}
    </Tag>
  );
}

function Bubble({ t, m, prev, next, q, flash, onReply, onJump, onOpenImage, setRef }) {
  const { person, update } = useStore();
  const toast = useToast();
  const { toggle, speaking } = useSpeech();
  const [picker, setPicker] = useState(false);
  const [dx, setDx] = useState(0);
  const pickerRef = useRef(null);
  const start = useRef(null);
  const mine = m.by === ME;
  const who = person(m.by);
  const first = !sameGroup(prev, m);
  const last = !sameGroup(m, next);
  const quoted = m.replyTo && t.messages.find((x) => x.id === m.replyTo);
  const reactions = Object.entries(m.reactions || {});
  const grouped = reactions.reduce((acc, [pid, e]) => ({ ...acc, [e]: [...(acc[e] || []), pid] }), {});

  useEffect(() => {
    if (!picker) return;
    const off = (e) => { if (!pickerRef.current?.contains(e.target)) setPicker(false); };
    const esc = (e) => e.key === "Escape" && setPicker(false);
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [picker]);

  const change = (fn) => update((s) => { fn(s.threads.find((x) => x.id === t.id).messages.find((x) => x.id === m.id)); }, null);
  const react = (emoji) => { change((x) => { x.reactions ||= {}; if (x.reactions[ME] === emoji) delete x.reactions[ME]; else x.reactions[ME] = emoji; }); setPicker(false); };
  const star = () => { change((x) => { x.starred = !x.starred; }); toast(m.starred ? "Unstarred" : "Starred", { sub: "Find starred messages under the Starred tab.", icon: "star", duration: 2500 }); };
  const copy = () => navigator.clipboard?.writeText(m.text).then(() => toast("Copied", { icon: "content_copy", duration: 1800 }), () => toast("Couldn't copy", { error: true, sub: "Select the text and copy it instead." }));
  const remove = () => {
    update((s) => { const x = s.threads.find((y) => y.id === t.id).messages.find((y) => y.id === m.id); x.deleted = true; }, `Deleted a message in ${t.title}`);
    toast("Message deleted", { icon: "delete", action: "Undo", onAction: () => update((s) => { delete s.threads.find((y) => y.id === t.id).messages.find((y) => y.id === m.id).deleted; }, "Restored a message") });
  };

  // Swipe right on a touch screen to reply.
  const onPointerDown = (e) => { if (e.pointerType === "touch" && !m.deleted) start.current = { x: e.clientX, y: e.clientY }; };
  const onPointerMove = (e) => {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x;
    if (Math.abs(e.clientY - start.current.y) > 30) { start.current = null; setDx(0); return; }
    setDx(Math.max(0, Math.min(80, ddx)));
  };
  const onPointerUp = () => { if (dx > 60) onReply(m); start.current = null; setDx(0); };

  const label = `${mine ? "You" : fullName(who)}, ${dayLabel(m.at)} ${clock(m.at)}: ${snippet(m)}`;
  return (
    <li ref={setRef} className={cx("flex flex-col", mine ? "items-end" : "items-start", first ? "mt-2.5" : "mt-0.5", reactions.length && "mb-3")}>
      <div className={cx("group/msg relative flex max-w-[min(85%,560px)] items-end gap-2", mine && "flex-row-reverse")}>
        {/* Group chats: the sender's avatar beside their last bubble in a run. */}
        {t.group && !mine && (last ? <Avatar round p={who} className="size-7! text-[.6rem]!" /> : <span className="w-7 shrink-0" />)}

        <article tabIndex={0} aria-label={label}
          onDoubleClick={() => !m.deleted && react("❤️")}
          onContextMenu={(e) => { if (m.deleted) return; e.preventDefault(); e.currentTarget.parentElement.querySelector("[data-more]")?.click(); }}
          onKeyDown={(e) => { if (e.target !== e.currentTarget || m.deleted) return; if (e.key.toLowerCase() === "r") { e.preventDefault(); onReply(m); } }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          style={dx ? { transform: `translateX(${dx}px)` } : undefined}
          className={cx("relative min-w-0 rounded-2xl px-3 pt-2 pb-1.5 shadow-[0_1px_1px_rgb(0_0_0/.06)] transition-[transform,box-shadow] outline-offset-2",
            mine ? "bg-sec text-sec-on" : "border border-line bg-surface text-ink",
            first && (mine ? "rounded-tr-sm" : "rounded-tl-sm"),
            flash && "ring-4 ring-gold/60")}>
          {dx > 20 && <Icon name="reply" className="absolute top-1/2 -left-8 -translate-y-1/2 text-muted" />}
          {t.group && !mine && first && <strong className={cx("mb-0.5 block text-xsmall", nameTone(t, m.by))}>{who?.first} <span className="font-normal text-muted">· {who?.role}</span></strong>}
          {m.deleted ? (
            <p className={cx("flex items-center gap-1.5 pr-14 italic", mine ? "text-white/70" : "text-muted")}><Icon name="block" size="sm" /> {mine ? "You deleted this message" : "This message was deleted"}</p>
          ) : (
            <>
              {quoted && <div className="mb-1.5"><Quote t={t} m={quoted} mine={mine} onClick={() => onJump(quoted.id)} /></div>}
              {m.img && (
                <button type="button" onClick={() => onOpenImage(m)} className="mb-1 block cursor-zoom-in overflow-hidden rounded-xl border-0 p-0">
                  <img src={m.img} alt={m.text ? `Photo: ${m.text}` : `Photo from ${mine ? "you" : who?.first}`} className="max-h-72 w-full max-w-72 object-cover" />
                </button>
              )}
              {/* The invisible spacer keeps the last line of text clear of the time stamp, as in most chat apps. */}
              {m.text && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]"><Highlight text={m.text} q={q} /><span aria-hidden="true" className={cx("inline-block", mine ? "w-20" : "w-14")} /></p>}
            </>
          )}
          <span className={cx("absolute right-2.5 bottom-1 flex items-center gap-1 text-[.68rem] tabular-nums", mine ? "text-on-dark" : "text-muted")}>
            {m.starred && <Icon name="star" fill className="text-[12px]!" />}
            {clock(m.at)}
            {mine && !m.deleted && <Ticks status={m.status} />}
          </span>
        </article>

        {/* Hover / focus actions: reply, react, more. */}
        {!m.deleted && (
          <div className={cx("flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-focus-within/msg:opacity-100 group-hover/msg:opacity-100 max-md:hidden max-md:group-focus-within/msg:flex", picker && "opacity-100 max-md:flex")}>
            <IconButton icon="reply" label="Reply" title="Reply (R)" className="size-8! border-0! bg-transparent! text-muted! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" onClick={() => onReply(m)} />
            <div ref={pickerRef} className="relative">
              <IconButton icon="add_reaction" label="React" title="React" aria-expanded={picker} className="size-8! border-0! bg-transparent! text-muted! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" onClick={() => setPicker(!picker)} />
              {picker && (
                <div role="group" aria-label="Reactions" className={cx("absolute bottom-full z-20 mb-1 flex animate-pop gap-0.5 rounded-full border border-line bg-surface p-1 shadow-pop", mine ? "right-0" : "left-0")}>
                  {REACTIONS.map((e) => (
                    <button key={e} type="button" aria-pressed={m.reactions?.[ME] === e} aria-label={`React with ${e}`} onClick={() => react(e)}
                      className={cx("grid size-9 cursor-pointer place-items-center rounded-full border-0 text-[1.25rem] transition-transform hover:scale-125", m.reactions?.[ME] === e ? "bg-sec-line" : "bg-transparent")}>{e}</button>
                  ))}
                </div>
              )}
            </div>
            <Menu label="Message actions" align={mine ? "right" : "left"} trigger={(p) => (
              <IconButton {...p} data-more icon="more_vert" label="More actions" title="More actions (or right-click the message)" className="size-8! border-0! bg-transparent! text-muted! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" />
            )}>
              <MenuItem icon="reply" hint="R" onClick={() => onReply(m)}>Reply</MenuItem>
              <MenuItem icon="add_reaction" onClick={() => setPicker(true)}>React…</MenuItem>
              {m.text && <MenuItem icon="content_copy" onClick={copy}>Copy text</MenuItem>}
              <MenuItem icon="star" onClick={star}>{m.starred ? "Unstar" : "Star"}</MenuItem>
              {canSpeak && m.text && <MenuItem icon={speaking ? "stop_circle" : "volume_up"} onClick={() => toggle(`${mine ? "You" : who?.first} said: ${m.text}`)}>{speaking ? "Stop reading" : "Read aloud"}</MenuItem>}
              {mine && <><MenuDivider /><MenuItem icon="delete" onClick={remove}>Delete for everyone</MenuItem></>}
            </Menu>
          </div>
        )}
      </div>

      {/* Reactions sit on the bubble's lower edge; tap one to add or take back your own. */}
      {reactions.length > 0 && (
        <div className={cx("relative z-1 -mt-2 flex gap-1", mine ? "mr-3" : t.group ? "ml-12" : "ml-3")}>
          {Object.entries(grouped).map(([e, ids]) => (
            <button key={e} type="button" onClick={() => react(e)} aria-pressed={ids.includes(ME)}
              title={ids.map((id) => (id === ME ? "You" : person(id)?.first)).join(", ")}
              aria-label={`${e} ${ids.length}: ${ids.map((id) => (id === ME ? "you" : person(id)?.first)).join(", ")}${ids.includes(ME) ? ". Tap to remove yours." : ""}`}
              className={cx("flex cursor-pointer items-center gap-0.5 rounded-full border px-1.5 py-px text-[.8rem] shadow-card", ids.includes(ME) ? "border-sec bg-sec-soft" : "border-line bg-surface")}>
              {e}{ids.length > 1 && <span className="text-[.68rem] font-semibold text-muted">{ids.length}</span>}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function Composer({ t, replyTo, setReplyTo, boxRef }) {
  const { update, person } = useStore();
  const toast = useToast();
  const [draft, setDraft, d] = useDraft(`chat-${t.id}`, { text: "" });
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const fileRef = useRef(null);
  const emojiRef = useRef(null);
  const text = draft.text;
  const setText = (v) => setDraft((x) => ({ ...x, text: typeof v === "function" ? v(x.text) : v }));
  const voice = useVoiceInput((said) => { setText((x) => (x ? x + " " : "") + said); boxRef.current?.focus(); });

  // The box grows with the text, up to about six lines.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text, boxRef]);
  useEffect(() => {
    if (!emoji) return;
    const off = (e) => { if (!emojiRef.current?.contains(e.target)) setEmoji(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [emoji]);

  const send = (body = text) => {
    const msg = body.trim();
    if (!msg && !img) return;
    update((s) => { postMessage(s, { threadId: t.id, text: msg, replyTo: replyTo?.id, img }); }, `Sent a message to ${t.title}`);
    if (body === text) { setText(""); d.clear(); }
    setImg(null);
    setReplyTo(null);
    boxRef.current?.focus();
  };
  const insert = (e) => {
    const el = boxRef.current;
    const at = el?.selectionStart ?? text.length;
    setText(text.slice(0, at) + e + text.slice(el?.selectionEnd ?? at));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + e.length, at + e.length); });
  };
  const attach = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Only photos can be attached here", { error: true, sub: "Choose a JPG, PNG or similar image." }); return; }
    setBusy(true);
    const url = await shrinkImage(file, 1000, 0.75);
    setBusy(false);
    if (!url) { toast("That photo couldn't be opened", { error: true, sub: "Try another image." }); return; }
    setImg(url);
    boxRef.current?.focus();
  };

  const canSend = !!(text.trim() || img);
  return (
    <div className="border-t border-line bg-surface px-3 pt-2 pb-3" onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); attach(f); } }}>
      {replyTo && <div className="mb-2"><Quote t={t} m={replyTo} onClose={() => setReplyTo(null)} /></div>}
      {(img || busy) && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-2 p-2">
          {busy ? <span className="flex items-center gap-2 text-small"><Spinner /> Preparing photo…</span> : (
            <>
              <img src={img} alt="Photo to send" className="size-16 rounded-lg object-cover" />
              <span className="flex-1 text-small text-muted">Add a caption, or send the photo on its own.</span>
              <IconButton icon="close" label="Remove photo" onClick={() => setImg(null)} />
            </>
          )}
        </div>
      )}
      {!text && !img && !replyTo && (
        <Chips scroll className="no-scrollbar mb-2" role="group" aria-label="Quick replies">
          {QUICK.map((qr) => <Chip key={qr} onClick={() => send(qr)}>{qr}</Chip>)}
        </Chips>
      )}
      <form className="flex items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="flex min-w-0 flex-1 items-end gap-0.5 rounded-3xl border border-line bg-surface-2 px-1.5 focus-within:border-sec focus-within:bg-surface">
          <div ref={emojiRef} className="relative">
            <IconButton icon="mood" label="Emoji" title="Emoji" aria-expanded={emoji} className="my-1 size-9! border-0! bg-transparent! text-muted! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" onClick={() => setEmoji(!emoji)} />
            {emoji && (
              <div role="group" aria-label="Emoji" className="absolute bottom-full left-0 z-30 mb-2 grid w-72 animate-pop grid-cols-8 gap-0.5 rounded-2xl border border-line bg-surface p-2 shadow-pop">
                {EMOJI.map((e) => <button key={e} type="button" aria-label={e} onClick={() => insert(e)} className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[1.2rem] transition-transform hover:scale-125 hover-tint">{e}</button>)}
              </div>
            )}
          </div>
          <label htmlFor="msgBox" className="sr-only">Message {t.title}</label>
          <textarea id="msgBox" ref={boxRef} rows={1} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              if (e.key === "Escape" && replyTo) { e.stopPropagation(); setReplyTo(null); }
            }}
            placeholder={replyTo ? `Reply to ${replyTo.by === ME ? "yourself" : person(replyTo.by)?.first}…` : "Message"}
            className="max-h-40 min-w-0 flex-1 resize-none border-0 bg-transparent py-2.5 leading-normal text-ink outline-0 placeholder:text-faint" />
          <IconButton icon="attach_file" label="Attach a photo" title="Attach a photo" className="my-1 size-9! border-0! bg-transparent! text-muted! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" onClick={() => fileRef.current.click()} />
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" aria-label="Attach a photo" onChange={(e) => { attach(e.target.files[0]); e.target.value = ""; }} />
        </div>
        {/* Send when there is something to send; otherwise the same spot dictates by voice. */}
        {canSend || !voice.supported ? (
          <button type="submit" disabled={!canSend} aria-label="Send" title="Send (Enter)"
            className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-sec text-sec-on shadow-card transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
            <Icon name="send" />
          </button>
        ) : (
          <button type="button" aria-pressed={voice.listening} aria-label={voice.listening ? "Stop dictating" : "Dictate a message"} title={voice.listening ? "Stop dictating" : "Dictate a message"}
            onClick={() => (voice.listening ? voice.stop() : voice.start())}
            className={cx("grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border-0 shadow-card transition active:scale-95",
              voice.listening ? "animate-rec-pulse bg-rec text-white" : "bg-sec text-sec-on hover:brightness-110")}>
            <Icon name={voice.listening ? "graphic_eq" : "mic"} />
          </button>
        )}
      </form>
      <p className="mt-1.5 px-2 text-[.68rem] text-faint max-sm:hidden">Enter to send · Shift+Enter for a new line · R on a message to reply · double-click to ❤️</p>
    </div>
  );
}

export default function Chat({ t, focusId, onBack }) {
  const { state, person, update } = useStore();
  const { open, confirm } = useModal();
  const { toggle: toggleSpeech, speaking } = useSpeech();
  const toast = useToast();
  const [replyTo, setReplyTo] = useState(null);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [hit, setHit] = useState(0);
  const [flash, setFlash] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const bodyRef = useRef(null);
  const boxRef = useRef(null);
  const items = useRef({});
  // Where "N unread messages" goes: fixed when the chat opens, so it doesn't vanish once they're marked read.
  const [unreadMark] = useState(() => (t.unread ? { id: t.messages[Math.max(0, t.messages.length - t.unread)]?.id, n: t.unread } : null));

  const jump = (id) => {
    const el = items.current[id];
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
  };

  // Opening a chat marks it read and lands on the first unread message (or a linked one, or the newest).
  useEffect(() => { if (t.unread) update((s) => { s.threads.find((x) => x.id === t.id).unread = 0; }, null); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const target = focusId || unreadMark?.id;
    if (target && items.current[target]) {
      items.current[target].scrollIntoView({ block: "center" });
      // Highlight a linked message (e.g. from Starred) briefly, so the eye finds it.
      if (focusId) requestAnimationFrame(() => { setFlash(focusId); setTimeout(() => setFlash((f) => (f === focusId ? null : f)), 1600); });
    }
    else bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps
  // New message: follow it if you were already at the bottom (always for your own).
  const count = t.messages.length;
  const lastMine = t.messages[count - 1]?.by === ME;
  useLayoutEffect(() => {
    if (atBottom || lastMine) bodyRef.current.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = q.trim() ? t.messages.filter((m) => !m.deleted && m.text.toLowerCase().includes(q.trim().toLowerCase())).map((m) => m.id) : [];
  // Match 0 is the newest; Enter moves to older matches, Shift+Enter back to newer ones.
  const goHit = (i) => { if (!matches.length) return; const n = (i + matches.length) % matches.length; setHit(n); jump(matches[matches.length - 1 - n]); };
  const firstMatch = matches[matches.length - 1];
  useEffect(() => { if (firstMatch) jump(firstMatch); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const reply = (m) => { setReplyTo(m); boxRef.current?.focus(); };
  const days = t.messages.reduce((acc, m) => {
    const day = m.at.slice(0, 10);
    if (acc.at(-1)?.day === day) acc.at(-1).list.push(m); else acc.push({ day, list: [m] });
    return acc;
  }, []);
  const openImage = (m) => open(
    <Dialog wide title={m.by === ME ? "Your photo" : `Photo from ${person(m.by)?.first}`} sub={`${dayLabel(m.at)}, ${clock(m.at)}${m.text ? ` · ${m.text}` : ""}`}>
      <img src={m.img} alt={m.text || "Photo"} className="max-h-[70vh] w-full rounded-xl object-contain" />
    </Dialog>,
  );
  const set = (k, v, msg) => { update((s) => { s.threads.find((x) => x.id === t.id)[k] = v; }, null); if (msg) toast(msg, { icon: "check_circle", duration: 2000 }); };

  /* ---------- Everything you can do with this chat ---------- */
  const info = () => open(<ChatInfoDialog id={t.id} onJump={jump} />);
  const toggleSearch = () => { setSearching(!searching); setQ(""); };
  const latest = [...t.messages].reverse().find((m) => !m.deleted && m.text);
  const readLatest = () => latest && toggleSpeech(`${latest.by === ME ? "You" : person(latest.by)?.first} said: ${latest.text}`);
  const exportChat = () => {
    // A plain-text transcript that opens anywhere: "[8 Nov 2026, 18:02] Sarah: …"
    const lines = t.messages.map((m) => `[${fmtDate(m.at.slice(0, 10))}, ${clock(m.at)}] ${m.by === ME ? "You" : fullName(person(m.by))}: ${m.deleted ? "(deleted)" : `${m.img ? "[photo] " : ""}${m.text}`}`);
    const blob = new Blob([`${t.title}\n${chatSubtitle(t, person)}\n\n${lines.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${t.title.replace(/[^\w -]+/g, "").trim() || "chat"}.txt` });
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Chat exported", { sub: `${t.messages.length} messages saved as a text file`, icon: "download" });
  };
  const clearChat = () => confirm("Clear all messages?", `Every message in “${t.title}” will be removed from this chat. You can undo straight after.`, "Clear messages", () => {
    const before = t.messages;
    update((s) => { s.threads.find((x) => x.id === t.id).messages = []; }, `Cleared the chat with ${t.title}`);
    toast("Chat cleared", { sub: t.title, icon: "delete_sweep", action: "Undo", onAction: () => update((s) => { s.threads.find((x) => x.id === t.id).messages = before; }, `Restored the chat with ${t.title}`) });
  });
  const removeChat = () => {
    const leaving = t.group;
    confirm(leaving ? `Leave “${t.title}”?` : `Delete the chat with ${t.title}?`,
      leaving ? "You'll stop receiving its messages and it will leave your chat list. You can undo straight after."
        : "The conversation will be removed from your chat list. You can undo straight after.",
      leaving ? "Leave group" : "Delete chat", () => {
        const index = state.threads.findIndex((x) => x.id === t.id);
        const copy = t;
        update((s) => { s.threads = s.threads.filter((x) => x.id !== t.id); }, leaving ? `Left ${t.title}` : `Deleted the chat with ${t.title}`);
        onBack();
        toast(leaving ? "You left the group" : "Chat deleted", { sub: t.title, icon: leaving ? "logout" : "delete", action: "Undo",
          onAction: () => update((s) => { s.threads.splice(index, 0, copy); }, `Restored ${t.title}`) });
      });
  };
  const tool = "border-0! text-muted! hover:text-ink!";
  return (
    <section aria-label={`Chat with ${t.title}`} className="flex min-h-0 min-w-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if (e.key === "Escape" && searching) { setSearching(false); setQ(""); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); setSearching(true); }
      }}>
      {/* Chat header: who you're talking to, and tools for this chat. */}
      <header className="flex items-center gap-2 border-b border-line bg-surface px-2.5 py-2 sm:px-4">
        <IconButton icon="arrow_back" label="Back to chats" className="border-0! md:hidden" onClick={onBack} />
        <button type="button" onClick={() => open(<ChatInfoDialog id={t.id} onJump={jump} />)} title="Chat info"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent p-1 text-left text-ink hover-tint">
          <ChatAvatar t={t} />
          <span className="min-w-0">
            <h2 className="flex items-center gap-1.5 truncate text-[1.08rem]!">{t.title}{t.muted && <Icon name="notifications_off" size="xs" className="text-faint" />}</h2>
            <span className="block truncate text-xsmall text-muted">{chatSubtitle(t, person)}</span>
          </span>
        </button>
        {/* The most used options, one tap away (labels on hover and for screen readers). On phones, the rest live in ⋮. */}
        <div role="toolbar" aria-label="Chat options" className="flex shrink-0 items-center gap-0.5">
          <IconButton icon="search" label="Search in this chat" title="Search in this chat (Ctrl+F)" aria-pressed={searching} className={tool} onClick={toggleSearch} />
          <IconButton icon="info" label="Chat info and members" title="Chat info and members" className={cx(tool, "max-sm:hidden")} onClick={info} />
          <IconButton icon="push_pin" label={t.pinned ? "Unpin chat" : "Pin chat"} title={t.pinned ? "Unpin chat" : "Pin chat to the top"} aria-pressed={!!t.pinned}
            iconProps={{ fill: !!t.pinned }} className={cx(tool, "max-md:hidden", t.pinned && "text-sec-ink! active:text-sec-on!")} onClick={() => set("pinned", !t.pinned, t.pinned ? "Unpinned" : "Pinned to the top")} />
          <IconButton icon={t.muted ? "notifications_off" : "notifications"} label={t.muted ? "Unmute chat" : "Mute chat"} title={t.muted ? "Unmute notifications" : "Mute notifications"}
            aria-pressed={!!t.muted} className={cx(tool, "max-md:hidden")} onClick={() => set("muted", !t.muted, t.muted ? "Notifications on" : "Muted")} />
          <Menu label="All chat options" trigger={(p) => <IconButton {...p} icon="more_vert" label="All chat options" title="All chat options" className={tool} />}>
            <MenuLabel>This chat</MenuLabel>
            <MenuItem icon="info" onClick={info}>Chat info &amp; members</MenuItem>
            <MenuItem icon="search" hint="Ctrl F" onClick={toggleSearch}>Search in chat</MenuItem>
            <MenuItem icon="star" onClick={info}>Starred messages</MenuItem>
            {canSpeak && latest && <MenuItem icon={speaking ? "stop_circle" : "volume_up"} onClick={readLatest}>{speaking ? "Stop reading" : "Read latest message aloud"}</MenuItem>}
            <MenuDivider />
            <MenuLabel>Organise</MenuLabel>
            <MenuItem icon="push_pin" onClick={() => set("pinned", !t.pinned, t.pinned ? "Unpinned" : "Pinned to the top")}>{t.pinned ? "Unpin chat" : "Pin chat to the top"}</MenuItem>
            <MenuItem icon={t.muted ? "notifications_active" : "notifications_off"} onClick={() => set("muted", !t.muted, t.muted ? "Notifications on" : "Muted")}>{t.muted ? "Unmute notifications" : "Mute notifications"}</MenuItem>
            <MenuItem icon="mark_chat_unread" onClick={() => { set("unread", Math.max(1, t.unread || 0), "Marked as unread"); onBack(); }}>Mark as unread</MenuItem>
            <MenuDivider />
            <MenuLabel>Manage</MenuLabel>
            <MenuItem icon="download" onClick={exportChat}>Export chat (text file)</MenuItem>
            <MenuItem icon="delete_sweep" onClick={clearChat}>Clear all messages…</MenuItem>
            <MenuItem icon={t.group ? "logout" : "delete"} onClick={removeChat}>{t.group ? "Leave group…" : "Delete chat…"}</MenuItem>
            <MenuDivider />
            <MenuItem icon="close" onClick={onBack}>Close chat</MenuItem>
          </Menu>
          <IconButton icon="close" label="Close chat" title="Close chat" className={cx(tool, "max-md:hidden")} onClick={onBack} />
        </div>
      </header>

      {searching && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
          <Icon name="search" size="sm" className="text-muted" />
          <label htmlFor="chatQ" className="sr-only">Search messages in {t.title}</label>
          <input id="chatQ" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHit(0); }} placeholder="Search this chat"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); goHit(hit + (e.shiftKey ? -1 : 1)); } }}
            className="min-w-0 flex-1 border-0 bg-transparent py-1 text-ink outline-0" />
          <span className="text-xsmall text-muted tabular-nums" aria-live="polite">{q.trim() ? (matches.length ? `${hit + 1} of ${matches.length}` : "No matches") : ""}</span>
          <IconButton icon="keyboard_arrow_up" label="Older match" className="size-8! border-0!" disabled={!matches.length} onClick={() => goHit(hit + 1)} />
          <IconButton icon="keyboard_arrow_down" label="Newer match" className="size-8! border-0!" disabled={!matches.length} onClick={() => goHit(hit - 1)} />
          <IconButton icon="close" label="Close search" className="size-8! border-0!" onClick={() => { setSearching(false); setQ(""); }} />
        </div>
      )}

      {/* Message body. */}
      <div className="relative min-h-0 flex-1">
        <ol ref={bodyRef} aria-label="Messages" onScroll={(e) => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120); }}
          className="m-0 h-full list-none overflow-y-auto bg-surface-2 bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:20px_20px] px-3 py-3 sm:px-6">
          <li className="mx-auto mb-3 flex max-w-110 items-start gap-2 rounded-xl bg-gold-100 px-3 py-2 text-center text-xsmall text-gold-ink">
            <Icon name="lock" size="xs" /> Messages stay inside the family archive. Only the people in this chat can read them.
          </li>
          {/* One section per day: its label sticks to the top only while that day is on screen, then the next day's takes over. */}
          {days.map(({ day, list }) => (
            <li key={day} aria-label={dayLabel(day)}>
              <div className="sticky top-1 z-10 my-3 flex justify-center" aria-hidden="true">
                <span className="rounded-lg bg-surface px-3 py-1 text-xsmall font-semibold text-muted shadow-card">{dayLabel(day)}</span>
              </div>
              <ol className="m-0 list-none p-0">
                {list.map((m, k) => (
                  <Fragment key={m.id}>
                    {unreadMark?.id === m.id && (
                      <li className="my-3 flex justify-center" role="separator" aria-label={`${unreadMark.n} unread messages`}>
                        <span className="w-full rounded-lg bg-sec-soft py-1 text-center text-xsmall font-semibold text-sec-ink">{unreadMark.n} unread message{unreadMark.n > 1 ? "s" : ""}</span>
                      </li>
                    )}
                    <Bubble t={t} m={m} prev={list[k - 1]} next={list[k + 1]} q={q.trim()} flash={flash === m.id}
                      onReply={reply} onJump={jump} onOpenImage={openImage} setRef={(el) => { items.current[m.id] = el; }} />
                  </Fragment>
                ))}
              </ol>
            </li>
          ))}
        </ol>
        {!atBottom && (
          <button type="button" aria-label="Jump to the newest message" title="Newest message"
            onClick={() => bodyRef.current.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" })}
            className="absolute right-4 bottom-4 grid size-11 animate-pop cursor-pointer place-items-center rounded-full border border-sec-line bg-surface text-sec-ink shadow-pop hover-fill">
            <Icon name="keyboard_double_arrow_down" />
          </button>
        )}
      </div>

      <Composer key={t.id} t={t} replyTo={replyTo} setReplyTo={setReplyTo} boxRef={boxRef} />
    </section>
  );
}
