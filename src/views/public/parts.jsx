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
export function PageIntro({ eyebrow, icon, title, sub, children }) {
  return (
    <div className="border-b border-line bg-[linear-gradient(160deg,var(--sec-soft),var(--color-bg)_70%)]">
      <div className="mx-auto max-w-300 px-4 pt-12 pb-10 sm:px-7">
        <Eyebrow icon={icon}>{eyebrow}</Eyebrow>
        <h1 className="mt-3 max-w-200 text-[clamp(1.9rem,4vw,2.9rem)]!">{title}</h1>
        {sub && <p className="mt-3 max-w-170 text-[1.05rem] text-muted">{sub}</p>}
        {children}
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

/* ---------- Hero illustration ---------- */

/** A relative on the tree: a ring with a simple head-and-shoulders figure. */
function Person({ x, y, r = 22, tone = "var(--color-pine-700)" }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r + 4} fill="var(--color-surface)" />
      <circle r={r} fill={tone} />
      <circle cy={-r * 0.22} r={r * 0.32} fill="#fff" opacity=".92" />
      <path d={`M${-r * 0.55} ${r * 0.62} a${r * 0.55} ${r * 0.48} 0 0 1 ${r * 1.1} 0`} fill="#fff" opacity=".92" />
    </g>
  );
}

/** Grandparents at the roots, parents on the branches, children at the top: a family growing from its roots. */
export function HeroArt() {
  const t = useT();
  const branch = { stroke: "var(--color-pine-800)", strokeLinecap: "round", fill: "none" };
  return (
    <div className="relative">
      <svg viewBox="0 0 480 440" role="img" aria-label={t("home.artAlt")} className="block h-auto w-full">
        <defs>
          <radialGradient id="heroGlow" cx="50%" cy="45%" r="55%">
            <stop offset="0" stopColor="var(--color-mint)" stopOpacity=".45" />
            <stop offset="1" stopColor="var(--color-mint)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="240" cy="200" r="215" fill="url(#heroGlow)" />
        {/* leaves */}
        {[[150, 150, 70], [330, 150, 70], [240, 95, 80], [195, 205, 55], [290, 205, 55]].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="var(--color-gold)" opacity=".16" />
        ))}
        {/* ground */}
        <path d="M40 340 Q240 318 440 340" stroke="var(--color-line)" strokeWidth="3" fill="none" />
        {/* trunk and branches */}
        <path d="M226 340 C229 290 224 250 230 205 L250 205 C256 250 251 290 254 340 Z" fill="var(--color-pine-800)" />
        <path d="M236 228 C205 212 175 192 150 160" strokeWidth="11" {...branch} />
        <path d="M244 228 C275 212 305 192 330 160" strokeWidth="11" {...branch} />
        <path d="M240 212 C240 175 240 140 240 112" strokeWidth="10" {...branch} />
        <path d="M150 160 C140 140 128 128 112 118" strokeWidth="6" {...branch} />
        <path d="M330 160 C340 140 352 128 368 118" strokeWidth="6" {...branch} />
        {/* roots */}
        <path d="M236 338 C220 362 190 376 150 384" strokeWidth="7" {...branch} />
        <path d="M244 338 C262 362 292 376 330 384" strokeWidth="7" {...branch} />
        <path d="M240 340 C239 360 238 378 240 398" strokeWidth="5" {...branch} opacity=".7" />
        {/* the family */}
        <Person x={150} y={388} r={24} tone="var(--color-gold-ink)" />
        <Person x={330} y={388} r={24} tone="var(--color-gold-ink)" />
        <Person x={150} y={160} r={26} />
        <Person x={330} y={160} r={26} />
        <Person x={240} y={100} r={24} tone="var(--color-pine-600)" />
        <Person x={112} y={112} r={18} tone="var(--color-pine-600)" />
        <Person x={368} y={112} r={18} tone="var(--color-pine-600)" />
      </svg>
      {/* What families keep on the tree: a voice and a confirmed date. */}
      <div aria-hidden="true" className="absolute top-[52%] -left-1 flex animate-pop items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-pop sm:-left-4">
        <span className="grid size-9 place-items-center rounded-full bg-rec/15 text-rec"><Icon name="graphic_eq" /></span>
        <span><strong className="block text-small">{t("home.art.voice")}</strong><small className="text-xsmall text-muted">{t("home.art.voiceSub")}</small></span>
      </div>
      <div aria-hidden="true" className="absolute top-[8%] -right-1 flex animate-pop items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-pop sm:-right-3">
        <span className="grid size-9 place-items-center rounded-full bg-gold-100 text-gold-ink"><Icon name="favorite" /></span>
        <span><strong className="block text-small">{t("home.art.date")}</strong><small className="text-xsmall text-muted">{t("home.art.dateSub")}</small></span>
      </div>
    </div>
  );
}
