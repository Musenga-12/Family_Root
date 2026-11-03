/* Add a family member (Tree + Directory). */
import { useState } from "react";
import { CancelButton, Dialog } from "../components/Modal";
import { useCloseModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Check, Field, Input, Select } from "../components/ui";
import { uid } from "../lib/format";
import { fullName, useStore } from "../lib/store";

export default function AddPersonDialog() {
  const { state, update, person } = useStore();
  const toast = useToast();
  const close = useCloseModal();
  const [f, setF] = useState({ first: "", last: "Mackenzie", rel: "child", to: "james", born: "", approx: false, occ: "" });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = () => {
    const e = {
      first: f.first.trim() ? "" : "Please enter a first name so relatives recognise them.",
      last: f.last.trim() ? "" : "Please enter a family name.",
      born: !f.born ? "Add a date of birth — tick “approximate” if you're not sure of the exact day."
        : new Date(f.born) > new Date() ? "The date of birth can't be in the future." : "",
    };
    setErrors(e);
    const bad = ["first", "last", "born"].find((k) => e[k]);
    if (bad) { document.getElementById("ap-" + bad).focus(); return; }

    const to = person(f.to);
    const p = {
      id: uid("p"), first: f.first.trim(), last: f.last.trim(), born: f.born, bornApprox: f.approx,
      gen: f.rel === "child" ? to.gen + 1 : to.gen, city: to.city, branch: to.branch,
      role: f.rel === "child" ? "Relative" : "Partner", occupation: f.occ.trim() || "Family member",
      parents: f.rel === "child" ? [to.id, ...(to.spouse ? [to.spouse] : [])] : [], spouse: f.rel === "spouse" ? to.id : null,
      color: ["#6a8f7a", "#8a6f9a", "#9a7a5a", "#5a7f9a"][Math.floor(Math.random() * 4)], tags: ["New addition"],
    };
    if (f.rel === "spouse") p.married = new Date().getFullYear();
    update((s) => {
      s.people.push(p);
      if (f.rel === "spouse") s.people.find((x) => x.id === to.id).spouse = p.id;
    });
    toast(`${p.first} added to the family tree`, {
      sub: "Custodians have been notified to verify.", action: "Undo",
      onAction: () => update((s) => {
        s.people = s.people.filter((x) => x.id !== p.id);
        const t = s.people.find((x) => x.id === to.id);
        if (t.spouse === p.id) t.spouse = null;
      }),
    });
    close();
  };

  return (
    <Dialog title="Add a family member" sub="Only basic details are needed. You can add more later — and nothing is shared outside the family circle."
      footer={<><CancelButton /><Button variant="primary" icon="person_add" onClick={save}>Add to tree</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="ap-first" label="First name" hint="Required" error={errors.first}>
          <Input id="ap-first" autoComplete="off" value={f.first} onChange={set("first")} invalid={!!errors.first} />
        </Field>
        <Field id="ap-last" label="Family name" hint="Required" error={errors.last}>
          <Input id="ap-last" autoComplete="off" value={f.last} onChange={set("last")} invalid={!!errors.last} />
        </Field>
        <Field id="ap-rel" label="Relationship">
          <Select id="ap-rel" value={f.rel} onChange={set("rel")}><option value="child">Child of…</option><option value="spouse">Partner of…</option></Select>
        </Field>
        <Field id="ap-to" label="Relative">
          <Select id="ap-to" value={f.to} onChange={set("to")}>{state.people.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</Select>
        </Field>
      </div>
      <Field id="ap-born" label="Date of birth" error={errors.born}>
        <Input id="ap-born" type="date" value={f.born} onChange={set("born")} invalid={!!errors.born} />
        <Check className="mt-2" checked={f.approx} onChange={set("approx")}>This date is approximate / remembered (not from a record)</Check>
      </Field>
      <Field id="ap-occ" label="Occupation or note" hint="Optional">
        <Input id="ap-occ" value={f.occ} onChange={set("occ")} placeholder="e.g. Teacher, Fiddle player" />
      </Field>
    </Dialog>
  );
}
