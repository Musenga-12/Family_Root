/* Store context, hook and pure kinship helpers. The provider lives in StoreProvider.jsx. */
import { createContext, useContext } from "react";

export const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

/* ---------- Kinship helpers (pure, take the current state) ---------- */
export const fullName = (p) => (p ? `${p.first} ${p.last}`.trim() : "Unknown");
export const initials = (p) => (p ? ((p.first?.[0] || "") + (p.last?.[0] || "")).toUpperCase() || "?" : "?");
export const year = (d) => (d ? d.slice(0, 4) : "");

/** Age in years, or null when the birth date isn't known (or a relative chose not to show it). */
export function age(p) {
  if (!p?.born || p.born.length < 4) return null;
  const end = p.died ? new Date(p.died) : new Date();
  const b = new Date(p.born.length === 4 ? `${p.born}-01-01` : p.born);
  let a = end.getFullYear() - b.getFullYear();
  if (end.getMonth() < b.getMonth() || (end.getMonth() === b.getMonth() && end.getDate() < b.getDate())) a--;
  return a;
}

/** Month and day of a birthday: from the full date, or from `birthday` ("MM-DD") when only the year is private. */
const birthMonthDay = (p) => {
  const md = p?.born?.length >= 10 ? p.born.slice(5, 10) : p?.birthday;
  return md && /^\d\d-\d\d$/.test(md) ? md.split("-").map(Number) : null;
};

/** The date of the next birthday (today counts), or null when it isn't known. */
export function nextBirthday(p) {
  const md = birthMonthDay(p);
  if (!md) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), md[0] - 1, md[1]);
  if (next < now) next = new Date(now.getFullYear() + 1, md[0] - 1, md[1]);
  return next;
}

/** Days until the next birthday, or null when it isn't known. */
export function daysToBirthday(p) {
  const next = nextBirthday(p);
  if (!next) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((next - now) / 86400000);
}
