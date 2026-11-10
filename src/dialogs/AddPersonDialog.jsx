/* Add a family member (Tree + Directory). */
import { useState } from "react";
import { CancelButton, Dialog, DraftNote } from "../components/Modal";
import { useCloseModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Check, Field, Input, Select } from "../components/ui";
import { uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { fullName, useStore } from "../lib/store";
import { useDraft } from "../lib/useDraft";

export default function AddPersonDialog() {
  const t = useT();
  const { state, update, person } = useStore();
  const toast = useToast();
  const close = useCloseModal();
  const [f, setF, draft] = useDraft("person", { first: "", last: "Mackenzie", rel: "child", to: "james", born: "", approx: false, occ: "" });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = () => {
    const e = {
      first: f.first.trim() ? "" : t("dlg.person.errFirst"),
      last: f.last.trim() ? "" : t("dlg.person.errLast"),
      born: !f.born ? t("dlg.person.errBorn")
        : new Date(f.born) > new Date() ? t("dlg.person.errFuture") : "",
    };
    setErrors(e);
    const bad = ["first", "last", "born"].find((k) => e[k]);
    if (bad) { document.getElementById("ap-" + bad).focus(); return; }

    const to = person(f.to);
    const p = {
      id: uid("p"), first: f.first.trim(), last: f.last.trim(), born: f.born, bornApprox: f.approx,
      gen: f.rel === "child" ? to.gen + 1 : to.gen, city: to.city, branch: to.branch,
      role: f.rel === "child" ? "Relative" : "Partner", occupation: f.occ.trim() || t("dlg.person.member"),
      parents: f.rel === "child" ? [to.id, ...(to.spouse ? [to.spouse] : [])] : [], spouse: f.rel === "spouse" ? to.id : null,
      color: ["#6a8f7a", "#8a6f9a", "#9a7a5a", "#5a7f9a"][Math.floor(Math.random() * 4)], tags: [t("dlg.person.newTag")],
    };
    if (f.rel === "spouse") p.married = new Date().getFullYear();
    update((s) => {
      s.people.push(p);
      if (f.rel === "spouse") s.people.find((x) => x.id === to.id).spouse = p.id;
    }, t("dlg.person.history", { name: fullName(p) }));
    toast(t("dlg.person.added", { name: p.first }), {
      sub: t("dlg.person.addedSub"), action: t("common.undo"),
      onAction: () => update((s) => {
        s.people = s.people.filter((x) => x.id !== p.id);
        const rel = s.people.find((x) => x.id === to.id);
        if (rel.spouse === p.id) rel.spouse = null;
      }, t("dlg.person.historyUndo", { name: fullName(p) })),
    });
    draft.clear();
    close();
  };

  return (
    <Dialog sec="tree" title={t("dlg.person.title")} sub={t("dlg.person.sub")}
      footer={<><DraftNote draft={draft} /><CancelButton /><Button variant="primary" icon="person_add" onClick={save}>{t("dlg.person.save")}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="ap-first" label={t("dlg.person.first")} hint={t("common.required")} error={errors.first}>
          <Input id="ap-first" autoComplete="off" value={f.first} onChange={set("first")} invalid={!!errors.first} />
        </Field>
        <Field id="ap-last" label={t("dlg.person.last")} hint={t("common.required")} error={errors.last}>
          <Input id="ap-last" autoComplete="off" value={f.last} onChange={set("last")} invalid={!!errors.last} />
        </Field>
        <Field id="ap-rel" label={t("dlg.person.rel")}>
          <Select id="ap-rel" value={f.rel} onChange={set("rel")}><option value="child">{t("dlg.person.childOf")}</option><option value="spouse">{t("dlg.person.partnerOf")}</option></Select>
        </Field>
        <Field id="ap-to" label={t("dlg.person.relative")}>
          <Select id="ap-to" value={f.to} onChange={set("to")}>{state.people.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</Select>
        </Field>
      </div>
      <Field id="ap-born" label={t("dlg.person.born")} error={errors.born}>
        <Input id="ap-born" type="date" value={f.born} onChange={set("born")} invalid={!!errors.born} />
        <Check className="mt-2" checked={f.approx} onChange={set("approx")}>{t("dlg.person.approx")}</Check>
      </Field>
      <Field id="ap-occ" label={t("dlg.person.occ")} hint={t("common.optional")}>
        <Input id="ap-occ" value={f.occ} onChange={set("occ")} placeholder={t("dlg.person.occPh")} />
      </Field>
    </Dialog>
  );
}
