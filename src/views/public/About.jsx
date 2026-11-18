/* About: why FamilyRoots exists, what it set out to do, how it is designed and who made it. */
import PublicLayout from "../../components/PublicLayout";
import { Card, Icon } from "../../components/ui";
import { useT } from "../../lib/i18n";
import { CtaBand, PageIntro, Section } from "./parts";
import { PagePhoto } from "./photos";

export default function About() {
  const t = useT();
  return (
    <PublicLayout title={t("about.title")}>
      <PageIntro eyebrow={t("about.title")} icon="info" title={t("about.h1")} sub={t("about.sub")}
        photo={<PagePhoto slot="about" alt={t("about.photoAlt")} eager />} />
      <Section className="mt-12 grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-[1.4rem]!">{t("about.why.title")}</h2>
          {t("about.why").map((p) => <p key={p} className="mt-3 text-muted">{p}</p>)}
        </Card>
        <Card>
          <h2 className="text-[1.4rem]!">{t("about.aims.title")}</h2>
          <ul className="m-0 mt-3 grid list-none gap-2.5 p-0">
            {t("about.aims").map((a) => (
              <li key={a} className="flex items-start gap-2.5 text-muted"><Icon name="check_circle" size="sm" className="mt-0.5 text-pine-700 dark:text-mint" />{a}</li>
            ))}
          </ul>
        </Card>
      </Section>
      <Section className="mt-12" aria-labelledby="principles">
        <h2 id="principles" className="text-[clamp(1.4rem,2.6vw,1.9rem)]!">{t("about.principles.title")}</h2>
        <ul className="m-0 mt-5 grid list-none gap-4 p-0 sm:grid-cols-2 md:grid-cols-4">
          {t("about.principles").map(([icon, title, body]) => (
            <li key={title} className="grid content-start gap-2.5 rounded-card border border-line bg-surface p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-sec-soft text-sec-ink"><Icon name={icon} /></span>
              <h3 className="text-[1.08rem]!">{title}</h3>
              <p className="text-small text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section className="mt-12 grid gap-6 md:grid-cols-2">
        <Card tone="soft">
          <h2 className="flex items-center gap-2 text-[1.3rem]!"><Icon name="school" className="text-sec-ink" />{t("about.team.title")}</h2>
          <p className="mt-3 text-muted">{t("about.team")}</p>
        </Card>
        <Card tone="soft">
          <h2 className="flex items-center gap-2 text-[1.3rem]!"><Icon name="construction" className="text-sec-ink" />{t("about.status.title")}</h2>
          <p className="mt-3 text-muted">{t("about.status")}</p>
        </Card>
      </Section>
      <CtaBand />
    </PublicLayout>
  );
}
