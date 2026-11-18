import { useToast } from "../components/toastContext";
import { useT } from "./i18n";
import { useStore } from "./store";

/** Shared by the app's top bar, the public site header, Overview and Settings, so the feedback is the same everywhere. */
export function useToggleEasy() {
  const { easy, setEasy } = useStore();
  const toast = useToast();
  const t = useT();
  return () => {
    const on = !easy;
    setEasy(on);
    toast(t(on ? "toast.easyOn" : "toast.easyOff"), { sub: t(on ? "toast.easyOnSub" : "toast.easyOffSub"), icon: "text_increase" });
  };
}
