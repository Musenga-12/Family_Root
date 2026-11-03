/* Settings & Accessibility: theme, accent, text size, motion, language, notifications, privacy defaults and data. */
import { useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Card, Eyebrow, Field, Hero, Icon, IconBox, Select, Switch, Tabs, Tag } from "../components/ui";
import { cx } from "../lib/format";
import { LANGS, useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { THEME_ICON, usePrefActions } from "../lib/usePrefActions";

const THEME_SWATCH = {
  light: { background: "#f2f7f4", color: "#143d30" },
  dark: { background: "#0c1512", color: "#9fe6c6" },
  system: { background: "linear-gradient(90deg, #f2f7f4 50%, #0c1512 50%)", color: "#3c7a63" },
};
const ACCENTS = [["forest", "#143d30", "#9fe6c6"], ["ocean", "#143a52", "#9fd4f0"], ["plum", "#3d1f48", "#e2bdf0"], ["clay", "#4c2617", "#f6c7a6"]];

function Section({ icon, title, children }) {
  return (
    <Card aria-label={title} className="grid content-start gap-4">
      <h2 className="flex items-center gap-2.5 text-[1.2rem]!"><IconBox icon={icon} /> {title}</h2>
      {children}
    </Card>
  );
}

export default function Settings() {
  const { prefs, setPref, easy, setEasy, state, reset } = useStore();
  const { setTheme, setLang } = usePrefActions();
  const { confirm } = useModal();
  const toast = useToast();
  const t = useT();
  const saved = () => toast(t("settings.saved"), { icon: "check_circle", duration: 1800 });
  const set = (k) => (v) => { setPref(k, v); saved(); };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), prefs, ...state }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "familyroots-archive.json" });
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t("settings.exported"), { icon: "download" });
  };

  return (
    <>
      <Hero className="flex flex-wrap items-center gap-6">
        <div className="min-w-65 flex-1">
          <Eyebrow icon="tune">{t("settings.eyebrow")}</Eyebrow>
          <h1 className="mt-2">{t("h1.settings")}</h1>
          <p className="mt-2 text-muted">{t("settings.sub")}</p>
        </div>
        {/* Live preview of the current theme + accent */}
        <div aria-label={t("settings.preview")} className="w-full max-w-85 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between"><Eyebrow>{t("settings.preview")}</Eyebrow><Tag tone="mint" icon={THEME_ICON[prefs.theme]}>{t(`theme.${prefs.theme}`)}</Tag></div>
          <p className="mt-2 text-small text-muted">{t("settings.previewText")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon="favorite">Primary</Button>
            <Button variant="mint" size="sm">Mint</Button>
            <Tag tone="gold">Gold</Tag><Tag tone="rose">Rose</Tag>
          </div>
        </div>
      </Hero>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Section icon="palette" title={t("settings.appearance")}>
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-[.86rem] font-semibold">{t("settings.theme")}</legend>
            <div role="radiogroup" aria-label={t("settings.theme")} className="grid grid-cols-3 gap-2.5">
              {["light", "dark", "system"].map((m) => (
                <button key={m} type="button" role="radio" aria-checked={prefs.theme === m} onClick={() => setTheme(m)}
                  className={cx("grid cursor-pointer justify-items-center gap-2 rounded-2xl border-2 p-3 text-[.84rem] text-ink",
                    prefs.theme === m ? "border-pine-700 bg-mint-100" : "border-line bg-surface hover:border-pine-600")}>
                  {/* Fixed colours on purpose: each swatch previews its theme regardless of the current one. */}
                  <span className="grid h-14 w-full place-items-center overflow-hidden rounded-lg border border-line" style={THEME_SWATCH[m]}>
                    <Icon name={THEME_ICON[m]} />
                  </span>
                  {t(`theme.${m}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-[.86rem] font-semibold">{t("settings.accent")}</legend>
            <div role="radiogroup" aria-label={t("settings.accent")} className="flex flex-wrap gap-3">
              {ACCENTS.map(([k, dark, light]) => (
                <button key={k} type="button" role="radio" aria-checked={prefs.accent === k} onClick={() => set("accent")(k)}
                  className={cx("flex cursor-pointer items-center gap-2 rounded-full border-2 py-1.5 pr-3.5 pl-1.5 text-[.84rem] text-ink",
                    prefs.accent === k ? "border-pine-700" : "border-line hover:border-pine-600")}>
                  <span className="grid size-7 place-items-center rounded-full" style={{ background: `linear-gradient(135deg, ${dark} 50%, ${light} 50%)` }}>
                    {prefs.accent === k && <Icon name="check" size="xs" className="text-white" />}
                  </span>
                  {t(`settings.accent.${k}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <div className="mb-2 text-[.86rem] font-semibold">{t("settings.text")}</div>
            <Tabs role="radiogroup" label={t("settings.text")} value={prefs.text} onChange={set("text")} className="grid! grid-cols-3"
              items={[["sm", <span key="sm" className="text-[.8rem]">A · {t("view.small")}</span>], ["md", <span key="md">A · {t("view.medium")}</span>], ["lg", <span key="lg" className="text-[1.05rem]">A · {t("view.large")}</span>]]} />
          </div>

          <div className="grid gap-4 border-t border-line pt-4">
            <Switch id="setEasy" checked={easy} onChange={setEasy} label={t("settings.easy")} help={t("settings.easyHelp")} />
            <Switch id="setMotion" checked={prefs.motion === "reduced"} onChange={(v) => set("motion")(v ? "reduced" : "full")} label={t("settings.motion")} help={t("settings.motionHelp")} />
            <Switch id="setSidebar" checked={prefs.sidebar === "compact"} onChange={(v) => set("sidebar")(v ? "compact" : "full")} label={t("settings.sidebar")} help={t("settings.sidebarHelp")} />
          </div>
        </Section>

        <div className="grid content-start gap-5">
          <Section icon="translate" title={t("settings.language")}>
            <p className="text-small text-muted">{t("settings.languageHelp")}</p>
            <div role="radiogroup" aria-label={t("settings.language")} className="grid gap-2 sm:grid-cols-2">
              {LANGS.map((l) => (
                <button key={l.code} type="button" role="radio" aria-checked={prefs.lang === l.code} onClick={() => setLang(l.code)}
                  className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 text-left text-ink",
                    prefs.lang === l.code ? "border-pine-700 bg-mint-100" : "border-line bg-surface hover:border-pine-600")}>
                  <span className="grid size-9 place-items-center rounded-lg bg-pine-900 text-[.78rem] font-bold text-mint">{l.short}</span>
                  <strong className="flex-1">{l.name}</strong>
                  {prefs.lang === l.code && <Icon name="check_circle" className="text-pine-700" />}
                </button>
              ))}
            </div>
          </Section>

          <Section icon="notifications" title={t("settings.notifications")}>
            <Switch id="nBday" checked={prefs.notify.birthdays} onChange={(v) => set("notify")({ ...prefs.notify, birthdays: v })}
              label={t("settings.notify.birthdays")} help={t("settings.notify.birthdaysHelp")} />
            <Switch id="nStory" checked={prefs.notify.stories} onChange={(v) => set("notify")({ ...prefs.notify, stories: v })}
              label={t("settings.notify.stories")} help={t("settings.notify.storiesHelp")} />
            <div>
              <div className="mb-2 text-[.86rem] font-semibold">{t("settings.digest")}</div>
              <Tabs role="radiogroup" dark label={t("settings.digest")} value={prefs.notify.digest} onChange={(v) => set("notify")({ ...prefs.notify, digest: v })}
                items={["off", "daily", "weekly", "monthly"].map((k) => [k, t(`settings.digest.${k}`)])} />
            </div>
          </Section>

          <Section icon="shield_lock" title={t("settings.privacy")}>
            <Field id="setVis" label={t("settings.visibility")}>
              <Select id="setVis" value={prefs.visibility} onChange={(e) => set("visibility")(e.target.value)}>
                <option value="All Family Branches">{t("settings.vis.all")}</option>
                <option value="Immediate Family">{t("settings.vis.immediate")}</option>
                <option value="Only Me (draft)">{t("settings.vis.me")}</option>
              </Select>
            </Field>
          </Section>

          <Section icon="database" title={t("settings.data")}>
            <div className="flex flex-wrap gap-2.5">
              <Button icon="download" onClick={exportData}>{t("settings.export")}</Button>
              <Button variant="danger" icon="restart_alt"
                onClick={() => confirm(t("settings.reset") + "?", t("settings.resetHelp"), t("settings.reset"),
                  () => { reset(); toast("Demo data reset", { sub: "The sample Mackenzie family has been restored.", icon: "restart_alt" }); })}>
                {t("settings.reset")}
              </Button>
            </div>
            <p className="text-xsmall text-muted">{t("settings.resetHelp")}</p>
          </Section>
        </div>
      </div>
    </>
  );
}
