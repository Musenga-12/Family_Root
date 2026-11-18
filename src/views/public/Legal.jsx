/* Privacy policy and Terms of use: plain-language pages built from the same list of sections. */
import PublicLayout from "../../components/PublicLayout";
import { Icon } from "../../components/ui";
import { useT } from "../../lib/i18n";
import { PageIntro, Section } from "./parts";

const UPDATED = "18 November 2026";

function LegalPage({ k, icon }) {
  const t = useT();
  const sections = t(`${k}.sections`);
  // Hash routing: in-page links scroll instead of changing the address.
  const jump = (i) => (e) => { e.preventDefault(); document.getElementById(`${k}-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return (
    <PublicLayout title={t(`${k}.title`)}>
      <PageIntro eyebrow={t(`${k}.title`)} icon={icon} title={t(`${k}.h1`)} sub={t("pub.updated", { date: UPDATED })} />
      <Section className="mt-10 max-w-200">
        <p className="flex items-start gap-2.5 rounded-2xl bg-gold-100 p-4 text-small text-gold-ink"><Icon name="info" size="sm" />{t("legal.notice")}</p>
        <nav aria-label={t(`${k}.title`)} className="mt-6">
          <ol className="m-0 grid gap-1 pl-5 text-small">
            {sections.map(([h], i) => <li key={h}><a href={`#${k}-${i}`} onClick={jump(i)}>{h}</a></li>)}
          </ol>
        </nav>
        {sections.map(([h, paras], i) => (
          <section key={h} id={`${k}-${i}`} className="mt-8 scroll-mt-24">
            <h2 className="text-[1.35rem]!">{i + 1}. {h}</h2>
            {paras.map((p) => <p key={p} className="mt-3 text-muted">{p}</p>)}
          </section>
        ))}
      </Section>
    </PublicLayout>
  );
}

export const PrivacyPolicy = () => <LegalPage k="privacyPolicy" icon="policy" />;
export const Terms = () => <LegalPage k="terms" icon="gavel" />;
