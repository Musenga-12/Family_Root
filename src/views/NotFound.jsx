/* Unknown address: say so plainly, then offer search and the most-used places (recognition over recall). */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Eyebrow, Hero, Icon, Input, InputIcon } from "../components/ui";
import { useT } from "../lib/i18n";
import { NAV } from "../lib/nav";

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
      <Hero>
        <Eyebrow icon="explore_off">{t("nf.eyebrow")}</Eyebrow>
        <h1 className="mt-2">{t("nf.title")}</h1>
        <p className="mt-2 max-w-155 text-muted">{before}<code className="rounded bg-surface-3 px-1.5">{pathname}</code>{after}</p>
        <form role="search" className="mt-4 flex max-w-130 flex-wrap gap-2.5" onSubmit={(e) => { e.preventDefault(); navigate(`/directory${q.trim() ? "?q=" + encodeURIComponent(q.trim()) : ""}`); }}>
          <InputIcon icon="search" className="min-w-55 flex-1">
            <label className="sr-only" htmlFor="nfQ">{t("dir.search")}</label>
            <Input id="nfQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("top.search")} />
          </InputIcon>
          <Button type="submit" variant="primary" icon="search">{t("common.search")}</Button>
        </form>
      </Hero>
      <Card className="mt-6">
        <h2 className="text-[1.2rem]!">{t("nf.goTo")}</h2>
        <ul className="m-0 mt-3 grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 p-0">
          {pages.map(([id, , icon]) => (
            <li key={id} data-sec={id}><Button to={`/${id}`} block className="justify-start!"><Icon name={icon} size="sm" className="text-sec-ink" />{t(`nav.${id}`)}</Button></li>
          ))}
        </ul>
      </Card>
    </>
  );
}
