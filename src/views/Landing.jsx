/* Public welcome page: introduces FamilyRoots before sign-in. Fully translated; has its own header with language and theme switches. */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, MenuItem, MenuLabel } from "../components/Menu";
import { useToast } from "../components/toastContext";
import { Button, Card, Chip, Chips, Eyebrow, Icon, IconButton, Input, InputIcon, Photo, PhotoOverlay, Switch, Tabs, Tag } from "../components/ui";
import { cx, emailOk } from "../lib/format";
import { LANGS, localeOf, useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { THEME_ICON, usePrefActions } from "../lib/usePrefActions";

const SECTIONS = [["features", "land.nav.features"], ["how", "land.nav.how"], ["pricing", "land.nav.pricing"], ["faq", "land.nav.faq"]];
const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function LandingHeader() {
  const t = useT();
  const { prefs } = useStore();
  const { cycleTheme, setLang } = usePrefActions();
  const [open, setOpen] = useState(false);
  const lang = LANGS.find((l) => l.code === prefs.lang) || LANGS[0];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-300 items-center gap-3 px-4 py-3 sm:px-7">
        <Link to="/" className="flex items-center gap-2.5 text-ink no-underline">
          <span className="grid size-8.5 place-items-center rounded-full bg-pine-900 text-mint"><Icon name="park" /></span>
          <strong className="font-serif text-[1.15rem]">FamilyRoots</strong>
        </Link>
        <nav aria-label="Sections" className="ml-6 hidden gap-1 md:flex">
          {SECTIONS.map(([id, key]) => (
            <button key={id} type="button" onClick={() => scrollTo(id)}
              className="cursor-pointer rounded-lg border-0 bg-transparent px-3 py-2 text-[.88rem] text-muted hover:bg-surface-2 hover:text-ink">{t(key)}</button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Menu label={t("top.language")} trigger={(p) => (
            <button type="button" {...p} aria-label={`${t("top.language")}: ${lang.name}`}
              className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-[10px] border border-line bg-surface px-2.5 text-[.8rem] font-semibold text-pine-800">
              <Icon name="translate" size="sm" />{lang.short}
            </button>
          )}>
            <MenuLabel>{t("top.language")}</MenuLabel>
            {LANGS.map((l) => <MenuItem key={l.code} checked={prefs.lang === l.code} onClick={() => setLang(l.code)} hint={l.short}>{l.name}</MenuItem>)}
          </Menu>
          <IconButton icon={THEME_ICON[prefs.theme]} label={t("theme.switch", { mode: t(`theme.${prefs.theme}`) })} onClick={cycleTheme} />
          <Button className="max-sm:hidden" to="/auth">{t("land.signin")}</Button>
          <Button variant="primary" className="max-sm:hidden" to="/overview">{t("land.demo")}</Button>
          <IconButton icon={open ? "close" : "menu"} label="Menu" aria-expanded={open} className="md:hidden" onClick={() => setOpen(!open)} />
        </div>
      </div>
      {open && (
        <nav aria-label="Sections" className="grid gap-1 border-t border-line px-4 py-3 md:hidden">
          {SECTIONS.map(([id, key]) => (
            <button key={id} type="button" onClick={() => { setOpen(false); scrollTo(id); }}
              className="cursor-pointer rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-ink hover:bg-surface-2">{t(key)}</button>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2"><Button to="/auth">{t("land.signin")}</Button><Button variant="primary" to="/overview">{t("land.demo")}</Button></div>
        </nav>
      )}
    </header>
  );
}

/** Cycles through words, e.g. "Keep your family's [stories → voices → recipes]". */
function RotatingWord({ words }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % words.length), 2200);
    return () => clearInterval(id);
  }, [words.length]);
  return (
    <span className="relative inline-block text-pine-700 italic" aria-live="off">
      <span key={i} className="inline-block animate-pop">{words[i % words.length]}</span>
      <span className="absolute inset-x-0 -bottom-1 h-1.5 rounded-full bg-mint/70" aria-hidden="true" />
    </span>
  );
}

/** Animates from 0 to `to` the first time it scrolls into view. */
function CountUp({ to, suffix = "" }) {
  const { prefs } = useStore();
  const ref = useRef(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    let raf;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / 1400);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{n.toLocaleString(localeOf(prefs.lang))}{suffix}</span>;
}

function Hero() {
  const t = useT();
  return (
    <section className="mx-auto grid max-w-300 items-center gap-10 px-4 pt-14 pb-10 sm:px-7 md:grid-cols-[1.1fr_.9fr]">
      <div>
        <Tag tone="mint" icon="shield">{t("land.eyebrow")}</Tag>
        <h1 className="mt-4 text-[clamp(2.1rem,4.6vw,3.6rem)]!">
          {t("land.title")} <RotatingWord words={t("land.words")} /> {t("land.title2")}
        </h1>
        <p className="mt-4 max-w-140 text-[1.05rem] text-muted">{t("land.sub")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" icon="rocket_launch" to="/auth">{t("land.start")}</Button>
          <Button size="lg" icon="play_circle" to="/overview">{t("land.watch")}</Button>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-small text-muted"><Icon name="verified_user" size="sm" className="text-pine-700" /> {t("land.trust")}</p>
      </div>
      <div className="relative">
        <Photo p1="#a98a68" p2="#2d4a3b" icon="family_restroom" aspect="aspect-[4/3.6]" className="rounded-[28px] shadow-pop" alt="Three generations looking through a family album">
          <PhotoOverlay className="flex items-center justify-between gap-2.5">
            <strong className="font-serif text-[1.1rem]">The Mackenzie Folio</strong><Tag tone="glass">142</Tag>
          </PhotoOverlay>
        </Photo>
        <div className="absolute -bottom-5 -left-4 flex animate-pop items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-pop">
          <span className="grid size-9 place-items-center rounded-full bg-rec/15 text-rec"><Icon name="graphic_eq" /></span>
          <span><strong className="block text-small">“Crossing the Atlantic”</strong><small className="text-xsmall text-muted">8:42 · Mary</small></span>
        </div>
        <div className="absolute -top-4 -right-3 rounded-2xl border border-line bg-surface px-3.5 py-2 shadow-pop">
          <span className="text-xsmall text-muted">4</span> <Icon name="account_tree" size="sm" className="text-pine-700" />
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const t = useT();
  const items = [[1200, "+", "land.stat.families"], [48000, "+", "land.stat.stories"], [4, "", "land.stat.gens"], [4, "", "land.stat.langs"]];
  return (
    <section aria-label="FamilyRoots in numbers" className="mx-auto mt-6 grid max-w-300 grid-cols-2 gap-3 px-4 sm:px-7 md:grid-cols-4">
      {items.map(([n, s, k]) => (
        <div key={k} className="rounded-2xl border border-line bg-surface p-5 text-center">
          <strong className="block font-serif text-[2rem] text-pine-800"><CountUp to={n} suffix={s} /></strong>
          <span className="text-small text-muted">{t(k)}</span>
        </div>
      ))}
    </section>
  );
}

function WhoPicker() {
  const t = useT();
  const { easy, setEasy } = useStore();
  const [who, setWho] = useState("elder");
  const icons = { elder: "elderly", parent: "family_restroom", young: "school" };
  return (
    <Card className="mx-auto mt-14 max-w-300">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2>{t("land.who.title")}</h2><p className="mt-1 text-muted">{t("land.who.sub")}</p></div>
        <Tabs role="radiogroup" label={t("land.who.title")} value={who} onChange={setWho} dark
          items={["elder", "parent", "young"].map((k) => [k, <span key={k} className="inline-flex items-center gap-1.5"><Icon name={icons[k]} size="sm" />{t(`land.who.${k}`)}</span>])} />
      </div>
      <ul key={who} className="mt-5 grid list-none gap-3 p-0 md:grid-cols-3">
        {t(`land.who.${who}.points`).map((p, i) => (
          <li key={p} className="flex animate-pop items-start gap-3 rounded-2xl bg-surface-2 p-4" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint text-pine-900"><Icon name="check" size="sm" /></span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      {who === "elder" && (
        <div className="mt-4 rounded-2xl border border-line p-4">
          <Switch id="landEasy" checked={easy} onChange={setEasy} label={t("settings.easy")} help={t("settings.easyHelp")} />
        </div>
      )}
    </Card>
  );
}

function Features() {
  const t = useT();
  const feats = [
    ["tree", "account_tree", "/tree", "#5f8b7d", "#22423a"],
    ["memories", "photo_library", "/memories", "#c28a4d", "#3b2a1c"],
    ["stories", "mic", "/stories", "#8193a8", "#2f3b4d"],
    ["timeline", "hourglass_top", "/timeline", "#9a6b4a", "#2e2320"],
  ];
  const [sel, setSel] = useState(0);
  const tabs = useRef([]);
  const onKey = (e) => {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const n = (sel + d + feats.length) % feats.length;
    setSel(n);
    tabs.current[n]?.focus();
  };
  const [key, icon, to, p1, p2] = feats[sel];
  return (
    <section id="features" className="mx-auto mt-16 max-w-300 scroll-mt-20 px-4 sm:px-7">
      <Eyebrow icon="auto_awesome">{t("land.nav.features")}</Eyebrow>
      <h2 className="mt-2 max-w-160 text-[clamp(1.5rem,3vw,2.2rem)]!">{t("land.feat.title")}</h2>
      <div className="mt-6 grid gap-5 md:grid-cols-[300px_1fr]">
        <div role="tablist" aria-orientation="vertical" aria-label={t("land.nav.features")} className="grid content-start gap-2" onKeyDown={onKey}>
          {feats.map(([k, ic], i) => (
            <button key={k} ref={(el) => (tabs.current[i] = el)} type="button" role="tab" id={`feat-${k}`} aria-selected={i === sel}
              aria-controls="featPanel" tabIndex={i === sel ? 0 : -1} onClick={() => setSel(i)}
              className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left transition",
                i === sel ? "border-pine-700 bg-surface shadow-card" : "border-transparent bg-surface-2 hover:bg-surface-3")}>
              <span className={cx("grid size-10 place-items-center rounded-xl", i === sel ? "bg-pine-900 text-mint" : "bg-surface text-pine-700")}><Icon name={ic} /></span>
              <strong className="text-ink">{t(`land.feat.${k}`)}</strong>
            </button>
          ))}
        </div>
        <div id="featPanel" role="tabpanel" aria-labelledby={`feat-${key}`} key={key}
          className="grid animate-fade items-center gap-5 rounded-card border border-line bg-surface p-5 sm:grid-cols-2">
          <Photo p1={p1} p2={p2} icon={icon} aspect="aspect-4/3" alt="" />
          <div>
            <h3 className="text-[1.5rem]!">{t(`land.feat.${key}`)}</h3>
            <p className="mt-2 text-muted">{t(`land.feat.${key}.d`)}</p>
            <Button className="mt-4" variant="primary" icon="arrow_forward" to={to}>{t("land.feat.open", { name: t(`land.feat.${key}`) })}</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const t = useT();
  const steps = t("land.how.steps");
  const details = t("land.how.details");
  const [step, setStep] = useState(0);
  return (
    <section id="how" className="mx-auto mt-16 max-w-300 scroll-mt-20 px-4 sm:px-7">
      <Card>
        <h2>{t("land.how.title")}</h2>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
          <div className="h-full rounded-full bg-pine-700 transition-[width] duration-500 dark:bg-mint" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
        <ol className="m-0 mt-4 grid list-none gap-3 p-0 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s}>
              <button type="button" aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}
                className={cx("flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-left text-ink",
                  i === step ? "border-pine-700 bg-mint-100" : "border-line bg-surface")}>
                <span className={cx("grid size-9 shrink-0 place-items-center rounded-full font-bold",
                  i < step ? "bg-pine-700 text-white" : i === step ? "bg-pine-900 text-mint" : "bg-surface-3 text-muted")}>
                  {i < step ? <Icon name="check" size="sm" /> : i + 1}
                </span>
                <strong className="text-[.92rem]">{s}</strong>
              </button>
            </li>
          ))}
        </ol>
        <p key={step} className="mt-4 animate-fade rounded-2xl bg-surface-2 p-4" aria-live="polite">{details[step]}</p>
        <div className="mt-4 flex gap-2.5">
          <Button icon="arrow_back" disabled={step === 0} onClick={() => setStep(step - 1)}>{t("common.prev")}</Button>
          <Button variant="primary" disabled={step === steps.length - 1} onClick={() => setStep(step + 1)}>{t("common.next")} <Icon name="arrow_forward" size="sm" /></Button>
        </div>
      </Card>
    </section>
  );
}

function Pricing() {
  const t = useT();
  const toast = useToast();
  const [yearly, setYearly] = useState(true);
  const [plan, setPlan] = useState("family");
  const plans = [["free", 0, "spa"], ["family", 4, "park"], ["legacy", 9, "account_balance"]];
  return (
    <section id="pricing" className="mx-auto mt-16 max-w-300 scroll-mt-20 px-4 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-[clamp(1.5rem,3vw,2.2rem)]!">{t("land.price.title")}</h2>
        <div className="flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2">
          <span className={cx("text-small", !yearly && "font-semibold")}>{t("land.price.monthly")}</span>
          <button type="button" role="switch" aria-checked={yearly} aria-label={t("land.price.yearly")} onClick={() => setYearly(!yearly)}
            className={cx("relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full border-0", yearly ? "bg-pine-800 dark:bg-mint" : "bg-surface-3")}>
            <span className={cx("inline-block size-4 rounded-full bg-white transition-transform", yearly ? "translate-x-6 dark:bg-pine-950" : "translate-x-1")} />
          </button>
          <span className={cx("text-small", yearly && "font-semibold")}>{t("land.price.yearly")}</span>
          <Tag tone="gold">{t("land.price.save")}</Tag>
        </div>
      </div>
      <div role="radiogroup" aria-label={t("land.nav.pricing")} className="mt-6 grid gap-4 md:grid-cols-3">
        {plans.map(([k, price, icon]) => {
          const on = plan === k;
          const shown = yearly ? +(price * 0.8).toFixed(2) : price;
          return (
            <div key={k} role="radio" aria-checked={on} tabIndex={0} onClick={() => setPlan(k)}
              onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), setPlan(k))}
              className={cx("relative grid cursor-pointer content-start gap-3 rounded-card border-2 bg-surface p-6 transition",
                on ? "border-pine-700 shadow-pop" : "border-line hover:border-pine-600", k === "family" && "md:-translate-y-2")}>
              {k === "family" && <span className="absolute -top-3 left-6"><Tag tone="dark" icon="star">{t("land.price.popular")}</Tag></span>}
              <span className="grid size-11 place-items-center rounded-xl bg-mint-100 text-pine-800"><Icon name={icon} /></span>
              <h3 className="text-[1.3rem]!">{t(`land.price.${k}`)}</h3>
              <p><strong className="font-serif text-[2.2rem]">${shown}</strong> <span className="text-muted">{t("land.price.per")}</span></p>
              <p className="text-small text-muted">{t(`land.price.${k}.d`)}</p>
              <Button variant={on ? "primary" : "default"} icon={on ? "check_circle" : undefined} block
                onClick={(e) => { e.stopPropagation(); setPlan(k); toast(t("land.price.toast", { plan: t(`land.price.${k}`) }), { icon: "check_circle" }); }}>
                {on ? t("land.price.chosen") : t("land.price.choose")}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Testimonials() {
  const t = useT();
  const quotes = t("land.quotes");
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setI((x) => (x + 1) % quotes.length), 6000);
    return () => clearInterval(id);
  }, [paused, quotes.length]);
  const [text, by] = quotes[i % quotes.length];
  return (
    <section aria-roledescription="carousel" aria-label={t("land.quotes.title")} className="mx-auto mt-16 max-w-300 px-4 sm:px-7"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <Card tone="dark" className="relative overflow-hidden p-8! sm:p-12!">
        <Icon name="format_quote" className="absolute top-4 right-6 text-[90px]! text-mint/20" />
        <Eyebrow className="text-mint!">{t("land.quotes.title")}</Eyebrow>
        <blockquote key={i} aria-live={paused ? "polite" : "off"} className="m-0 mt-4 animate-fade">
          <p className="max-w-205 font-serif text-[clamp(1.2rem,2.4vw,1.7rem)] leading-snug text-white italic">“{text}”</p>
          <footer className="mt-4 text-on-dark">— {by}</footer>
        </blockquote>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <IconButton icon="chevron_left" label={t("common.prev")} className="border-white/20! bg-white/10! text-white! hover:bg-white/20!" onClick={() => setI((i - 1 + quotes.length) % quotes.length)} />
          <IconButton icon="chevron_right" label={t("common.next")} className="border-white/20! bg-white/10! text-white! hover:bg-white/20!" onClick={() => setI((i + 1) % quotes.length)} />
          <IconButton icon={paused ? "play_arrow" : "pause"} label={paused ? t("common.play") : t("common.pause")} aria-pressed={paused}
            className="border-white/20! bg-white/10! text-white! hover:bg-white/20!" onClick={() => setPaused(!paused)} />
          <div className="ml-2 flex gap-1.5">
            {quotes.map((q, n) => (
              <button key={q[1]} type="button" aria-label={`${n + 1} / ${quotes.length}`} aria-current={n === i}
                onClick={() => setI(n)} className={cx("h-2.5 cursor-pointer rounded-full border-0 transition-all", n === i ? "w-7 bg-mint" : "w-2.5 bg-white/30")} />
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}

function Quiz() {
  const t = useT();
  const navigate = useNavigate();
  const [pick, setPick] = useState(null);
  const targets = [["/stories", "nav.stories"], ["/memories", "nav.memories"], ["/memories?q=recipe", "nav.memories"], ["/tree", "nav.tree"]];
  const icons = ["record_voice_over", "photo_camera", "restaurant", "account_tree"];
  return (
    <section className="mx-auto mt-16 max-w-300 px-4 sm:px-7">
      <Card>
        <h2>{t("land.quiz.title")}</h2>
        <div role="radiogroup" aria-label={t("land.quiz.title")} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {t("land.quiz.options").map((o, i) => (
            <button key={o} type="button" role="radio" aria-checked={pick === i} onClick={() => setPick(i)}
              className={cx("flex cursor-pointer flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left text-ink transition",
                pick === i ? "border-pine-700 bg-mint-100" : "border-line bg-surface hover:border-pine-600")}>
              <Icon name={icons[i]} className="text-pine-700" /><strong>{o}</strong>
            </button>
          ))}
        </div>
        {pick !== null && (
          <div className="mt-4 flex animate-pop flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4" aria-live="polite">
            <span>{t("land.quiz.result", { page: t(targets[pick][1]) })}</span>
            <Button variant="primary" icon="arrow_forward" onClick={() => navigate(targets[pick][0])}>{t("land.quiz.go")}</Button>
          </div>
        )}
      </Card>
    </section>
  );
}

function Faq() {
  const t = useT();
  const [q, setQ] = useState("");
  const [openSet, setOpenSet] = useState(() => new Set([0]));
  const all = t("land.faq").map((x, i) => [...x, i]);
  const ql = q.trim().toLowerCase();
  const list = all.filter(([qq, a]) => !ql || (qq + a).toLowerCase().includes(ql));
  const toggle = (i) => setOpenSet((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <section id="faq" className="mx-auto mt-16 max-w-225 scroll-mt-20 px-4 sm:px-7">
      <h2 className="text-center text-[clamp(1.5rem,3vw,2.2rem)]!">{t("land.faq.title")}</h2>
      <InputIcon icon="search" className="mt-5">
        <label className="sr-only" htmlFor="faqQ">{t("land.faq.search")}</label>
        <Input id="faqQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("land.faq.search")} />
      </InputIcon>
      <div className="mt-4 grid gap-2.5">
        {list.length === 0 && <p className="py-6 text-center text-muted">{t("land.faq.none")}</p>}
        {list.map(([question, answer, i]) => {
          const open = openSet.has(i) || !!ql;
          return (
            <div key={i} className="rounded-2xl border border-line bg-surface">
              <h3 className="text-base!">
                <button type="button" aria-expanded={open} aria-controls={`faq-${i}`} onClick={() => toggle(i)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent p-4 text-left font-sans text-[.98rem] font-semibold text-ink">
                  {question}<Icon name="expand_more" className={cx("transition-transform", open && "rotate-180")} />
                </button>
              </h3>
              {open && <p id={`faq-${i}`} className="animate-fade px-4 pb-4 text-muted">{answer}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Newsletter() {
  const t = useT();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (!emailOk(email.trim())) { setErr(t("land.news.err")); document.getElementById("newsEmail").focus(); return; }
    setErr(""); setDone(true); toast(t("land.news.ok"), { icon: "mark_email_read" });
  };
  return (
    <section className="mx-auto mt-16 max-w-300 px-4 sm:px-7">
      <div className="grid items-center gap-5 rounded-card border border-line bg-[linear-gradient(135deg,var(--color-mint-100),var(--color-surface))] p-7 md:grid-cols-2">
        <div><h2>{t("land.news.title")}</h2><p className="mt-2 text-muted">{t("land.news.sub")}</p></div>
        {done ? (
          <p className="flex items-center gap-2 font-semibold text-pine-700" aria-live="polite"><Icon name="check_circle" /> {t("land.news.ok")}</p>
        ) : (
          <form noValidate onSubmit={submit} className="grid gap-1.5">
            <div className="flex gap-2.5">
              <label className="sr-only" htmlFor="newsEmail">{t("land.news.email")}</label>
              <Input id="newsEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!err}
                aria-describedby={err ? "newsErr" : undefined} placeholder={t("land.news.email")} className="flex-1" />
              <Button variant="primary" type="submit">{t("land.news.join")}</Button>
            </div>
            {err && <span id="newsErr" role="alert" className="text-[.78rem] text-rose">{err}</span>}
          </form>
        )}
      </div>
    </section>
  );
}

export default function Landing() {
  const t = useT();
  useEffect(() => { document.title = "FamilyRoots – " + t("land.eyebrow"); }, [t]);
  return (
    <div className="min-h-screen">
      <LandingHeader />
      <main id="main">
        <Hero />
        <Stats />
        <div className="px-4 sm:px-7"><WhoPicker /></div>
        <Features />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <Quiz />
        <Faq />
        <Newsletter />
      </main>
      <footer className="mt-16 border-t border-line bg-surface-2">
        <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-4 px-4 py-6 text-small text-muted sm:px-7">
          <span className="flex items-center gap-2"><Icon name="park" className="text-pine-700" /> FamilyRoots · {t("land.footer")}</span>
          <Chips>
            {SECTIONS.map(([id, key]) => <Chip key={id} onClick={() => scrollTo(id)}>{t(key)}</Chip>)}
          </Chips>
        </div>
      </footer>
    </div>
  );
}
