/* Screens referenced in the navigation but not documented in the design report. Collects quick user feedback instead. */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useToast } from "../components/toastContext";
import { Button, Card, Check, Eyebrow, Field, Hero, Icon, Switch, Textarea } from "../components/ui";
import { cx } from "../lib/format";
import { useT } from "../lib/i18n";
import { routeLabel } from "../lib/nav";

const WISHES = {
  legacy: ["Wills & heirloom letters", "Digitised certificates", "A 'for my grandchildren' time capsule", "Printed legacy book"],
  messages: ["Voice messages", "Group chat per branch", "Photo replies", "Read-aloud for elders"],
  admin: ["Approve new relatives", "Assign custodians", "Merge duplicate profiles", "Activity log"],
  privacy: ["Per-person consent switches", "Hide minors automatically", "Download everything about me", "Who viewed my stories"],
};
const LABELS = ["Not useful", "Slightly useful", "Useful", "Very useful", "Essential"];

export default function Placeholder() {
  const { route } = useParams();
  const t = useT();
  const toast = useToast();
  const known = routeLabel(route);
  const title = known ? t(`nav.${route}`) : "Page not found";
  const wishes = WISHES[route] || [];
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!rating) { toast("Choose a star rating first", { error: true, sub: "How useful would this page be for your family?" }); return; }
    setSent(true);
    toast("Thank you for your feedback", { sub: `${title}: ${LABELS[rating - 1]}${picked.length ? ` · ${picked.length} idea(s)` : ""}`, icon: "volunteer_activism" });
  };

  return (
    <>
      <Hero>
        <Eyebrow icon="construction">Not part of this design review</Eyebrow>
        <h1 className="mt-2">{title}</h1>
        <p className="mt-2 max-w-155 text-muted">
          This area appears in the FamilyRoots navigation but was not included in the seven screens documented in the UI/UX design report. Help us shape it below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5"><Button variant="primary" icon="home" to="/overview">Back to Overview</Button></div>
      </Hero>

      {known && (
        <Card className="mt-6 max-w-190">
          {sent ? (
            <div className="grid justify-items-center gap-3 py-6 text-center" aria-live="polite">
              <span className="grid size-14 place-items-center rounded-full bg-mint text-pine-900"><Icon name="favorite" fill className="text-[30px]!" /></span>
              <h2>Thank you!</h2>
              <p className="text-muted">Your ideas for “{title}” were recorded{notify ? " — we'll let you know when it's ready" : ""}.</p>
              <Button onClick={() => { setSent(false); setRating(0); setPicked([]); setNote(""); }}>Send more feedback</Button>
            </div>
          ) : (
            <form className="grid gap-5" onSubmit={submit}>
              <h2>How useful would this page be for your family?</h2>
              <div>
                <div role="radiogroup" aria-label="Usefulness rating" className="flex gap-1" onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} – ${LABELS[n - 1]}`}
                      onMouseEnter={() => setHover(n)} onClick={() => setRating(n)}
                      className="cursor-pointer rounded-lg border-0 bg-transparent p-1 text-gold transition-transform hover:scale-110">
                      <Icon name="star" fill={n <= (hover || rating)} className={cx("text-[34px]!", n > (hover || rating) && "text-faint")} />
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-small text-muted" aria-live="polite">{(hover || rating) ? LABELS[(hover || rating) - 1] : "Tap a star"}</p>
              </div>
              {wishes.length > 0 && (
                <fieldset className="m-0 grid gap-2 border-0 p-0 sm:grid-cols-2">
                  <legend className="mb-2 text-[.86rem] font-semibold">What should it include? (choose any)</legend>
                  {wishes.map((w) => (
                    <Check key={w} checked={picked.includes(w)} className="rounded-xl border border-line bg-surface-2 p-3"
                      onChange={() => setPicked(picked.includes(w) ? picked.filter((x) => x !== w) : [...picked, w])}>{w}</Check>
                  ))}
                </fieldset>
              )}
              <Field id="phNote" label="Anything else?" hint={`${note.length}/300`}>
                <Textarea id="phNote" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell us what would make this page helpful…" />
              </Field>
              <Switch id="phNotify" checked={notify} onChange={setNotify} label="Notify me when this page is ready" help="We'll show a notification in the top bar." />
              <div><Button variant="primary" type="submit" icon="send">Send feedback</Button></div>
            </form>
          )}
        </Card>
      )}
    </>
  );
}
