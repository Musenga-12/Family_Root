/* Frame for every public page: skip link, the site header, the page, the site footer. Open to visitors and members alike;
   the header and footer follow the sign-in state. `minimal` (welcome steps) drops the site links and the footer. */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useT } from "../lib/i18n";
import { SiteFooter } from "./Footer";
import SiteHeader from "./SiteHeader";

export default function PublicLayout({ title, minimal, children }) {
  const t = useT();
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  useEffect(() => { document.title = title ? `${title} – FamilyRoots` : "FamilyRoots"; }, [title]);
  // A new page starts at the top, like a normal website.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}
        className="absolute top-2 -left-249.75 z-100 rounded-lg bg-pine-900 px-3.5 py-2 text-white focus:left-2">
        {t("shell.skip")}
      </a>
      <SiteHeader minimal={minimal} />
      <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 outline-none">{children}</main>
      {!minimal && <SiteFooter />}
    </div>
  );
}
