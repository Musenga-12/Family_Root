/** Join class names, skipping falsy values. */
export const cx = (...c) => c.filter(Boolean).join(" ");

/* Dates follow the interface language. StoreProvider calls setDateLang() whenever the language changes, before
   the app renders, so every fmtDate()/fmtWhen() call uses the chosen language. Kept as plain tables (not Intl)
   because browsers don't all ship Kinyarwanda and Swahili date names. */
const MONTH_NAMES = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  rw: ["Mut", "Gas", "Wer", "Mat", "Gic", "Kam", "Nya", "Kan", "Nze", "Ukw", "Ugu", "Uku"],
  sw: ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ago", "Sep", "Okt", "Nov", "Des"],
};
const DAY_NAMES = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  fr: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  rw: ["Ku cyumweru", "Ku wa mbere", "Ku wa kabiri", "Ku wa gatatu", "Ku wa kane", "Ku wa gatanu", "Ku wa gatandatu"],
  sw: ["Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"],
};
const DAY_SHORT = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  fr: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
  rw: ["Cyu", "Mbe", "Kab", "Gat", "Kan", "Gnu", "Gnd"],
  sw: ["Jpi", "Jtt", "Jnn", "Jtn", "Alh", "Iju", "Jmo"],
};
const DATE_WORDS = {
  en: { approx: "c.", today: "Today", yesterday: "Yesterday" },
  fr: { approx: "v.", today: "Aujourd'hui", yesterday: "Hier" },
  rw: { approx: "ahagana", today: "Uyu munsi", yesterday: "Ejo hashize" },
  sw: { approx: "takriban", today: "Leo", yesterday: "Jana" },
};
let dateLang = "en";
export const setDateLang = (lang) => { dateLang = MONTH_NAMES[lang] ? lang : "en"; };
export const currentLang = () => dateLang;
/** Short month name in the interface language (0 = January). */
export const monthName = (i) => MONTH_NAMES[dateLang][i];
export const dayName = (i) => DAY_NAMES[dateLang][i];
export const dayShort = (i) => DAY_SHORT[dateLang][i];
/** "approx" (the "c." before an approximate year), "today" or "yesterday" in the interface language. */
export const dateWord = (key) => DATE_WORDS[dateLang][key];

/** Consistent date format: "14 Oct 2025", "Oct 1968", or "c. 1918" for approximate dates. */
export function fmtDate(d, approx) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (approx) return `${dateWord("approx")} ${y}`;
  if (!m) return y;
  if (!day) return `${monthName(+m - 1)} ${y}`;
  return `${+day} ${monthName(+m - 1)} ${y}`;
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
  if (diff === 0) return `${dateWord("today")}, ${time}`;
  if (diff === 1) return `${dateWord("yesterday")}, ${time}`;
  return `${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}, ${time}`;
}

/** Current local date and time as "YYYY-MM-DDTHH:MM" (same shape as the stored message timestamps). */
export const nowLocalISO = () => { const d = new Date(); return `${todayISO()}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

/** Offer `data` as a JSON file download. */
export function saveJson(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}
