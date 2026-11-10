/* Settings & Accessibility: theme, accent, text size, motion, language, feedback & speech, notifications, privacy defaults, help and data. */
import { useNavigate } from "react-router-dom";
import { useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Card, Eyebrow, Field, Hero, Icon, IconBox, Select, Switch, Tabs, Tag } from "../components/ui";
import { cue } from "../lib/feedback";
import { cx } from "../lib/format";
import { LANGS, useT } from "../lib/i18n";
import { canSpeak, SpeechRec, useSpeech } from "../lib/speech";
import { useInstall } from "../lib/useInstall";
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
  const { prefs, setPref, easy, setEasy, state, reset, recent, clearRecent, past } = useStore();
  const { speak } = useSpeech();
  const app = useInstall();
  const navigate = useNavigate();
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
                    prefs.theme === m ? "border-sec bg-sec-soft shadow-[0_6px_18px_-10px_var(--sec)]" : "lift border-line bg-surface")}>
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
                    prefs.accent === k ? "border-sec bg-sec-soft shadow-[0_6px_18px_-10px_var(--sec)]" : "lift border-line bg-surface")}>
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
                    prefs.lang === l.code ? "border-sec bg-sec-soft shadow-[0_6px_18px_-10px_var(--sec)]" : "lift border-line bg-surface")}>
                  <span className="grid size-9 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--sec),var(--sec-ink))] text-[.78rem] font-bold text-sec-on">{l.short}</span>
                  <strong className="flex-1">{l.name}</strong>
                  {prefs.lang === l.code && <Icon name="check_circle" className="text-pine-700" />}
                </button>
              ))}
            </div>
          </Section>

          <Section icon="hearing" title={t("settings.feedback")}>
            <p className="text-small text-muted">{t("settings.feedbackHelp")}</p>
            <Switch id="setSound" checked={prefs.sound} onChange={(v) => { setPref("sound", v); if (v) cue("success", { force: true }); saved(); }}
              label={t("settings.sound")} help={t("settings.soundHelp")} />
            <Switch id="setHaptics" checked={prefs.haptics} onChange={(v) => { setPref("haptics", v); if (v) cue("tap", { force: true }); saved(); }}
              label={t("settings.haptics")} help={"vibrate" in navigator ? t("settings.hapticsHelp") : t("settings.hapticsNone")} />
            <div className="flex flex-wrap gap-2">
              {[["success", "check_circle"], ["error", "error"], ["info", "info"]].map(([k, icon]) => (
                <Button key={k} size="sm" icon={icon} onClick={() => cue(k, { force: true })}>{t(`settings.test.${k}`)}</Button>
              ))}
            </div>
            {canSpeak && (
              <div className="grid gap-2 border-t border-line pt-4">
                <Field id="setRate" label={t("settings.speechRate")} hint={`${prefs.speechRate}×`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xsmall text-muted">{t("settings.slower")}</span>
                    <input id="setRate" type="range" min="0.6" max="1.6" step="0.1" value={prefs.speechRate}
                      aria-valuetext={`${prefs.speechRate} times normal speed`} onChange={(e) => setPref("speechRate", +e.target.value)} className="flex-1" />
                    <span className="text-xsmall text-muted">{t("settings.faster")}</span>
                  </div>
                </Field>
                <Button size="sm" icon="volume_up" className="justify-self-start" onClick={() => speak(t("settings.speechSample"))}>{t("settings.speechTest")}</Button>
              </div>
            )}
            <p className="text-xsmall text-muted">
              <Icon name={SpeechRec ? "mic" : "mic_off"} size="xs" /> {SpeechRec ? t("settings.voiceOk") : t("settings.voiceNone")}
            </p>
          </Section>

          <Section icon="school" title={t("settings.help")}>
            <div className="flex flex-wrap gap-2.5">
              <Button icon="tour" onClick={() => { setPref("tourDone", false); navigate("/overview"); }}>{t("tour.restart")}</Button>
              <Button icon="history_toggle_off" disabled={!recent.length}
                onClick={() => { clearRecent(); toast(t("settings.recentCleared"), { icon: "history_toggle_off", duration: 2500 }); }}>
                {t("settings.clearRecent")} ({recent.length})
              </Button>
            </div>
            <p className="text-xsmall text-muted">{t("settings.helpNote", { n: past.length })}</p>
            <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
              {app.status === "installed" ? (
                <p className="flex items-center gap-2 text-small"><Icon name="task_alt" className="text-pine-700" /> FamilyRoots is installed on this device.</p>
              ) : (
                <>
                  <Button icon="install_desktop" disabled={app.status !== "available"}
                    onClick={async () => { if (await app.install()) toast("FamilyRoots installed", { sub: "Open it from your home screen or apps list.", icon: "install_desktop" }); }}>
                    Install FamilyRoots app
                  </Button>
                  {app.status !== "available" && <span className="text-xsmall text-muted">Open FamilyRoots from its web address in Chrome, Edge or Safari to install it.</span>}
                </>
              )}
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
                  () => { reset(); toast("Sample family restored", { sub: "The Mackenzie family archive is back. Use Undo if you didn't mean to.", icon: "restart_alt" }); })}>
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
