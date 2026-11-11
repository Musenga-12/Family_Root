/* 5.7 Authentication and Family Onboarding */
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

function CreateAccount({ onEnter, setTab }) {
  const { setEasy } = useStore();
  const t = useT();
  const [f, setF] = useState({ name: "", email: "", pass: "", easy: true, trust: false });
  const [role, setRole] = useState("elder");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const s = passStrength(f.pass);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const submit = () => {
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
    onEnter(name.split(" ")[0], t("au.requestSent"));
  };

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
        <div className="min-w-0 flex-1"><strong className="text-small">{t("au.token")}</strong><p className="text-xsmall text-muted">{rich(t("au.invite", { code: "MCK-8294" }))}</p></div>
        <Button variant="ghost" size="sm" onClick={() => setTab("code")}>{t("au.changeCode")}</Button>
      </div>
      <Check checked={f.easy} onChange={set("easy")}>
        <strong>{t("au.easy")}</strong><br />
        <span className="text-xsmall text-muted">{t("au.easyHelp")}</span>
      </Check>
      <div className="grid gap-1.5">
        <Check id="ca-trust" checked={f.trust} onChange={set("trust")} aria-invalid={!!errors.trust || undefined}>
          <strong>{t("au.trust")}</strong><br />
          <span className="text-xsmall text-muted">{t("au.trustHelp")} <Link to="/privacy">{t("au.charter")}</Link></span>
        </Check>
        <ErrorText>{errors.trust}</ErrorText>
      </div>
      <Button variant="primary" size="lg" block type="submit">{t("au.create")} <Icon name="arrow_forward" size="sm" /></Button>
    </form>
  );
}

function SignIn({ onEnter }) {
  const toast = useToast();
  const t = useT();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const submit = () => {
    const e = { email: emailOk(email.trim()) ? "" : t("au.errSiEmail"), pass: pass ? "" : t("au.errSiPass") };
    setErrors(e);
    if (e.email || e.pass) { document.getElementById(e.email ? "siEmail" : "siPass").focus(); return; }
    onEnter(null, t("au.signedIn"));
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
        <a href="#/auth" onClick={(e) => { e.preventDefault(); toast(t("au.recovery"), { sub: t("au.recoverySub"), icon: "mail" }); }}>
          {t("au.forgot")}
        </a>
      </div>
      <Button variant="primary" size="lg" block type="submit">{t("au.signIn")} <Icon name="arrow_forward" size="sm" /></Button>
    </form>
  );
}

function FamilyCode({ onAccepted }) {
  const toast = useToast();
  const t = useT();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const c = code.trim().toUpperCase();
    const err = !/^[A-Z]{3}-?\d{4}$/.test(c) ? t("au.errCodeFormat")
      : c.replace("-", "") !== "MCK8294" ? t("au.errCodeUnknown") : "";
    setError(err);
    if (err) { document.getElementById("fcCode").focus(); return; }
    toast(t("au.codeOk"), { sub: t("au.codeOkSub"), icon: "verified" });
    onAccepted();
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
      <Button variant="primary" size="lg" block type="submit">{t("au.checkCode")} <Icon name="arrow_forward" size="sm" /></Button>
    </form>
  );
}

// Text for each step is au.step<n>, au.step<n>d and au.step<n>f.
const STEPS = [["badge", 1], ["verified", 2], ["account_tree", 3]];

export default function Auth() {
  const toast = useToast();
  const navigate = useNavigate();
  const t = useT();
  const [tab, setTabState] = useState("create");
  const setTab = (v) => {
    setTabState(v);
    setTimeout(() => document.querySelector("#authPanel input")?.focus());
  };
  const enter = (name, sub) => {
    toast(name ? t("au.welcome", { name }) : t("au.welcomeAgain"), { sub, icon: "celebration", duration: 6000 });
    navigate("/overview");
  };

  return (
    <>
      <div className="mb-6.5 grid justify-items-center gap-2.5 text-center">
        <Tag tone="sec" icon="shield">{t("au.haven")}</Tag>
        <h1>{t("au.h1a")}<br />{t("au.h1b")}</h1>
        <p className="max-w-140 text-muted">{t("au.intro")}</p>
      </div>

      <div className="mx-auto grid max-w-260 overflow-hidden rounded-[26px] bg-surface shadow-pop md:grid-cols-[minmax(0,.85fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5.5 bg-[radial-gradient(circle_at_20%_10%,var(--color-pine-700),var(--color-pine-900)_60%)] p-5 text-white sm:p-7">
          <div><Tag className="bg-white/10! text-mint!">{t("au.branch")}</Tag></div>
          <Photo p1="#a98a68" p2="#3c4f40" icon="family_restroom" aspect="aspect-[4/3.4]" alt={t("au.photoAlt")}>
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
          <Tabs label={t("au.options")} value={tab} onChange={setTab} className="grid! grid-cols-3"
            items={[["signin", t("au.tabSignIn")], ["create", t("au.tabCreate")], ["code", t("au.tabCode")]]} />
          <div id="authPanel" role="tabpanel">
            {tab === "signin" && <SignIn onEnter={enter} />}
            {tab === "create" && <CreateAccount onEnter={enter} setTab={setTab} />}
            {tab === "code" && <FamilyCode onAccepted={() => setTab("create")} />}
          </div>
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
        <Button to="/privacy">{t("au.readCharter")}</Button>
      </Card>
    </>
  );
}
