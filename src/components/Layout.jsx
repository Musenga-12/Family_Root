/* App shell: sidebar navigation, top bar, footer, theme / language / Easy-to-Read switches, quick search, quick actions. */
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ME } from "../data";
import AddMemoryDialog from "../dialogs/AddMemoryDialog";
import AddPersonDialog from "../dialogs/AddPersonDialog";
import InviteDialog from "../dialogs/InviteDialog";
import { cx } from "../lib/format";
import { LANGS, useT } from "../lib/i18n";
import { NAV } from "../lib/nav";
import { useStore } from "../lib/store";
import { THEME_ICON, usePrefActions } from "../lib/usePrefActions";
import { useToggleEasy } from "../lib/useToggleEasy";
import CommandPalette from "./CommandPalette";
import { Menu, MenuDivider, MenuItem, MenuLabel } from "./Menu";
import { Dialog } from "./Modal";
import { useCloseModal, useModal } from "./modalContext";
import { useToast } from "./toastContext";
import { Avatar, Button, Icon, IconButton, Record } from "./ui";

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function Sidebar({ open, onClose }) {
  const { prefs, setPref } = useStore();
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
        <nav>
          {NAV.map((g) => (
            <div key={g.group}>
              <div className={cx("px-2.5 pt-3 pb-1.5 text-[.66rem] font-semibold tracking-[.14em] text-muted uppercase", compact && "md:sr-only")}>
                {t(g.key)}
              </div>
              <ul className="m-0 grid list-none gap-0.5 p-0">
                {g.items.map(([id, , icon]) => (
                  <li key={id}>
                    <NavLink to={`/${id}`} onClick={onClose} title={compact ? t(`nav.${id}`) : undefined}
                      className={({ isActive }) => cx(
                        "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[.9rem] no-underline",
                        compact && "md:justify-center md:px-0",
                        isActive ? "bg-pine-900 text-white" : "text-ink hover:bg-surface-3",
                      )}>
                      {({ isActive }) => <>
                        <Icon name={icon} className={cx("text-[20px]!", isActive ? "text-mint" : "text-pine-700")} />
                        <span className={cx(compact && "md:sr-only")}>{t(`nav.${id}`)}</span>
                      </>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-auto grid gap-2">
          <div className={cx("flex items-center gap-1.5 rounded-[10px] bg-surface-3 px-3 py-2.5 text-[.78rem] font-semibold text-pine-800", compact && "md:justify-center md:px-0")}>
            <Icon name="lock" size="sm" /> <span className={cx(compact && "md:sr-only")}>{t("side.protected")}</span>
          </div>
          <button type="button" onClick={() => setPref("sidebar", compact ? "full" : "compact")}
            className="hidden cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-[.78rem] text-muted hover:text-ink md:flex">
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
  const rows = [
    [["Ctrl", "K"], "shortcuts.palette"], [["/"], "shortcuts.search"], [["Shift", "T"], "shortcuts.theme"],
    [["?"], "shortcuts.help"], [["Alt", "L"], "shortcuts.list"], [["Esc"], "shortcuts.esc"],
  ];
  return (
    <Dialog title={t("shortcuts.title")}>
      <dl className="m-0 grid gap-2">
        {rows.map(([keys, label]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-small">{t(label)}</dt>
            <dd className="m-0 flex gap-1">{keys.map((k) => <kbd key={k} className="rounded-md border border-line bg-surface px-2 py-0.5 text-xsmall font-semibold shadow-card">{k}</kbd>)}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

function Topbar({ menuOpen, onMenu, onPalette }) {
  const { easy, person, prefs } = useStore();
  const t = useT();
  const toggleEasy = useToggleEasy();
  const { cycleTheme, setTheme, setLang } = usePrefActions();
  const toast = useToast();
  const { open } = useModal();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [unread, setUnread] = useState(3);
  const me = person(ME);
  const lang = LANGS.find((l) => l.code === prefs.lang) || LANGS[0];

  return (
    <header data-no-print className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur-md sm:gap-2.5 sm:px-7 sm:py-3">
      <IconButton icon="menu" label="Open navigation" aria-expanded={menuOpen} aria-controls="sidebar" onClick={onMenu} className="md:hidden" />
      <button type="button" onClick={() => toast("Only one archive in this demo", { sub: "The Mackenzie Family", icon: "info" })}
        className="hidden cursor-pointer items-center gap-4 rounded-xl border border-line bg-surface px-3 py-1.5 text-left text-ink lg:flex">
        <span>
          <small className="block text-[.6rem] font-semibold tracking-[.12em] text-muted uppercase">{t("top.activeArchive")}</small>
          <strong className="text-[.92rem] font-semibold">The Mackenzie Family</strong>
        </span>
        <Icon name="expand_more" size="sm" />
      </button>
      <form role="search" onSubmit={(e) => { e.preventDefault(); navigate(`/directory${q.trim() ? "?q=" + encodeURIComponent(q.trim()) : ""}`); }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted focus-within:outline-3 focus-within:outline-offset-1 focus-within:outline-focus sm:max-w-90">
        <Icon name="search" size="sm" />
        <label className="sr-only" htmlFor="globalSearchInput">{t("top.search")}</label>
        <input id="globalSearchInput" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
          placeholder={t("top.search")} className="w-full min-w-0 border-0 bg-transparent py-2.5 text-ink outline-0" />
        <button type="button" onClick={onPalette} title={t("top.palette")}
          className="hidden shrink-0 cursor-pointer items-center gap-0.5 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-xsmall font-semibold text-muted sm:inline-flex">
          Ctrl K
        </button>
      </form>
      <button type="button" aria-pressed={easy} title={t("top.easyTitle")} onClick={toggleEasy}
        className={cx("inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border px-3 py-2 text-small font-medium easy:min-h-12",
          easy ? "border-pine-900 bg-pine-900 text-white" : "border-line bg-surface-3 text-pine-800")}>
        <span className="font-bold">Aa</span> <span className="hidden xl:inline">{t("top.easy")}</span>
      </button>

      <Menu label={t("top.language")} className="max-sm:hidden" trigger={(p) => (
        <button type="button" {...p} aria-label={`${t("top.language")}: ${lang.name}`}
          className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-[10px] border border-line bg-surface px-2.5 text-[.8rem] font-semibold text-pine-800">
          <Icon name="translate" size="sm" />{lang.short}
        </button>
      )}>
        <MenuLabel>{t("top.language")}</MenuLabel>
        {LANGS.map((l) => <MenuItem key={l.code} checked={prefs.lang === l.code} onClick={() => setLang(l.code)} hint={l.short}>{l.name}</MenuItem>)}
      </Menu>

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
          className="flex cursor-pointer items-center gap-2.5 rounded-xl border-0 bg-transparent p-0.5 text-left text-ink">
          <Avatar p={me} />
          <span className="hidden md:block">
            <strong className="block text-[.9rem] font-semibold">{me.first} {me.last}</strong>
            <small className="text-xsmall text-pine-700">{me.role}</small>
          </span>
          <Icon name="expand_more" size="sm" className="hidden text-muted md:inline-block" />
        </button>
      )}>
        <MenuItem icon="badge" onClick={() => navigate(`/tree?person=${ME}`)}>{t("menu.profile")}</MenuItem>
        <MenuItem icon="tune" onClick={() => navigate("/settings")}>{t("menu.settings")}</MenuItem>
        <MenuItem icon="keyboard" hint="?" onClick={() => open(<ShortcutsDialog />)}>{t("menu.shortcuts")}</MenuItem>
        <MenuDivider />
        <MenuLabel>{t("theme.label")}</MenuLabel>
        {["light", "dark", "system"].map((m) => <MenuItem key={m} icon={THEME_ICON[m]} checked={prefs.theme === m} onClick={() => setTheme(m)}>{t(`theme.${m}`)}</MenuItem>)}
        <div className="sm:hidden">
          <MenuLabel>{t("top.language")}</MenuLabel>
          {LANGS.map((l) => <MenuItem key={l.code} checked={prefs.lang === l.code} onClick={() => setLang(l.code)}>{l.name}</MenuItem>)}
        </div>
        <MenuDivider />
        <MenuItem icon="home" onClick={() => navigate("/")}>{t("menu.landing")}</MenuItem>
        <MenuItem icon="logout" onClick={() => { toast("Signed out of the demo", { icon: "logout" }); navigate("/auth"); }}>{t("menu.signout")}</MenuItem>
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
      <div aria-hidden="true" data-no-print className="fixed top-0 left-0 z-95 h-0.75 bg-pine-700 transition-[width] duration-75 dark:bg-mint" style={{ width: `${progress * 100}%` }} />
      <button type="button" data-no-print onClick={() => window.scrollTo({ top: 0 })} aria-label={t("common.backToTop")} title={t("common.backToTop")}
        className={cx("fixed right-5 bottom-23 z-40 grid size-11 cursor-pointer place-items-center rounded-full border border-line bg-surface text-pine-800 shadow-pop transition",
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
  const items = [
    ["add_photo_alternate", "fab.memory", () => open(<AddMemoryDialog />)],
    ["mic", "fab.story", () => navigate("/stories?record=1")],
    ["person_add", "fab.invite", () => open(<InviteDialog />)],
    ["group_add", "fab.person", () => open(<AddPersonDialog />)],
  ];
  return (
    <div ref={ref} data-no-print className="fixed right-5 bottom-5 z-40 flex flex-col items-end gap-2.5">
      {expanded && (
        <ul id="quickActions" className="m-0 grid list-none justify-items-end gap-2 p-0">
          {items.map(([icon, label, run], i) => (
            <li key={label} className="animate-pop" style={{ animationDelay: `${(items.length - i) * 30}ms` }}>
              <button type="button" onClick={() => { setExpanded(false); run(); }}
                className="flex cursor-pointer items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pr-1.5 pl-4 text-[.86rem] font-semibold text-ink shadow-pop hover:bg-surface-2">
                {t(label)}
                <span className="grid size-9 place-items-center rounded-full bg-mint text-pine-900"><Icon name={icon} size="sm" /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" aria-expanded={expanded} aria-controls="quickActions" aria-label={t("fab.label")} title={t("fab.label")}
        onClick={() => setExpanded((x) => !x)}
        className="grid size-14 cursor-pointer place-items-center rounded-full border-0 bg-pine-900 text-mint shadow-pop hover:bg-pine-800">
        <Icon name="add" className={cx("text-[30px]! transition-transform", expanded && "rotate-45")} />
      </button>
    </div>
  );
}

export default function Layout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  const t = useT();
  const { open } = useModal();
  const toggleEasy = useToggleEasy();
  const { cycleTheme } = usePrefActions();
  const route = pathname.replace(/^\//, "") || "overview";

  // On navigation: scroll to top, move focus to main content, update the title. (Nav links close the menu.)
  useEffect(() => {
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);
  useEffect(() => {
    const label = t(`nav.${route}`);
    document.title = `${label.startsWith("nav.") ? "FamilyRoots" : label} – FamilyRoots`;
  }, [route, t]);

  // Global keyboard shortcuts. Single keys are ignored while typing in a field.
  const cycleRef = useRef(cycleTheme);
  useEffect(() => { cycleRef.current = cycleTheme; });
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); document.getElementById("globalSearchInput")?.focus(); }
      else if (e.key === "?") { e.preventDefault(); open(<ShortcutsDialog />); }
      else if (e.key === "T" && e.shiftKey) { e.preventDefault(); cycleRef.current(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const actions = [
    { key: "theme", label: t("action.theme"), icon: "dark_mode", run: cycleTheme },
    { key: "easy", label: t("action.easy"), icon: "text_increase", run: toggleEasy },
    { key: "memory", label: t("fab.memory"), icon: "add_photo_alternate", run: () => open(<AddMemoryDialog />) },
    { key: "invite", label: t("fab.invite"), icon: "person_add", run: () => open(<InviteDialog />) },
    { key: "shortcuts", label: t("action.shortcuts"), icon: "keyboard", run: () => open(<ShortcutsDialog />) },
  ];

  return (
    <>
      <a href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}
        className="absolute top-2 -left-249.75 z-100 rounded-lg bg-pine-900 px-3.5 py-2 text-white focus:left-2">
        Skip to main content
      </a>
      <ScrollHelpers />
      <div className="flex min-h-screen">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar menuOpen={menuOpen} onMenu={() => setMenuOpen(true)} onPalette={() => setPalette(true)} />
          <main id="main" ref={mainRef} tabIndex={-1} className="w-full max-w-350 min-w-0 flex-1 p-4 pb-24 outline-none sm:px-7 sm:pt-6">
            {children}
          </main>
          <footer data-no-print className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-3.5 pr-24 text-[.76rem] text-muted sm:px-7 sm:pr-24">
            <span><Icon name="verified_user" size="sm" className="text-pine-700" /> {t("footer.privacy")} • {t("footer.gens")} • {t("footer.synced")}</span>
            <span className="flex gap-5.5">
              <Link to="/privacy" className="text-ink no-underline hover:underline">{t("footer.guidelines")}</Link>
              <Link to="/privacy" className="text-ink no-underline hover:underline">{t("footer.support")}</Link>
            </span>
          </footer>
        </div>
      </div>
      <QuickActions />
      {palette && <CommandPalette onClose={() => setPalette(false)} actions={actions} />}
    </>
  );
}
