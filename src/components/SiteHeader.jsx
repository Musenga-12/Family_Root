/* Header for the public pages (welcome page and Sign in / Join): brand, the page's own section links if any,
   language and theme switches, and the way into the app. Signed-in screens use the app shell in Layout.jsx instead. */
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LANGS, useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { THEME_ICON, usePrefActions } from "../lib/usePrefActions";
import { Menu, MenuItem, MenuLabel } from "./Menu";
import { Button, Icon, IconButton } from "./ui";

/** `sections` are [id, labelKey] anchors on the current page, opened with `onSection`. */
export default function SiteHeader({ sections = [], onSection }) {
  const t = useT();
  const { prefs, dark } = useStore();
  const { cycleTheme, setLang } = usePrefActions();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const lang = LANGS.find((l) => l.code === prefs.lang) || LANGS[0];
  // No "Sign in" button on the sign-in page itself.
  const onAuth = pathname === "/auth";
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-300 items-center gap-3 px-4 py-3 sm:px-7">
        <Link to="/" aria-label={t("shell.home")} className="flex items-center gap-2.5 text-ink no-underline">
          <span className="grid size-8.5 place-items-center rounded-full bg-pine-900 text-mint"><Icon name="park" /></span>
          <strong className="font-serif text-[1.15rem]">FamilyRoots</strong>
        </Link>
        {sections.length > 0 && (
          <nav aria-label={t("land.sections")} className="ml-6 hidden gap-1 md:flex">
            {sections.map(([id, key]) => (
              <button key={id} type="button" onClick={() => onSection?.(id)}
                className="cursor-pointer rounded-lg border-0 bg-transparent px-3 py-2 text-[.88rem] text-muted hover-fill">{t(key)}</button>
            ))}
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
          <IconButton icon={THEME_ICON[dark ? "dark" : "light"]} label={t("theme.switch", { mode: t(dark ? "theme.dark" : "theme.light") })} title={t("theme.switch", { mode: t(dark ? "theme.dark" : "theme.light") })} onClick={cycleTheme} />
          {!onAuth && <Button className="max-sm:hidden" to="/auth">{t("land.signin")}</Button>}
          <Button variant="primary" className="max-sm:hidden" to="/overview">{t("land.demo")}</Button>
          <IconButton icon={open ? "close" : "menu"} label={t("common.menu")} aria-expanded={open} className="md:hidden" onClick={() => setOpen(!open)} />
        </div>
      </div>
      {open && (
        <nav aria-label={t("land.sections")} className="grid gap-1 border-t border-line px-4 py-3 md:hidden">
          {sections.map(([id, key]) => (
            <button key={id} type="button" onClick={() => { setOpen(false); onSection?.(id); }}
              className="cursor-pointer rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-ink hover-fill">{t(key)}</button>
          ))}
          <div className={onAuth ? "mt-2 grid" : "mt-2 grid grid-cols-2 gap-2"}>
            {!onAuth && <Button to="/auth">{t("land.signin")}</Button>}
            <Button variant="primary" to="/overview">{t("land.demo")}</Button>
          </div>
        </nav>
      )}
    </header>
  );
}
