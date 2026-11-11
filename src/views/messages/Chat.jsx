/* One conversation: header (who, search, info), the message body (day separators, bubbles, replies, reactions) and the composer. */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Menu, MenuDivider, MenuItem, MenuLabel } from "../../components/Menu";
import { Dialog } from "../../components/Modal";
import { useModal } from "../../components/modalContext";
import { useToast } from "../../components/toastContext";
import { Avatar, Chip, Chips, Icon, IconButton, Spinner } from "../../components/ui";
import { ME } from "../../data";
import { cx, fmtDate } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { shrinkImage } from "../../lib/images";
import { chatSubtitle, clock, dayLabel, nameTone, postMessage, snippet } from "../../lib/messages";
import { canSpeak, useSpeech, useVoiceInput } from "../../lib/speech";
import { fullName, useStore } from "../../lib/store";
import { useDraft } from "../../lib/useDraft";
import { ChatAvatar, ChatInfoDialog } from "./parts";

const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
const EMOJI = ["😀", "😂", "🥰", "😍", "😊", "😉", "🤗", "😢", "😮", "🙏", "👍", "👏", "🎉", "❤️", "💐", "🎂", "🍪", "☕", "🏴", "🌧️", "🌳", "📷", "🎻", "✈️"];
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
  const tr = useT();
  return (
    <span className="inline-flex" title={tr(read ? "msg.read" : "msg.delivered")}>
      <Icon name={status === "sent" ? "check" : "done_all"} className={cx("text-[15px]!", read ? "text-sec-on" : "opacity-70")} />
      <span className="sr-only">{tr(read ? "msg.read" : "msg.delivered")}</span>
    </span>
  );
}

/** The quoted message inside a reply (and above the composer). Tapping it jumps to the original. */
function Quote({ t, m, mine, onClick, onClose }) {
  const { person } = useStore();
  const tr = useT();
  const who = m.by === ME ? tr("msg.you") : person(m.by)?.first;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={cx("flex w-full min-w-0 items-stretch gap-2 overflow-hidden rounded-lg border-0 p-0 text-left",
        mine ? "bg-white/12 text-white" : "bg-surface-2 text-ink", onClick && "cursor-pointer hover:brightness-(--hover-brightness)")}>
      <span aria-hidden="true" className={cx("w-1 shrink-0", mine ? "bg-sec-on/70" : "bg-sec")} />
      <span className="min-w-0 flex-1 py-1.5 pr-2">
        <strong className={cx("block text-xsmall", mine ? "text-sec-on" : nameTone(t, m.by))}>{onClose ? tr("msg.replyingTo", { name: who }) : who}</strong>
        <span className={cx("line-clamp-2 text-small", mine ? "text-white/85" : "text-muted")}>{m.img && !m.deleted && <Icon name="photo_camera" size="xs" />} {snippet(m)}</span>
      </span>
      {m.img && !m.deleted && <img src={m.img} alt="" className="size-12 shrink-0 object-cover" />}
      {onClose && <IconButton icon="close" label={tr("msg.cancelReply")} className="m-1 size-8! self-center border-0! bg-transparent! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" onClick={onClose} />}
    </Tag>
  );
}

function Bubble({ t, m, prev, next, q, flash, onReply, onJump, onOpenImage, setRef }) {
  const { person, update, kin } = useStore();
  const toast = useToast();
  const tr = useT();
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
  const star = () => { change((x) => { x.starred = !x.starred; }); toast(tr(m.starred ? "msg.unstarred" : "msg.starredT"), { sub: tr("msg.starredSub"), icon: "star", duration: 2500 }); };
  const copy = () => navigator.clipboard?.writeText(m.text).then(() => toast(tr("msg.copied"), { icon: "content_copy", duration: 1800 }), () => toast(tr("msg.copyFail"), { error: true, sub: tr("msg.copyFailSub") }));
  const remove = () => {
    update((s) => { const x = s.threads.find((y) => y.id === t.id).messages.find((y) => y.id === m.id); x.deleted = true; }, tr("msg.hDeleted", { title: t.title }));
    toast(tr("msg.deletedT"), { icon: "delete", action: tr("common.undo"), onAction: () => update((s) => { delete s.threads.find((y) => y.id === t.id).messages.find((y) => y.id === m.id).deleted; }, tr("msg.hRestored")) });
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

  const label = `${mine ? tr("msg.you") : fullName(who)}, ${dayLabel(m.at)} ${clock(m.at)}: ${snippet(m)}`;
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
          {t.group && !mine && first && <strong className={cx("mb-0.5 block text-xsmall", nameTone(t, m.by))}>{who?.first} <span className="font-normal text-muted">· {who && kin(who.role)}</span></strong>}
          {m.deleted ? (
            <p className={cx("flex items-center gap-1.5 pr-14 italic", mine ? "text-white/70" : "text-muted")}><Icon name="block" size="sm" /> {tr(mine ? "msg.youDeleted" : "chat.deleted")}</p>
          ) : (
            <>
              {quoted && <div className="mb-1.5"><Quote t={t} m={quoted} mine={mine} onClick={() => onJump(quoted.id)} /></div>}
              {m.img && (
                <button type="button" onClick={() => onOpenImage(m)} className="mb-1 block cursor-zoom-in overflow-hidden rounded-xl border-0 p-0">
                  <img src={m.img} alt={m.text ? tr("msg.photoCaption", { text: m.text }) : tr("msg.photoFrom", { name: mine ? tr("msg.youLower") : who?.first })} className="max-h-72 w-full max-w-72 object-cover" />
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
            <IconButton icon="reply" label={tr("msg.reply")} title={tr("msg.replyR")} className="size-8! border-0! bg-transparent! text-muted! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" onClick={() => onReply(m)} />
            <div ref={pickerRef} className="relative">
              <IconButton icon="add_reaction" label={tr("msg.react")} title={tr("msg.react")} aria-expanded={picker} className="size-8! border-0! bg-transparent! text-muted! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" onClick={() => setPicker(!picker)} />
              {picker && (
                <div role="group" aria-label={tr("msg.reactions")} className={cx("absolute bottom-full z-20 mb-1 flex animate-pop gap-0.5 rounded-full border border-line bg-surface p-1 shadow-pop", mine ? "right-0" : "left-0")}>
                  {REACTIONS.map((e) => (
                    <button key={e} type="button" aria-pressed={m.reactions?.[ME] === e} aria-label={tr("msg.reactWith", { e })} onClick={() => react(e)}
                      className={cx("grid size-9 cursor-pointer place-items-center rounded-full border-0 text-[1.25rem] transition-transform hover:scale-125", m.reactions?.[ME] === e ? "bg-sec-line" : "bg-transparent")}>{e}</button>
                  ))}
                </div>
              )}
            </div>
            <Menu label={tr("msg.actions")} align={mine ? "right" : "left"} trigger={(p) => (
              <IconButton {...p} data-more icon="more_vert" label={tr("msg.more")} title={tr("msg.moreTitle")} className="size-8! border-0! bg-transparent! text-muted! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" />
            )}>
              <MenuItem icon="reply" hint="R" onClick={() => onReply(m)}>{tr("msg.reply")}</MenuItem>
              <MenuItem icon="add_reaction" onClick={() => setPicker(true)}>{tr("msg.reactMenu")}</MenuItem>
              {m.text && <MenuItem icon="content_copy" onClick={copy}>{tr("msg.copyText")}</MenuItem>}
              <MenuItem icon="star" onClick={star}>{tr(m.starred ? "msg.unstar" : "msg.star")}</MenuItem>
              {canSpeak && m.text && <MenuItem icon={speaking ? "stop_circle" : "volume_up"} onClick={() => toggle(tr("msg.said", { name: mine ? tr("msg.you") : who?.first, text: m.text }))}>{tr(speaking ? "read.stop" : "msg.readAloud")}</MenuItem>}
              {mine && <><MenuDivider /><MenuItem icon="delete" onClick={remove}>{tr("msg.deleteAll")}</MenuItem></>}
            </Menu>
          </div>
        )}
      </div>

      {/* Reactions sit on the bubble's lower edge; tap one to add or take back your own. */}
      {reactions.length > 0 && (
        <div className={cx("relative z-1 -mt-2 flex gap-1", mine ? "mr-3" : t.group ? "ml-12" : "ml-3")}>
          {Object.entries(grouped).map(([e, ids]) => (
            <button key={e} type="button" onClick={() => react(e)} aria-pressed={ids.includes(ME)}
              title={ids.map((id) => (id === ME ? tr("msg.you") : person(id)?.first)).join(", ")}
              aria-label={tr("msg.reactLabel", { e, n: ids.length, names: ids.map((id) => (id === ME ? tr("msg.youLower") : person(id)?.first)).join(", ") }) + (ids.includes(ME) ? tr("msg.tapRemove") : "")}
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
  const tr = useT();
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
    update((s) => { postMessage(s, { threadId: t.id, text: msg, replyTo: replyTo?.id, img }); }, tr("msg.hSent", { title: t.title }));
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
    if (!file.type.startsWith("image/")) { toast(tr("msg.onlyPhotos"), { error: true, sub: tr("msg.onlyPhotosSub") }); return; }
    setBusy(true);
    const url = await shrinkImage(file, 1000, 0.75);
    setBusy(false);
    if (!url) { toast(tr("msg.photoFail"), { error: true, sub: tr("msg.photoFailSub") }); return; }
    setImg(url);
    boxRef.current?.focus();
  };

  const canSend = !!(text.trim() || img);
  return (
    <div className="border-t border-line bg-surface px-3 pt-2 pb-3" onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); attach(f); } }}>
      {replyTo && <div className="mb-2"><Quote t={t} m={replyTo} onClose={() => setReplyTo(null)} /></div>}
      {(img || busy) && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-2 p-2">
          {busy ? <span className="flex items-center gap-2 text-small"><Spinner /> {tr("msg.preparing")}</span> : (
            <>
              <img src={img} alt={tr("msg.photoToSend")} className="size-16 rounded-lg object-cover" />
              <span className="flex-1 text-small text-muted">{tr("msg.captionHint")}</span>
              <IconButton icon="close" label={tr("msg.removePhoto")} onClick={() => setImg(null)} />
            </>
          )}
        </div>
      )}
      {!text && !img && !replyTo && (
        <Chips scroll className="no-scrollbar mb-2" role="group" aria-label={tr("msg.quick")}>
          {tr("msg.quickList").map((qr) => <Chip key={qr} onClick={() => send(qr)}>{qr}</Chip>)}
        </Chips>
      )}
      <form className="flex items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="flex min-w-0 flex-1 items-end gap-0.5 rounded-3xl border border-line bg-surface-2 px-1.5 focus-within:border-sec focus-within:bg-surface">
          <div ref={emojiRef} className="relative">
            <IconButton icon="mood" label={tr("msg.emoji")} title={tr("msg.emoji")} aria-expanded={emoji} className="my-1 size-9! border-0! bg-transparent! text-muted! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" onClick={() => setEmoji(!emoji)} />
            {emoji && (
              <div role="group" aria-label={tr("msg.emoji")} className="absolute bottom-full left-0 z-30 mb-2 grid w-72 animate-pop grid-cols-8 gap-0.5 rounded-2xl border border-line bg-surface p-2 shadow-pop">
                {EMOJI.map((e) => <button key={e} type="button" aria-label={e} onClick={() => insert(e)} className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[1.2rem] transition-transform hover:scale-125 hover-tint">{e}</button>)}
              </div>
            )}
          </div>
          <label htmlFor="msgBox" className="sr-only">{tr("msg.messageTo", { title: t.title })}</label>
          <textarea id="msgBox" ref={boxRef} rows={1} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              if (e.key === "Escape" && replyTo) { e.stopPropagation(); setReplyTo(null); }
            }}
            placeholder={replyTo ? tr("msg.replyPh", { name: replyTo.by === ME ? tr("msg.yourself") : person(replyTo.by)?.first }) : tr("msg.ph")}
            className="max-h-40 min-w-0 flex-1 resize-none border-0 bg-transparent py-2.5 leading-normal text-ink outline-0 placeholder:text-faint" />
          <IconButton icon="attach_file" label={tr("msg.attach")} title={tr("msg.attach")} className="my-1 size-9! border-0! bg-transparent! text-muted! hover:bg-sec-hover! hover:text-sec-ink! active:bg-sec! active:text-sec-on!" onClick={() => fileRef.current.click()} />
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" aria-label={tr("msg.attach")} onChange={(e) => { attach(e.target.files[0]); e.target.value = ""; }} />
        </div>
        {/* Send when there is something to send; otherwise the same spot dictates by voice. */}
        {canSend || !voice.supported ? (
          <button type="submit" disabled={!canSend} aria-label={tr("msg.send")} title={tr("msg.sendTitle")}
            className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-sec text-sec-on shadow-card transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
            <Icon name="send" />
          </button>
        ) : (
          <button type="button" aria-pressed={voice.listening} aria-label={tr(voice.listening ? "msg.stopDictate" : "msg.dictate")} title={tr(voice.listening ? "msg.stopDictate" : "msg.dictate")}
            onClick={() => (voice.listening ? voice.stop() : voice.start())}
            className={cx("grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border-0 shadow-card transition active:scale-95",
              voice.listening ? "animate-rec-pulse bg-rec text-white" : "bg-sec text-sec-on hover:brightness-110")}>
            <Icon name={voice.listening ? "graphic_eq" : "mic"} />
          </button>
        )}
      </form>
      <p className="mt-1.5 px-2 text-[.68rem] text-faint max-sm:hidden">{tr("msg.keys")}</p>
    </div>
  );
}

export default function Chat({ t, focusId, onBack }) {
  const { state, person, update } = useStore();
  const { open, confirm } = useModal();
  const { toggle: toggleSpeech, speaking } = useSpeech();
  const toast = useToast();
  const tr = useT();
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
    <Dialog wide title={m.by === ME ? tr("msg.yourPhoto") : tr("msg.photoFrom", { name: person(m.by)?.first })} sub={`${dayLabel(m.at)}, ${clock(m.at)}${m.text ? ` · ${m.text}` : ""}`}>
      <img src={m.img} alt={m.text || tr("msg.photo")} className="max-h-[70vh] w-full rounded-xl object-contain" />
    </Dialog>,
  );
  const set = (k, v, msg) => { update((s) => { s.threads.find((x) => x.id === t.id)[k] = v; }, null); if (msg) toast(msg, { icon: "check_circle", duration: 2000 }); };

  /* ---------- Everything you can do with this chat ---------- */
  const info = () => open(<ChatInfoDialog id={t.id} onJump={jump} />);
  const toggleSearch = () => { setSearching(!searching); setQ(""); };
  const latest = [...t.messages].reverse().find((m) => !m.deleted && m.text);
  const readLatest = () => latest && toggleSpeech(tr("msg.said", { name: latest.by === ME ? tr("msg.you") : person(latest.by)?.first, text: latest.text }));
  const exportChat = () => {
    // A plain-text transcript that opens anywhere: "[8 Nov 2026, 18:02] Sarah: …"
    const lines = t.messages.map((m) => `[${fmtDate(m.at.slice(0, 10))}, ${clock(m.at)}] ${m.by === ME ? tr("msg.you") : fullName(person(m.by))}: ${m.deleted ? tr("msg.exDeleted") : `${m.img ? tr("msg.exPhoto") : ""}${m.text}`}`);
    const blob = new Blob([`${t.title}\n${chatSubtitle(t, person)}\n\n${lines.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${t.title.replace(/[^\w -]+/g, "").trim() || "chat"}.txt` });
    a.click();
    URL.revokeObjectURL(a.href);
    toast(tr("msg.exported"), { sub: tr("msg.exportedSub", { n: t.messages.length }), icon: "download" });
  };
  const clearChat = () => confirm(tr("msg.clearQ"), tr("msg.clearBody", { title: t.title }), tr("msg.clearBtn"), () => {
    const before = t.messages;
    update((s) => { s.threads.find((x) => x.id === t.id).messages = []; }, tr("msg.hCleared", { title: t.title }));
    toast(tr("msg.cleared"), { sub: t.title, icon: "delete_sweep", action: tr("common.undo"), onAction: () => update((s) => { s.threads.find((x) => x.id === t.id).messages = before; }, tr("msg.hRestoredChat", { title: t.title })) });
  });
  const removeChat = () => {
    const leaving = t.group;
    confirm(tr(leaving ? "msg.leaveQ" : "msg.deleteQ", { title: t.title }), tr(leaving ? "msg.leaveBody" : "msg.deleteBody"),
      tr(leaving ? "msg.leaveBtn" : "msg.deleteBtn"), () => {
        const index = state.threads.findIndex((x) => x.id === t.id);
        const copy = t;
        update((s) => { s.threads = s.threads.filter((x) => x.id !== t.id); }, tr(leaving ? "msg.hLeft" : "msg.hDeletedChat", { title: t.title }));
        onBack();
        toast(tr(leaving ? "msg.left" : "msg.chatDeleted"), { sub: t.title, icon: leaving ? "logout" : "delete", action: tr("common.undo"),
          onAction: () => update((s) => { s.threads.splice(index, 0, copy); }, tr("msg.hRestoredT", { title: t.title })) });
      });
  };
  const tool = "border-0! text-muted! hover:text-ink!";
  return (
    <section aria-label={tr("msg.chatWith", { title: t.title })} className="flex min-h-0 min-w-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if (e.key === "Escape" && searching) { setSearching(false); setQ(""); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); setSearching(true); }
      }}>
      {/* Chat header: who you're talking to, and tools for this chat. */}
      <header className="flex items-center gap-2 border-b border-line bg-surface px-2.5 py-2 sm:px-4">
        <IconButton icon="arrow_back" label={tr("msg.back")} className="border-0! md:hidden" onClick={onBack} />
        <button type="button" onClick={() => open(<ChatInfoDialog id={t.id} onJump={jump} />)} title={tr("msg.info")}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent p-1 text-left text-ink hover-tint">
          <ChatAvatar t={t} />
          <span className="min-w-0">
            <h2 className="flex items-center gap-1.5 truncate text-[1.08rem]!">{t.title}{t.muted && <Icon name="notifications_off" size="xs" className="text-faint" />}</h2>
            <span className="block truncate text-xsmall text-muted">{chatSubtitle(t, person)}</span>
          </span>
        </button>
        {/* The most used options, one tap away (labels on hover and for screen readers). On phones, the rest live in ⋮. */}
        <div role="toolbar" aria-label={tr("msg.options")} className="flex shrink-0 items-center gap-0.5">
          <IconButton icon="search" label={tr("msg.searchIn")} title={tr("msg.searchInTitle")} aria-pressed={searching} className={tool} onClick={toggleSearch} />
          <IconButton icon="info" label={tr("msg.infoMembers")} title={tr("msg.infoMembers")} className={cx(tool, "max-sm:hidden")} onClick={info} />
          <IconButton icon="push_pin" label={tr(t.pinned ? "msg.unpinChat" : "msg.pinChat")} title={tr(t.pinned ? "msg.unpinChat" : "msg.pinChatTop")} aria-pressed={!!t.pinned}
            iconProps={{ fill: !!t.pinned }} className={cx(tool, "max-md:hidden", t.pinned && "text-sec-ink! active:text-sec-on!")} onClick={() => set("pinned", !t.pinned, tr(t.pinned ? "msg.unpinned" : "msg.pinnedTop"))} />
          <IconButton icon={t.muted ? "notifications_off" : "notifications"} label={tr(t.muted ? "msg.unmuteChat" : "msg.muteChat")} title={tr(t.muted ? "msg.unmuteNotif" : "msg.muteNotif")}
            aria-pressed={!!t.muted} className={cx(tool, "max-md:hidden")} onClick={() => set("muted", !t.muted, tr(t.muted ? "msg.notifOn" : "msg.muted"))} />
          <Menu label={tr("msg.allOptions")} trigger={(p) => <IconButton {...p} icon="more_vert" label={tr("msg.allOptions")} title={tr("msg.allOptions")} className={tool} />}>
            <MenuLabel>{tr("msg.thisChat")}</MenuLabel>
            <MenuItem icon="info" onClick={info}>{tr("msg.infoMenu")}</MenuItem>
            <MenuItem icon="search" hint="Ctrl F" onClick={toggleSearch}>{tr("msg.searchMenu")}</MenuItem>
            <MenuItem icon="star" onClick={info}>{tr("msg.starred")}</MenuItem>
            {canSpeak && latest && <MenuItem icon={speaking ? "stop_circle" : "volume_up"} onClick={readLatest}>{tr(speaking ? "read.stop" : "msg.readLatest")}</MenuItem>}
            <MenuDivider />
            <MenuLabel>{tr("msg.organise")}</MenuLabel>
            <MenuItem icon="push_pin" onClick={() => set("pinned", !t.pinned, tr(t.pinned ? "msg.unpinned" : "msg.pinnedTop"))}>{tr(t.pinned ? "msg.unpinChat" : "msg.pinChatTop")}</MenuItem>
            <MenuItem icon={t.muted ? "notifications_active" : "notifications_off"} onClick={() => set("muted", !t.muted, tr(t.muted ? "msg.notifOn" : "msg.muted"))}>{tr(t.muted ? "msg.unmuteNotif" : "msg.muteNotif")}</MenuItem>
            <MenuItem icon="mark_chat_unread" onClick={() => { set("unread", Math.max(1, t.unread || 0), tr("msg.markedUnread")); onBack(); }}>{tr("msg.markUnread")}</MenuItem>
            <MenuDivider />
            <MenuLabel>{tr("msg.manage")}</MenuLabel>
            <MenuItem icon="download" onClick={exportChat}>{tr("msg.export")}</MenuItem>
            <MenuItem icon="delete_sweep" onClick={clearChat}>{tr("msg.clearMenu")}</MenuItem>
            <MenuItem icon={t.group ? "logout" : "delete"} onClick={removeChat}>{tr(t.group ? "msg.leaveMenu" : "msg.deleteMenu")}</MenuItem>
            <MenuDivider />
            <MenuItem icon="close" onClick={onBack}>{tr("msg.close")}</MenuItem>
          </Menu>
          <IconButton icon="close" label={tr("msg.close")} title={tr("msg.close")} className={cx(tool, "max-md:hidden")} onClick={onBack} />
        </div>
      </header>

      {searching && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
          <Icon name="search" size="sm" className="text-muted" />
          <label htmlFor="chatQ" className="sr-only">{tr("msg.searchMsgs", { title: t.title })}</label>
          <input id="chatQ" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHit(0); }} placeholder={tr("msg.searchPh")}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); goHit(hit + (e.shiftKey ? -1 : 1)); } }}
            className="min-w-0 flex-1 border-0 bg-transparent py-1 text-ink outline-0" />
          <span className="text-xsmall text-muted tabular-nums" aria-live="polite">{q.trim() ? (matches.length ? tr("msg.hitOf", { a: hit + 1, b: matches.length }) : tr("msg.noMatches")) : ""}</span>
          <IconButton icon="keyboard_arrow_up" label={tr("msg.older")} className="size-8! border-0!" disabled={!matches.length} onClick={() => goHit(hit + 1)} />
          <IconButton icon="keyboard_arrow_down" label={tr("msg.newer")} className="size-8! border-0!" disabled={!matches.length} onClick={() => goHit(hit - 1)} />
          <IconButton icon="close" label={tr("msg.closeSearch")} className="size-8! border-0!" onClick={() => { setSearching(false); setQ(""); }} />
        </div>
      )}

      {/* Message body. */}
      <div className="relative min-h-0 flex-1">
        <ol ref={bodyRef} aria-label={tr("nav.messages")} onScroll={(e) => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120); }}
          className="m-0 h-full list-none overflow-y-auto bg-surface-2 bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:20px_20px] px-3 py-3 sm:px-6">
          <li className="mx-auto mb-3 flex max-w-110 items-start gap-2 rounded-xl bg-gold-100 px-3 py-2 text-center text-xsmall text-gold-ink">
            <Icon name="lock" size="xs" /> {tr("msg.privacyNote")}
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
                      <li className="my-3 flex justify-center" role="separator" aria-label={unreadMark.n > 1 ? tr("msg.unreadMsgsN", { n: unreadMark.n }) : tr("msg.unreadMsgs1")}>
                        <span className="w-full rounded-lg bg-sec-soft py-1 text-center text-xsmall font-semibold text-sec-ink">{unreadMark.n > 1 ? tr("msg.unreadMsgsN", { n: unreadMark.n }) : tr("msg.unreadMsgs1")}</span>
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
          <button type="button" aria-label={tr("msg.jumpNewest")} title={tr("msg.newest")}
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
