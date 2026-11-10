/* Upload a memory (Overview + Memories). */
import { useRef, useState } from "react";
import { CancelButton, Dialog, DraftNote } from "../components/Modal";
import { useCloseModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Check, Field, Icon, Input, PeopleChecks, Select, Textarea } from "../components/ui";
import { ME } from "../data";
import { cx, uid } from "../lib/format";
import { shrinkImage } from "../lib/images";
import { useStore } from "../lib/store";
import { useDraft } from "../lib/useDraft";

export default function AddMemoryDialog() {
  const { state, update, prefs } = useStore();
  const toast = useToast();
  const close = useCloseModal();
  const fileRef = useRef(null);
  const [images, setImages] = useState([]);
  const [over, setOver] = useState(false);
  const [preparing, setPreparing] = useState(0);
  // Text fields autosave as a draft (photos are too large for storage, so they are re-attached).
  const [f, setF, draft] = useDraft("memory", { title: "", date: "", approx: false, place: "", caption: "", alt: "", vis: prefs.visibility, consent: false, tagged: [] });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const add = async (files) => {
    const all = [...files];
    const imgs = all.filter((x) => x.type.startsWith("image/"));
    if (imgs.length < all.length) toast("Some files were skipped", { error: true, sub: "Only images (JPG, PNG, GIF, WebP) can be added here." });
    setPreparing((n) => n + imgs.length);
    for (const fl of imgs) {
      const url = await shrinkImage(fl);
      setPreparing((n) => n - 1);
      if (!url) continue;
      setImages((im) => [...im, url]);
      setF((x) => (x.title ? x : { ...x, title: fl.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") }));
    }
  };

  const save = () => {
    if (preparing) return;
    const e = {
      title: f.title.trim() ? "" : "Add a short title so relatives can find this memory.",
      date: f.date ? "" : "Choose a month and year — tick “approximate” if you're unsure.",
      alt: f.alt.trim() ? "" : "Please describe the image so it's accessible to everyone.",
      consent: f.consent || f.vis.startsWith("Only") ? "" : "Please confirm consent before sharing photos of other people.",
    };
    setErrors(e);
    const bad = ["title", "date", "alt", "consent"].find((k) => e[k]);
    if (bad) { document.getElementById("mem-" + bad).focus(); return; }

    const pal = [["#7fa894", "#2a5140"], ["#b08a68", "#4a3626"], ["#8796b0", "#2f3b52"]][Math.floor(Math.random() * 3)];
    const base = {
      title: f.title.trim(), date: f.date, approx: f.approx, type: "photo", place: f.place.trim() || "Unknown place",
      label: "New Upload", tagged: f.tagged.length ? f.tagged : [ME], visibility: f.vis, caption: f.caption.trim() || "No caption yet.",
      alt: f.alt.trim(), p1: pal[0], p2: pal[1], icon: "image", owner: ME,
    };
    const added = (images.length ? images : [null]).map((img, i) => ({
      ...base, id: uid("m"), img, title: images.length > 1 ? `${base.title} (${i + 1})` : base.title,
    }));
    const ids = added.map((m) => m.id);
    update((s) => { s.memories.push(...added); }, `Uploaded “${base.title}”`);
    toast("Upload completed", {
      sub: `${added.length} keepsake${added.length > 1 ? "s" : ""} saved to the vault · ${base.visibility}`, icon: "cloud_done",
      action: "Undo", onAction: () => update((s) => { s.memories = s.memories.filter((m) => !ids.includes(m.id)); }, `Undid upload of “${base.title}”`),
    });
    draft.clear();
    close();
  };

  return (
    <Dialog wide sec="memories" title="Upload a new memory" sub="Add a photo or scan with a caption, so future generations know the story behind it."
      footer={<><DraftNote draft={draft} /><CancelButton /><Button variant="primary" icon="cloud_upload" busy={preparing > 0} onClick={save}>{preparing ? "Preparing photos…" : "Save to vault"}</Button></>}>
      <label tabIndex={0}
        className={cx("block cursor-pointer rounded-2xl border-2 border-dashed border-sec p-5.5 text-center", over ? "bg-sec-line" : "bg-sec-soft")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current.click(); } }}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
        <Icon name="add_photo_alternate" size="lg" />
        <div><strong>Drag photos here, or click to choose</strong><p className="text-xsmall text-muted">JPG or PNG · stays private to the family vault</p></div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
        {preparing > 0 && (
          <p role="status" className="mt-2 inline-flex items-center gap-2 text-small font-semibold text-sec-ink">
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> Preparing {preparing} photo{preparing > 1 ? "s" : ""}…
          </p>
        )}
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
            {images.map((src, i) => (
              <span key={i} className="relative">
                <img src={src} alt={`Selected photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                {/* Remove one photo without starting over (easy correction). */}
                <button type="button" aria-label={`Remove photo ${i + 1}`} title="Remove this photo"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setImages((im) => im.filter((_, k) => k !== i)); }}
                  className="absolute top-1 right-1 grid size-7 cursor-pointer place-items-center rounded-full border-0 bg-pine-950/80 text-white hover:bg-rose">
                  <Icon name="close" size="xs" />
                </button>
              </span>
            ))}
          </div>
        )}
      </label>
      <Field id="mem-title" label="Title" hint="Required" error={errors.title}>
        <Input id="mem-title" value={f.title} onChange={set("title")} placeholder="e.g. Grandpa John's first garden" invalid={!!errors.title} />
      </Field>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field id="mem-date" label="When was it?" hint="Month & year" error={errors.date}>
          <Input id="mem-date" type="month" value={f.date} onChange={set("date")} invalid={!!errors.date} />
          <Check className="mt-2" checked={f.approx} onChange={set("approx")}>Approximate / remembered date</Check>
        </Field>
        <Field id="mem-place" label="Place">
          <Input id="mem-place" value={f.place} onChange={set("place")} placeholder="e.g. Inverness" />
        </Field>
      </div>
      <Field id="mem-caption" label="Caption — the story behind it">
        <Textarea id="mem-caption" rows={2} value={f.caption} onChange={set("caption")} />
      </Field>
      <Field id="mem-alt" label="Image description for screen readers" hint="Required" error={errors.alt}
        help="Describe what's in the picture for relatives who can't see it.">
        <Input id="mem-alt" value={f.alt} onChange={set("alt")} placeholder="e.g. Two children on a beach holding buckets" invalid={!!errors.alt} />
      </Field>
      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-small font-semibold">Who is in it?</legend>
        <PeopleChecks people={state.people} value={f.tagged} onChange={(tagged) => setF({ ...f, tagged })} />
      </fieldset>
      <Field id="mem-vis" label="Who can see this?" error={errors.consent}>
        <Select id="mem-vis" value={f.vis} onChange={set("vis")}>
          <option>All Family Branches</option><option>Immediate Family</option><option>Only Me (draft)</option>
        </Select>
        <Check className="mt-2" id="mem-consent" checked={f.consent} onChange={set("consent")} aria-invalid={!!errors.consent || undefined}>
          Everyone pictured (or their guardian) is happy for this to be shared
        </Check>
      </Field>
    </Dialog>
  );
}
