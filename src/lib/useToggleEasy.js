import { useToast } from "../components/toastContext";
import { useStore } from "./store";

/** Shared by the top-bar button, Overview and Settings so feedback is consistent. */
export function useToggleEasy() {
  const { easy, setEasy } = useStore();
  const toast = useToast();
  return () => {
    const on = !easy;
    setEasy(on);
    toast(on ? "Easy-to-Read mode on" : "Easy-to-Read mode off", {
      sub: on ? "Larger 18pt text, stronger contrast, bigger touch targets." : "Standard text size restored.", icon: "text_increase",
    });
  };
}
