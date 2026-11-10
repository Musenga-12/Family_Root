/* Messages. Top: filter tabs (All, Unread, Groups, Private, Starred) with live counts. Left: the chat list. Right: the open chat.
   On phones the list and the chat take turns filling the screen. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Menu, MenuItem } from "../components/Menu";
import { useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Empty, Icon, IconButton, Input, InputIcon } from "../components/ui";
import { ME } from "../data";
import { cx } from "../lib/format";
import { useT } from "../lib/i18n";
import { chatSubtitle, clock, dayLabel, lastOf, listTime, snippet } from "../lib/messages";
import { fullName, useStore } from "../lib/store";
import Chat from "./messages/Chat";
import { ChatAvatar, NewChatDialog } from "./messages/parts";

const FILTERS = [["all", "All", "forum"], ["unread", "Unread", "mark_chat_unread"], ["groups", "Groups", "groups"], ["private", "Private", "person"], ["starred", "Starred", "star"]];

/**
 * Hover (or keyboard-focus) preview of a chat: its latest messages in full, so a long message can be read
 * without opening the chat (which would mark it read). Drawn outside the scrolling list so nothing clips it.
 */
function ChatPreview({ x, anchor }) {
  const { person } = useStore();
  const r = anchor.getBoundingClientRect();
  const W = 340;
  // Beside the row when there is room; otherwise just below it (narrow windows).
  const beside = r.right + W + 16 < window.innerWidth;
  const style = beside
    ? { left: r.right + 8, top: Math.max(8, Math.min(r.top - 8, window.innerHeight - 380)) }
    : { left: Math.max(8, Math.min(r.left + 16, window.innerWidth - W - 8)), top: Math.min(r.bottom + 6, window.innerHeight - 380) };
  const recent = x.messages.filter((m) => !m.deleted).slice(-3);
  return createPortal(
    <div role="tooltip" id={`preview-${x.id}`} style={{ ...style, width: W }}
      className="pointer-events-none fixed z-70 grid animate-fade gap-2.5 rounded-2xl border border-line bg-surface p-3.5 shadow-pop">
      <div className="flex items-center gap-2.5">
        <ChatAvatar t={x} size="sm" />
        <span className="min-w-0">
          <strong className="block truncate">{x.title}</strong>
          <small className="block truncate text-xsmall text-muted">{chatSubtitle(x, person)}</small>
        </span>
      </div>
      {x.unread > 0 && <span className="justify-self-start rounded-full bg-sec px-2 py-0.5 text-[.7rem] font-bold text-sec-on">{x.unread} unread</span>}
      <ol className="m-0 grid list-none gap-2 p-0">
        {recent.map((m) => {
          const quoted = m.replyTo && x.messages.find((y) => y.id === m.replyTo);
          return (
            <li key={m.id} className={cx("rounded-xl px-3 py-2 text-small", m.by === ME ? "ml-6 bg-sec-soft" : "mr-6 bg-surface-2")}>
              <span className="flex items-baseline justify-between gap-2 text-xsmall">
                <strong>{m.by === ME ? "You" : person(m.by)?.first}</strong>
                <span className="text-muted tabular-nums">{dayLabel(m.at)}, {clock(m.at)}</span>
              </span>
              {quoted && <span className="mt-1 block truncate border-l-2 border-sec pl-2 text-xsmall text-muted">↩ {quoted.by === ME ? "You" : person(quoted.by)?.first}: {snippet(quoted)}</span>}
              <span className="mt-0.5 block whitespace-pre-wrap [overflow-wrap:anywhere]">{snippet(m)}</span>
              {m.reactions && Object.keys(m.reactions).length > 0 && <span className="mt-1 block text-xsmall">{Object.values(m.reactions).join(" ")}</span>}
            </li>
          );
        })}
        {!recent.length && <li className="text-small text-muted">No messages yet.</li>}
      </ol>
      <small className="text-xsmall text-muted">{x.messages.length > 3 ? `Latest 3 of ${x.messages.length} messages · ` : ""}Click to open the chat</small>
    </div>,
    document.body,
  );
}

function ChatRow({ x, active, onOpen }) {
  const { person, update } = useStore();
  const toast = useToast();
  const last = lastOf(x);
  const rowRef = useRef(null);
  const timer = useRef(null);
  const [preview, setPreview] = useState(null); // the row element the preview card is placed against
  // A short pause before showing, so sweeping the mouse down the list doesn't flash every card.
  const show = (delay) => { clearTimeout(timer.current); timer.current = setTimeout(() => setPreview(rowRef.current), delay); };
  const hide = () => { clearTimeout(timer.current); setPreview(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!preview) return;
    const close = () => setPreview(null);
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("keydown", onKey); };
  }, [preview]);
  const set = (k, v, msg) => { update((s) => { s.threads.find((y) => y.id === x.id)[k] = v; }, null); toast(msg, { icon: "check_circle", duration: 2000 }); };
  const who = last ? (last.by === ME ? "You" : x.group ? person(last.by)?.first : null) : null;
  return (
    <li className="group/row relative" onContextMenu={(e) => { e.preventDefault(); e.currentTarget.querySelector("[data-row-menu]")?.click(); }}>
      <button ref={rowRef} type="button" aria-current={active ? "true" : undefined} onClick={() => { hide(); onOpen(x.id); }}
        onMouseEnter={() => show(450)} onMouseLeave={hide} onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(150)} onBlur={hide}
        aria-describedby={preview ? `preview-${x.id}` : undefined}
        aria-label={`${x.title}${x.unread ? `, ${x.unread} unread` : ""}${x.pinned ? ", pinned" : ""}. ${who ? who + ": " : ""}${snippet(last)}`}
        className={cx("flex w-full cursor-pointer items-center gap-3 border-0 border-b border-line/60 px-3 py-2.5 pr-10 text-left text-ink",
          active ? "bg-sec-soft shadow-[inset_4px_0_0_var(--sec)]" : "hover-tint bg-transparent hover:shadow-[inset_4px_0_0_var(--sec)]")}>
        <ChatAvatar t={x} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <strong className={cx("truncate", x.unread ? "font-bold" : "font-semibold")}>{x.title}</strong>
            <small className={cx("shrink-0 text-[.7rem] tabular-nums", x.unread && !x.muted ? "font-bold text-sec-ink" : "text-muted")}>{last ? listTime(last.at) : ""}</small>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {last?.by === ME && !last.deleted && <Icon name="done_all" className={cx("text-[15px]!", last.status === "read" ? "text-sec" : "text-faint")} />}
            <span className={cx("min-w-0 flex-1 truncate text-small", x.unread ? "text-ink" : "text-muted", last?.deleted && "italic")}>
              {who && <span className="font-medium">{who}: </span>}{last ? snippet(last) : "No messages yet"}
            </span>
            {x.muted && <Icon name="notifications_off" size="xs" className="text-faint" title="Muted" />}
            {x.pinned && <Icon name="push_pin" size="xs" className="text-faint" />}
            {x.unread > 0 && (
              <span className={cx("grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[.66rem] font-bold", x.muted ? "bg-surface-3 text-muted" : "bg-sec text-sec-on")}>{x.unread}</span>
            )}
          </span>
        </span>
      </button>
      {preview && <ChatPreview x={x} anchor={preview} />}
      {/* Row options: on hover, focus or right-click. */}
      <div className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 max-md:opacity-100">
        <Menu label={`Options for ${x.title}`} trigger={(p) => <IconButton {...p} data-row-menu icon="more_vert" label={`Options for ${x.title}`} className="size-8! border-0! bg-transparent! hover:bg-sec! hover:text-sec-on!" />}>
          <MenuItem icon="push_pin" onClick={() => set("pinned", !x.pinned, x.pinned ? "Unpinned" : "Pinned to the top")}>{x.pinned ? "Unpin" : "Pin to the top"}</MenuItem>
          <MenuItem icon={x.unread ? "mark_chat_read" : "mark_chat_unread"} onClick={() => set("unread", x.unread ? 0 : 1, x.unread ? "Marked as read" : "Marked as unread")}>
            {x.unread ? "Mark as read" : "Mark as unread"}
          </MenuItem>
          <MenuItem icon={x.muted ? "notifications_active" : "notifications_off"} onClick={() => set("muted", !x.muted, x.muted ? "Notifications on" : "Muted")}>{x.muted ? "Unmute" : "Mute"}</MenuItem>
        </Menu>
      </div>
    </li>
  );
}

/** Every starred message, newest first; choosing one opens its chat at that message. */
function StarredList({ threads, onOpen }) {
  const { person } = useStore();
  const items = threads.flatMap((x) => x.messages.filter((m) => m.starred && !m.deleted).map((m) => ({ x, m }))).sort((a, b) => b.m.at.localeCompare(a.m.at));
  if (!items.length) return <Empty icon="star" title="No starred messages" className="m-3"><p className="text-small">Open a message's menu and choose Star to keep it here.</p></Empty>;
  return (
    <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
      {items.map(({ x, m }) => (
        <li key={m.id}>
          <button type="button" onClick={() => onOpen(x.id, m.id)}
            className="grid w-full cursor-pointer gap-1 border-0 border-b border-line/60 bg-transparent px-4 py-3 text-left text-ink hover-tint">
            <span className="flex items-center justify-between gap-2 text-xsmall text-muted">
              <span className="truncate"><strong className="text-ink">{m.by === ME ? "You" : person(m.by)?.first}</strong> in {x.title}</span>
              <span className="shrink-0">{dayLabel(m.at)}, {clock(m.at)}</span>
            </span>
            <span className="flex items-start gap-2 text-small"><Icon name="star" fill size="xs" className="mt-0.5 text-gold" /><span className="line-clamp-2">{snippet(m)}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function Messages() {
  const { state, person, update } = useStore();
  const { open } = useModal();
  const toast = useToast();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const threads = state.threads;
  // No chat opens by itself: opening one marks it read, so that only happens when you choose it.
  const activeId = params.get("c");
  const active = threads.find((x) => x.id === activeId);
  const select = (id, msg) => setParams(id ? { c: id, ...(msg ? { m: msg } : {}) } : {});

  const unreadChats = threads.filter((x) => x.unread);
  const unread = unreadChats.reduce((n, x) => n + x.unread, 0);
  const starredCount = threads.reduce((n, x) => n + x.messages.filter((m) => m.starred && !m.deleted).length, 0);
  const counts = { all: threads.length, unread: unreadChats.length, groups: threads.filter((x) => x.group).length, private: threads.filter((x) => !x.group).length, starred: starredCount };

  const ql = q.trim().toLowerCase();
  const list = threads
    .filter((x) => filter === "all" || filter === "starred" || (filter === "unread" ? x.unread : filter === "groups" ? x.group : !x.group))
    .filter((x) => !ql || [x.title, ...x.messages.filter((m) => !m.deleted).map((m) => m.text), ...x.members.map((id) => fullName(person(id)))].join(" ").toLowerCase().includes(ql))
    // Pinned first, then the most recent conversation.
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (lastOf(b)?.at || "").localeCompare(lastOf(a)?.at || ""));
  const markAllRead = () => {
    update((s) => { s.threads.forEach((x) => { x.unread = 0; }); }, null);
    toast("All chats marked as read", { icon: "mark_chat_read", duration: 2000 });
  };

  return (
    <div className={cx("flex min-h-130 flex-col gap-3", active ? "h-[calc(100dvh-170px)] max-md:h-[calc(100dvh-130px)]" : "h-[calc(100dvh-170px)]")}>
      {/* On a phone, an open chat gets the whole screen; the heading stays for screen readers. */}
      {active && <h1 className="sr-only md:hidden">{t("nav.messages")}: {active.title}</h1>}
      {/* Header: what's waiting, and the filters that sort it. */}
      <header className={cx("flex flex-wrap items-end justify-between gap-3", active && "max-md:hidden")}>
        <div>
          <h1 className="text-[clamp(1.6rem,2.4vw,2.1rem)]!">{t("nav.messages")}</h1>
          <p className="mt-1 text-small text-muted" aria-live="polite">
            {unread ? <><strong className="text-ink">{unread} unread</strong> in {unreadChats.length} chat{unreadChats.length > 1 ? "s" : ""} · </> : "You're all caught up · "}
            {threads.length} conversations
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon="mark_chat_read" disabled={!unread} onClick={markAllRead}><span className="max-sm:sr-only">Mark all read</span></Button>
          <Button variant="primary" icon="edit_square" onClick={() => open(<NewChatDialog onCreated={(id) => { setFilter("all"); select(id); }} />)}>New chat</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <aside aria-label="Chats" className={cx("flex w-full min-w-0 flex-col md:w-90 md:shrink-0 md:border-r md:border-line", active && "max-md:hidden")}>
          <div className="grid gap-2.5 border-b border-line p-3">
            <InputIcon icon="search">
              <label htmlFor="msgQ" className="sr-only">Search chats and messages</label>
              <Input id="msgQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats and messages" className="rounded-full!" />
            </InputIcon>
            <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1.5">
              {FILTERS.map(([k, label, icon]) => {
                const on = filter === k;
                return (
                  <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setFilter(k)}
                    className={cx("pressable inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[.82rem] font-semibold easy:min-h-12",
                      on ? "border-transparent bg-[linear-gradient(135deg,var(--sec),var(--sec-ink))] text-sec-on shadow-[0_4px_12px_-6px_var(--sec)]" : "hover-fill border-sec-line bg-surface text-ink")}>
                    <Icon name={icon} size="xs" />{label}
                    {counts[k] > 0 && <span className={cx("rounded-full px-1.5 text-[.68rem]", on ? "bg-sec-on/25" : k === "unread" ? "bg-sec text-sec-on" : "bg-surface-3")}>{counts[k]}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          {filter === "starred" ? <StarredList threads={threads} onOpen={select} /> : list.length ? (
            <ul aria-label={`${FILTERS.find(([k]) => k === filter)[1]} chats`} className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
              {list.map((x) => <ChatRow key={x.id} x={x} active={x.id === activeId} onOpen={(id) => select(id)} />)}
            </ul>
          ) : (
            <Empty icon={filter === "unread" ? "mark_chat_read" : "forum"} title={filter === "unread" && !ql ? "No unread messages" : "No chats match"} className="m-3">
              <p className="text-small">{filter === "unread" && !ql ? "You've read everything. Nice." : "Try another name or word, or show all chats."}</p>
              {(ql || filter !== "all") && <Button className="mt-3" onClick={() => { setQ(""); setFilter("all"); }}>Show all chats</Button>}
            </Empty>
          )}
        </aside>

        {active ? <Chat key={active.id} t={active} focusId={params.get("m")} onBack={() => select(null)} /> : (
          <div className="hidden flex-1 place-items-center bg-surface-2 p-6 text-center text-muted md:grid">
            <div className="grid justify-items-center gap-2">
              <span className="grid size-16 place-items-center rounded-full bg-sec-soft text-sec-ink"><Icon name="forum" className="text-[34px]!" /></span>
              <h2 className="text-ink">Your family conversations</h2>
              <p className="max-w-80 text-small">Choose a chat on the left, or start a new one with any relative.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
