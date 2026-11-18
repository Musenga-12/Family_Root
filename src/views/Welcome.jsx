/* Welcome steps after creating an account (/welcome): greet, check the profile, bring the family in, show what the app
   does, then into the dashboard. Every step can be skipped. On a family server the account remembers when they are
   done (PATCH /me onboarding_done), so existing members never see them; in the on-device demo a preference does. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PublicLayout from "../components/PublicLayout";
import { useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Card, Check, Field, Icon, Input, InputIcon, Switch, Tag } from "../components/ui";
import { ME } from "../data";
import InviteDialog from "../dialogs/InviteDialog";
import { inviteApi } from "../lib/api";
import { cx, emailOk } from "../lib/format";
import { LANGS, useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { FEATURES } from "../lib/site";
import { useStore } from "../lib/store";
import { usePrefActions } from "../lib/usePrefActions";
import { PagePhoto } from "./public/photos";

const STEPS = ["hello", "profile", "family", "discover", "done"];
const DISCOVER = ["tree", "memories", "stories", "timeline", "messages", "calendar"];

function Progress({ i }) {
  const t = useT();
  const names = t("ob.steps");
  return (
    <ol aria-label={t("ob.step", { i: i + 1, n: STEPS.length })} className="m-0 flex list-none gap-1.5 p-0">
      {STEPS.map((s, k) => (
        <li key={s} aria-current={k === i ? "step" : undefined} className="min-w-0 flex-1">
          <span className={cx("block h-1.5 rounded-full transition-colors", k <= i ? "bg-pine-700 dark:bg-mint" : "bg-surface-3")} />
          <span className={cx("mt-1.5 block truncate text-xsmall max-sm:sr-only", k === i ? "font-semibold text-ink" : "text-muted")}>{names[k]}</span>
        </li>
      ))}
    </ol>
  );
}

function Hello({ name, family, admin }) {
  const t = useT();
  return (
    <div className="grid gap-4">
      <span className="grid size-14 place-items-center rounded-2xl bg-mint text-pine-900"><Icon name="waving_hand" className="text-[30px]!" /></span>
      <h1 className="text-[clamp(1.6rem,3.4vw,2.3rem)]!">{t("ob.hello", { name })}</h1>
      {family && <p className="text-[1.05rem]">{t(admin ? "ob.helloAdmin" : "ob.helloFamily", { family })}</p>}
      <p className="text-muted">{t("ob.helloSub")}</p>
      <div className="rounded-2xl bg-surface-2 p-4">
        <strong className="text-small">{t("ob.whatNext")}</strong>
        <ul className="m-0 mt-2 grid list-none gap-2 p-0">
          {t("ob.whatNextList").map((x) => <li key={x} className="flex items-start gap-2 text-small"><Icon name="check_circle" size="sm" className="text-pine-700 dark:text-mint" />{x}</li>)}
        </ul>
      </div>
    </div>
  );
}

/** Name and Easy-to-Read are saved to the account; the language is this device's choice, like everywhere in the app. */
function Profile({ draft, setDraft, error, demo }) {
  const t = useT();
  const { prefs } = useStore();
  const { setLang } = usePrefActions();
  return (
    <div className="grid gap-5">
      <div><h1 className="text-[clamp(1.5rem,3vw,2rem)]!">{t("ob.profile.title")}</h1><p className="mt-1 text-muted">{t("ob.profile.sub")}</p></div>
      {demo ? <p className="rounded-xl bg-surface-2 p-3 text-small text-muted">{t("ob.profile.demo")}</p> : (
        <Field id="obName" label={t("ob.profile.name")} help={t("ob.profile.nameHelp")} error={error}>
          <InputIcon icon="badge"><Input id="obName" autoComplete="name" maxLength={120} value={draft.name} invalid={!!error}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></InputIcon>
        </Field>
      )}
      <div className="rounded-2xl border border-line p-4">
        <Switch id="obEasy" checked={draft.easy} onChange={(v) => setDraft({ ...draft, easy: v })} label={t("settings.easy")} help={t("settings.easyHelp")} />
      </div>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-small font-semibold">{t("ob.profile.lang")}</legend>
        <div role="radiogroup" aria-label={t("ob.profile.lang")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LANGS.map((l) => (
            <button key={l.code} type="button" role="radio" aria-checked={prefs.lang === l.code} onClick={() => setLang(l.code)}
              className={cx("min-h-12 cursor-pointer rounded-xl border-2 px-3 py-2 text-left text-ink", prefs.lang === l.code ? "border-sec bg-sec-soft font-semibold" : "lift border-line bg-surface")}>
              {l.name}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Admins share the family code and create invitations (real ones on a server); members see how to find relatives. */
function Family({ me, demo }) {
  const t = useT();
  const toast = useToast();
  const { open } = useModal();
  const [f, setF] = useState({ name: "", email: "", relation: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState([]);
  const copy = (text, msg) => navigator.clipboard?.writeText(text).then(() => toast(msg, { icon: "content_copy", duration: 2000 }), () => toast(t("msg.copyFail"), { error: true }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const invite = async () => {
    const e = { name: f.name.trim() ? "" : t("dlg.invite.errName"), email: emailOk(f.email.trim()) ? "" : t("dlg.invite.errEmail") };
    setErrors(e);
    if (e.name || e.email) { document.getElementById(e.name ? "obInvName" : "obInvEmail").focus(); return; }
    setBusy(true);
    try {
      const inv = await inviteApi.create({ name: f.name.trim(), email: f.email.trim(), relation: f.relation.trim() || null });
      setSent((s) => [inv, ...s]);
      setF({ name: "", email: "", relation: "" });
      toast(t("ob.family.sent", { name: inv.name }), { icon: "mark_email_read" });
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (demo) {
    return (
      <div className="grid gap-4">
        <div><h1 className="text-[clamp(1.5rem,3vw,2rem)]!">{t("ob.family.title")}</h1><p className="mt-1 text-muted">{t("ob.family.sub")}</p></div>
        <p className="rounded-xl bg-surface-2 p-3 text-small text-muted">{t("ob.family.demo")}</p>
        <Button className="justify-self-start" icon="person_add" onClick={() => open(<InviteDialog />)}>{t("ob.family.invite")}</Button>
      </div>
    );
  }
  if (!me.family_code) {
    return (
      <div className="grid gap-4">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)]!">{t("ob.family.member", { family: me.family_name })}</h1>
        <p className="text-muted">{t("ob.family.memberSub", { role: t(`kin.${me.role}`) })}</p>
        <ul className="m-0 grid list-none gap-2 p-0">
          {t("ob.family.memberList").map((x, i) => (
            <li key={x} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
              <Icon name={["groups", "account_tree", "forum"][i]} className="text-sec-ink" />{x}
            </li>
          ))}
        </ul>
        <p className="text-small text-muted">{t("ob.family.memberInvite")}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-5">
      <div><h1 className="text-[clamp(1.5rem,3vw,2rem)]!">{t("ob.family.title")}</h1><p className="mt-1 text-muted">{t("ob.family.sub")}</p></div>
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-pine-900 p-5 text-white">
        <div className="min-w-0 flex-1">
          <small className="text-on-dark">{t("ob.family.code")}</small>
          <strong className="block font-serif text-[1.9rem] tracking-[.12em] text-mint">{me.family_code}</strong>
          <small className="text-on-dark">{t("ob.family.codeHelp")}</small>
        </div>
        <Button variant="mint" icon="content_copy" onClick={() => copy(me.family_code, t("ob.family.copied"))}>{t("ob.family.copy")}</Button>
      </div>
      <form noValidate className="grid gap-3 rounded-2xl border border-line p-4" onSubmit={(e) => { e.preventDefault(); invite(); }}>
        <div><strong>{t("ob.family.invite")}</strong><p className="text-xsmall text-muted">{t("ob.family.inviteSub")}</p></div>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <Field id="obInvName" label={t("ob.family.inviteName")} error={errors.name}>
            <Input id="obInvName" value={f.name} onChange={set("name")} invalid={!!errors.name} autoComplete="off" />
          </Field>
          <Field id="obInvEmail" label={t("ob.family.inviteEmail")} error={errors.email}>
            <Input id="obInvEmail" type="email" value={f.email} onChange={set("email")} invalid={!!errors.email} autoComplete="off" />
          </Field>
        </div>
        <Field id="obInvRel" label={t("ob.family.inviteRel")} hint={t("common.optional")}>
          <Input id="obInvRel" value={f.relation} onChange={set("relation")} maxLength={120} placeholder={t("ob.family.inviteRelPh")} />
        </Field>
        {errors.form && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-100 p-3 text-small text-rose"><Icon name="error" size="sm" />{errors.form}</p>}
        <Button type="submit" variant="primary" icon="person_add" busy={busy} className="justify-self-start">{t("ob.family.send")}</Button>
      </form>
      {sent.length > 0 && (
        <ul aria-live="polite" className="m-0 grid list-none gap-2.5 p-0">
          {sent.map((inv) => (
            <li key={inv.id} className="grid gap-2 rounded-2xl bg-surface-2 p-4">
              <span className="flex flex-wrap items-center gap-2"><Icon name="mark_email_read" size="sm" className="text-sec-ink" /><strong>{inv.name}</strong><Tag>{inv.email}</Tag></span>
              {inv.link && (
                <>
                  <small className="text-xsmall text-muted">{t("ob.family.linkHelp")}</small>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2.5 py-2 text-xsmall">{inv.link}</code>
                    <Button size="sm" icon="content_copy" onClick={() => copy(inv.link, t("ob.family.linkCopied"))}>{t("ob.family.copyLink")}</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Discover({ tour, setTour }) {
  const t = useT();
  return (
    <div className="grid gap-5">
      <div><h1 className="text-[clamp(1.5rem,3vw,2rem)]!">{t("ob.discover.title")}</h1><p className="mt-1 text-muted">{t("ob.discover.sub")}</p></div>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {FEATURES.filter(([k]) => DISCOVER.includes(k)).map(([k, icon]) => (
          <li key={k} className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sec-soft text-sec-ink"><Icon name={icon} size="sm" /></span>
            <span><strong className="block">{t(`feat.${k}`)}</strong><span className="mt-0.5 block text-xsmall text-muted">{t(`feat.${k}.d`)}</span></span>
          </li>
        ))}
      </ul>
      <Check checked={tour} onChange={(e) => setTour(e.target.checked)}>
        <strong>{t("ob.discover.tour")}</strong><br /><span className="text-xsmall text-muted">{t("ob.discover.tourHelp")}</span>
      </Check>
    </div>
  );
}

function Done({ onGo }) {
  const t = useT();
  return (
    <div className="grid gap-4">
      <span className="grid size-14 place-items-center rounded-2xl bg-mint text-pine-900"><Icon name="celebration" className="text-[30px]!" /></span>
      <h1 className="text-[clamp(1.6rem,3.4vw,2.3rem)]!">{t("ob.done.title")}</h1>
      <p className="text-muted">{t("ob.done.sub")}</p>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {t("ob.done.ideas").map(([icon, label, to]) => (
          <li key={to}>
            <button type="button" onClick={() => onGo(to)}
              className="lift flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left text-ink">
              <span className="grid size-10 place-items-center rounded-xl bg-sec-soft text-sec-ink"><Icon name={icon} size="sm" /></span>
              <strong className="flex-1">{label}</strong><Icon name="arrow_forward" size="sm" className="text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Welcome() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { me, updateMe } = useSession();
  const { easy, setEasy, setPref, state } = useStore();
  const demo = !me;
  const [i, setI] = useState(0);
  const [draft, setDraft] = useState(() => ({ name: me?.name || "", easy: me ? me.easy_mode : easy }));
  const [nameError, setNameError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tour, setTour] = useState(true);
  const headRef = useRef(null);
  const step = STEPS[i];
  const firstName = (me?.name || state.people?.find((p) => p.id === ME)?.first || "").split(" ")[0];

  // Each new step starts at the top, with focus on it so screen readers read the new heading (not on first load).
  const moved = useRef(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (moved.current) headRef.current?.focus();
    moved.current = true;
  }, [i]);

  /** Mark the welcome steps done (finished or skipped), then go. */
  const finish = async (to = "/overview") => {
    setBusy(true);
    try {
      if (me) await updateMe({ onboarding_done: true });
      else setPref("welcomeDone", true);
      setPref("tourDone", !tour);
      navigate(to, { replace: true });
    } catch (err) {
      toast(t("ob.error", { msg: err.message }), { error: true });
      setBusy(false);
    }
  };

  const next = async () => {
    if (step === "profile") {
      const name = draft.name.trim();
      if (me && !name) { setNameError(t("au.errName")); document.getElementById("obName")?.focus(); return; }
      setNameError("");
      setEasy(draft.easy);
      if (me && (name !== me.name || draft.easy !== me.easy_mode)) {
        setBusy(true);
        try { await updateMe({ name, easy_mode: draft.easy }); toast(t("ob.profile.saved"), { icon: "check_circle", duration: 2000 }); }
        catch (err) { setNameError(err.message); setBusy(false); return; }
        setBusy(false);
      }
    }
    if (step === "done") { finish(); return; }
    setI(i + 1);
  };

  return (
    <PublicLayout title={t("ob.title")} minimal>
      <div className="mx-auto w-full max-w-190 px-4 pt-8 pb-16 sm:px-7">
        <Progress i={i} />
        <Card className="mt-6 p-6! sm:p-9!">
          <div ref={headRef} key={step} tabIndex={-1} className="animate-fade outline-none">
            {step === "hello" && <PagePhoto slot="welcome" alt={t("ob.photoAlt")} aspect="aspect-[16/7] max-sm:aspect-16/9" className="mb-6 rounded-2xl! shadow-card!" eager />}
            {step === "hello" && <Hello name={firstName} family={me?.family_name} admin={!!me?.family_code} />}
            {step === "profile" && <Profile draft={draft} setDraft={setDraft} error={nameError} demo={demo} />}
            {step === "family" && <Family me={me} demo={demo} />}
            {step === "discover" && <Discover tour={tour} setTour={setTour} />}
            {step === "done" && <Done onGo={finish} />}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-2.5 border-t border-line pt-5">
            {i > 0 && step !== "done" && <Button icon="arrow_back" onClick={() => setI(i - 1)} disabled={busy}>{t("common.back")}</Button>}
            {step !== "done" && <Button variant="ghost" onClick={() => finish()} disabled={busy}>{t("ob.skip")}</Button>}
            <span className="flex-1" />
            <Button variant="primary" size="lg" busy={busy} onClick={next}>
              {step === "hello" ? t("ob.start") : step === "done" ? t("ob.done.go") : t("ob.next")} <Icon name="arrow_forward" size="sm" />
            </Button>
          </div>
        </Card>
        <p className="mt-4 text-center text-xsmall text-muted">{t("ob.step", { i: i + 1, n: STEPS.length })} · {t("ob.skipHelp")}</p>
      </div>
    </PublicLayout>
  );
}
