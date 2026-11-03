/* Private message to a relative (Tree + Directory). */
import { useState } from "react";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Field, Textarea } from "../components/ui";

export default function MessageDialog({ person, title, sub, label = "Message", sendLabel = "Send Message", placeholder }) {
  const toast = useToast();
  const close = useCloseModal();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const send = () => {
    if (!text.trim()) { setError("Please write a message before sending."); document.getElementById("pm").focus(); return; }
    toast(`Message sent to ${person.first}`, { icon: "send" });
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
