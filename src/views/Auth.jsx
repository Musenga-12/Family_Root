/* 5.7 Authentication and Family Onboarding */
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../components/toastContext";
import { Button, Card, Check, ErrorText, Eyebrow, Field, Icon, IconBox, Input, InputIcon, Photo, PhotoOverlay, Tabs, Tag } from "../components/ui";
import { cx, emailOk } from "../lib/format";
import { useStore } from "../lib/store";

const ROLES = [
  ["elder", "elderly", "Elder / Matriarch", "Primary oral narrator"],
  ["parent", "family_restroom", "Parent / Adult Kin", "Family archivist"],
  ["youth", "sentiment_satisfied", "Youth / Grandchild", "Age 13+ descendant"],
];
const STRENGTH_LABEL = ["Too short", "Too short — keep going", "Fair — almost there", "Good passphrase", "Strong passphrase"];
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
  const pick = (i) => { onPick(ROLES[i][0]); refs.current[i].focus(); };
  return (
    <div role="radiogroup" aria-label="Generational role" className="grid gap-2.5 sm:grid-cols-3">
      {ROLES.map(([k, icon, title, sub], i) => {
        const on = role === k;
        return (
          <button key={k} ref={(el) => (refs.current[i] = el)} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            onClick={() => pick(i)}
            onKeyDown={(e) => {
              if (["ArrowRight", "ArrowDown"].includes(e.key)) { e.preventDefault(); pick((i + 1) % ROLES.length); }
              if (["ArrowLeft", "ArrowUp"].includes(e.key)) { e.preventDefault(); pick((i + ROLES.length - 1) % ROLES.length); }
            }}
            className={cx("relative grid cursor-pointer gap-1 rounded-[14px] border-2 p-3 text-left", on ? "border-pine-700 bg-mint-100" : "border-line bg-surface-2")}>
            <Icon name={icon} />
            <strong className="text-[.92rem]">{title}</strong>
            <small className="text-[.7rem] text-muted">{sub}</small>
            {on && <Icon name="check_circle" size="sm" className="absolute top-2 right-2 text-pine-700" />}
          </button>
        );
      })}
    </div>
  );
}

function CreateAccount({ onEnter, setTab }) {
  const { setEasy } = useStore();
  const [f, setF] = useState({ name: "", email: "", pass: "", easy: true, trust: false });
  const [role, setRole] = useState("elder");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const s = passStrength(f.pass);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const submit = () => {
    const name = f.name.trim(), email = f.email.trim();
    const e = {
      name: name ? "" : "Please enter your name so relatives can recognise you.",
      email: !email ? "Please enter your email — we use it only for sign-in and account recovery."
        : emailOk(email) ? "" : "That email looks incomplete. It should look like name@example.com.",
      pass: f.pass.length >= 10 ? "" : `Your passphrase needs at least 10 characters (you have ${f.pass.length}). Try a short sentence like “rose cottage summers”.`,
      trust: f.trust ? "" : "Please accept the Family Privacy Trust to continue.",
    };
    setErrors(e);
    const bad = ["name", "email", "pass", "trust"].find((k) => e[k]);
    if (bad) { document.getElementById("ca-" + bad).focus(); return; }
    setEasy(f.easy);
    onEnter(name.split(" ")[0], "Your request was sent to custodian Sarah Mackenzie. You can explore the archive while it's confirmed.");
  };

  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div><h2>Join the Living Family Archive</h2><p className="mt-2 text-small text-muted">Step into your branch with a verified lineage profile. We only ask for what we need.</p></div>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field id="ca-name" label="Full or chosen name" hint="Required" help="Shown to relatives so they recognise you." error={errors.name}>
          <InputIcon icon="badge"><Input id="ca-name" autoComplete="name" value={f.name} onChange={set("name")} invalid={!!errors.name} placeholder="e.g. Sarah Mackenzie" /></InputIcon>
        </Field>
        <Field id="ca-email" label="Email address" hint="For sign-in & recovery" help="Never shown publicly or shared." error={errors.email}>
          <InputIcon icon="mail"><Input id="ca-email" type="email" autoComplete="email" value={f.email} onChange={set("email")} invalid={!!errors.email} placeholder="sarah@example.com" /></InputIcon>
        </Field>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="ca-pass" className="flex items-center justify-between gap-2 text-[.8rem] font-semibold">
          Sanctuary passphrase
          <Button variant="ghost" size="sm" icon={show ? "visibility_off" : "visibility"} iconSize="xs" aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</Button>
        </label>
        <InputIcon icon="key">
          <Input id="ca-pass" type={show ? "text" : "password"} autoComplete="new-password" value={f.pass} onChange={set("pass")} invalid={!!errors.pass}
            placeholder="Create a memorable phrase" aria-describedby="caPassHelp" />
        </InputIcon>
        <div className="grid grid-cols-4 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => <i key={i} className={cx("h-1.25 rounded", f.pass && i <= Math.max(1, s) ? STRENGTH_COLOR[Math.max(1, s)] : "bg-surface-3")} />)}
        </div>
        <span id="caPassHelp" className="text-[.74rem] text-muted">
          {f.pass ? `${STRENGTH_LABEL[s]} (${f.pass.length} characters)` : "Use at least 10 characters — a short sentence is easiest to remember."}
        </span>
        <ErrorText id="ca-passErr">{errors.pass}</ErrorText>
      </div>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 flex w-full items-center justify-between text-small font-semibold">
          Select your generational role <span className="text-xsmall font-medium text-pine-700">Tailors accessibility</span>
        </legend>
        <RoleGrid role={role} onPick={(r) => { setRole(r); setF((x) => ({ ...x, easy: r === "elder" })); }} />
      </fieldset>
      <div className="flex items-center gap-3 rounded-[14px] bg-surface-2 p-3">
        <IconBox icon="key" tone="dark" />
        <div className="min-w-0 flex-1"><strong className="text-small">Mackenzie Family Token</strong><p className="text-xsmall text-muted">Joining through active invite: <strong>MCK-8294</strong></p></div>
        <Button variant="ghost" size="sm" onClick={() => setTab("code")}>Change Family Code</Button>
      </div>
      <Check checked={f.easy} onChange={set("easy")}>
        <strong>Enable Easy-to-Read mode by default</strong><br />
        <span className="text-xsmall text-muted">Larger text, higher contrast, and bigger buttons. You can change this anytime.</span>
      </Check>
      <div className="grid gap-1.5">
        <Check id="ca-trust" checked={f.trust} onChange={set("trust")} aria-invalid={!!errors.trust || undefined}>
          <strong>I accept the Family Privacy Trust</strong><br />
          <span className="text-xsmall text-muted">No advertising or data sales. Stories and photos are only visible to approved relatives. <Link to="/privacy">Read the charter</Link></span>
        </Check>
        <ErrorText>{errors.trust}</ErrorText>
      </div>
      <Button variant="primary" size="lg" block type="submit">Create Account &amp; Enter Family Sanctuary <Icon name="arrow_forward" size="sm" /></Button>
    </form>
  );
}

function SignIn({ onEnter }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const submit = () => {
    const e = { email: emailOk(email.trim()) ? "" : "Enter the email you joined with, e.g. name@example.com.", pass: pass ? "" : "Enter your passphrase." };
    setErrors(e);
    if (e.email || e.pass) { document.getElementById(e.email ? "siEmail" : "siPass").focus(); return; }
    onEnter("back", "Signed in to The Mackenzie Family archive.");
  };
  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div><h2>Welcome back</h2><p className="mt-2 text-small text-muted">Sign in to your family's private archive.</p></div>
      <Field id="siEmail" label="Email address" error={errors.email}>
        <InputIcon icon="mail"><Input id="siEmail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} placeholder="you@example.com" /></InputIcon>
      </Field>
      <Field id="siPass" label="Passphrase" error={errors.pass}>
        <InputIcon icon="key"><Input id="siPass" type={show ? "text" : "password"} autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} invalid={!!errors.pass} /></InputIcon>
      </Field>
      <div className="flex items-center justify-between gap-2.5 text-small">
        <Check checked={show} onChange={(e) => setShow(e.target.checked)}>Show passphrase</Check>
        <a href="#/auth" onClick={(e) => { e.preventDefault(); toast("Recovery link sent", { sub: "If that email is registered, a custodian-approved reset link is on its way.", icon: "mail" }); }}>
          Forgot passphrase?
        </a>
      </div>
      <Button variant="primary" size="lg" block type="submit">Sign in <Icon name="arrow_forward" size="sm" /></Button>
      <Button block icon="passkey" onClick={() => toast("Passkeys are not available in this demo", { sub: "Use email and passphrase, or create an account.", icon: "passkey" })}>
        Sign in with a Passkey
      </Button>
    </form>
  );
}

function FamilyCode({ onAccepted }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const c = code.trim().toUpperCase();
    const err = !/^[A-Z]{3}-?\d{4}$/.test(c) ? "Family codes have 3 letters and 4 numbers, like MCK-8294."
      : c.replace("-", "") !== "MCK8294" ? "We couldn't find that code. Check with the relative who invited you — codes can expire after 14 days." : "";
    setError(err);
    if (err) { document.getElementById("fcCode").focus(); return; }
    toast("Code accepted — The Mackenzie Family", { sub: "Now create your account to finish joining.", icon: "verified" });
    onAccepted();
  };
  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div>
        <h2>Join with a Family Code</h2>
        <p className="mt-2 text-small text-muted">A relative can give you a code from their “Invite Relative” screen. It links you to the right branch — a custodian still approves you.</p>
      </div>
      <Field id="fcCode" label="Family code" hint="Format: ABC-1234" help="Tip: try MCK-8294 in this demo." error={error}>
        <Input id="fcCode" value={code} onChange={(e) => setCode(e.target.value)} invalid={!!error} placeholder="MCK-8294" autoComplete="off" maxLength={8}
          className="text-center text-[1.3rem] tracking-[.15em] uppercase" />
      </Field>
      <Button variant="primary" size="lg" block type="submit">Check code <Icon name="arrow_forward" size="sm" /></Button>
    </form>
  );
}

const STEPS = [
  ["badge", "Step 01", "Kinship Identity", "Submit your basic descent line or enter the invitation code handed down by an active family archivist.", "Instant encryption seal"],
  ["verified", "Step 02", "Custodian Approval", "Family custodians (Mary or Sarah Mackenzie) receive a prompt to confirm your lineage branch access.", "Guaranteed kinship verification"],
  ["account_tree", "Step 03", "Living Tree Unlocked", "Explore 4 generations of oral recordings, ancestral portraits, handwritten recipes, and interactive milestones.", "Full vault access"],
];

export default function Auth() {
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTabState] = useState("create");
  const setTab = (t) => {
    setTabState(t);
    setTimeout(() => document.querySelector("#authPanel input")?.focus());
  };
  const enter = (name, sub) => {
    toast(`Welcome, ${name}!`, { sub, icon: "celebration", duration: 6000 });
    navigate("/overview");
  };

  return (
    <>
      <div className="mb-6.5 grid justify-items-center gap-2.5 text-center">
        <Tag tone="mint" icon="shield">PRIVATE FAMILY HAVEN</Tag>
        <h1>Every generation has a story.<br />Keep yours connected.</h1>
        <p className="max-w-140 text-muted">Join the private living archive for the Mackenzie lineage — a dignified space kept away from public web trackers, data brokers and commercial noise.</p>
      </div>

      <div className="mx-auto grid max-w-260 overflow-hidden rounded-[26px] bg-surface shadow-pop md:grid-cols-[minmax(0,.85fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5.5 bg-[radial-gradient(circle_at_20%_10%,#2a6450,var(--color-pine-900)_60%)] p-5 text-[#e8f3ee] sm:p-7">
          <div><Tag className="bg-white/10! text-mint!">● BRANCH 04 · MACKENZIE LINE</Tag></div>
          <Photo p1="#a98a68" p2="#3c4f40" icon="family_restroom" aspect="aspect-[4/3.4]" alt="A grandfather, mother and young child looking at a family album together">
            <PhotoOverlay className="flex items-center justify-between gap-2.5">
              <strong>The Mackenzie Folio</strong><Tag className="bg-white/20! text-white!">142 Memories</Tag>
            </PhotoOverlay>
          </Photo>
          <blockquote className="m-0 font-serif text-[1.25rem] leading-[1.45] text-white italic">
            “A private sanctuary for our stories, safe from commercial social media and preserved for generations unborn.”
            <footer className="mt-2.5 font-sans text-small text-on-dark not-italic">— Mary Mackenzie, Family Matriarch</footer>
          </blockquote>
          <div className="mt-auto grid gap-2">
            {[["lock", "End-to-End Kinship Encryption", "Only approved descendants can open the archive"],
              ["block", "Zero Advertising & Commercialisation", "Never tracked, indexed by search engines, or sold"],
              ["accessibility_new", "Built to WCAG 2.2 guidelines", "Large targets & easy audio reading for elders"]].map(([i, t, s]) => (
              <div key={t} className="flex gap-2.5 rounded-xl bg-white/10 px-3 py-2.5 text-[.8rem]">
                <Icon name={i} /><span><strong className="block text-white">{t}</strong><small className="text-on-dark">{s}</small></span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid content-start gap-4 p-5 sm:p-7.5">
          <Tabs label="Account options" value={tab} onChange={setTab} className="grid! grid-cols-3"
            items={[["signin", "Sign In"], ["create", "Create Account"], ["code", "Family Code"]]} />
          <div id="authPanel" role="tabpanel">
            {tab === "signin" && <SignIn onEnter={enter} />}
            {tab === "create" && <CreateAccount onEnter={enter} setTab={setTab} />}
            {tab === "code" && <FamilyCode onAccepted={() => setTab("create")} />}
          </div>
          <p className="flex items-center gap-2.5 text-xsmall text-muted"><Icon name="support_agent" size="sm" /> Need help joining? Ask your family custodian, or call Kinship Care on HELP-ROOTS-24.</p>
        </div>
      </div>

      <section className="mt-7 text-center">
        <Eyebrow>Kinship verification flow</Eyebrow>
        <h2 className="mt-2">How Family Security Protects Our Circle</h2>
        <p className="mt-2 text-muted">Accounts are approved by trusted lineage guardians so sacred stories remain uncompromised.</p>
      </section>
      <div className="mt-4 grid gap-4.5 md:grid-cols-3">
        {STEPS.map(([i, s, t, d, f]) => (
          <div key={s} className="grid content-start gap-2.5 rounded-[18px] border border-line bg-surface p-5">
            <span className="grid size-10 place-items-center rounded-[10px] bg-surface-2 text-pine-800"><Icon name={i} /></span>
            <div className="flex items-center gap-2.5"><Tag tone="mint">{s}</Tag><h3>{t}</h3></div>
            <p className="text-small text-muted">{d}</p>
            <span className="text-xsmall text-pine-700"><Icon name="check" size="xs" /> {f}</span>
          </div>
        ))}
      </div>
      <Card tone="soft" className="mt-7 flex flex-wrap items-center gap-2.5">
        <IconBox icon="handshake" tone="gold" />
        <div className="min-w-0 flex-1">
          <h3>Family Trust Guarantee</h3>
          <p className="text-small text-muted">Audio narrations, photographs, and records belong to your family. They are never used to train commercial AI models or added to external indexes.</p>
        </div>
        <Button to="/privacy">Read Archival Trust Charter</Button>
      </Card>
    </>
  );
}
