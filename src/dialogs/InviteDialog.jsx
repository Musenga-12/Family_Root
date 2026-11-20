/* Invite a relative (Overview, Directory, Administration). The invitation is listed under Family Administration until accepted.
   On a family server the invitation is made straight away, so the message can say truthfully whether it was emailed;
   either way its link can be copied and shared. */
import { useState } from "react";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Field, Icon, Input, Select } from "../components/ui";
import { ME } from "../data";
import { inviteApi } from "../lib/api";
import { copyText, emailOk, todayISO, uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { inviteOf } from "../lib/serverArchive";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";

const DEMO_CODE = "MCK-8294";

export default function InviteDialog() {
  const t = useT();
  const toast = useToast();
  const close = useCloseModal();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rel, setRel] = useState("Cousin");
  const { state, update, server } = useStore();
  const { me: account } = useSession();
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const onServer = server.source === "server";
  const code = onServer ? account?.family_code : DEMO_CODE;

  const send = async () => {
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
    if (onServer) {
      setBusy(true);
      try {
        const made = await inviteApi.create({ name: name.trim(), email: email.trim(), relation: rel });
        server.adopt("invites", { ...inviteOf(made), by: ME });
        const copy = () => copyText(made.link).then((ok) => toast(ok ? t("dlg.invite.linkCopied") : made.link, { icon: "content_copy" }));
        if (made.emailed) toast(t("dlg.invite.emailed", { name: made.name }), { sub: t("dlg.invite.emailedSub", { email: made.email }), icon: "mark_email_read", action: t("dlg.invite.copyLink"), onAction: copy });
        else toast(t("dlg.invite.notEmailed", { name: made.name }), { sub: t("dlg.invite.notEmailedSub"), icon: "link", persist: true, action: t("dlg.invite.copyLink"), onAction: copy });
        close();
      } catch (err) {
        setErrors({ email: err.message });
        document.getElementById("invEmail").focus();
      } finally {
        setBusy(false);
      }
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
      footer={<><CancelButton /><Button variant="primary" icon="send" busy={busy} onClick={send}>{t("dlg.invite.send")}</Button></>}>
      <Field id="invName" label={t("dlg.invite.name")} hint={t("common.required")} error={errors.name}>
        <Input id="invName" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("dlg.invite.namePh")} invalid={!!errors.name} />
      </Field>
      <Field id="invEmail" label={t("dlg.invite.email")} hint={t("dlg.invite.emailHint")} error={errors.email}>
        <Input id="invEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" invalid={!!errors.email} />
      </Field>
      <Field id="invRel" label={t("dlg.invite.rel")}>
        <Select id="invRel" value={rel} onChange={(e) => setRel(e.target.value)}>{["Cousin", "Niece / Nephew", "Sibling", "In-law", "Other"].map((o) => <option key={o} value={o}>{t(`rel.${o}`)}</option>)}</Select>
      </Field>
      {/* The family's own code: the server shows it to Admins only (the demo has the sample's). */}
      {code && (
        <div className="flex items-center gap-3 rounded-[14px] bg-surface-2 p-3">
          <Icon name="key" />
          <div className="min-w-0 flex-1">
            <strong className="text-small">{t("dlg.invite.code", { code })}</strong>
            <p className="text-xsmall text-muted">{t("dlg.invite.codeHelp")}</p>
          </div>
          <Button size="sm" onClick={() => copyText(code).then((ok) => toast(ok ? t("dlg.invite.copied") : code, { icon: "content_copy" }))}>{t("common.copy")}</Button>
        </div>
      )}
    </Dialog>
  );
}
