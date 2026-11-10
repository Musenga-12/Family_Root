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
  const pages = NAV.flatMap((g) => g.items).filter(([id]) => id !== "auth");
  return (
    <>
      <Hero>
        <Eyebrow icon="explore_off">Page not found</Eyebrow>
        <h1 className="mt-2">We couldn't find that page</h1>
        <p className="mt-2 max-w-155 text-muted">There is nothing at <code className="rounded bg-surface-3 px-1.5">{pathname}</code>. The link may be old or mistyped. Search for what you need, or pick a page below.</p>
        <form role="search" className="mt-4 flex max-w-130 flex-wrap gap-2.5" onSubmit={(e) => { e.preventDefault(); navigate(`/directory${q.trim() ? "?q=" + encodeURIComponent(q.trim()) : ""}`); }}>
          <InputIcon icon="search" className="min-w-55 flex-1">
            <label className="sr-only" htmlFor="nfQ">Search relatives</label>
            <Input id="nfQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("top.search")} />
          </InputIcon>
          <Button type="submit" variant="primary" icon="search">Search</Button>
        </form>
      </Hero>
      <Card className="mt-6">
        <h2 className="text-[1.2rem]!">Go to</h2>
        <ul className="m-0 mt-3 grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 p-0">
          {pages.map(([id, , icon]) => (
            <li key={id}><Button to={`/${id}`} block className="justify-start!"><Icon name={icon} size="sm" className="text-pine-700" />{t(`nav.${id}`)}</Button></li>
          ))}
        </ul>
      </Card>
    </>
  );
}
