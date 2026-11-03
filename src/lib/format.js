/** Join class names, skipping falsy values. */
export const cx = (...c) => c.filter(Boolean).join(" ");

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Consistent date format: "14 Oct 2025", "Oct 1968", or "c. 1918" for approximate dates. */
export function fmtDate(d, approx) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (approx) return `c. ${y}`;
  if (!m) return y;
  if (!day) return `${MONTHS[+m - 1]} ${y}`;
  return `${+day} ${MONTHS[+m - 1]} ${y}`;
}

export const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];

/** Current year, computed once at load so render stays pure. */
export const THIS_YEAR = new Date().getFullYear();
