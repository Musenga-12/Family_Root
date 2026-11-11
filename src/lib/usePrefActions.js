/* Theme and language switching with consistent toast feedback, shared by the top bar, landing page, palette and Settings. */
import { useToast } from "../components/toastContext";
import { LANGS, translate, useT } from "./i18n";
import { useStore } from "./store";

export const THEME_ICON = { light: "light_mode", dark: "dark_mode", system: "contrast" };

export function usePrefActions() {
  const { setPref, dark } = useStore();
  const toast = useToast();
  const t = useT();

  const setTheme = (mode) => {
    setPref("theme", mode);
    toast(t("toast.theme", { mode: t(`theme.${mode}`) }), { icon: THEME_ICON[mode], duration: 2500 });
  };
  // One tap flips what you see: light <-> dark. "Match device" stays available in Settings.
  const cycleTheme = () => setTheme(dark ? "light" : "dark");
  const setLang = (code) => {
    setPref("lang", code);
    const name = LANGS.find((l) => l.code === code)?.name;
    toast(translate(code, "toast.lang", { lang: name }), { icon: "translate", duration: 2500 });
  };
  return { setTheme, cycleTheme, setLang };
}
