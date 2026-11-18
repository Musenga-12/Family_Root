/* Building blocks shared by the public pages: page intro, feature cards, the four steps, trust points, FAQ list,
   the closing call to action and the hero illustration. Everything reads its text from i18n-public.js. */
import { useState } from "react";
import { Button, Card, Eyebrow, Icon, Input, InputIcon } from "../../components/ui";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { FEATURES } from "../../lib/site";

export const Section = ({ id, className, children, ...rest }) => (
  <section id={id} className={cx("mx-auto w-full max-w-300 scroll-mt-20 px-4 sm:px-7", className)} {...rest}>{children}</section>
);

/** Heading band at the top of each public page. */
/** Top of a public page. `photo` (optional) sits beside the text on wide screens and below it on phones. */
export function PageIntro({ eyebrow, icon, title, sub, photo, children }) {
  return (
    <div className="border-b border-line bg-[linear-gradient(160deg,var(--sec-soft),var(--color-bg)_70%)]">
      <div className={cx("mx-auto max-w-300 px-4 pt-12 pb-10 sm:px-7", photo && "grid items-center gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]")}>
        <div className="min-w-0">
          <Eyebrow icon={icon}>{eyebrow}</Eyebrow>
          <h1 className="mt-3 max-w-200 text-[clamp(1.9rem,4vw,2.9rem)]!">{title}</h1>
          {sub && <p className="mt-3 max-w-170 text-[1.05rem] text-muted">{sub}</p>}
          {children}
        </div>
        {photo}
      </div>
    </div>
  );
}

export function SectionHead({ eyebrow, icon, title, sub, center, children }) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-4", center && "justify-center text-center")}>
      <div className={cx("max-w-180", center && "mx-auto")}>
        {eyebrow && <Eyebrow icon={icon}>{eyebrow}</Eyebrow>}
        <h2 className="mt-2 text-[clamp(1.5rem,3vw,2.2rem)]!">{title}</h2>
        {sub && <p className="mt-2 text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function FeatureCard({ k, icon, to, detail = true }) {
  const t = useT();
  return (
    <li className="lift grid content-start gap-3 rounded-card border border-line bg-surface p-5">
      <span className="grid size-11 place-items-center rounded-xl bg-sec-soft text-sec-ink"><Icon name={icon} /></span>
      <h3 className="text-[1.12rem]!">{t(`feat.${k}`)}</h3>
      {detail && <p className="text-small text-muted">{t(`feat.${k}.d`)}</p>}
      {to && (
        <Button variant="ghost" size="sm" className="-ml-2 justify-self-start" to={to} aria-label={t("features.open", { name: t(`feat.${k}`) })}>
          {t("features.openShort")} <Icon name="arrow_forward" size="xs" />
        </Button>
      )}
    </li>
  );
}

export function FeatureGrid({ keys, cols = "md:grid-cols-3" }) {
  const list = keys ? FEATURES.filter(([k]) => keys.includes(k)) : FEATURES;
  return (
    <ul className={cx("m-0 mt-6 grid list-none gap-4 p-0 sm:grid-cols-2", cols)}>
      {list.map(([k, icon, to]) => <FeatureCard key={k} k={k} icon={icon} to={to} />)}
    </ul>
  );
}

/** The four steps from sign-up to a first memory. */
export function Steps() {
  const t = useT();
  return (
    <ol className="m-0 mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 md:grid-cols-4">
      {t("how.steps").map(([title, body], i) => (
        <li key={title} className="relative grid content-start gap-2.5 rounded-card border border-line bg-surface p-5">
          <span className="grid size-10 place-items-center rounded-full bg-pine-900 font-serif text-[1.1rem] font-bold text-mint">{i + 1}</span>
          <h3 className="text-[1.08rem]!">{title}</h3>
          <p className="text-small text-muted">{body}</p>
        </li>
      ))}
    </ol>
  );
}

export function TrustGrid() {
  const t = useT();
  return (
    <ul className="m-0 mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 md:grid-cols-3">
      {t("trust.items").map(([icon, title, body]) => (
        <li key={title} className="flex gap-3.5 rounded-card border border-line bg-surface p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-pine-900 text-mint"><Icon name={icon} size="sm" /></span>
          <span><strong className="block">{title}</strong><span className="mt-1 block text-small text-muted">{body}</span></span>
        </li>
      ))}
    </ul>
  );
}

/** Collapsible questions. `groups` = [[groupTitle, [[q, a], …]], …]; `search` adds a filter box. */
export function FaqList({ groups, search, showGroups = true }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const ql = q.trim().toLowerCase();
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const shown = groups.map(([g, items], gi) => [g, items.map((x, i) => [...x, `${gi}-${i}`]).filter(([qq, a]) => !ql || (qq + a).toLowerCase().includes(ql))])
    .filter(([, items]) => items.length);
  return (
    <div className="grid gap-6">
      {search && (
        <InputIcon icon="search">
          <label className="sr-only" htmlFor="faqQ">{t("faq.search")}</label>
          <Input id="faqQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("faq.search")} />
        </InputIcon>
      )}
      {shown.length === 0 && <p role="status" className="py-6 text-center text-muted">{t("faq.none")}</p>}
      {shown.map(([group, items]) => (
        <div key={group} className="grid gap-2.5">
          {showGroups && <h2 className="text-[1.25rem]!">{group}</h2>}
          {items.map(([question, answer, id]) => {
            const isOpen = open.has(id) || !!ql;
            return (
              <div key={id} className="rounded-2xl border border-line bg-surface">
                <h3 className="text-base!">
                  <button type="button" aria-expanded={isOpen} aria-controls={`faq-${id}`} onClick={() => toggle(id)}
                    className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-0 bg-transparent p-4 text-left font-sans text-[.98rem] font-semibold text-ink hover-tint">
                    {question}<Icon name="expand_more" className={cx("shrink-0 transition-transform", isOpen && "rotate-180")} />
                  </button>
                </h3>
                {isOpen && <p id={`faq-${id}`} className="animate-fade px-4 pb-4 text-muted">{answer}</p>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Closing band: visitors are invited in, members are sent back to their archive. */
export function CtaBand() {
  const t = useT();
  const { status, me } = useSession();
  return (
    <Section className="mt-16">
      <Card tone="dark" className="relative overflow-hidden p-8! sm:p-12!">
        <Icon name="park" className="absolute -right-6 -bottom-10 text-[220px]! text-mint/10" />
        <h2 className="relative max-w-160 text-[clamp(1.5rem,3vw,2.2rem)]! text-white">{t("home.cta.title")}</h2>
        <p className="relative mt-3 max-w-150 text-on-dark">
          {status === "signedIn" ? t("home.cta.signedIn", { name: me.name.split(" ")[0] }) : t("home.cta.sub")}
        </p>
        <div className="relative mt-6 flex flex-wrap gap-3">
          {status === "signedIn" ? (
            <Button variant="mint" size="lg" icon="dashboard" to="/overview">{t("pub.dashboard")}</Button>
          ) : status === "demo" ? (
            <Button variant="mint" size="lg" icon="rocket_launch" to="/overview">{t("pub.openDemo")}</Button>
          ) : (
            <>
              <Button variant="mint" size="lg" icon="person_add" to="/register">{t("home.ctaStart")}</Button>
              <Button size="lg" icon="key" to="/join" className="border-white/30! bg-white/10! text-white! hover:bg-white/20!">{t("home.ctaJoin")}</Button>
            </>
          )}
        </div>
      </Card>
    </Section>
  );
}
