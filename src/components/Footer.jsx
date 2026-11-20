/* Footers, one per kind of page:
     SiteFooter – the full footer of the public pages: brand, the site's pages, account links that follow the sign-in
                  state, support and legal pages, copyright.
     AppFooter  – a slim strip under the workspace pages, so it never competes with the work on the page.
   Only real pages are linked; there is no contact address or social account in the project, so none is shown. */
import { Link } from "react-router-dom";
import { cx } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { SITE_PAGES } from "../lib/site";
import { Icon, IconButton, Tag } from "./ui";

const YEAR = new Date().getFullYear();

/* Footer links take the shared hover/press colours (hover-fill), so both themes match the rest of the app. */
const linkBase = "inline-flex items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-1 text-left no-underline cursor-pointer transition-colors duration-200 hover-fill";
const siteLink = cx(linkBase, "-mx-1.5 min-h-9 text-small text-muted easy:min-h-11");
const appLink = cx(linkBase, "min-h-8 text-xsmall font-medium text-ink");

// [path, labelKey, icon]
const VISITOR = [["/login", "pub.login", "login"], ["/register", "pub.register", "person_add"], ["/join", "au.tabCode", "key"],
  ["/forgot-password", "au.forgot", "lock_reset"]];
const MEMBER = [["/overview", "pub.dashboard", "dashboard"], ["/settings", "nav.settings", "tune"], ["/privacy", "nav.privacy", "verified_user"]];
const DEMO = [["/overview", "pub.openDemo", "rocket_launch"], ["/settings", "nav.settings", "tune"], ["/privacy", "nav.privacy", "verified_user"]];
const SUPPORT = [["/contact", "pub.nav.contact", "support_agent"], ["/faq", "pub.nav.faq", "help"], ["/privacy-policy", "privacyPolicy.title", "policy"],
  ["/terms", "terms.title", "gavel"]];

function Column({ id, title, children }) {
  return (
    <nav aria-labelledby={id} className="min-w-0">
      <h2 id={id} className="mb-3 font-sans text-xsmall font-semibold tracking-[.14em] text-ink uppercase">{title}</h2>
      <ul className="m-0 grid list-none gap-1 p-0">{children}</ul>
    </nav>
  );
}

const PageLink = ({ to, label, icon }) => (
  <li><Link to={to} className={siteLink}>{icon && <Icon name={icon} size="xs" />}{label}</Link></li>
);

/** Full footer for the public pages. */
export function SiteFooter() {
  const t = useT();
  const { status } = useSession();
  const account = status === "signedIn" ? MEMBER : status === "demo" ? DEMO : VISITOR;
  return (
    <footer data-no-print className="mt-16 border-t border-line bg-surface-2">
      <div className="mx-auto grid max-w-300 grid-cols-2 gap-x-6 gap-y-10 px-4 pt-12 pb-10 sm:px-7 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-2 grid content-start gap-4 md:col-span-1 md:pr-8">
          <Link to="/" aria-label={t("shell.home")} className="-mx-1.5 flex w-fit items-center gap-2.5 rounded-xl px-1.5 py-1 text-ink no-underline transition-colors duration-200">
            <span className="grid size-10 place-items-center rounded-full bg-pine-900 text-mint"><Icon name="park" /></span>
            <span>
              <strong className="block font-serif text-[1.25rem] leading-[1.1]">FamilyRoots</strong>
              <small className="text-tag font-semibold tracking-[.16em] text-pine-700 uppercase">{t("brand.tagline")}</small>
            </span>
          </Link>
          <p className="m-0 max-w-90 text-small leading-relaxed text-muted">{t("footer.desc")}</p>
          <Tag tone="mint" icon="verified_user" className="justify-self-start">{t("home.trust1")}</Tag>
        </div>
        <Column id="footExplore" title={t("footer.explore")}>
          {SITE_PAGES.filter(([to]) => !["/contact", "/faq", "/privacy-policy"].includes(to)).map(([to, key]) => <PageLink key={to} to={to} label={t(key)} />)}
        </Column>
        <Column id="footAccount" title={t("pub.account")}>
          {account.map(([to, key, icon]) => <PageLink key={to + key} to={to} label={t(key)} icon={icon} />)}
        </Column>
        <Column id="footHelp" title={t("footer.help")}>
          {SUPPORT.map(([to, key, icon]) => <PageLink key={to} to={to} label={t(key)} icon={icon} />)}
        </Column>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-5 text-xsmall text-muted sm:px-7">
          <p className="m-0">{t("footer.rights", { year: YEAR })}</p>
          <p className="m-0 min-w-0 flex-1 basis-60 sm:text-center">{t("land.footer")}</p>
          <IconButton icon="arrow_upward" label={t("footer.top")} title={t("footer.top")} className="size-10"
            onClick={() => window.scrollTo({ top: 0 })} />
        </div>
      </div>
    </footer>
  );
}

/** Slim footer under the workspace pages. `status` is the live sync status from the app shell. */
export function AppFooter({ status }) {
  const t = useT();
  return (
    <footer data-no-print className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line bg-surface-2 px-4 py-3 pr-24 text-xsmall text-muted sm:px-7 sm:pr-24">
      <span className="min-w-0"><Icon name="verified_user" size="sm" className="text-pine-700" /> {t("footer.privacy")} • {status}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link to="/privacy" className={appLink}>{t("nav.privacy")}</Link>
        <Link to="/settings" className={appLink}>{t("nav.settings")}</Link>
        <Link to="/contact" className={appLink}>{t("pub.nav.contact")}</Link>
        <span>{t("footer.rights", { year: YEAR })}</span>
      </span>
    </footer>
  );
}
