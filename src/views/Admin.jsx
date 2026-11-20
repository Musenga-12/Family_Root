/* Family Administration: who has access and with which role, join requests, invitations, and records awaiting verification. */
import { Link } from "react-router-dom";
import { useState } from "react";
import { CancelButton, Dialog } from "../components/Modal";
import { useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Avatar, Button, Card, Empty, Icon, IconBox, IconButton, PageHeader, Record, SectionTitle, Select, Stat, Tag } from "../components/ui";
import { ME } from "../data";
import InviteDialog from "../dialogs/InviteDialog";
import { api } from "../lib/api";
import { inviteOf } from "../lib/serverArchive";
import { copyText, fmtDate, todayISO, uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { fullName, useStore } from "../lib/store";

/** Roles from most to least access; names and what each can do are role.<Role> and role.<Role>.d (shown so nobody has to remember it). */
const ROLES = [["Admin", "admin_panel_settings"], ["Custodian", "verified_user"], ["Contributor", "edit_note"], ["Viewer", "visibility"]];
const ROLE_ICON = Object.fromEntries(ROLES.map(([r, i]) => [r, i]));

/** A one-time link for a relative who can't sign in (forgotten password, or no email from this server): it works once,
 *  for 3 days, and is passed on in person, by phone or by message. */
export function ResetLinkDialog({ member, name }) {
  const t = useT();
  const toast = useToast();
  const [state, setState] = useState({ busy: false, link: null, expires: null, error: "" });
  const make = async () => {
    setState({ busy: true, link: null, expires: null, error: "" });
    try {
      const r = await api(`/members/${member.userId}/reset-link`, { method: "POST" });
      setState({ busy: false, link: r.link, expires: r.expires, error: "" });
    } catch (e) { setState({ busy: false, link: null, expires: null, error: e.message }); }
  };
  const copy = () => copyText(state.link).then((ok) => toast(ok ? t("adm.resetCopied") : state.link, { icon: "content_copy" }));
  return (
    <Dialog title={t("adm.resetTitle", { name })} sub={t("adm.resetSub")}
      footer={<><CancelButton>{t("common.close")}</CancelButton>
        {state.link ? <Button variant="primary" icon="content_copy" onClick={copy}>{t("dlg.invite.copyLink")}</Button>
          : <Button variant="primary" icon="lock_reset" busy={state.busy} onClick={make}>{t("adm.resetMake")}</Button>}</>}>
      {state.error && <p role="alert" className="rounded-xl border border-rose bg-surface-2 p-3 text-small text-rose">{state.error}</p>}
      {state.link && (
        <div className="grid gap-2">
          <label htmlFor="resetLink" className="text-small font-semibold">{t("adm.resetLink")}</label>
          <input id="resetLink" readOnly value={state.link} onFocus={(e) => e.target.select()}
            className="w-full rounded-xl border border-line bg-surface-2 p-3 font-mono text-xsmall text-ink" />
          <p className="text-xsmall text-muted">{t("adm.resetExpires", { date: new Date(state.expires).toLocaleString() })}</p>
        </div>
      )}
    </Dialog>
  );
}

function RequestCard({ r }) {
  const { person, update, kin } = useStore();
  const { confirm } = useModal();
  const toast = useToast();
  const t = useT();
  const [role, setRole] = useState("Viewer");
  const approve = () => {
    const m = { id: uid("u"), name: r.name, role, lastActive: null, joined: todayISO() };
    update((s) => { s.requests = s.requests.filter((x) => x.id !== r.id); s.members.push(m); }, t("adm.hApproved", { name: r.name, role: t(`role.${role}`) }));
    toast(t("adm.canJoin", { name: r.name }), { sub: t("adm.canJoinSub", { role: t(`role.${role}`) }), icon: "how_to_reg", action: t("common.undo"),
      onAction: () => update((s) => { s.members = s.members.filter((x) => x.id !== m.id); s.requests.push(r); }, t("adm.hUndoApprove", { name: r.name })) });
  };
  const decline = () => confirm(t("adm.declineQ", { name: r.name }), t("adm.declineBody"), t("adm.decline"), () => {
    update((s) => { s.requests = s.requests.filter((x) => x.id !== r.id); }, t("adm.hDeclined", { name: r.name }));
    toast(t("adm.declined"), { sub: r.name, icon: "person_remove", action: t("common.undo"), onAction: () => update((s) => { s.requests.push(r); }, t("adm.hRestoreReq", { name: r.name })) });
  });
  return (
    <article className="grid gap-3 rounded-[18px] border border-gold/50 bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3>{r.name}</h3>
          <p className="text-small text-muted">{t("adm.asked", { relation: kin(r.relation), date: fmtDate(r.date) })}</p>
        </div>
        <Tag tone="gold" icon="pending">{t("adm.waiting")}</Tag>
      </div>
      {r.note && <p className="rounded-xl bg-surface-2 p-3 text-small">“{r.note}”</p>}
      <p className="flex items-center gap-2 text-small"><Avatar p={person(r.vouchedBy)} className="size-7! rounded-lg! text-tag!" /> {t("adm.vouched", { name: fullName(person(r.vouchedBy)) })}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xsmall font-semibold" htmlFor={`role-${r.id}`}>{t("adm.giveRole")}
          <Select id={`role-${r.id}`} className="w-auto!" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.filter(([x]) => x !== "Admin").map(([x]) => <option key={x} value={x}>{t(`role.${x}`)}</option>)}
          </Select>
        </label>
        <span className="flex-1" />
        <Button icon="close" onClick={decline}>{t("adm.decline")}</Button>
        <Button variant="primary" icon="how_to_reg" onClick={approve}>{t("adm.approve")}</Button>
      </div>
    </article>
  );
}

export default function Admin() {
  const { state, person, update, kin, server } = useStore();
  const { me: account } = useSession();
  // Admin-made reset links: on a family server, for an Admin, for anyone but themselves.
  const canReset = (m) => server.source === "server" && account?.role === "Admin" && m.userId && !m.you;
  const { open, confirm } = useModal();
  const toast = useToast();
  const t = useT();
  const members = state.members;
  const admins = members.filter((m) => m.role === "Admin").length;
  const proofs = state.people.filter((p) => p.pending);
  const reviews = state.records.filter((r) => r.status === "review");
  const nameOf = (m) => (m.name || fullName(person(m.id)));

  const setRole = (m, role) => {
    const prev = m.role;
    update((s) => { s.members.find((x) => x.id === m.id).role = role; }, t("adm.hRole", { name: nameOf(m), from: t(`role.${prev}`), to: t(`role.${role}`) }));
    toast(t("adm.nowRole", { name: nameOf(m), role: t(`role.${role}`) }), { icon: ROLE_ICON[role], action: t("common.undo"),
      onAction: () => update((s) => { s.members.find((x) => x.id === m.id).role = prev; }, t("adm.hRoleBack", { name: nameOf(m), role: t(`role.${prev}`) })) });
  };
  const removeMember = (m) => confirm(t("adm.removeQ", { name: nameOf(m) }), t("adm.removeBody"), t("adm.removeAccess"), () => {
      let index = 0;
      update((s) => { index = s.members.findIndex((x) => x.id === m.id); s.members.splice(index, 1); }, t("adm.hRemoved", { name: nameOf(m) }));
      toast(t("adm.removed"), { sub: nameOf(m), icon: "person_remove", action: t("common.undo"), onAction: () => update((s) => { s.members.splice(index, 0, m); }, t("adm.hRestored", { name: nameOf(m) })) });
    });
  const resend = async (inv) => {
    if (server.source !== "server") {
      update((s) => { s.invites.find((x) => x.id === inv.id).sent = todayISO(); }, t("adm.hResent", { name: inv.name }));
      toast(t("adm.resent"), { sub: inv.email, icon: "forward_to_inbox" });
      return;
    }
    // On a server: say truthfully whether the email went out (it can't when email isn't set up).
    try {
      const made = await api(`/invites/${inv.id}/resend`, { method: "POST" });
      server.adopt("invites", { ...inviteOf(made), by: inv.by });
      if (made.emailed) toast(t("adm.resent"), { sub: inv.email, icon: "forward_to_inbox" });
      else toast(t("dlg.invite.notEmailed", { name: inv.name }), { sub: t("dlg.invite.notEmailedSub"), icon: "link", action: t("dlg.invite.copyLink"), onAction: () => copyLink(inv) });
    } catch (e) { toast(e.message, { error: true }); }
  };
  const copyLink = (inv) => copyText(inv.link).then((ok) => toast(ok ? t("dlg.invite.linkCopied") : inv.link, { icon: "content_copy" }));
  const cancelInvite = (inv) => confirm(t("adm.cancelQ", { name: inv.name }), t("adm.cancelBody"), t("adm.cancelInvite"), () => {
    update((s) => { s.invites = s.invites.filter((x) => x.id !== inv.id); }, t("adm.hCancelled", { name: inv.name }));
    toast(t("adm.cancelled"), { sub: inv.name, icon: "cancel_schedule_send", action: t("common.undo"), onAction: () => update((s) => { s.invites.push(inv); }, t("adm.hRestoredInv", { name: inv.name })) });
  });

  return (
    <>
      <PageHeader icon="admin_panel_settings" eyebrow={t("adm.eyebrow")} title={t("nav.admin")} description={t("adm.sub")}
        actions={<Button variant="primary" icon="person_add" onClick={() => open(<InviteDialog />)}>{t("fab.invite")}</Button>}
        aside={<div className="flex flex-wrap gap-2.5">
          <Stat value={members.length} label={t("adm.members")} />
          <Stat value={state.requests.length} label={t("adm.requests")} />
          <Stat value={proofs.length + reviews.length} label={t("adm.toVerify")} />
        </div>} />

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 [&>*]:min-w-0">
          <section aria-labelledby="reqH">
            <SectionTitle><h2 id="reqH">{t("adm.requests")} <Tag tone={state.requests.length ? "gold" : "default"}>{state.requests.length}</Tag></h2></SectionTitle>
            {state.requests.length ? <div className="grid gap-3 xl:grid-cols-2">{state.requests.map((r) => <RequestCard key={r.id} r={r} />)}</div>
              : <Empty icon="how_to_reg" title={t("adm.noRequests")}><p className="text-small">{t("adm.noRequestsHelp")}</p></Empty>}
          </section>

          <section aria-labelledby="memH">
            <SectionTitle><h2 id="memH">{t("adm.membersRoles")}</h2><span className="text-small text-muted">{admins > 1 ? t("adm.adminMany", { n: admins }) : t("adm.adminOne")}</span></SectionTitle>
            <div className="relative overflow-x-auto rounded-[18px] border border-line bg-surface">
              <table className="w-full min-w-150 border-collapse text-left text-small">
                <caption className="sr-only">{t("adm.caption")}</caption>
                <thead className="bg-surface-2 text-xsmall tracking-wide text-muted uppercase">
                  <tr><th scope="col" className="px-3.5 py-2.5">{t("adm.colMember")}</th><th scope="col" className="px-3.5 py-2.5">{t("adm.colRole")}</th><th scope="col" className="px-3.5 py-2.5">{t("adm.colActive")}</th><th scope="col" className="px-3.5 py-2.5"><span className="sr-only">{t("adm.colActions")}</span></th></tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const p = person(m.id);
                    const lastAdmin = m.role === "Admin" && admins === 1;
                    return (
                      <tr key={m.id} className="border-t border-line">
                        <th scope="row" className="px-3.5 py-2 font-normal">
                          <span className="flex items-center gap-2.5">
                            {p ? <Avatar p={p} className="size-8! rounded-lg! text-xsmall!" /> : <span className="grid size-8 place-items-center rounded-lg bg-sec-soft text-sec-ink"><Icon name="person" size="sm" /></span>}
                            <span><strong className="block font-semibold">{nameOf(m)}{m.id === ME && t("adm.you")}</strong><small className="text-xsmall text-muted">{p ? kin(p.role) : t("adm.newMember")}</small></span>
                          </span>
                        </th>
                        <td className="px-3.5 py-2">
                          <label className="sr-only" htmlFor={`mr-${m.id}`}>{t("adm.roleFor", { name: nameOf(m) })}</label>
                          <Select id={`mr-${m.id}`} className="w-auto! py-1.5!" value={m.role} disabled={lastAdmin} title={lastAdmin ? t("adm.needAdmin") : undefined}
                            onChange={(e) => setRole(m, e.target.value)}>
                            {ROLES.map(([r]) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                          </Select>
                        </td>
                        <td className="px-3.5 py-2 whitespace-nowrap text-muted">{m.lastActive ? fmtDate(m.lastActive) : <Tag tone="mint">{t("adm.joined", { date: fmtDate(m.joined) })}</Tag>}</td>
                        <td className="px-3.5 py-2 text-right whitespace-nowrap">
                          {canReset(m) && <IconButton icon="lock_reset" label={t("adm.resetFor", { name: nameOf(m) })} title={t("adm.resetFor", { name: nameOf(m) })}
                            onClick={() => open(<ResetLinkDialog member={m} name={nameOf(m)} />)} />}
                          <IconButton icon="person_remove" label={t("adm.removeLabel", { name: nameOf(m) })} disabled={m.id === ME || lastAdmin}
                            title={m.id === ME ? t("adm.notYourself") : lastAdmin ? t("adm.needAdmin") : t("adm.removeAccess")}
                            className="disabled:cursor-not-allowed disabled:opacity-40" onClick={() => removeMember(m)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="invH">
            <SectionTitle><h2 id="invH">{t("adm.invites")}</h2></SectionTitle>
            {state.invites.length ? (
              <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0">
                {state.invites.map((inv) => (
                  <li key={inv.id}>
                    <Record icon="mail" className="flex-wrap">
                      <div className="min-w-0 flex-1 basis-50"><strong>{inv.name}</strong><p className="truncate text-xsmall text-muted">{t("adm.sentBy", { email: inv.email, relation: kin(inv.relation), date: fmtDate(inv.sent), name: person(inv.by)?.first || t("adm.youLower") })}</p></div>
                      {/* On a phone the two buttons take their own line instead of pushing past the screen edge. */}
                      <div className="flex flex-wrap gap-2 max-sm:basis-full max-sm:pl-12">
                        {inv.link && <Button size="sm" icon="link" onClick={() => copyLink(inv)}>{t("dlg.invite.copyLink")}</Button>}
                        <Button size="sm" icon="forward_to_inbox" onClick={() => resend(inv)}>{t("adm.resend")}</Button>
                        <Button size="sm" variant="ghost" icon="close" onClick={() => cancelInvite(inv)}>{t("common.cancel")}</Button>
                      </div>
                    </Record>
                  </li>
                ))}
              </ul>
            ) : <p className="text-small text-muted">{t("adm.noInvites")}</p>}
          </section>
        </div>

        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 [&>*]:min-w-0 lg:sticky lg:top-21">
          <Card aria-labelledby="verH">
            <h2 id="verH" className="flex items-center gap-2.5 text-[1.15rem]!"><IconBox icon="fact_check" tone="gold" /> {t("adm.toVerify")}</h2>
            {proofs.length + reviews.length ? (
              <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                {proofs.map((p) => (
                  <li key={p.id}><Record as={Link} to={`/tree?person=${p.id}`} icon="family_history">
                    <div className="min-w-0 flex-1"><strong className="text-small">{fullName(p)}</strong><p className="text-xsmall text-muted">{t("adm.birthPending")}</p></div><Icon name="chevron_right" />
                  </Record></li>
                ))}
                {reviews.map((r) => (
                  <li key={r.id}><Record as={Link} to="/legacy" icon="description">
                    <div className="min-w-0 flex-1"><strong className="text-small">{r.title}</strong><p className="text-xsmall text-muted">{t("adm.legacyRecord")}</p></div><Icon name="chevron_right" />
                  </Record></li>
                ))}
              </ul>
            ) : <p className="mt-3 flex items-center gap-2 text-small text-muted"><Icon name="task_alt" className="text-sec-ink" /> {t("adm.allVerified")}</p>}
          </Card>
          <Card tone="soft" aria-labelledby="roleH">
            <h2 id="roleH" className="text-[1.15rem]!">{t("adm.whatRoles")}</h2>
            <dl className="m-0 mt-3 grid gap-3">
              {ROLES.map(([r, icon]) => (
                <div key={r} className="text-small">
                  <dt className="flex items-center gap-2 font-semibold"><Icon name={icon} size="sm" className="text-sec-ink" />{t(`role.${r}`)}</dt>
                  <dd className="m-0 mt-0.5 pl-6.5 text-muted">{t(`role.${r}.d`)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}
