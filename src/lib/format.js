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

/** Today's date as YYYY-MM-DD (local time). */
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Timestamps in the same unambiguous style as dates: "Today, 09:30", "Yesterday, 18:02", "8 Nov 2026, 18:02". */
export function fmtWhen(iso) {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diff = Math.round((now - day) / 86400000);
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

/** Current local date and time as "YYYY-MM-DDTHH:MM" (same shape as the stored message timestamps). */
export const nowLocalISO = () => { const d = new Date(); return `${todayISO()}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
