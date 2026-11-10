/* Family Administration: who has access and with which role, join requests, invitations, and records awaiting verification. */
import { Link } from "react-router-dom";
import { useState } from "react";
import { useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Avatar, Button, Card, Empty, Eyebrow, Hero, Icon, IconBox, IconButton, Record, SectionTitle, Select, Stat, Tag } from "../components/ui";
import { ME } from "../data";
import InviteDialog from "../dialogs/InviteDialog";
import { fmtDate, todayISO, uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { fullName, useStore } from "../lib/store";

/** Roles from most to least access, with what each one can do (shown so nobody has to remember it). */
const ROLES = [
  ["Admin", "admin_panel_settings", "Manages members, roles and privacy settings for the whole archive."],
  ["Custodian", "verified_user", "Verifies records and approves new relatives for their branch."],
  ["Contributor", "edit_note", "Adds memories, stories and records; edits their own."],
  ["Viewer", "visibility", "Can see and listen, but not add or change anything."],
];
const ROLE_ICON = Object.fromEntries(ROLES.map(([r, i]) => [r, i]));

function RequestCard({ r }) {
  const { person, update } = useStore();
  const { confirm } = useModal();
  const toast = useToast();
  const [role, setRole] = useState("Viewer");
  const approve = () => {
    const m = { id: uid("u"), name: r.name, role, lastActive: null, joined: todayISO() };
    update((s) => { s.requests = s.requests.filter((x) => x.id !== r.id); s.members.push(m); }, `Approved ${r.name} as ${role}`);
    toast(`${r.name} can now join`, { sub: `Role: ${role}. They'll get an email with a sign-in link.`, icon: "how_to_reg", action: "Undo",
      onAction: () => update((s) => { s.members = s.members.filter((x) => x.id !== m.id); s.requests.push(r); }, `Undid approval of ${r.name}`) });
  };
  const decline = () => confirm(`Decline ${r.name}'s request?`, "They won't be able to see the archive. You can undo straight after.", "Decline", () => {
    update((s) => { s.requests = s.requests.filter((x) => x.id !== r.id); }, `Declined ${r.name}`);
    toast("Request declined", { sub: r.name, icon: "person_remove", action: "Undo", onAction: () => update((s) => { s.requests.push(r); }, `Restored ${r.name}'s request`) });
  });
  return (
    <article className="grid gap-3 rounded-[18px] border border-gold/50 bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3>{r.name}</h3>
          <p className="text-small text-muted">{r.relation} · asked {fmtDate(r.date)}</p>
        </div>
        <Tag tone="gold" icon="pending">Waiting for you</Tag>
      </div>
      {r.note && <p className="rounded-xl bg-surface-2 p-3 text-small">“{r.note}”</p>}
      <p className="flex items-center gap-2 text-small"><Avatar p={person(r.vouchedBy)} className="size-7! rounded-lg! text-[.62rem]!" /> Vouched for by {fullName(person(r.vouchedBy))}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xsmall font-semibold" htmlFor={`role-${r.id}`}>Give them the role
          <Select id={`role-${r.id}`} className="w-auto!" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.filter(([x]) => x !== "Admin").map(([x]) => <option key={x}>{x}</option>)}
          </Select>
        </label>
        <span className="flex-1" />
        <Button icon="close" onClick={decline}>Decline</Button>
        <Button variant="primary" icon="how_to_reg" onClick={approve}>Approve</Button>
      </div>
    </article>
  );
}

export default function Admin() {
  const { state, person, update } = useStore();
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
    update((s) => { s.members.find((x) => x.id === m.id).role = role; }, `Changed ${nameOf(m)} from ${prev} to ${role}`);
    toast(`${nameOf(m)} is now ${role === "Admin" ? "an" : "a"} ${role}`, { icon: ROLE_ICON[role], action: "Undo",
      onAction: () => update((s) => { s.members.find((x) => x.id === m.id).role = prev; }, `Changed ${nameOf(m)} back to ${prev}`) });
  };
  const removeMember = (m) => confirm(`Remove ${nameOf(m)}'s access?`,
    "They will no longer be able to sign in to the archive. Their memories and stories stay in the archive. You can undo straight after.", "Remove access", () => {
      let index = 0;
      update((s) => { index = s.members.findIndex((x) => x.id === m.id); s.members.splice(index, 1); }, `Removed ${nameOf(m)}'s access`);
      toast("Access removed", { sub: nameOf(m), icon: "person_remove", action: "Undo", onAction: () => update((s) => { s.members.splice(index, 0, m); }, `Restored ${nameOf(m)}'s access`) });
    });
  const resend = (inv) => {
    update((s) => { s.invites.find((x) => x.id === inv.id).sent = todayISO(); }, `Resent the invitation to ${inv.name}`);
    toast("Invitation sent again", { sub: inv.email, icon: "forward_to_inbox" });
  };
  const cancelInvite = (inv) => confirm(`Cancel ${inv.name}'s invitation?`, "The link in their email will stop working.", "Cancel invitation", () => {
    update((s) => { s.invites = s.invites.filter((x) => x.id !== inv.id); }, `Cancelled the invitation to ${inv.name}`);
    toast("Invitation cancelled", { sub: inv.name, icon: "cancel_schedule_send", action: "Undo", onAction: () => update((s) => { s.invites.push(inv); }, `Restored the invitation to ${inv.name}`) });
  });

  return (
    <>
      <Hero className="flex flex-wrap items-center gap-6">
        <div className="min-w-65 flex-1">
          <Eyebrow icon="admin_panel_settings">Keepers of the archive</Eyebrow>
          <h1 className="mt-2">{t("nav.admin")}</h1>
          <p className="mt-2 max-w-160 text-muted">Decide who can join, what each person can do, and keep the family record trustworthy.</p>
          <div className="mt-4"><Button variant="primary" icon="person_add" onClick={() => open(<InviteDialog />)}>Invite a relative</Button></div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Stat value={members.length} label="Members" />
          <Stat value={state.requests.length} label="Join requests" />
          <Stat value={proofs.length + reviews.length} label="To verify" />
        </div>
      </Hero>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 [&>*]:min-w-0">
          <section aria-labelledby="reqH">
            <SectionTitle><h2 id="reqH">Join requests <Tag tone={state.requests.length ? "gold" : "default"}>{state.requests.length}</Tag></h2></SectionTitle>
            {state.requests.length ? <div className="grid gap-3 xl:grid-cols-2">{state.requests.map((r) => <RequestCard key={r.id} r={r} />)}</div>
              : <Empty icon="how_to_reg" title="No requests waiting"><p className="text-small">New requests from relatives will appear here.</p></Empty>}
          </section>

          <section aria-labelledby="memH">
            <SectionTitle><h2 id="memH">Members &amp; roles</h2><span className="text-small text-muted">{admins} admin{admins > 1 ? "s" : ""} · at least one is always kept</span></SectionTitle>
            <div className="relative overflow-x-auto rounded-[18px] border border-line bg-surface">
              <table className="w-full min-w-150 border-collapse text-left text-small">
                <caption className="sr-only">Members of the family archive and their roles</caption>
                <thead className="bg-surface-2 text-xsmall tracking-wide text-muted uppercase">
                  <tr><th scope="col" className="px-3.5 py-2.5">Member</th><th scope="col" className="px-3.5 py-2.5">Role</th><th scope="col" className="px-3.5 py-2.5">Last active</th><th scope="col" className="px-3.5 py-2.5"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const p = person(m.id);
                    const lastAdmin = m.role === "Admin" && admins === 1;
                    return (
                      <tr key={m.id} className="border-t border-line">
                        <th scope="row" className="px-3.5 py-2 font-normal">
                          <span className="flex items-center gap-2.5">
                            {p ? <Avatar p={p} className="size-8! rounded-lg! text-[.7rem]!" /> : <span className="grid size-8 place-items-center rounded-lg bg-sec-soft text-sec-ink"><Icon name="person" size="sm" /></span>}
                            <span><strong className="block font-semibold">{nameOf(m)}{m.id === ME && " (you)"}</strong><small className="text-xsmall text-muted">{p ? p.role : "New member"}</small></span>
                          </span>
                        </th>
                        <td className="px-3.5 py-2">
                          <label className="sr-only" htmlFor={`mr-${m.id}`}>Role for {nameOf(m)}</label>
                          <Select id={`mr-${m.id}`} className="w-auto! py-1.5!" value={m.role} disabled={lastAdmin} title={lastAdmin ? "The archive needs at least one Admin" : undefined}
                            onChange={(e) => setRole(m, e.target.value)}>
                            {ROLES.map(([r]) => <option key={r}>{r}</option>)}
                          </Select>
                        </td>
                        <td className="px-3.5 py-2 whitespace-nowrap text-muted">{m.lastActive ? fmtDate(m.lastActive) : <Tag tone="mint">Joined {fmtDate(m.joined)}</Tag>}</td>
                        <td className="px-3.5 py-2 text-right">
                          <IconButton icon="person_remove" label={`Remove ${nameOf(m)}'s access`} disabled={m.id === ME || lastAdmin}
                            title={m.id === ME ? "You can't remove yourself" : lastAdmin ? "The archive needs at least one Admin" : "Remove access"}
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
            <SectionTitle><h2 id="invH">Invitations not yet accepted</h2></SectionTitle>
            {state.invites.length ? (
              <ul className="m-0 grid list-none gap-2 p-0">
                {state.invites.map((inv) => (
                  <li key={inv.id}>
                    <Record icon="mail" className="flex-wrap">
                      <div className="min-w-0 flex-1 basis-50"><strong>{inv.name}</strong><p className="truncate text-xsmall text-muted">{inv.email} · {inv.relation} · sent {fmtDate(inv.sent)} by {person(inv.by)?.first || "you"}</p></div>
                      <Button size="sm" icon="forward_to_inbox" onClick={() => resend(inv)}>Resend</Button>
                      <Button size="sm" variant="ghost" icon="close" onClick={() => cancelInvite(inv)}>Cancel</Button>
                    </Record>
                  </li>
                ))}
              </ul>
            ) : <p className="text-small text-muted">No open invitations.</p>}
          </section>
        </div>

        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 [&>*]:min-w-0 lg:sticky lg:top-21">
          <Card aria-labelledby="verH">
            <h2 id="verH" className="flex items-center gap-2.5 text-[1.15rem]!"><IconBox icon="fact_check" tone="gold" /> To verify</h2>
            {proofs.length + reviews.length ? (
              <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                {proofs.map((p) => (
                  <li key={p.id}><Record as={Link} to={`/tree?person=${p.id}`} icon="family_history">
                    <div className="min-w-0 flex-1"><strong className="text-small">{fullName(p)}</strong><p className="text-xsmall text-muted">Birth details awaiting family consensus</p></div><Icon name="chevron_right" />
                  </Record></li>
                ))}
                {reviews.map((r) => (
                  <li key={r.id}><Record as={Link} to="/legacy" icon="description">
                    <div className="min-w-0 flex-1"><strong className="text-small">{r.title}</strong><p className="text-xsmall text-muted">Record in the Legacy Archive</p></div><Icon name="chevron_right" />
                  </Record></li>
                ))}
              </ul>
            ) : <p className="mt-3 flex items-center gap-2 text-small text-muted"><Icon name="task_alt" className="text-sec-ink" /> Everything is verified.</p>}
          </Card>
          <Card tone="soft" aria-labelledby="roleH">
            <h2 id="roleH" className="text-[1.15rem]!">What each role can do</h2>
            <dl className="m-0 mt-3 grid gap-3">
              {ROLES.map(([r, icon, text]) => (
                <div key={r} className="text-small">
                  <dt className="flex items-center gap-2 font-semibold"><Icon name={icon} size="sm" className="text-sec-ink" />{r}</dt>
                  <dd className="m-0 mt-0.5 pl-6.5 text-muted">{text}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}
