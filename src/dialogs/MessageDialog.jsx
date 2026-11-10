/* Private message to a relative (Tree + Directory). It lands in the one-to-one conversation on the Messages screen. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Field, Textarea } from "../components/ui";
import { useT } from "../lib/i18n";
import { postMessage, threadIdFor } from "../lib/messages";
import { fullName, useStore } from "../lib/store";

export default function MessageDialog({ person, title, sub, label, sendLabel, placeholder }) {
  const t = useT();
  const toast = useToast();
  const close = useCloseModal();
  const { state, update } = useStore();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const send = () => {
    if (!text.trim()) { setError(t("dlg.msg.err")); document.getElementById("pm").focus(); return; }
    const threadId = threadIdFor(state, [person.id]);
    update((s) => { postMessage(s, { threadId, to: [person.id], title: fullName(person), text: text.trim() }); }, t("dlg.msg.history", { name: person.first }));
    toast(t("dlg.msg.sent", { name: person.first }), { icon: "send", action: t("dlg.msg.open"), onAction: () => navigate(`/messages?c=${threadId}`) });
    close();
  };

  return (
    <Dialog sec="messages" title={title || t("dlg.msg.title", { name: person.first })} sub={sub || t("dlg.msg.sub")}
      footer={<><CancelButton /><Button variant="primary" icon="send" onClick={send}>{sendLabel ?? t("dlg.msg.send")}</Button></>}>
      <Field id="pm" label={label ?? t("dlg.msg.label")} error={error}>
        <Textarea id="pm" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} invalid={!!error} />
      </Field>
    </Dialog>
  );
}
