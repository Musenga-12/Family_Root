/* FAQ: every question, grouped and searchable. */
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";
import { useT } from "../../lib/i18n";
import { CtaBand, FaqList, PageIntro, Section } from "./parts";

export default function Faq() {
  const t = useT();
  return (
    <PublicLayout title={t("faq.title")}>
      <PageIntro eyebrow={t("pub.nav.faq")} icon="help" title={t("faq.h1")} sub={t("faq.sub")}>
        <Button className="mt-5" icon="support_agent" to="/contact">{t("contact.title")}</Button>
      </PageIntro>
      <Section className="mt-10 max-w-225"><FaqList groups={t("faq.groups")} search /></Section>
      <CtaBand />
    </PublicLayout>
  );
}
