/* Features: every part of FamilyRoots that exists today, grouped by what it is for. */
import PublicLayout from "../../components/PublicLayout";
import { useT } from "../../lib/i18n";
import { FEATURES } from "../../lib/site";
import { CtaBand, FeatureGrid, PageIntro, Section } from "./parts";

const GROUPS = ["heritage", "together", "care"];

export default function Features() {
  const t = useT();
  return (
    <PublicLayout title={t("features.title")}>
      <PageIntro eyebrow={t("features.title")} icon="auto_awesome" title={t("features.h1")} sub={t("features.sub")} />
      {GROUPS.map((g) => (
        <Section key={g} className="mt-12" aria-labelledby={`fg-${g}`}>
          <h2 id={`fg-${g}`} className="text-[clamp(1.3rem,2.4vw,1.75rem)]!">{t(`features.g.${g}`)}</h2>
          <FeatureGrid keys={FEATURES.filter((f) => f[3] === g).map(([k]) => k)} />
        </Section>
      ))}
      <CtaBand />
    </PublicLayout>
  );
}
