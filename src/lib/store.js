/* Store context, hook and pure kinship helpers. The provider lives in StoreProvider.jsx. */
import { createContext, useContext } from "react";

export const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

/* ---------- Kinship helpers (pure, take the current state) ---------- */
export const fullName = (p) => (p ? `${p.first} ${p.last}` : "Unknown");
export const initials = (p) => (p ? (p.first[0] + p.last[0]).toUpperCase() : "?");
export const year = (d) => (d ? d.slice(0, 4) : "");

export function age(p) {
  const end = p.died ? new Date(p.died) : new Date();
  const b = new Date(p.born);
  let a = end.getFullYear() - b.getFullYear();
  if (end.getMonth() < b.getMonth() || (end.getMonth() === b.getMonth() && end.getDate() < b.getDate())) a--;
  return a;
}

export function daysToBirthday(p) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const b = new Date(p.born);
  let next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
  if (next < now) next = new Date(now.getFullYear() + 1, b.getMonth(), b.getDate());
  return Math.round((next - now) / 86400000);
}
