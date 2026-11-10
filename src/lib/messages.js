/* Conversation helpers shared by the Messages screen and the "Message" buttons on the Tree and Directory. */
import { ME } from "../data";
import { MONTHS, nowLocalISO, todayISO, uid } from "./format";

/** The one-to-one thread between the signed-in user and `personId`, if there is one. */
export const directThread = (state, personId) =>
  state.threads.find((t) => !t.group && t.members.length === 2 && t.members.includes(ME) && t.members.includes(personId));

/** Id of the conversation a message to `to` will land in: the existing one-to-one thread, or a fresh id. */
export const threadIdFor = (state, to) => (to.length === 1 && directThread(state, to[0])?.id) || uid("c");

/**
 * Append a message from the signed-in user, creating the conversation (with id `threadId`) when needed. Call inside update().
 * Optional: `replyTo` (id of the quoted message), `img` (a data URL).
 */
export function postMessage(draft, { threadId, to = [], title, text = "", replyTo, img }) {
  let t = draft.threads.find((x) => x.id === threadId);
  if (!t) {
    t = { id: threadId, title, group: to.length > 1, members: [ME, ...to], unread: 0, messages: [] };
    draft.threads.unshift(t);
  }
  // "delivered": it reached the family archive. There is no read receipt until a relative actually opens it.
  t.messages.push({ id: uid("x"), by: ME, at: nowLocalISO(), text, status: "delivered", ...(replyTo ? { replyTo } : {}), ...(img ? { img } : {}) });
  // Most recent conversation first (pinned ones are sorted to the top on screen).
  draft.threads = [t, ...draft.threads.filter((x) => x.id !== t.id)];
}

/** Latest message that hasn't been deleted (for the chat list preview). */
export const lastOf = (t) => [...t.messages].reverse().find((m) => !m.deleted) || t.messages[t.messages.length - 1];

/** One-line description of a message, for previews and reply quotes. */
export const snippet = (m) => (!m ? "" : m.deleted ? "This message was deleted" : m.text || (m.img ? "📷 Photo" : ""));

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayDiff = (iso) => Math.round((new Date(`${todayISO()}T00:00`) - new Date(`${iso.slice(0, 10)}T00:00`)) / 86400000);

/** Separator label inside a conversation: "Today", "Yesterday", a weekday within the last week, else "3 Nov 2026". */
export function dayLabel(iso) {
  const d = dayDiff(iso);
  const date = new Date(`${iso.slice(0, 10)}T00:00`);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d > 1 && d < 7) return DAYS[date.getDay()];
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Time in the chat list: "09:30" today, "Yesterday", a weekday, else "3 Nov". */
export function listTime(iso) {
  const d = dayDiff(iso);
  if (d === 0) return iso.slice(11, 16);
  if (d === 1) return "Yesterday";
  const date = new Date(`${iso.slice(0, 10)}T00:00`);
  if (d > 1 && d < 7) return DAYS[date.getDay()].slice(0, 3);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export const clock = (iso) => iso.slice(11, 16);

/** A steady name colour per sender in group chats, so a glance shows who is talking (the name is always written too). */
const NAME_TONES = ["text-pine-700", "text-gold-ink", "text-rose", "text-[#4c7a8f]", "text-[#8a6f9a]", "text-[#9a7a5a]"];
export const nameTone = (t, id) => NAME_TONES[Math.max(0, t.members.indexOf(id)) % NAME_TONES.length];

/** "Daughter · Inverness, UK" for a private chat; "You, Sarah, Michael and 5 others" for a group. */
export function chatSubtitle(t, person) {
  const others = t.members.filter((m) => m !== ME).map(person).filter(Boolean);
  if (!t.group) return others[0] ? `${others[0].role} · ${others[0].city}` : "";
  const names = others.map((p) => p.first);
  return `You, ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} others` : ""}`;
}
