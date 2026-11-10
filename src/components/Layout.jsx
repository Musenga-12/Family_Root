/* App shell: sidebar navigation, top bar, breadcrumbs, footer, theme / language / Easy-to-Read switches, quick search,
   undo / redo with history, read aloud, voice search, connection status, quick actions and the first-visit tour. */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ME } from "../data";
import AddMemoryDialog from "../dialogs/AddMemoryDialog";
import AddPersonDialog from "../dialogs/AddPersonDialog";
import InviteDialog from "../dialogs/InviteDialog";
import { cx } from "../lib/format";
import { LANGS, useT } from "../lib/i18n";
import { NAV } from "../lib/nav";
import { canSpeak, pageText, useSpeech, useVoiceInput } from "../lib/speech";
import { useInstall } from "../lib/useInstall";
import { fullName, useStore } from "../lib/store";
import { THEME_ICON, usePrefActions } from "../lib/usePrefActions";
import { useToggleEasy } from "../lib/useToggleEasy";
import CommandPalette from "./CommandPalette";
import { Menu, MenuDivider, MenuItem, MenuLabel } from "./Menu";
import { Dialog } from "./Modal";
import Tour from "./Tour";
import { useCloseModal, useModal } from "./modalContext";
import { useToast } from "./toastContext";
import { Avatar, Button, Empty, Icon, IconButton, Record } from "./ui";

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function Sidebar({ open, onClose }) {
  const { prefs, setPref, state } = useStore();
  const unread = (state.threads || []).reduce((n, x) => n + (x.unread || 0), 0);
  const t = useT();
  const compact = prefs.sidebar === "compact";
  return (
    <>
      <aside id="sidebar" aria-label="Primary" data-no-print
        className={cx(
          "z-40 flex h-screen w-62 shrink-0 flex-col gap-4.5 overflow-y-auto border-r border-line bg-surface-2 px-3.5 py-4.5 transition-[width,transform]",
          "fixed top-0 left-0 shadow-pop md:sticky md:translate-x-0 md:shadow-none",
          compact && "md:w-19 md:px-2.5",
          open ? "translate-x-0" : "-translate-x-full",
        )}>
        <Link to="/" aria-label="FamilyRoots home" className={cx("flex items-center gap-2.5 px-1.5 text-ink no-underline", compact && "md:justify-center")}>
          <span className="grid size-8.5 shrink-0 place-items-center rounded-full bg-pine-900 text-mint"><Icon name="park" /></span>
          <span className={cx(compact && "md:sr-only")}>
            <strong className="block font-serif text-[1.15rem] leading-[1.1]">FamilyRoots</strong>
            <small className="text-[.62rem] font-semibold tracking-[.16em] text-pine-700 uppercase">{t("brand.tagline")}</small>
          </span>
        </Link>
        <nav data-tour="nav">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className={cx("px-2.5 pt-3 pb-1.5 text-[.66rem] font-semibold tracking-[.14em] text-muted uppercase", compact && "md:sr-only")}>
                {t(g.key)}
              </div>
              <ul className="m-0 grid list-none gap-0.5 p-0">
                {g.items.map(([id, , icon]) => (
                  <li key={id} data-sec={id}>
                    {/* Each section keeps its own colour here, on its page header and on its cards.
                        Tab style: the item runs to the sidebar's left edge with a rounded right end;
                        a soft tint of the section colour on hover; the open page is filled with a bright gradient of
                        its colour (white text and filled icon, a glow), so where you are is unmistakable. */}
                    <NavLink to={`/${id}`} onClick={onClose} title={compact ? t(`nav.${id}`) : undefined}
                      className={({ isActive }) => cx(
                        "group relative -ml-3.5 flex min-h-11 items-center gap-3.5 rounded-r-full py-1.5 pr-3 pl-6 text-[.92rem] no-underline transition-[background-color,box-shadow,color] duration-200",
                        compact && "md:ml-0 md:justify-center md:rounded-full md:px-0",
                        isActive
                          ? cx("font-bold text-sec-on",
                            // Overview leads to every section, so it shows all the family's colours (like its header stripe).
                            id === "overview" ? "bg-(image:--rainbow)" : "bg-[linear-gradient(110deg,var(--sec)_0%,var(--sec)_45%,var(--sec-ink)_100%)]",
                            "shadow-[0_6px_18px_-6px_var(--sec),inset_0_1px_0_rgb(255_255_255/.25)] hover:brightness-110 dark:hover:brightness-105")
                          : "text-ink hover:bg-[color-mix(in_oklab,var(--sec)_15%,var(--color-surface))] hover:text-sec-ink active:bg-[color-mix(in_oklab,var(--sec)_32%,var(--color-surface))]",
                      )}>
                      {({ isActive }) => <>
                        <Icon name={icon} fill={isActive}
                          className={cx("shrink-0 text-[21px]!", isActive ? "text-sec-on" : "text-muted group-hover:text-sec-ink")} />
                        <span className={cx("min-w-0 flex-1", compact && "md:sr-only")}>{t(`nav.${id}`)}</span>
                        {/* A small dot on the open page, so it is marked by shape as well as colour. */}
                        {isActive && !compact && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-sec-on shadow-[0_0_0_3px_rgb(255_255_255/.25)]" />}
                        {id === "messages" && unread > 0 && (
                          <span className={cx("grid h-5 min-w-5 place-items-center rounded-full bg-rose px-1 text-[.66rem] font-bold text-white", isActive && "ring-2 ring-white", compact && "md:absolute md:top-1 md:right-1")}>
                            {unread}<span className="sr-only"> unread</span>
                          </span>
                        )}
                      </>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-auto grid gap-2">
          <div className={cx("flex items-center gap-1.5 rounded-[10px] bg-mint-100 px-3 py-2.5 text-[.78rem] font-semibold text-pine-800 dark:text-mint", compact && "md:justify-center md:px-0")}>
            <Icon name="lock" size="sm" /> <span className={cx(compact && "md:sr-only")}>{t("side.protected")}</span>
          </div>
          <button type="button" onClick={() => setPref("sidebar", compact ? "full" : "compact")}
            className="pressable hidden cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-[.78rem] text-muted hover-fill md:flex">
            <Icon name={compact ? "left_panel_open" : "left_panel_close"} size="sm" />
            <span className={cx(compact && "sr-only")}>{t(compact ? "side.expand" : "side.collapse")}</span>
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-35 bg-[rgba(10,30,24,.4)] md:hidden" onClick={onClose} />}
    </>
  );
}

function NotificationsDialog({ onRead }) {
  const items = [
    ["cake", "Anna's birthday is coming up", "Send a voice card or attach a memory."],
    ["forum", "2 new replies to this week's prompt", "Michael and Anna shared recollections."],
    ["fact_check", "Pending proof review", "Robert Dunbar's birth record awaits family consensus."],
  ];
  return (
    <Dialog title="Notifications" footer={<CloseAfter onClick={onRead}>Mark all as read</CloseAfter>}>
      <div className="grid gap-2">
        {items.map(([icon, title, sub]) => (
          <Record key={title} icon={icon}><div className="min-w-0 flex-1"><strong>{title}</strong><p className="text-small text-muted">{sub}</p></div></Record>
        ))}
      </div>
    </Dialog>
  );
}
function CloseAfter({ onClick, children }) {
  const close = useCloseModal();
  return <Button variant="primary" onClick={() => { onClick(); close(); }}>{children}</Button>;
}

function ShortcutsDialog() {
  const t = useT();
  // Grouped by purpose so the list is easy to scan (and fits short-term memory).
  const groups = [
    ["shortcuts.g.find", [[["Ctrl", "K"], "shortcuts.palette"], [["/"], "shortcuts.search"], [["?"], "shortcuts.help"]]],
    ["shortcuts.g.create", [[["Alt", "M"], "shortcuts.memory"], [["Alt", "P"], "shortcuts.person"], [["Alt", "R"], "shortcuts.record"], [["Alt", "I"], "shortcuts.invite"]]],
    ["shortcuts.g.fix", [[["Ctrl", "Z"], "shortcuts.undo"], [["Ctrl", "Y"], "shortcuts.redo"], [["Alt", "←"], "shortcuts.back"], [["Esc"], "shortcuts.esc"]]],
    ["shortcuts.g.view", [[["Shift", "T"], "shortcuts.theme"], [["Alt", "A"], "shortcuts.read"], [["Alt", "L"], "shortcuts.list"]]],
  ];
  return (
    <Dialog wide title={t("shortcuts.title")}>
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map(([g, rows]) => (
          <section key={g}>
            <h3 className="mb-2 text-small!">{t(g)}</h3>
            <dl className="m-0 grid gap-2">
              {rows.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-sec-soft px-3 py-2.5">
                  <dt className="text-small">{t(label)}</dt>
                  <dd className="m-0 flex gap-1">{keys.map((k) => <kbd key={k} className="rounded-md border border-line bg-surface px-2 py-0.5 text-xsmall font-semibold shadow-card">{k}</kbd>)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

/** Every change made in this session, newest first, with a way back to any earlier point. */
function HistoryDialog() {
  const { past, future, undo, redo } = useStore();
  const t = useT();
  const toast = useToast();
  const close = useCloseModal();
  const time = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const back = (n, label) => {
    undo(n);
    toast(t("undo.done", { label }), { icon: "undo", action: t("undo.redo"), onAction: () => { for (let k = 0; k < n; k++) redo(); } });
    close();
  };
  return (
    <Dialog title={t("history.title")} sub={t("history.sub")}>
      {!past.length && !future.length && <Empty icon="history" title={t("history.empty")}><p className="text-small">{t("history.emptyHelp")}</p></Empty>}
      {future.length > 0 && (
        <div className="grid gap-1.5">
          <h3 className="text-small! text-muted">{t("history.undone")}</h3>
          {future.map((h, k) => (
            <Record key={h.at + "f" + k} icon="redo" className="opacity-75">
              <div className="min-w-0 flex-1"><s>{h.label}</s><small className="block text-xsmall text-muted">{time(h.at)}</small></div>
              {k === 0 && <Button size="sm" icon="redo" onClick={() => { redo(); close(); }}>{t("undo.redo")}</Button>}
            </Record>
          ))}
        </div>
      )}
      {past.length > 0 && (
        <ol className="m-0 grid list-none gap-1.5 p-0">
          {[...past].reverse().map((h, k) => (
            <li key={h.at + "p" + k}>
              <Record icon={k === 0 ? "edit" : "history"}>
                <div className="min-w-0 flex-1"><strong className="font-medium">{h.label}</strong><small className="block text-xsmall text-muted">{time(h.at)}</small></div>
                <Button size="sm" variant={k === 0 ? "primary" : "default"} icon="undo" onClick={() => back(k + 1, h.label)}>
                  {k === 0 ? t("undo.undo") : t("history.revert", { n: k + 1 })}
                </Button>
              </Record>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

/** Undo / redo with toast feedback, shared by the buttons, the keyboard and quick search. */
function useUndoActions() {
  const { past, future, undo, redo } = useStore();
  const toast = useToast();
  const t = useT();
  const undoStep = () => {
    const last = past[past.length - 1];
    if (!last) { toast(t("undo.nothing"), { icon: "info", duration: 2000 }); return; }
    undo();
    toast(t("undo.done", { label: last.label }), { icon: "undo", action: t("undo.redo"), onAction: redo });
  };
  const redoStep = () => {
    const next = future[0];
    if (!next) { toast(t("redo.nothing"), { icon: "info", duration: 2000 }); return; }
    redo();
    toast(t("redo.done", { label: next.label }), { icon: "redo", action: t("undo.undo"), onAction: () => undo() });
  };
  return { undoStep, redoStep };
}

/** Undo / redo buttons, greyed out when there is nothing to undo; the tooltip names the step. */
function UndoControls() {
  const { past, future } = useStore();
  const { undoStep, redoStep } = useUndoActions();
  const t = useT();
  const { open } = useModal();
  const last = past[past.length - 1]?.label;
  const next = future[0]?.label;
  const undoTip = last ? t("undo.tip", { label: last }) : t("undo.nothing");
  const redoTip = next ? t("redo.tip", { label: next }) : t("redo.nothing");
  return (
    <div data-tour="undo" role="group" aria-label={t("undo.group")} className="flex items-center rounded-[10px] border border-line bg-surface max-sm:hidden">
      <IconButton icon="undo" className="rounded-r-none border-0 disabled:cursor-not-allowed disabled:opacity-40" disabled={!last} onClick={undoStep}
        label={undoTip} title={last ? `${undoTip} (Ctrl+Z)` : undoTip} />
      <IconButton icon="redo" className="rounded-none border-0 disabled:cursor-not-allowed disabled:opacity-40" disabled={!next} onClick={redoStep}
        label={redoTip} title={next ? `${redoTip} (Ctrl+Y)` : redoTip} />
      <IconButton icon="history" className="rounded-l-none border-0" label={t("history.title")} title={t("history.title")} onClick={() => open(<HistoryDialog />)}>
        {past.length > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-gold" />}
      </IconButton>
    </div>
  );
}

/** Mic button inside the search box: say a name and it searches the Directory. */
function VoiceSearch({ onText }) {
  const t = useT();
  const toast = useToast();
  const { listening, error, start, stop, supported } = useVoiceInput(onText);
  useEffect(() => {
    if (error && error !== "aborted" && error !== "no-speech") toast(t("voice.error"), { error: true, sub: t("voice.errorHelp") });
  }, [error, toast, t]);
  if (!supported) return null;
  return (
    <button type="button" onClick={listening ? stop : start} aria-pressed={listening}
      aria-label={listening ? t("voice.stop") : t("voice.start")} title={listening ? t("voice.stop") : t("voice.start")}
      className={cx("grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border-0",
        listening ? "animate-rec-pulse bg-rec text-white" : "hover-fill bg-transparent text-muted")}>
      <Icon name={listening ? "graphic_eq" : "mic"} size="sm" />
      <span className="sr-only" aria-live="assertive">{listening ? t("voice.listening") : ""}</span>
    </button>
  );
}

/** Speaker button: reads the page (or the selected text) aloud. */
function ReadAloudButton({ speech }) {
  const t = useT();
  if (!canSpeak) return null;
  const label = speech.speaking ? t("read.stop") : t("read.page");
  return (
    <IconButton icon={speech.speaking ? "stop_circle" : "volume_up"} aria-pressed={speech.speaking}
      className={cx("max-sm:hidden", speech.speaking && "bg-mint-100!")} label={label} title={`${label} (Alt+A)`}
      onClick={() => speech.toggle(pageText())} />
  );
}

/* ---------- Connection status (observability) ---------- */
const subscribeOnline = (cb) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

/** Banner shown for as long as the device is offline, then a one-off "back online" confirmation. */
function OfflineBanner() {
  const online = useOnline();
  const t = useT();
  const toast = useToast();
  const was = useRef(online);
  useEffect(() => {
    if (!was.current && online) toast(t("net.back"), { icon: "wifi", sub: t("net.backSub") });
    was.current = online;
  }, [online, toast, t]);
  if (online) return null;
  return (
    <div role="alert" data-no-print className="flex flex-wrap items-center gap-2.5 border-b border-line bg-gold-100 px-4 py-2 text-small text-gold-ink sm:px-7">
      <Icon name="wifi_off" size="sm" /> <strong>{t("net.offline")}</strong> <span>{t("net.offlineSub")}</span>
    </div>
  );
}

/** Footer sync line: icon + words (never colour alone), live with the connection. */
function SyncStatus() {
  const online = useOnline();
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1">
      <Icon name={online ? "cloud_done" : "cloud_off"} size="xs" className={online ? "text-pine-700" : "text-gold-ink"} />
      {online ? t("footer.synced") : t("net.footer")}
    </span>
  );
}

/** "You are here": the current page (> item), with back / forward buttons. */
function Breadcrumbs({ route }) {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { person } = useStore();
  const label = t(`nav.${route}`);
  const p = params.get("person") && person(params.get("person"));
  const q = params.get("q");
  const leaf = p ? fullName(p) : q ? t("crumb.search", { q }) : null;
  const pageIcon = NAV.flatMap((g) => g.items).find(([id]) => id === route)?.[2];
  // Only the current page is shown (plus the open person / search, if any).
  const crumbs = [
    [leaf ? `/${route}` : null, label.startsWith("nav.") ? route : label],
    leaf && [null, leaf],
  ].filter(Boolean);
  return (
    <div data-no-print className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex gap-1">
        <IconButton icon="arrow_back" className="size-9!" label={t("crumb.back")} title={`${t("crumb.back")} (Alt+←)`} onClick={() => navigate(-1)} />
        <IconButton icon="arrow_forward" className="size-9!" label={t("crumb.forward")} title={`${t("crumb.forward")} (Alt+→)`} onClick={() => navigate(1)} />
      </div>
      <nav aria-label={t("crumb.label")} className="min-w-0">
        <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-small text-muted">
          {crumbs.map(([to, text, icon, hideOnPhone], k) => {
            const isLast = k === crumbs.length - 1;
            const page = k === 0 && pageIcon;
            return (
              <li key={k} className={cx("flex items-center gap-1", hideOnPhone && "max-sm:hidden")}>
                {k > 0 && <Icon name="chevron_right" size="xs" className="text-faint" />}
                {to && !isLast
                  ? <Link to={to} className={cx("inline-flex items-center gap-1.5 no-underline hover:underline", page
                    ? "hover-fill rounded-full border border-sec-line bg-sec-soft px-3 py-1 font-semibold text-sec-ink"
                    : "hover-fill rounded-md px-1 text-sec-ink")}>{(page || icon) && <Icon name={page || icon} size={page ? "sm" : "xs"} />}{text}</Link>
                  : <span aria-current={isLast ? "page" : undefined}
                    className={cx(page ? "inline-flex items-center gap-1.5 rounded-full border border-sec-line bg-sec-soft px-3 py-1 font-semibold text-sec-ink" : "px-1", isLast && !page && "font-semibold text-ink")}>
                    {page && <Icon name={page} size="sm" />}{text}
                  </span>}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

function Topbar({ menuOpen, onMenu, onPalette, onTour, speech }) {
  const { easy, person, prefs } = useStore();
  const t = useT();
  const toggleEasy = useToggleEasy();
  const { cycleTheme, setTheme, setLang } = usePrefActions();
  const toast = useToast();
  const { open } = useModal();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [unread, setUnread] = useState(3);
  const app = useInstall();
  const me = person(ME);
  const lang = LANGS.find((l) => l.code === prefs.lang) || LANGS[0];

  return (
    <header data-no-print className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur-md sm:gap-2.5 sm:px-7 sm:py-3">
      <IconButton icon="menu" label="Open navigation" aria-expanded={menuOpen} aria-controls="sidebar" onClick={onMenu} className="md:hidden" />
      <button type="button" onClick={() => toast("You belong to one family archive", { sub: "To join another family's archive, ask one of its admins for an invitation.", icon: "info" })}
        className="pressable hidden cursor-pointer items-center gap-4 rounded-xl border border-line bg-surface px-3 py-1.5 text-left text-ink hover-fill min-[1500px]:flex">
        <span>
          <small className="block text-[.6rem] font-semibold tracking-[.12em] text-muted uppercase">{t("top.activeArchive")}</small>
          <strong className="text-[.92rem] font-semibold">The Mackenzie Family</strong>
        </span>
        <Icon name="expand_more" size="sm" />
      </button>
      <form role="search" data-tour="search" onSubmit={(e) => { e.preventDefault(); navigate(`/directory${q.trim() ? "?q=" + encodeURIComponent(q.trim()) : ""}`); }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted transition-[border-color,box-shadow] hover:border-sec-line focus-within:border-sec focus-within:text-sec-ink focus-within:shadow-[0_0_0_4px_var(--sec-line)] sm:max-w-90">
        <Icon name="search" size="sm" />
        <label className="sr-only" htmlFor="globalSearchInput">{t("top.search")}</label>
        <input id="globalSearchInput" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
          placeholder={t("top.search")} className="w-full min-w-0 border-0 bg-transparent py-2.5 text-ink outline-0" />
        <VoiceSearch onText={(said) => {
          setQ(said);
          toast(t("voice.heard", { q: said }), { icon: "mic", duration: 3000 });
          navigate(`/directory?q=${encodeURIComponent(said)}`);
        }} />
        <button type="button" onClick={onPalette} title={t("top.palette")}
          className="hidden shrink-0 cursor-pointer items-center gap-0.5 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-xsmall font-semibold text-muted hover-fill sm:inline-flex">
          Ctrl K
        </button>
      </form>
      <UndoControls />
      <button type="button" data-tour="easy" aria-pressed={easy} title={t("top.easyTitle")} onClick={toggleEasy}
        className={cx("pressable inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-small font-medium easy:min-h-12",
          easy ? "border-transparent bg-[linear-gradient(135deg,var(--sec),var(--sec-ink))] text-sec-on shadow-[0_4px_12px_-6px_var(--sec)] hover:ring-4 hover:ring-sec-line"
            : "hover-fill border-sec-line bg-sec-soft text-sec-ink")}>
        <span className="font-bold">Aa</span> <span className="hidden xl:inline">{t("top.easy")}</span>
      </button>

      <Menu label={t("top.language")} className="max-sm:hidden" trigger={(p) => (
        <button type="button" {...p} aria-label={`${t("top.language")}: ${lang.name}`}
          className="pressable inline-flex h-11 cursor-pointer items-center gap-1 rounded-xl border border-line bg-surface px-2.5 text-[.8rem] font-semibold text-sec-ink hover-fill">
          <Icon name="translate" size="sm" />{lang.short}
        </button>
      )}>
        <MenuLabel>{t("top.language")}</MenuLabel>
        {LANGS.map((l) => <MenuItem key={l.code} checked={prefs.lang === l.code} onClick={() => setLang(l.code)} hint={l.short}>{l.name}</MenuItem>)}
      </Menu>

      <ReadAloudButton speech={speech} />

      <IconButton icon={THEME_ICON[prefs.theme]} label={t("theme.switch", { mode: t(`theme.${prefs.theme}`) })} title={t("theme.switch", { mode: t(`theme.${prefs.theme}`) })}
        onClick={cycleTheme} />

      <IconButton icon="notifications" label={unread ? `${t("top.notifications")}, ${unread}` : t("top.notifications")} className="max-sm:hidden"
        onClick={() => open(<NotificationsDialog onRead={() => setUnread(0)} />)}>
        {unread > 0 && (
          <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose text-[.62rem] font-bold text-white">{unread}</span>
        )}
      </IconButton>

      <Menu label={t("menu.account")} className="ml-auto" trigger={(p) => (
        <button type="button" {...p} aria-label={t("menu.account")}
          className="flex cursor-pointer items-center gap-2.5 rounded-xl border-0 bg-transparent p-0.5 pr-1.5 text-left text-ink hover-fill">
          <Avatar p={me} />
          <span className="hidden md:block">
            <strong className="block text-[.9rem] font-semibold">{me.first} {me.last}</strong>
            <small className="text-xsmall text-sec-ink">{me.role}</small>
          </span>
          <Icon name="expand_more" size="sm" className="hidden text-muted md:inline-block" />
        </button>
      )}>
        <MenuItem icon="badge" onClick={() => navigate(`/tree?person=${ME}`)}>{t("menu.profile")}</MenuItem>
        <MenuItem icon="tune" onClick={() => navigate("/settings")}>{t("menu.settings")}</MenuItem>
        <MenuItem icon="keyboard" hint="?" onClick={() => open(<ShortcutsDialog />)}>{t("menu.shortcuts")}</MenuItem>
        <MenuItem icon="history" onClick={() => open(<HistoryDialog />)}>{t("history.title")}</MenuItem>
        <MenuItem icon="tour" onClick={onTour}>{t("tour.restart")}</MenuItem>
        {app.status === "available" && (
          <MenuItem icon="install_desktop" onClick={async () => { if (await app.install()) toast("FamilyRoots installed", { sub: "Open it from your home screen or apps list.", icon: "install_desktop" }); }}>
            Install FamilyRoots app
          </MenuItem>
        )}
        <MenuDivider />
        <MenuLabel>{t("theme.label")}</MenuLabel>
        {["light", "dark", "system"].map((m) => <MenuItem key={m} icon={THEME_ICON[m]} checked={prefs.theme === m} onClick={() => setTheme(m)}>{t(`theme.${m}`)}</MenuItem>)}
        <div className="sm:hidden">
          <MenuLabel>{t("top.language")}</MenuLabel>
          {LANGS.map((l) => <MenuItem key={l.code} checked={prefs.lang === l.code} onClick={() => setLang(l.code)}>{l.name}</MenuItem>)}
        </div>
        <MenuDivider />
        <MenuItem icon="home" onClick={() => navigate("/")}>{t("menu.landing")}</MenuItem>
        <MenuItem icon="logout" onClick={() => { toast("You've signed out", { sub: "Your archive stays saved on this device.", icon: "logout" }); navigate("/auth"); }}>{t("menu.signout")}</MenuItem>
      </Menu>
    </header>
  );
}

/** Thin reading-progress bar plus a back-to-top button that appears after scrolling. */
function ScrollHelpers() {
  const t = useT();
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? window.scrollY / max : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);
  return (
    <>
      <div aria-hidden="true" data-no-print className="fixed top-0 left-0 z-95 h-1 bg-sec transition-[width] duration-75" style={{ width: `${progress * 100}%` }} />
      <button type="button" data-no-print onClick={() => window.scrollTo({ top: 0 })} aria-label={t("common.backToTop")} title={t("common.backToTop")}
        className={cx("fixed right-5 bottom-24 z-40 grid size-12 cursor-pointer place-items-center rounded-full border border-sec-line bg-surface text-sec-ink shadow-pop transition hover:-translate-y-0.5 hover:bg-sec hover:text-sec-on",
          progress > 0.15 ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0")}>
        <Icon name="arrow_upward" />
      </button>
    </>
  );
}

/** Floating "+" speed dial with the most common actions. */
function QuickActions() {
  const t = useT();
  const { open } = useModal();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e) => { if (!ref.current.contains(e.target)) setExpanded(false); };
    const onKey = (e) => e.key === "Escape" && setExpanded(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [expanded]);
  // Tucked away while scrolling down so it never covers what you are reading (e.g. switches at the right edge);
  // back as soon as you scroll up, reach the end of the page, or tab to it.
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 120;
      if (atEnd || y < 200 || y < last - 4) setTucked(false);
      else if (y > last + 4) setTucked(true);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const hidden = tucked && !expanded;
  const items = [
    ["add_photo_alternate", "fab.memory", () => open(<AddMemoryDialog />), "memories"],
    ["mic", "fab.story", () => navigate("/stories?record=1"), "stories"],
    ["person_add", "fab.invite", () => open(<InviteDialog />), "directory"],
    ["group_add", "fab.person", () => open(<AddPersonDialog />), "tree"],
  ];
  return (
    <div ref={ref} data-no-print
      className={cx("fixed right-5 bottom-5 z-40 flex flex-col items-end gap-2.5 transition-[transform,opacity] duration-300",
        hidden && "pointer-events-none translate-y-[calc(100%+2rem)] opacity-0 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100")}>
      {expanded && (
        <ul id="quickActions" className="m-0 grid list-none justify-items-end gap-2 p-0">
          {items.map(([icon, label, run, sec], i) => (
            <li key={label} data-sec={sec} className="animate-pop" style={{ animationDelay: `${(items.length - i) * 30}ms` }}>
              <button type="button" onClick={() => { setExpanded(false); run(); }}
                className="group pressable hover-fill flex min-h-12 cursor-pointer items-center gap-2.5 rounded-full border border-sec-line bg-surface py-1.5 pr-1.5 pl-4 text-[.9rem] font-semibold text-ink shadow-pop hover:-translate-x-1">
                {t(label)}
                <span className="grid size-9 place-items-center rounded-full bg-[linear-gradient(135deg,var(--sec),var(--sec-ink))] text-sec-on group-hover:bg-none group-hover:bg-sec-on/25"><Icon name={icon} size="sm" /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" data-tour="fab" aria-expanded={expanded} aria-controls="quickActions" aria-label={t("fab.label")} title={t("fab.label")}
        onClick={() => setExpanded((x) => !x)}
        className={cx("grid size-15 cursor-pointer place-items-center rounded-full border-0 text-white shadow-[0_10px_28px_-8px_rgb(124_58_237/.55)]",
          "bg-[linear-gradient(135deg,#2e7d32,#0b6e99_35%,#7c3aed_70%,#c2410c)] bg-size-[200%_200%] bg-left transition-[background-position,transform,box-shadow] duration-500",
          "hover:scale-105 hover:bg-right hover:ring-4 hover:ring-[#7c3aed]/35 active:scale-95 active:ring-[#7c3aed]/60", expanded && "bg-right ring-4 ring-[#7c3aed]/35")}>
        <Icon name="add" className={cx("text-[30px]! transition-transform", expanded && "rotate-45")} />
      </button>
    </div>
  );
}

export default function Layout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const { prefs, setPref, addRecent } = useStore();
  // The tour opens on a first visit, or when restarted from the menu, quick search or Settings.
  const [tourAsked, setTour] = useState(false);
  const tour = tourAsked || !prefs.tourDone;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { undoStep, redoStep } = useUndoActions();
  const speech = useSpeech();
  const mainRef = useRef(null);
  const t = useT();
  const { open } = useModal();
  const toggleEasy = useToggleEasy();
  const { cycleTheme } = usePrefActions();
  const route = pathname.replace(/^\//, "") || "overview";
  const endTour = () => { setTour(false); setPref("tourDone", true); };

  // On navigation: scroll to top, move focus to main content, remember the page for "Recent". (Nav links close the menu.)
  useEffect(() => {
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
    const item = NAV.flatMap((g) => g.items).find(([id]) => id === route);
    if (item) addRecent({ id: "p-" + route, page: route, icon: item[2], to: `/${route}` });
  }, [route, addRecent]);
  useEffect(() => {
    const label = t(`nav.${route}`);
    document.title = `${label.startsWith("nav.") ? "FamilyRoots" : label} – FamilyRoots`;
  }, [route, t]);

  // Global keyboard shortcuts. Handlers are read through a ref so the listener always sees the latest state.
  const keys = useRef({});
  useEffect(() => {
    keys.current = {
      cycle: cycleTheme, undo: undoStep, redo: redoStep, read: () => speech.toggle(pageText()),
      m: () => open(<AddMemoryDialog />), p: () => open(<AddPersonDialog />), i: () => open(<InviteDialog />), r: () => navigate("/stories?record=1"),
    };
  });
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (e.key === "Escape") setMenuOpen(false);
      if ((e.ctrlKey || e.metaKey) && k === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      // Not while typing (Ctrl+Z belongs to the text field) or while a dialog is open over the page.
      const inDialog = !!document.querySelector("[role=dialog]");
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !isTyping(e.target) && !inDialog) {
        if (k === "z" && !e.shiftKey) { e.preventDefault(); keys.current.undo(); return; }
        if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); keys.current.redo(); return; }
      }
      // Alt + letter accelerators. e.code keeps them working on any layout, even where Alt changes the character.
      if (e.altKey && !e.ctrlKey && !e.metaKey && !inDialog) {
        const letter = e.code?.startsWith("Key") ? e.code.slice(3).toLowerCase() : k;
        const fn = { m: "m", p: "p", i: "i", r: "r", a: "read" }[letter];
        if (fn) { e.preventDefault(); keys.current[fn](); return; }
      }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); document.getElementById("globalSearchInput")?.focus(); }
      else if (e.key === "?") { e.preventDefault(); open(<ShortcutsDialog />); }
      else if (e.key === "T" && e.shiftKey) { e.preventDefault(); keys.current.cycle(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const actions = [
    { key: "theme", label: t("action.theme"), icon: "dark_mode", run: cycleTheme },
    { key: "easy", label: t("action.easy"), icon: "text_increase", run: toggleEasy },
    { key: "memory", label: t("fab.memory"), icon: "add_photo_alternate", run: () => open(<AddMemoryDialog />) },
    { key: "invite", label: t("fab.invite"), icon: "person_add", run: () => open(<InviteDialog />) },
    { key: "person", label: t("fab.person"), icon: "group_add", run: () => open(<AddPersonDialog />) },
    { key: "record", label: t("fab.story"), icon: "mic", run: () => navigate("/stories?record=1") },
    { key: "undo", label: t("undo.undo"), icon: "undo", run: undoStep },
    { key: "redo", label: t("undo.redo"), icon: "redo", run: redoStep },
    { key: "history", label: t("history.title"), icon: "history", run: () => open(<HistoryDialog />) },
    ...(canSpeak ? [{ key: "read", label: t("read.page"), icon: "volume_up", run: () => speech.toggle(pageText()) }] : []),
    { key: "print", label: t("action.print"), icon: "print", run: () => window.print() },
    { key: "tour", label: t("tour.restart"), icon: "tour", run: () => { navigate("/overview"); setTour(true); } },
    { key: "shortcuts", label: t("action.shortcuts"), icon: "keyboard", run: () => open(<ShortcutsDialog />) },
  ];

  return (
    <>
      <a href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}
        className="absolute top-2 -left-249.75 z-100 rounded-lg bg-pine-900 px-3.5 py-2 text-white focus:left-2">
        Skip to main content
      </a>
      {/* data-sec gives the whole page its section colour (header, buttons, chips, progress bar). */}
      <div data-sec={route} className="contents">
      <ScrollHelpers />
      <div className="flex min-h-screen">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar menuOpen={menuOpen} onMenu={() => setMenuOpen(true)} onPalette={() => setPalette(true)} speech={speech}
            onTour={() => { navigate("/overview"); setTour(true); }} />
          <OfflineBanner />
          <main id="main" ref={mainRef} tabIndex={-1} className="w-full max-w-350 min-w-0 flex-1 p-4 pb-24 outline-none sm:px-7 sm:pt-5">
            <Breadcrumbs route={route} />
            {children}
          </main>
          <footer data-no-print className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-3.5 pr-24 text-[.76rem] text-muted sm:px-7 sm:pr-24">
            <span><Icon name="verified_user" size="sm" className="text-pine-700" /> {t("footer.privacy")} • {t("footer.gens")} • <SyncStatus /></span>
            <span className="flex gap-5.5">
              <Link to="/privacy" className="font-medium text-ink no-underline hover:text-sec-ink hover:underline">{t("footer.guidelines")}</Link>
              <Link to="/privacy" className="font-medium text-ink no-underline hover:text-sec-ink hover:underline">{t("footer.support")}</Link>
            </span>
          </footer>
        </div>
      </div>
      {/* Not on Messages, where it would cover the Send button. Its actions stay in Ctrl+K and the Alt shortcuts. */}
      {route !== "messages" && <QuickActions />}
      {palette && <CommandPalette onClose={() => setPalette(false)} actions={actions} />}
      {/* The tour runs on Overview, where every control it points at is on screen. */}
      {tour && route === "overview" && <Tour onClose={endTour} />}
      </div>
    </>
  );
}
