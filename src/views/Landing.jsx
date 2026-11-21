/* Public home page: what FamilyRoots is, what it does and how to start. Open to visitors and signed-in members;
   the header, calls to action and footer follow the sign-in state. Only real features are shown, with no invented
   users, quotes or prices. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PublicLayout from "../components/PublicLayout";
import { Button, Card, Icon, Switch, Tabs, Tag } from "../components/ui";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { CtaBand, FaqList, FeatureGrid, Section, SectionHead, Steps, TrustGrid } from "./public/parts";
import { HeroPhotos, TopicPhotos } from "./public/photos";

/** Visitors to a hosted FamilyRoots can look around the sample family first, without an account (see SessionProvider). */
export function TryDemo({ className }) {
  const t = useT();
  const { status, tryDemo, connected } = useSession();
  const navigate = useNavigate();
  if (!connected || status !== "signedOut") return null;
  return (
    <p className={className}>
      <Button variant="ghost" size="sm" icon="visibility" onClick={() => { tryDemo(); navigate("/overview"); }}>{t("pub.tryDemo")}</Button>
      <span className="text-small text-muted">{t("pub.tryDemoNote")}</span>
    </p>
  );
}

function HeroActions() {
  const t = useT();
  const { status } = useSession();
  if (status === "signedIn") {
    return <Button variant="primary" size="lg" icon="dashboard" to="/overview">{t("pub.dashboard")}</Button>;
  }
  if (status === "demo") {
    return (
      <>
        <Button variant="primary" size="lg" icon="rocket_launch" to="/overview">{t("pub.openDemo")}</Button>
        <Button size="lg" icon="route" to="/how-it-works">{t("home.ctaHow")}</Button>
      </>
    );
  }
  return (
    <>
      <Button variant="primary" size="lg" icon="person_add" to="/register">{t("home.ctaStart")}</Button>
      <Button size="lg" icon="key" to="/join">{t("home.ctaJoin")}</Button>
    </>
  );
}

function Hero() {
  const t = useT();
  const { status } = useSession();
  return (
    <section className="overflow-hidden border-b border-line bg-[linear-gradient(170deg,var(--sec-soft),var(--color-bg)_65%)]">
      <div className="mx-auto grid max-w-300 items-center gap-10 px-4 pt-12 pb-14 sm:px-7 md:grid-cols-[1.05fr_.95fr]">
        <div>
          <Tag tone="mint" icon="shield">{t("home.eyebrow")}</Tag>
          <h1 className="mt-4 text-[clamp(2.2rem,5vw,3.7rem)]! leading-[1.08]">
            {t("home.title")} <span className="block text-terra-ink italic">{t("home.title2")}</span>
          </h1>
          <p className="mt-5 max-w-140 text-[1.08rem] text-muted">{t("home.sub")}</p>
          <div className="mt-7 flex flex-wrap gap-3"><HeroActions /></div>
          <TryDemo className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1" />
          {status === "demo" && <p className="mt-3 text-small text-muted">{t("pub.demoNote")}</p>}
          <ul className="m-0 mt-6 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-small text-muted">
            {["home.trust1", "home.trust2", "home.trust3"].map((k) => (
              <li key={k} className="flex items-center gap-1.5"><Icon name="check_circle" size="sm" className="text-success" />{t(k)}</li>
            ))}
          </ul>
        </div>
        <HeroPhotos />
      </div>
    </section>
  );
}

function Intro() {
  const t = useT();
  const points = [["help", "home.intro.p1"], ["lightbulb", "home.intro.p2"], ["diversity_3", "home.intro.p3"]];
  return (
    <Section className="mt-16" aria-labelledby="introTitle">
      <div className="grid gap-8 md:grid-cols-[.9fr_1.1fr] md:items-start">
        <div>
          <SectionHead eyebrow={t("home.intro.eyebrow")} icon="park" title={<span id="introTitle">{t("home.intro.title")}</span>} />
          <p className="mt-4 text-muted">{t("home.intro.body")}</p>
          <Button className="mt-5" icon="info" to="/about">{t("pub.nav.about")}</Button>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0">
          {points.map(([icon, k]) => (
            <li key={k} className="flex gap-4 rounded-card border border-line bg-surface p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sec-soft text-sec-ink"><Icon name={icon} /></span>
              <span><strong className="block text-[1.05rem]">{t(k)}</strong><span className="mt-1 block text-small text-muted">{t(`${k}d`)}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function WhoPicker() {
  const t = useT();
  const { easy, setEasy } = useStore();
  const [who, setWho] = useState("elder");
  const icons = { elder: "elderly", parent: "family_restroom", young: "school" };
  return (
    <Section className="mt-16">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-tag font-semibold tracking-[.14em] text-sec-ink uppercase">{t("home.who.eyebrow")}</span>
            <h2 className="mt-1">{t("land.who.title")}</h2><p className="mt-1 text-muted">{t("land.who.sub")}</p>
          </div>
          <Tabs role="radiogroup" label={t("land.who.title")} value={who} onChange={setWho}
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
    </Section>
  );
}

export default function Landing() {
  const t = useT();
  const [firstGroup] = t("faq.groups");
  return (
    <PublicLayout title={t("home.eyebrow")}>
      <Hero />
      <Intro />
      <Section className="mt-16" aria-labelledby="keepTitle">
        <SectionHead eyebrow={t("home.keep.eyebrow")} icon="photo_library" title={<span id="keepTitle">{t("home.keep.title")}</span>} sub={t("home.keep.sub")} />
        <TopicPhotos />
      </Section>
      <Section className="mt-16" aria-labelledby="featTitle">
        <SectionHead eyebrow={t("home.feat.eyebrow")} icon="auto_awesome" title={<span id="featTitle">{t("home.feat.title")}</span>} sub={t("home.feat.sub")}>
          <Button icon="arrow_forward" to="/features">{t("home.feat.all")}</Button>
        </SectionHead>
        <FeatureGrid keys={["tree", "memories", "stories", "timeline", "messages", "calendar"]} />
      </Section>
      <Section className="mt-16" aria-labelledby="howTitle">
        <SectionHead eyebrow={t("home.how.eyebrow")} icon="route" title={<span id="howTitle">{t("home.how.title")}</span>}>
          <Button icon="arrow_forward" to="/how-it-works">{t("pub.nav.how")}</Button>
        </SectionHead>
        <Steps />
      </Section>
      <WhoPicker />
      <Section className="mt-16" aria-labelledby="trustTitle">
        <SectionHead eyebrow={t("home.trust.eyebrow")} icon="verified_user" title={<span id="trustTitle">{t("home.trust.title")}</span>} />
        <TrustGrid />
      </Section>
      <Section className="mt-16 max-w-225" aria-labelledby="faqTitle">
        <SectionHead title={<span id="faqTitle">{t("home.faq.title")}</span>}>
          <Button icon="arrow_forward" to="/faq">{t("home.faq.all")}</Button>
        </SectionHead>
        <div className="mt-5"><FaqList groups={[firstGroup]} showGroups={false} /></div>
      </Section>
      <CtaBand />
    </PublicLayout>
  );
}
