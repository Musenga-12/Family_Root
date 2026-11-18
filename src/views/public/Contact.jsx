/* Contact & support: the right place for each kind of question. There is no public support address in the project,
   so nothing pretends to send a message; each card opens the page that really helps. */
import PublicLayout from "../../components/PublicLayout";
import { Button, Card, Icon } from "../../components/ui";
import { useT } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { PageIntro, Section } from "./parts";

// Pages inside the signed-in app: visitors are asked to sign in first.
const PROTECTED = ["/messages", "/privacy", "/settings"];

export default function Contact() {
  const t = useT();
  const { status } = useSession();
  const signedOut = status === "signedOut" || status === "error";
  return (
    <PublicLayout title={t("contact.title")}>
      <PageIntro eyebrow={t("pub.nav.contact")} icon="support_agent" title={t("contact.h1")} sub={t("contact.sub")} />
      <Section className="mt-10">
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 md:grid-cols-3">
          {t("contact.cards").map(([icon, title, body, to, action]) => (
            <li key={title} className="grid content-start gap-3 rounded-card border border-line bg-surface p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-sec-soft text-sec-ink"><Icon name={icon} /></span>
              <h2 className="text-[1.1rem]!">{title}</h2>
              <p className="text-small text-muted">{body}</p>
              <div className="grid gap-1">
                <Button size="sm" className="justify-self-start" to={to}>{action} <Icon name="arrow_forward" size="xs" /></Button>
                {signedOut && PROTECTED.includes(to) && <small className="text-xsmall text-muted">{t("contact.signInFirst")}</small>}
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Section className="mt-10">
        <Card tone="soft" className="flex flex-wrap items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-pine-900 text-mint"><Icon name="school" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.2rem]!">{t("contact.project.title")}</h2>
            <p className="mt-1 text-muted">{t("contact.project")}</p>
          </div>
        </Card>
      </Section>
    </PublicLayout>
  );
}
