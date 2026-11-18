/* Features: every part of FamilyRoots that exists today, grouped by what it is for. */
import PublicLayout from "../../components/PublicLayout";
import { useT } from "../../lib/i18n";
import { FEATURES } from "../../lib/site";
import { CtaBand, FeatureGrid, PageIntro, Section } from "./parts";
import { PagePhoto } from "./photos";

const GROUPS = ["heritage", "together", "care"];

export default function Features() {
  const t = useT();
  return (
    <PublicLayout title={t("features.title")}>
      <PageIntro eyebrow={t("features.title")} icon="auto_awesome" title={t("features.h1")} sub={t("features.sub")} />
      {GROUPS.map((g) => (
        <Section key={g} className="mt-12" aria-labelledby={`fg-${g}`}>
          {/* Each group opens with a photo of what it is for: heritage, time together, care. */}
          <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
            <div className="min-w-0">
              <h2 id={`fg-${g}`} className="text-[clamp(1.3rem,2.4vw,1.75rem)]!">{t(`features.g.${g}`)}</h2>
              <p className="mt-2 max-w-140 text-muted">{t(`features.gsub.${g}`)}</p>
            </div>
            <PagePhoto slot={`features-${g}`} alt={t(`features.photo.${g}`)} aspect="aspect-4/3 max-md:aspect-16/9" className="rounded-card! shadow-card!" />
          </div>
          <FeatureGrid keys={FEATURES.filter((f) => f[3] === g).map(([k]) => k)} />
        </Section>
      ))}
      <CtaBand />
    </PublicLayout>
  );
}
