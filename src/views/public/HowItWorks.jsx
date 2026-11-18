/* How it works: the four steps, the three ways into a family and the roles members can have. */
import PublicLayout from "../../components/PublicLayout";
import { Button, Icon } from "../../components/ui";
import { useT } from "../../lib/i18n";
import { CtaBand, PageIntro, Section, Steps } from "./parts";

// Where each of the three ways in starts (an invitation starts from the link in the relative's message).
const WAY_LINKS = ["/register", null, "/join"];

export default function HowItWorks() {
  const t = useT();
  return (
    <PublicLayout title={t("how.title")}>
      <PageIntro eyebrow={t("how.title")} icon="route" title={t("how.h1")} sub={t("how.sub")} />
      <Section className="mt-6"><Steps /></Section>
      <Section className="mt-14" aria-labelledby="ways">
        <h2 id="ways" className="text-[clamp(1.4rem,2.6vw,1.9rem)]!">{t("how.ways.title")}</h2>
        <ul className="m-0 mt-5 grid list-none gap-4 p-0 md:grid-cols-3">
          {t("how.ways").map(([icon, title, body], i) => (
            <li key={title} className="grid content-start gap-3 rounded-card border border-line bg-surface p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-pine-900 text-mint"><Icon name={icon} /></span>
              <h3 className="text-[1.1rem]!">{title}</h3>
              <p className="text-small text-muted">{body}</p>
              {WAY_LINKS[i] && <Button variant="ghost" size="sm" className="-ml-2 justify-self-start" to={WAY_LINKS[i]}>{title} <Icon name="arrow_forward" size="xs" /></Button>}
            </li>
          ))}
        </ul>
      </Section>
      <Section className="mt-14" aria-labelledby="roles">
        <h2 id="roles" className="text-[clamp(1.4rem,2.6vw,1.9rem)]!">{t("how.roles.title")}</h2>
        <p className="mt-2 max-w-170 text-muted">{t("how.roles.sub")}</p>
        <dl className="m-0 mt-5 grid gap-3 sm:grid-cols-2">
          {t("how.roles").map(([role, body]) => (
            <div key={role} className="rounded-2xl border border-line bg-surface p-4">
              <dt className="font-semibold">{role}</dt>
              <dd className="m-0 mt-1 text-small text-muted">{body}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <CtaBand />
    </PublicLayout>
  );
}
