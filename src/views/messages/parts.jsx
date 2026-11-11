/* Small pieces shared by the chat list and the conversation: avatars, the new-chat dialog and the chat-info panel. */
import { useState } from "react";
import { CancelButton, Dialog } from "../../components/Modal";
import { useCloseModal } from "../../components/modalContext";
import { useToast } from "../../components/toastContext";
import { Avatar, Button, Empty, Field, Icon, Input, PeopleChecks, Record, Switch, Textarea } from "../../components/ui";
import { ME } from "../../data";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { clock, dayLabel, postMessage, snippet, threadIdFor } from "../../lib/messages";
import { fullName, useStore } from "../../lib/store";

/** Group chats show a group icon; private chats show the other person's avatar. */
export function ChatAvatar({ t, size = "md" }) {
  const { person } = useStore();
  if (t.group) {
    return (
      <span aria-hidden="true" className={cx("grid shrink-0 place-items-center rounded-full bg-sec text-sec-on", size === "sm" ? "size-9" : "size-11")}>
        <Icon name="groups" size={size === "sm" ? "sm" : undefined} />
      </span>
    );
  }
  return <Avatar round p={person(t.members.find((m) => m !== ME))} className={size === "sm" ? "size-9!" : "size-11!"} />;
}

export function NewChatDialog({ onCreated }) {
  const { state, update } = useStore();
  const close = useCloseModal();
  const toast = useToast();
  const tr = useT();
  const [to, setTo] = useState([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState({});
  const people = state.people.filter((p) => !p.died && p.id !== ME);
  const send = () => {
    const e = { to: to.length ? "" : tr("msg.errTo"), text: text.trim() ? "" : tr("msg.errText") };
    setErrors(e);
    if (e.to || e.text) { if (e.text && !e.to) document.getElementById("nmText").focus(); return; }
    const title = to.length > 1 ? name.trim() || to.map((id) => state.people.find((p) => p.id === id).first).join(", ") : fullName(state.people.find((p) => p.id === to[0]));
    const id = threadIdFor(state, to);
    update((s) => { postMessage(s, { threadId: id, to, title, text: text.trim() }); }, tr("msg.hSent", { title }));
    toast(tr("msg.sent"), { sub: title, icon: "send" });
    close();
    onCreated(id);
  };
  return (
    <Dialog title={tr("msg.newChat")} sub={tr("msg.newSub")}
      footer={<><CancelButton /><Button variant="primary" icon="send" onClick={send}>{tr("msg.send")}</Button></>}>
      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-small font-semibold">{tr("msg.to")} {to.length > 1 && <span className="font-normal text-muted">{tr("msg.groupOf", { n: to.length + 1 })}</span>}</legend>
        <PeopleChecks people={people} value={to} onChange={setTo} />
        {errors.to && <span role="alert" className="text-[.76rem] text-rose"><Icon name="error" size="xs" /> {errors.to}</span>}
      </fieldset>
      {to.length > 1 && (
        <Field id="nmName" label={tr("msg.groupName")} hint={tr("common.optional")}><Input id="nmName" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("msg.groupPh")} /></Field>
      )}
      <Field id="nmText" label={tr("dlg.msg.label")} error={errors.text}>
        <Textarea id="nmText" rows={3} value={text} onChange={(e) => setText(e.target.value)} invalid={!!errors.text} />
      </Field>
    </Dialog>
  );
}

/** Members, starred messages and chat settings. */
export function ChatInfoDialog({ id, onJump }) {
  const { state, person, update, kin } = useStore();
  const close = useCloseModal();
  const tr = useT();
  const t = state.threads.find((x) => x.id === id);
  if (!t) return null;
  const starred = t.messages.filter((m) => m.starred && !m.deleted);
  const set = (k, v) => update((s) => { s.threads.find((x) => x.id === id)[k] = v; }, null);
  return (
    <Dialog title={t.title} sub={t.group ? tr("msg.groupSub", { n: t.members.length }) : tr("msg.privateSub")}>
      <section aria-label={tr("msg.settings")} className="grid gap-3 rounded-2xl bg-surface-2 p-3.5">
        <Switch id="ciPin" checked={!!t.pinned} onChange={(v) => set("pinned", v)} label={tr("msg.pinTop")} help={tr("msg.pinHelp")} />
        <Switch id="ciMute" checked={!!t.muted} onChange={(v) => set("muted", v)} label={tr("msg.muteNotif")} help={tr("msg.muteHelp")} />
      </section>
      <section aria-labelledby="ciMembers">
        <h3 id="ciMembers" className="mb-2 text-small!">{t.group ? tr("msg.membersN", { n: t.members.length }) : tr("msg.inThisChat")}</h3>
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {t.members.map((m) => {
            const p = person(m);
            return <li key={m} className="flex items-center gap-2.5 text-small"><Avatar round p={p} className="size-8! text-[.66rem]!" /><span><strong>{m === ME ? tr("msg.you") : fullName(p)}</strong><small className="block text-xsmall text-muted">{p && kin(p.role)} · {p?.city}</small></span></li>;
          })}
        </ul>
      </section>
      <section aria-labelledby="ciStar">
        <h3 id="ciStar" className="mb-2 text-small!">{tr("msg.starred")}</h3>
        {starred.length ? (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {starred.map((m) => (
              <li key={m.id}>
                <Record as="button" type="button" icon="star" className="w-full text-left" onClick={() => { close(); onJump(m.id); }}>
                  <span className="min-w-0 flex-1"><strong className="text-small">{m.by === ME ? tr("msg.you") : person(m.by)?.first}</strong><span className="block truncate text-small">{snippet(m)}</span>
                    <small className="text-xsmall text-muted">{dayLabel(m.at)}, {clock(m.at)}</small></span>
                </Record>
              </li>
            ))}
          </ul>
        ) : <Empty icon="star" className="py-5!"><p className="text-small">{tr("msg.starHelp")}</p></Empty>}
      </section>
    </Dialog>
  );
}
