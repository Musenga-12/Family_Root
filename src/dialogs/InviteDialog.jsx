/* Invite a relative (Overview, Directory, Administration). The invitation is listed under Family Administration until accepted. */
import { useState } from "react";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Field, Icon, Input, Select } from "../components/ui";
import { ME } from "../data";
import { emailOk, todayISO, uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";

export default function InviteDialog() {
  const t = useT();
  const toast = useToast();
  const close = useCloseModal();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rel, setRel] = useState("Cousin");
  const { state, update } = useStore();
  const [errors, setErrors] = useState({});

  const send = () => {
    const e = {
      name: name.trim() ? "" : t("dlg.invite.errName"),
      email: emailOk(email.trim()) ? "" : t("dlg.invite.errEmail"),
    };
    setErrors(e);
    if (e.name || e.email) { document.getElementById(e.name ? "invName" : "invEmail").focus(); return; }
    if (state.invites?.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) {
      setErrors({ email: t("dlg.invite.errDup") });
      document.getElementById("invEmail").focus();
      return;
    }
    const inv = { id: uid("i"), name: name.trim(), email: email.trim(), relation: rel, sent: todayISO(), by: ME };
    update((s) => { s.invites.push(inv); }, t("dlg.invite.history", { name: inv.name }));
    toast(t("dlg.invite.sent", { name: inv.name }), { sub: t("dlg.invite.sentSub"), icon: "mark_email_read",
      action: t("common.undo"), onAction: () => update((s) => { s.invites = s.invites.filter((x) => x.id !== inv.id); }, t("dlg.invite.historyUndo", { name: inv.name })) });
    close();
  };

  return (
    <Dialog sec="directory" title={t("dlg.invite.title")} sub={t("dlg.invite.sub")}
      footer={<><CancelButton /><Button variant="primary" icon="send" onClick={send}>{t("dlg.invite.send")}</Button></>}>
      <Field id="invName" label={t("dlg.invite.name")} hint={t("common.required")} error={errors.name}>
        <Input id="invName" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("dlg.invite.namePh")} invalid={!!errors.name} />
      </Field>
      <Field id="invEmail" label={t("dlg.invite.email")} hint={t("dlg.invite.emailHint")} error={errors.email}>
        <Input id="invEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" invalid={!!errors.email} />
      </Field>
      <Field id="invRel" label={t("dlg.invite.rel")}>
        <Select id="invRel" value={rel} onChange={(e) => setRel(e.target.value)}>{["Cousin", "Niece / Nephew", "Sibling", "In-law", "Other"].map((o) => <option key={o} value={o}>{t(`rel.${o}`)}</option>)}</Select>
      </Field>
      <div className="flex items-center gap-3 rounded-[14px] bg-surface-2 p-3">
        <Icon name="key" />
        <div className="min-w-0 flex-1">
          <strong className="text-small">{t("dlg.invite.code", { code: "MCK-8294" })}</strong>
          <p className="text-xsmall text-muted">{t("dlg.invite.codeHelp")}</p>
        </div>
        <Button size="sm" onClick={() => { navigator.clipboard?.writeText("MCK-8294"); toast(t("dlg.invite.copied"), { icon: "content_copy" }); }}>{t("common.copy")}</Button>
      </div>
    </Dialog>
  );
}
