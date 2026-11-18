/* Header for the public pages (welcome page, About, Features…, and Log in / Create account): brand, the site's pages,
   language and theme switches, and the way in. It follows the sign-in state: visitors see Log in and Get started,
   signed-in members see Go to dashboard and their account menu. Signed-in screens use the app shell in Layout.jsx instead. */
import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { cx } from "../lib/format";
import { LANGS, useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { SITE_PAGES } from "../lib/site";
import { useStore } from "../lib/store";
import { THEME_ICON, usePrefActions } from "../lib/usePrefActions";
import { Menu, MenuDivider, MenuItem, MenuLabel } from "./Menu";
import { useToast } from "./toastContext";
import { Button, Icon, IconButton } from "./ui";

const linkCls = ({ isActive }) => cx("rounded-lg px-3 py-2 text-[.88rem] no-underline hover-fill",
  isActive ? "bg-sec-soft font-semibold text-sec-ink" : "text-muted");

export function Brand({ className }) {
  const t = useT();
  return (
    <Link to="/" aria-label={t("shell.home")} className={cx("flex items-center gap-2.5 rounded-xl text-ink no-underline", className)}>
      <span className="grid size-8.5 place-items-center rounded-full bg-pine-900 text-mint"><Icon name="park" /></span>
      <strong className="font-serif text-[1.15rem]">FamilyRoots</strong>
    </Link>
  );
}

const initialsOf = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

/** Signed-in member: name, family and the places they'll want from a public page. */
function AccountMenu() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { me, signOut } = useSession();
  return (
    <Menu label={t("pub.account")} trigger={(p) => (
      <button type="button" {...p} aria-label={`${t("pub.account")}: ${me.name}`}
        className="flex cursor-pointer items-center gap-2 rounded-xl border-0 bg-transparent p-0.5 pr-1.5 text-left text-ink hover-fill">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-pine-800 text-[.85rem] font-bold text-white">{initialsOf(me.name)}</span>
        <Icon name="expand_more" size="sm" className="text-muted max-sm:hidden" />
      </button>
    )}>
      <div className="px-2.5 pt-1.5 pb-2">
        <strong className="block text-[.9rem]">{me.name}</strong>
        <small className="text-xsmall text-muted">{me.family_name} · {me.role}</small>
      </div>
      <MenuDivider />
      {!me.onboarding_done && <MenuItem icon="checklist" onClick={() => navigate("/welcome")}>{t("pub.continueSetup")}</MenuItem>}
      <MenuItem icon="dashboard" onClick={() => navigate("/overview")}>{t("pub.dashboard")}</MenuItem>
      <MenuItem icon="tune" onClick={() => navigate("/settings")}>{t("pub.settings")}</MenuItem>
      <MenuItem icon="verified_user" onClick={() => navigate("/privacy")}>{t("nav.privacy")}</MenuItem>
      <MenuDivider />
      <MenuItem icon="logout" onClick={() => { signOut(); toast(t("pub.signedOut"), { icon: "logout" }); navigate("/"); }}>{t("pub.signout")}</MenuItem>
    </Menu>
  );
}

/** The buttons on the right: what to do next depends on whether you're signed in. */
function Actions({ stacked }) {
  const t = useT();
  const { status } = useSession();
  const { pathname } = useLocation();
  const cls = stacked ? "w-full" : "max-sm:hidden";
  if (status === "signedIn") return <Button variant="primary" icon="dashboard" className={cls} to="/overview">{t("pub.dashboard")}</Button>;
  if (status === "demo") {
    return (
      <>
        {pathname !== "/login" && <Button className={cls} to="/login">{t("pub.login")}</Button>}
        <Button variant="primary" className={cls} to="/overview">{t("pub.openDemo")}</Button>
      </>
    );
  }
  return (
    <>
      {pathname !== "/login" && <Button className={cls} to="/login">{t("pub.login")}</Button>}
      {pathname !== "/register" && <Button variant="primary" className={cls} to="/register">{t("pub.getStarted")}</Button>}
    </>
  );
}

/** `minimal` hides the site's page links (used by the welcome steps, which are about the member, not the site). */
export default function SiteHeader({ minimal }) {
  const t = useT();
  const { prefs, dark } = useStore();
  const { status } = useSession();
  const { cycleTheme, setLang } = usePrefActions();
  const [open, setOpen] = useState(false);
  const lang = LANGS.find((l) => l.code === prefs.lang) || LANGS[0];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-300 items-center gap-3 px-4 py-3 sm:px-7">
        <Brand />
        {!minimal && (
          <nav aria-label={t("pub.nav.main")} className="ml-4 hidden gap-0.5 md:flex">
            {SITE_PAGES.map(([to, key]) => <NavLink key={to} to={to} end className={linkCls}>{t(key)}</NavLink>)}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Menu label={t("top.language")} trigger={(p) => (
            <button type="button" {...p} aria-label={`${t("top.language")}: ${lang.name}`}
              className="pressable inline-flex h-11 cursor-pointer items-center gap-1 rounded-xl border border-sec-line bg-surface px-2.5 text-[.8rem] font-semibold text-sec-ink hover-fill">
              <Icon name="translate" size="sm" />{lang.short}
            </button>
          )}>
            <MenuLabel>{t("top.language")}</MenuLabel>
            {LANGS.map((l) => <MenuItem key={l.code} checked={prefs.lang === l.code} onClick={() => setLang(l.code)} hint={l.short}>{l.name}</MenuItem>)}
          </Menu>
          <IconButton icon={THEME_ICON[dark ? "dark" : "light"]} label={t("theme.switch", { mode: t(dark ? "theme.dark" : "theme.light") })}
            title={t("theme.switch", { mode: t(dark ? "theme.dark" : "theme.light") })} onClick={cycleTheme} />
          <Actions />
          {status === "signedIn" && <AccountMenu />}
          {!minimal && <IconButton icon={open ? "close" : "menu"} label={t("common.menu")} aria-expanded={open} aria-controls="siteMenu" className="md:hidden" onClick={() => setOpen(!open)} />}
        </div>
      </div>
      {open && !minimal && (
        // Choosing a page closes the menu.
        <nav id="siteMenu" aria-label={t("pub.nav.main")} onClick={(e) => e.target.closest("a") && setOpen(false)}
          className="grid animate-fade gap-1 border-t border-line px-4 py-3 md:hidden">
          {SITE_PAGES.map(([to, key]) => <NavLink key={to} to={to} end className={(s) => cx(linkCls(s), "py-2.5 text-[.95rem]")}>{t(key)}</NavLink>)}
          <div className="mt-2 grid gap-2 sm:hidden"><Actions stacked /></div>
        </nav>
      )}
    </header>
  );
}
