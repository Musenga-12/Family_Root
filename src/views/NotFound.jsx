/* Unknown address: say so plainly, then offer search and the most-used places (recognition over recall). */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PublicLayout from "../components/PublicLayout";
import { Button, Card, Icon, Input, InputIcon, PageHeader } from "../components/ui";
import { useT } from "../lib/i18n";
import { NAV } from "../lib/nav";
import { SITE_PAGES } from "../lib/site";

export default function NotFound() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState("");
  // The path sits inside the sentence where each language puts it.
  const [before, after] = t("nf.body").split("{path}");
  const pages = NAV.flatMap((g) => g.items);
  return (
    <>
      {/* Same top as every other screen; the search sits where the main actions go. */}
      <PageHeader icon="explore_off" eyebrow={t("nf.eyebrow")} title={t("nf.title")}
        description={<>{before}<code className="rounded bg-surface-3 px-1.5">{pathname}</code>{after}</>}>
        <form role="search" className="mt-4 flex max-w-130 flex-wrap gap-2.5" onSubmit={(e) => { e.preventDefault(); navigate(`/directory${q.trim() ? "?q=" + encodeURIComponent(q.trim()) : ""}`); }}>
          <InputIcon icon="search" className="min-w-55 flex-1">
            <label className="sr-only" htmlFor="nfQ">{t("dir.search")}</label>
            <Input id="nfQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("top.search")} />
          </InputIcon>
          <Button type="submit" variant="primary" icon="search">{t("common.search")}</Button>
        </form>
      </PageHeader>
      <Card className="mt-6">
        <h2 className="text-[1.2rem]!">{t("nf.goTo")}</h2>
        <ul className="m-0 mt-3 grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 p-0">
          {pages.map(([id, , icon]) => (
            <li key={id} data-sec={id}><Button to={`/${id}`} block className="justify-start! text-left!"><Icon name={icon} size="sm" className="text-sec-ink" />{t(`nav.${id}`)}</Button></li>
          ))}
        </ul>
      </Card>
    </>
  );
}

/** The same message for visitors who aren't signed in: the public site's pages, and the ways in. */
export function PublicNotFound() {
  const t = useT();
  const { pathname } = useLocation();
  return (
    <PublicLayout title={t("notFound.public")}>
      <div className="mx-auto grid w-full max-w-200 gap-5 px-4 pt-12 pb-16 text-center sm:px-7">
        <Icon name="explore_off" className="justify-self-center text-[48px]! text-sec-ink" />
        <h1>{t("notFound.public")}</h1>
        <p className="text-muted"><code className="rounded bg-surface-3 px-1.5">{pathname}</code></p>
        <p className="text-muted">{t("notFound.publicSub")}</p>
        <nav aria-label={t("pub.nav.main")}>
          <ul className="m-0 flex list-none flex-wrap justify-center gap-2 p-0">
            {SITE_PAGES.map(([to, key]) => <li key={to}><Button to={to}>{t(key)}</Button></li>)}
          </ul>
        </nav>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button to="/login" icon="login">{t("pub.login")}</Button>
          <Button variant="primary" to="/register" icon="person_add">{t("pub.getStarted")}</Button>
        </div>
      </div>
    </PublicLayout>
  );
}
