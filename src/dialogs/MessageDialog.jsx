/* Private message to a relative (Tree + Directory). It lands in the one-to-one conversation on the Messages screen. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Field, Textarea } from "../components/ui";
import { postMessage, threadIdFor } from "../lib/messages";
import { fullName, useStore } from "../lib/store";

export default function MessageDialog({ person, title, sub, label = "Message", sendLabel = "Send Message", placeholder }) {
  const toast = useToast();
  const close = useCloseModal();
  const { state, update } = useStore();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const send = () => {
    if (!text.trim()) { setError("Please write a message before sending."); document.getElementById("pm").focus(); return; }
    const threadId = threadIdFor(state, [person.id]);
    update((s) => { postMessage(s, { threadId, to: [person.id], title: fullName(person), text: text.trim() }); }, `Sent a message to ${person.first}`);
    toast(`Message sent to ${person.first}`, { icon: "send", action: "Open chat", onAction: () => navigate(`/messages?c=${threadId}`) });
    close();
  };

  return (
    <Dialog title={title || `Private message to ${person.first}`} sub={sub || "Only you and the recipient can read this message."}
      footer={<><CancelButton /><Button variant="primary" icon="send" onClick={send}>{sendLabel}</Button></>}>
      <Field id="pm" label={label} error={error}>
        <Textarea id="pm" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} invalid={!!error} />
      </Field>
    </Dialog>
  );
}
