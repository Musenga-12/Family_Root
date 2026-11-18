/* 5.7 Authentication and Family Onboarding.
   One screen behind several addresses: /login, /register, /join (family code), /forgot-password and /reset-password.
   /auth still works for older links (including ?reset=… and ?invite=…). */
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import PublicLayout from "../components/PublicLayout";
import { authApi, connected } from "../lib/api";
import { useSession } from "../lib/session";
import { useToast } from "../components/toastContext";
import { Button, Card, Check, ErrorText, Eyebrow, Field, Icon, IconBox, Input, InputIcon, Photo, PhotoOverlay, Tabs, Tag } from "../components/ui";
import { cx, emailOk } from "../lib/format";
import { rich, useT } from "../lib/i18n";
import { useStore } from "../lib/store";

// Titles and subtitles are au.role.<key> and au.role.<key>Sub.
const ROLES = [["elder", "elderly"], ["parent", "family_restroom"], ["youth", "sentiment_satisfied"]];
const STRENGTH_COLOR = ["", "bg-rose", "bg-gold", "bg-pine-600", "bg-pine-800"];

function passStrength(v) {
  let s = 0;
  if (v.length >= 6) s++;
  if (v.length >= 10) s++;
  if ((/[A-Z]/.test(v) && /[a-z]/.test(v)) || /\s/.test(v)) s++;
  if (/\d|[^\w\s]/.test(v) && v.length >= 12) s++;
  return s;
}

function RoleGrid({ role, onPick }) {
  const refs = useRef([]);
  const t = useT();
  const pick = (i) => { onPick(ROLES[i][0]); refs.current[i].focus(); };
  return (
    <div role="radiogroup" aria-label={t("au.roleGroup")} className="grid gap-2.5 sm:grid-cols-3">
      {ROLES.map(([k, icon], i) => {
        const on = role === k;
        return (
          <button key={k} ref={(el) => (refs.current[i] = el)} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            onClick={() => pick(i)}
            onKeyDown={(e) => {
              if (["ArrowRight", "ArrowDown"].includes(e.key)) { e.preventDefault(); pick((i + 1) % ROLES.length); }
              if (["ArrowLeft", "ArrowUp"].includes(e.key)) { e.preventDefault(); pick((i + ROLES.length - 1) % ROLES.length); }
            }}
            className={cx("relative grid cursor-pointer gap-1 rounded-[14px] border-2 p-3 text-left", on ? "border-sec bg-sec-soft shadow-[0_6px_18px_-10px_var(--sec)]" : "lift border-line bg-surface")}>
            <Icon name={icon} />
            <strong className="text-[.92rem]">{t(`au.role.${k}`)}</strong>
            <small className="text-[.7rem] text-muted">{t(`au.role.${k}Sub`)}</small>
            {on && <Icon name="check_circle" size="sm" className="absolute top-2 right-2 text-pine-700" />}
          </button>
        );
      })}
    </div>
  );
}

/** `join` = { code, family } after a family code was checked; `invite` = { token, family_name, name, email } from an invitation link. */
function CreateAccount({ onEnter, onPending, setTab, join, invite }) {
  const { setEasy } = useStore();
  const { signIn } = useSession();
  const t = useT();
  const [f, setF] = useState(() => ({ name: invite?.name || "", email: invite?.email || "", pass: "", easy: true, trust: false, relation: "" }));
  const [role, setRole] = useState("elder");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const s = passStrength(f.pass);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const submit = async () => {
    const name = f.name.trim(), email = f.email.trim();
    const e = {
      name: name ? "" : t("au.errName"),
      email: !email ? t("au.errEmailEmpty") : emailOk(email) ? "" : t("au.errEmail"),
      pass: f.pass.length >= 10 ? "" : t("au.errPass", { n: f.pass.length }),
      trust: f.trust ? "" : t("au.errTrust"),
    };
    setErrors(e);
    const bad = ["name", "email", "pass", "trust"].find((k) => e[k]);
    if (bad) { document.getElementById("ca-" + bad).focus(); return; }
    setEasy(f.easy);
    if (!connected) { onEnter(name.split(" ")[0], t("au.requestSent"), { welcome: true }); return; }
    setBusy(true);
    try {
      const r = await authApi.register({
        name, email, password: f.pass, easy_mode: f.easy,
        ...(invite ? { invite_token: invite.token } : join ? { family_code: join.code, relation: f.relation.trim() || null } : {}),
      });
      if (r.status === "pending") { onPending(r.family_name); return; }
      const me = await signIn(r.access_token);
      if (me) onEnter(name.split(" ")[0], t(invite || join ? "au.signedInTo" : "au.newFamilyDone", { family: r.family_name }), { welcome: !me.onboarding_done });
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setBusy(false);
    }
  };
  // What this account will join: the invitation, the checked family code, or (on a server, with neither) a new archive.
  const joining = !connected ? rich(t("au.invite", { code: "MCK-8294" }))
    : invite ? t("au.joiningInvite", { family: invite.family_name })
    : join ? t("au.joiningCode", { family: join.family, code: join.code })
    : t("au.newFamily");

  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div><h2>{t("au.joinTitle")}</h2><p className="mt-2 text-small text-muted">{t("au.joinSub")}</p></div>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field id="ca-name" label={t("au.name")} hint={t("common.required")} help={t("au.nameHelp")} error={errors.name}>
          <InputIcon icon="badge"><Input id="ca-name" autoComplete="name" value={f.name} onChange={set("name")} invalid={!!errors.name} placeholder={t("au.namePh")} /></InputIcon>
        </Field>
        <Field id="ca-email" label={t("au.email")} hint={t("au.emailHint")} help={t("au.emailHelp")} error={errors.email}>
          <InputIcon icon="mail"><Input id="ca-email" type="email" autoComplete="email" value={f.email} onChange={set("email")} invalid={!!errors.email} placeholder="sarah@example.com" /></InputIcon>
        </Field>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="ca-pass" className="flex items-center justify-between gap-2 text-[.8rem] font-semibold">
          {t("au.pass")}
          <Button variant="ghost" size="sm" icon={show ? "visibility_off" : "visibility"} iconSize="xs" aria-pressed={show} onClick={() => setShow(!show)}>{show ? t("au.hide") : t("au.show")}</Button>
        </label>
        <InputIcon icon="key">
          <Input id="ca-pass" type={show ? "text" : "password"} autoComplete="new-password" value={f.pass} onChange={set("pass")} invalid={!!errors.pass}
            placeholder={t("au.passPh")} aria-describedby="caPassHelp" />
        </InputIcon>
        <div className="grid grid-cols-4 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => <i key={i} className={cx("h-1.25 rounded", f.pass && i <= Math.max(1, s) ? STRENGTH_COLOR[Math.max(1, s)] : "bg-surface-3")} />)}
        </div>
        <span id="caPassHelp" className="text-[.74rem] text-muted">
          {f.pass ? t("au.passLen", { label: t("au.strength")[s], n: f.pass.length }) : t("au.passHelp")}
        </span>
        <ErrorText id="ca-passErr">{errors.pass}</ErrorText>
      </div>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 flex w-full items-center justify-between text-small font-semibold">
          {t("au.selectRole")} <span className="text-xsmall font-medium text-pine-700">{t("au.tailors")}</span>
        </legend>
        <RoleGrid role={role} onPick={(r) => { setRole(r); setF((x) => ({ ...x, easy: r === "elder" })); }} />
      </fieldset>
      <div className="flex items-center gap-3 rounded-[14px] bg-surface-2 p-3">
        <IconBox icon="key" tone="dark" />
        <div className="min-w-0 flex-1"><strong className="text-small">{t("au.token")}</strong><p className="text-xsmall text-muted">{joining}</p></div>
        {!invite && <Button variant="ghost" size="sm" onClick={() => setTab("code")}>{t(connected && !join ? "au.useCode" : "au.changeCode")}</Button>}
      </div>
      {connected && join && !invite && (
        <Field id="ca-relation" label={t("au.relation")} hint={t("common.optional")} help={t("au.relationHelp")}>
          <Input id="ca-relation" value={f.relation} onChange={set("relation")} maxLength={120} placeholder={t("au.relationPh")} />
        </Field>
      )}
      <Check checked={f.easy} onChange={set("easy")}>
        <strong>{t("au.easy")}</strong><br />
        <span className="text-xsmall text-muted">{t("au.easyHelp")}</span>
      </Check>
      <div className="grid gap-1.5">
        <Check id="ca-trust" checked={f.trust} onChange={set("trust")} aria-invalid={!!errors.trust || undefined}>
          <strong>{t("au.trust")}</strong><br />
          <span className="text-xsmall text-muted">{t("au.trustHelp")} <Link to="/privacy-policy">{t("au.charter")}</Link> · <Link to="/terms">{t("terms.title")}</Link></span>
        </Check>
        <ErrorText>{errors.trust}</ErrorText>
      </div>
      <FormError>{errors.form}</FormError>
      <Button variant="primary" size="lg" block type="submit" busy={busy}>{t("au.create")} <Icon name="arrow_forward" size="sm" /></Button>
      <p className="text-center text-small text-muted">{t("auth.haveAccount")} <Link to="/login">{t("pub.login")}</Link></p>
    </form>
  );
}

/** A problem the server reported for the whole form (wrong password, request still waiting…), in its own words. */
function FormError({ children }) {
  if (!children) return null;
  return <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-100 p-3 text-small text-rose"><Icon name="error" size="sm" /> <span>{children}</span></p>;
}

function SignIn({ onEnter }) {
  const t = useT();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e = { email: emailOk(email.trim()) ? "" : t("au.errSiEmail"), pass: pass ? "" : t("au.errSiPass") };
    setErrors(e);
    if (e.email || e.pass) { document.getElementById(e.email ? "siEmail" : "siPass").focus(); return; }
    if (!connected) { onEnter(null, t("au.signedIn")); return; }
    setBusy(true);
    try {
      const r = await authApi.login(email.trim(), pass);
      const me = await signIn(r.access_token);
      // Someone who signed up but left before finishing the welcome steps picks them up again.
      if (me) onEnter(me.name.split(" ")[0], t("au.signedInTo", { family: me.family_name }), { welcome: me.onboarding_done === false });
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div><h2>{t("au.welcomeBack")}</h2><p className="mt-2 text-small text-muted">{t("au.welcomeBackSub")}</p></div>
      <Field id="siEmail" label={t("au.email")} error={errors.email}>
        <InputIcon icon="mail"><Input id="siEmail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} placeholder="you@example.com" /></InputIcon>
      </Field>
      <Field id="siPass" label={t("au.passphrase")} error={errors.pass}>
        <InputIcon icon="key"><Input id="siPass" type={show ? "text" : "password"} autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} invalid={!!errors.pass} /></InputIcon>
      </Field>
      <div className="flex items-center justify-between gap-2.5 text-small">
        <Check checked={show} onChange={(e) => setShow(e.target.checked)}>{t("au.showPass")}</Check>
        <Link to="/forgot-password" state={{ email: email.trim() }}>{t("au.forgot")}</Link>
      </div>
      <FormError>{errors.form}</FormError>
      <Button variant="primary" size="lg" block type="submit" busy={busy}>{t("au.signIn")} <Icon name="arrow_forward" size="sm" /></Button>
      <p className="text-center text-small text-muted">{t("auth.noAccount")} <Link to="/register">{t("pub.register")}</Link></p>
    </form>
  );
}

/** /forgot-password: ask for a link to choose a new password. The server answers the same way whether or not the
 *  email has an account, so the confirmation never reveals who is registered. */
function ForgotPassword() {
  const t = useT();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || "");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!emailOk(email.trim())) { setError(t("au.forgotNeedEmail")); document.getElementById("fpEmail").focus(); return; }
    setError("");
    if (!connected) { setSent(t("auth.forgotDemo")); return; }
    setBusy(true);
    try { setSent((await authApi.forgotPassword(email.trim())).detail); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  if (sent) {
    return (
      <div role="status" className="grid justify-items-center gap-3 rounded-2xl bg-surface-2 p-6 text-center">
        <Icon name="mark_email_read" className="text-[40px]! text-sec-ink" />
        <h2>{t("auth.forgotSent")}</h2>
        <p className="max-w-100 text-small text-muted">{sent}</p>
        {connected && <p className="max-w-100 text-xsmall text-muted">{t("auth.forgotDev")}</p>}
        <Button to="/login" icon="arrow_back">{t("auth.backToLogin")}</Button>
      </div>
    );
  }
  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div><h2>{t("auth.forgotTitle")}</h2><p className="mt-2 text-small text-muted">{t("auth.forgotSub")}</p></div>
      <Field id="fpEmail" label={t("au.email")} error={error}>
        <InputIcon icon="mail"><Input id="fpEmail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} placeholder="you@example.com" /></InputIcon>
      </Field>
      <Button variant="primary" size="lg" block type="submit" busy={busy}>{t("auth.forgotSend")} <Icon name="arrow_forward" size="sm" /></Button>
      <Button variant="ghost" icon="arrow_back" to="/login">{t("auth.backToLogin")}</Button>
    </form>
  );
}

/** Opened from the link in a "choose a new password" message (#/reset-password?token=…, or the older #/auth?reset=…). */
function ResetPassword({ token, onEnter }) {
  const t = useT();
  const { signIn } = useSession();
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pass.length < 10) { setErrors({ pass: t("au.errPass", { n: pass.length }) }); document.getElementById("rpPass").focus(); return; }
    setBusy(true);
    try {
      const r = await authApi.resetPassword(token, pass);
      const me = await signIn(r.access_token);
      if (me) onEnter(me.name.split(" ")[0], t("au.resetDone"), { welcome: me.onboarding_done === false });
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div><h2>{t("au.resetTitle")}</h2><p className="mt-2 text-small text-muted">{t("au.resetSub")}</p></div>
      <Field id="rpPass" label={t("au.pass")} error={errors.pass}>
        <InputIcon icon="key"><Input id="rpPass" type={show ? "text" : "password"} autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} invalid={!!errors.pass} /></InputIcon>
      </Field>
      <Check checked={show} onChange={(e) => setShow(e.target.checked)}>{t("au.showPass")}</Check>
      <FormError>{errors.form}</FormError>
      <Button variant="primary" size="lg" block type="submit" busy={busy}>{t("au.resetSave")} <Icon name="arrow_forward" size="sm" /></Button>
    </form>
  );
}

function FamilyCode({ onAccepted }) {
  const toast = useToast();
  const t = useT();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const c = code.trim().toUpperCase();
    // Codes look like MCK-8294; the dash is optional when typing.
    const formatted = /^[A-Z]{3}\d{4}$/.test(c) ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
    let err = !/^[A-Z]{3}-\d{4}$/.test(formatted) ? t("au.errCodeFormat") : "";
    let family = null;
    if (!err && !connected && formatted !== "MCK-8294") err = t("au.errCodeUnknown");
    if (!err && connected) {
      setBusy(true);
      try { family = (await authApi.verifyCode(formatted)).family_name; }
      catch (e) { err = e.status === 404 ? t("au.errCodeUnknown") : e.message; }
      finally { setBusy(false); }
    }
    setError(err);
    if (err) { document.getElementById("fcCode").focus(); return; }
    toast(family ? t("au.codeFound", { family }) : t("au.codeOk"), { sub: t("au.codeOkSub"), icon: "verified" });
    onAccepted({ code: formatted, family });
  };
  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div>
        <h2>{t("au.codeTitle")}</h2>
        <p className="mt-2 text-small text-muted">{t("au.codeSub")}</p>
      </div>
      <Field id="fcCode" label={t("au.code")} hint={t("au.codeHint")} help={t("au.codeHelp")} error={error}>
        <Input id="fcCode" value={code} onChange={(e) => setCode(e.target.value)} invalid={!!error} placeholder="MCK-8294" autoComplete="off" maxLength={8}
          className="text-center text-[1.3rem] tracking-[.15em] uppercase" />
      </Field>
      <Button variant="primary" size="lg" block type="submit" busy={busy}>{t("au.checkCode")} <Icon name="arrow_forward" size="sm" /></Button>
    </form>
  );
}

// Text for each step is au.step<n>, au.step<n>d and au.step<n>f.
const STEPS = [["badge", 1], ["verified", 2], ["account_tree", 3]];

// Tab -> address, so each form has its own link and the browser's Back button moves between them.
const TAB_PATH = { signin: "/login", create: "/register", code: "/join" };
const TITLE = { signin: "pub.login", create: "pub.register", code: "au.tabCode", forgot: "auth.forgotTitle", reset: "au.resetTitle" };

/** `mode` comes from the address: signin | create | code | forgot | reset. Without one (/auth) it is picked as before. */
export default function Auth({ mode }) {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { status, me } = useSession();
  const t = useT();
  const resetToken = connected ? params.get("token") || params.get("reset") : null;
  const inviteToken = connected ? params.get("invite") : null;
  const resetting = mode === "reset" || !!resetToken;
  const [tabState, setTabState] = useState(inviteToken ? "create" : connected ? "signin" : "create");
  const tab = mode && TAB_PATH[mode] ? mode : tabState;
  const [join, setJoin] = useState(null);
  const [invite, setInvite] = useState(null);
  const [inviteError, setInviteError] = useState("");
  const [pending, setPending] = useState(null);
  const setTab = (v) => {
    setTabState(v);
    // Keep ?invite=… and where you were heading when moving between the forms.
    navigate({ pathname: TAB_PATH[v], search: location.search }, { replace: true, state: location.state });
    setTimeout(() => document.querySelector("#authPanel input")?.focus());
  };
  // New accounts go to the welcome steps; everyone else back to the page that sent them here, or the Overview.
  const enter = (name, sub, { welcome } = {}) => {
    toast(name ? t("au.welcome", { name }) : t("au.welcomeAgain"), { sub, icon: "celebration", duration: 6000 });
    navigate(welcome ? "/welcome" : location.state?.from || "/overview", { replace: true });
  };

  // An invitation link greets the person by name and fills in their email.
  useEffect(() => {
    if (!inviteToken) return;
    authApi.inviteInfo(inviteToken).then((i) => setInvite({ token: inviteToken, ...i }), (e) => setInviteError(e.message));
  }, [inviteToken]);

  // Already signed in (and not here to reset a password): straight into the archive.
  // Signing in or up lands here too, as soon as the account loads: unfinished welcome steps come first.
  if (status === "signedIn" && !resetting) return <Navigate to={me?.onboarding_done === false ? "/welcome" : location.state?.from || "/overview"} replace />;

  // A public page: the site header and footer, outside the signed-in app shell (no sidebar, quick actions or tour).
  return (
    <PublicLayout title={t(TITLE[resetting ? "reset" : mode === "forgot" ? "forgot" : tab])}>
      <div className="mx-auto w-full max-w-300 px-4 pt-8 sm:px-7">
      <div className="mb-6.5 grid justify-items-center gap-2.5 text-center">
        <Tag tone="sec" icon="shield">{t("au.haven")}</Tag>
        <h1>{t("au.h1a")}<br />{t("au.h1b")}</h1>
        <p className="max-w-140 text-muted">{t("au.intro")}</p>
      </div>

      <div className="mx-auto grid max-w-260 overflow-hidden rounded-[26px] bg-surface shadow-pop md:grid-cols-[minmax(0,.85fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5.5 bg-[radial-gradient(circle_at_20%_10%,var(--color-pine-700),var(--color-pine-900)_60%)] p-5 text-white sm:p-7">
          <div><Tag className="bg-white/10! text-mint!">{t("au.branch")}</Tag></div>
          <Photo p1="#a98a68" p2="#3c4f40" icon="family_restroom" sample="auth" aspect="aspect-[4/3.4]" alt={t("au.photoAlt")}>
            <PhotoOverlay className="flex items-center justify-between gap-2.5">
              <strong>{t("land.folio")}</strong><Tag className="bg-white/20! text-white!">{t("au.memories", { n: 142 })}</Tag>
            </PhotoOverlay>
          </Photo>
          <blockquote className="m-0 font-serif text-[1.25rem] leading-[1.45] text-white italic">
            {t("au.quote")}
            <footer className="mt-2.5 font-sans text-small text-on-dark not-italic">{t("au.quoteBy")}</footer>
          </blockquote>
          <div className="mt-auto grid gap-2">
            {[["lock", "au.f1"], ["block", "au.f2"], ["accessibility_new", "au.f3"]].map(([i, k]) => (
              <div key={k} className="flex gap-2.5 rounded-xl bg-white/10 px-3 py-2.5 text-[.8rem]">
                <Icon name={i} /><span><strong className="block text-white">{t(k)}</strong><small className="text-on-dark">{t(`${k}d`)}</small></span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid content-start gap-4 p-5 sm:p-7.5">
          {resetting ? (resetToken ? <ResetPassword token={resetToken} onEnter={enter} /> : (
            <div className="grid gap-4">
              <FormError>{connected ? t("auth.resetMissing") : t("auth.forgotDemo")}</FormError>
              <Button to="/forgot-password" icon="lock_reset">{t("auth.forgotSend")}</Button>
            </div>
          )) : mode === "forgot" ? <ForgotPassword /> : pending ? (
            // A join request waits for an Admin: say so plainly instead of pretending the person is in.
            <div role="status" className="grid justify-items-center gap-3 rounded-2xl bg-surface-2 p-6 text-center">
              <Icon name="hourglass_top" className="text-[40px]! text-sec-ink" />
              <h2>{t("au.pendingTitle", { family: pending })}</h2>
              <p className="max-w-100 text-small text-muted">{t("au.pendingSub")}</p>
              <Button onClick={() => { setPending(null); setTab("signin"); }}>{t("au.tabSignIn")}</Button>
            </div>
          ) : (
            <>
              {invite && <p className="flex items-start gap-2 rounded-xl bg-sec-soft p-3 text-small"><Icon name="mail" size="sm" className="text-sec-ink" /> {t("au.invited", { name: invite.name.split(" ")[0], family: invite.family_name })}</p>}
              <FormError>{inviteError}</FormError>
              <Tabs label={t("au.options")} value={tab} onChange={setTab} className="grid! grid-cols-3"
                items={[["signin", t("au.tabSignIn")], ["create", t("au.tabCreate")], ["code", t("au.tabCode")]]} />
              <div id="authPanel" role="tabpanel">
                {tab === "signin" && <SignIn onEnter={enter} />}
                {/* Re-created when an invitation arrives, so its name and email are filled in. */}
                {tab === "create" && <CreateAccount key={invite?.token || "new"} onEnter={enter} onPending={setPending} setTab={setTab} join={join} invite={invite} />}
                {tab === "code" && <FamilyCode onAccepted={(j) => { setJoin(j); setTab("create"); }} />}
              </div>
            </>
          )}
          <p className="flex items-center gap-2.5 text-xsmall text-muted"><Icon name="support_agent" size="sm" /> {t("au.help")}</p>
        </div>
      </div>

      <section className="mt-7 text-center">
        <Eyebrow>{t("au.flow")}</Eyebrow>
        <h2 className="mt-2">{t("au.flowTitle")}</h2>
        <p className="mt-2 text-muted">{t("au.flowSub")}</p>
      </section>
      <div className="mt-4 grid gap-4.5 md:grid-cols-3">
        {STEPS.map(([i, n]) => (
          <div key={n} className="grid content-start gap-2.5 rounded-[18px] border border-line bg-surface p-5">
            <span className="grid size-10 place-items-center rounded-[10px] bg-surface-2 text-pine-800"><Icon name={i} /></span>
            <div className="flex items-center gap-2.5"><Tag tone="mint">{t("au.step", { n: String(n).padStart(2, "0") })}</Tag><h3>{t(`au.step${n}`)}</h3></div>
            <p className="text-small text-muted">{t(`au.step${n}d`)}</p>
            <span className="text-xsmall text-pine-700"><Icon name="check" size="xs" /> {t(`au.step${n}f`)}</span>
          </div>
        ))}
      </div>
      <Card tone="soft" className="mt-7 flex flex-wrap items-center gap-2.5">
        <IconBox icon="handshake" tone="gold" />
        <div className="min-w-0 flex-1">
          <h3>{t("au.guarantee")}</h3>
          <p className="text-small text-muted">{t("au.guaranteeText")}</p>
        </div>
        <Button to="/privacy-policy">{t("au.readCharter")}</Button>
      </Card>
      </div>
    </PublicLayout>
  );
}
