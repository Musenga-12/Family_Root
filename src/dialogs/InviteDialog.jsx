/* Invite a relative (Overview, Directory, Administration). The invitation is listed under Family Administration until accepted. */
import { useState } from "react";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Field, Icon, Input, Select } from "../components/ui";
import { ME } from "../data";
import { emailOk, todayISO, uid } from "../lib/format";
import { useStore } from "../lib/store";

export default function InviteDialog() {
  const toast = useToast();
  const close = useCloseModal();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rel, setRel] = useState("Cousin");
  const { state, update } = useStore();
  const [errors, setErrors] = useState({});

  const send = () => {
    const e = {
      name: name.trim() ? "" : "Please enter their name so the custodian knows who is joining.",
      email: emailOk(email.trim()) ? "" : "That email doesn't look complete — it should look like name@example.com.",
    };
    setErrors(e);
    if (e.name || e.email) { document.getElementById(e.name ? "invName" : "invEmail").focus(); return; }
    if (state.invites?.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) {
      setErrors({ email: "This address already has an open invitation. You can resend it from Family Administration." });
      document.getElementById("invEmail").focus();
      return;
    }
    const inv = { id: uid("i"), name: name.trim(), email: email.trim(), relation: rel, sent: todayISO(), by: ME };
    update((s) => { s.invites.push(inv); }, `Invited ${inv.name}`);
    toast(`Invitation sent to ${inv.name}`, { sub: "An admin or custodian confirms their access when they accept.", icon: "mark_email_read",
      action: "Undo", onAction: () => update((s) => { s.invites = s.invites.filter((x) => x.id !== inv.id); }, `Cancelled the invitation to ${inv.name}`) });
    close();
  };

  return (
    <Dialog sec="directory" title="Invite a relative" sub="We only ask for what's needed to send the invite. A custodian approves every new member."
      footer={<><CancelButton /><Button variant="primary" icon="send" onClick={send}>Send Invitation</Button></>}>
      <Field id="invName" label="Their name" hint="Required" error={errors.name}>
        <Input id="invName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fiona Campbell" invalid={!!errors.name} />
      </Field>
      <Field id="invEmail" label="Email address" hint="Required — used only for this invite" error={errors.email}>
        <Input id="invEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" invalid={!!errors.email} />
      </Field>
      <Field id="invRel" label="How are they related to you?">
        <Select id="invRel" value={rel} onChange={(e) => setRel(e.target.value)}>{["Cousin", "Niece / Nephew", "Sibling", "In-law", "Other"].map((o) => <option key={o}>{o}</option>)}</Select>
      </Field>
      <div className="flex items-center gap-3 rounded-[14px] bg-surface-2 p-3">
        <Icon name="key" />
        <div className="min-w-0 flex-1">
          <strong className="text-small">Family Code: MCK-8294</strong>
          <p className="text-xsmall text-muted">They can also join by entering this code on the sign-up screen.</p>
        </div>
        <Button size="sm" onClick={() => { navigator.clipboard?.writeText("MCK-8294"); toast("Family code copied", { icon: "content_copy" }); }}>Copy</Button>
      </div>
    </Dialog>
  );
}
