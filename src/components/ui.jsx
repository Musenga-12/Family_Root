/* Shared UI primitives styled with Tailwind. */
import { Link } from "react-router-dom";
import { ME } from "../data";
import { cx } from "../lib/format";
import { samplePhoto } from "../lib/photos";
import { useT } from "../lib/i18n";
import { fullName, initials } from "../lib/store";

export function Icon({ name, size, fill, className }) {
  return <span className={cx("ms", size, fill && "fill", className)} aria-hidden="true">{name}</span>;
}

/* ---------- Buttons ---------- */
const BTN_VARIANTS = {
  default: "hover-fill bg-surface border-sec-line text-sec-ink hover:shadow-[0_6px_16px_-10px_var(--sec)]",
  /* Primary buttons are navy. Hover turns them soft slate blue with navy text (like everything else under the
     pointer); pressing makes them a deeper navy. */
  primary: cx("border-transparent bg-sec text-sec-on shadow-[0_4px_12px_-6px_var(--sec)]",
    "hover:-translate-y-px hover:border-sec-hover-line hover:bg-sec-hover hover:text-sec-ink hover:shadow-[0_10px_22px_-10px_var(--sec)]",
    "focus-visible:border-sec-hover-line focus-visible:bg-sec-hover focus-visible:text-sec-ink",
    "active:translate-y-0 active:border-(--sec-press) active:bg-(--sec-press) active:text-sec-on"),
  brand: "bg-pine-900 border-pine-900 text-white hover:bg-pine-700 hover:-translate-y-px hover:ring-4 hover:ring-mint-200 active:bg-pine-950",
  tint: "hover-fill bg-sec-soft border-sec-line text-sec-ink",
  mint: "bg-mint border-mint text-pine-900 hover:-translate-y-px hover:border-mint-btn-hover hover:bg-mint-btn-hover hover:text-white active:bg-pine-950",
  soft: "hover-fill bg-sec-soft border-transparent text-sec-ink",
  ghost: "hover-fill bg-transparent border-transparent text-sec-ink",
  danger: "bg-[linear-gradient(135deg,var(--color-rose),#8f2f29)] border-transparent text-white shadow-[0_4px_12px_-6px_var(--color-rose)] hover:-translate-y-px hover:bg-none hover:bg-[#8f2f29] hover:ring-4 hover:ring-rose-ring active:bg-[#6f241f]",
};
const BTN_SIZES = {
  md: "min-h-11 px-4 py-2.5 text-[.9rem] rounded-xl",
  sm: "min-h-9 px-3 py-1.5 text-[.82rem] rounded-[10px]",
  lg: "min-h-13 px-5 py-3.5 text-base rounded-xl",
};
const btnCls = (variant = "default", size = "md", block = false, extra, wrap = false) =>
  cx(
    "inline-flex items-center justify-center gap-2 border font-semibold no-underline cursor-pointer",
    "pressable disabled:translate-y-0! disabled:opacity-50 disabled:shadow-none! disabled:cursor-not-allowed easy:min-h-12",
    block || wrap ? "min-w-0 whitespace-normal text-center" : "whitespace-nowrap max-sm:whitespace-normal max-sm:text-center",
    variant === "ghost" && size === "md" ? "min-h-11 px-2.5 py-2.5 text-[.9rem] rounded-xl" : BTN_SIZES[size],
    BTN_VARIANTS[variant], block && "w-full", extra,
  );

/** Small spinning ring for busy states. */
export const Spinner = ({ className }) => (
  <span aria-hidden="true" className={cx("inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />
);

/** `busy` shows a spinner and blocks further clicks until the work finishes (no duplicate submissions). */
/** `sec` colours the button with another section's colour, e.g. sec="memories" on an "Add a Memory" shortcut. */
export function Button({ variant, size, block, wrap, icon, iconSize = "sm", to, busy, disabled, sec, className, children, ...rest }) {
  if (sec) rest["data-sec"] = sec;
  const cls = btnCls(variant, size, block, cx(busy && "cursor-progress!", className), wrap);
  const inner = <>{busy ? <Spinner /> : icon && <Icon name={icon} size={iconSize} />}{children}</>;
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>;
  return <button type="button" className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>{inner}</button>;
}

export function IconButton({ icon, label, className, iconProps, children, ...rest }) {
  return (
    <button type="button" aria-label={label}
      className={cx("pressable relative inline-grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-line bg-surface text-sec-ink hover-fill", className)}
      {...rest}>
      <Icon name={icon} {...iconProps} />{children}
    </button>
  );
}

/** Decorative rounded square holding an icon (used beside headings). */
export function IconBox({ icon, tone = "sec", className }) {
  const tones = { mint: "bg-mint text-pine-900", dark: "bg-pine-900 text-mint", gold: "bg-gold-100 text-gold-ink", sec: "bg-sec-soft text-sec-ink ring-1 ring-sec-line ring-inset", solid: "bg-sec text-sec-on" };
  return <span className={cx("inline-grid size-10 shrink-0 place-items-center rounded-[10px]", tones[tone], className)}><Icon name={icon} /></span>;
}

/* ---------- Tags & chips ---------- */
const TAG_TONES = {
  default: "bg-surface-3 text-pine-800",
  mint: "bg-mint-200 text-pine-900",
  gold: "bg-gold-100 text-gold-ink",
  // Warm accents, used sparingly: terracotta for warm moments (birthdays), sage for supporting information.
  terra: "bg-terra-100 text-terra-ink",
  sage: "bg-sage-100 text-pine-800 dark:text-mint",
  rose: "bg-rose-100 text-rose",
  dark: "bg-pine-900 text-mint",
  outline: "border border-line bg-transparent text-muted",
  glass: "bg-white/90 text-pine-800",
  sec: "bg-sec-soft text-sec-ink ring-1 ring-sec-line ring-inset",
};
export function Tag({ tone = "default", icon, className, children, ...rest }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.75 font-sans text-tag font-semibold tracking-[.02em]", TAG_TONES[tone], className)} {...rest}>
      {icon && <Icon name={icon} size="xs" />}{children}
    </span>
  );
}

const chipCls = (pressed) =>
  cx(
    "pressable group inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[.84rem] font-medium whitespace-nowrap cursor-pointer easy:min-h-12",
    pressed
      ? "border-transparent bg-sec font-semibold text-sec-on shadow-[0_4px_12px_-6px_var(--sec)] hover:ring-4 hover:ring-sec-edge"
      : "hover-fill border-sec-line bg-surface text-ink",
  );

export function Chip({ pressed, count, icon, className, children, ...rest }) {
  return (
    <button type="button" aria-pressed={pressed} className={cx(chipCls(pressed), className)} {...rest}>
      {icon && <Icon name={icon} size="xs" />}{children}
      {count !== undefined && (
        <span className={cx("rounded-full px-1.75 text-xsmall", pressed ? "bg-black/25" : "bg-sec-soft text-sec-ink")}>{count}</span>
      )}
    </button>
  );
}

export function Chips({ scroll, className, children, ...rest }) {
  return <div className={cx("flex gap-2", scroll ? "flex-nowrap overflow-x-auto pb-1" : "flex-wrap", className)} {...rest}>{children}</div>;
}

/** Segmented tab control. items: [[key, label]]. The selected item is always navy. */
export function Tabs({ items, value, onChange, label, role = "tablist", className, itemClassName }) {
  return (
    <div role={role} aria-label={label} className={cx("inline-flex flex-wrap gap-0.5 rounded-xl border border-sec-line bg-sec-soft p-1", className)}>
      {items.map(([key, text, aria]) => {
        const sel = value === key;
        return (
          <button key={key} type="button" aria-label={aria}
            {...(role === "tablist" ? { role: "tab", "aria-selected": sel } : { "aria-pressed": sel })}
            onClick={() => onChange(key)}
            className={cx(
              "inline-flex min-h-10 items-center justify-center gap-1 rounded-[9px] border-0 px-3.5 py-2 text-[.88rem] cursor-pointer easy:min-h-12",
              sel ? "bg-sec font-semibold text-sec-on shadow-card" : "hover-fill bg-transparent font-medium text-muted",
              itemClassName,
            )}>
            {text}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Surfaces ---------- */
const CARD_TONES = {
  default: "bg-surface border-line shadow-card",
  soft: "bg-surface-2 border-line",
  dark: "bg-pine-900 border-pine-900 text-[#e8f3ee] [&_h3]:text-white",
};
/** `sec` marks the card with a section's colour: a coloured top edge, and its heading icon and buttons in that colour. */
export function Card({ tone = "default", sec, as: As = "section", className, children, ...rest }) {
  return (
    <As data-sec={sec} className={cx("rounded-card border p-5.5 max-sm:p-4.5", CARD_TONES[tone], sec && tone !== "dark" && "border-t-4 border-t-sec [&_h2_.ms]:text-sec-ink", className)} {...rest}>
      {children}
    </As>
  );
}

export function Hero({ as: As = "section", className, children, ...rest }) {
  return (
    <As className={cx("relative overflow-hidden rounded-card border border-sec-line bg-[linear-gradient(135deg,var(--sec-soft)_0%,var(--color-surface)_60%,var(--sec-soft)_100%)] p-7 pt-8 max-sm:p-4.5 max-sm:pt-6",
      "before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:[background:var(--stripe)]", className)} {...rest}>
      {children}
    </As>
  );
}

/** The top of every screen, so they all start the same way: a short label, the screen's title (its menu name),
 *  one plain sentence, the main actions (always under the sentence, so they're in the same place on every screen),
 *  and an optional `aside` on the right for counts or a preview. `children` go between the sentence and the actions. */
export function PageHeader({ icon, eyebrow, title, description, actions, aside, className, children, ...rest }) {
  return (
    <Hero className={cx("flex flex-wrap items-center gap-x-6 gap-y-4", className)} {...rest}>
      <div className="min-w-65 flex-1 max-sm:min-w-0">
        {eyebrow && <Eyebrow icon={icon}>{eyebrow}</Eyebrow>}
        <h1 className={eyebrow ? "mt-2" : undefined}>{title}</h1>
        {description && <p className="mt-2 max-w-160 text-muted">{description}</p>}
        {children}
        {actions && <div className="mt-4 flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      {aside}
    </Hero>
  );
}

export function Eyebrow({ icon, className, children }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-tag font-semibold tracking-[.14em] text-sec-ink uppercase", className)}>
      {icon && <Icon name={icon} size="sm" />}{children}
    </span>
  );
}

export function SectionTitle({ className, children }) {
  return <div className={cx("mb-3.5 flex flex-wrap items-center justify-between gap-3", className)}>{children}</div>;
}

export function Stat({ value, label }) {
  return (
    <div className="rounded-[14px] border border-line border-l-4 border-l-sec bg-surface px-4.5 py-3.5">
      <strong className="block font-serif text-2xl">{value}</strong>
      <span className="text-tag font-semibold tracking-widest text-muted uppercase">{label}</span>
    </div>
  );
}

export function Empty({ icon, title, className, children }) {
  return (
    <div className={cx("rounded-[14px] border-2 border-dashed border-line px-5 py-10 text-center text-muted", className)}>
      <Icon name={icon} className="text-[40px]! text-sec-ink" />
      {title && <h3 className="mt-2 mb-1 text-ink">{title}</h3>}
      {children}
    </div>
  );
}

/** A soft row with a leading icon tile (records, notifications, linked items). */
export function Record({ icon, as: As = "div", className, children, ...rest }) {
  return (
    <As className={cx("flex items-center gap-3 rounded-xl border border-transparent bg-surface-2 p-3 text-inherit no-underline", As !== "div" && "lift cursor-pointer hover:bg-(--surface-hover)", className)} {...rest}>
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-sec-soft text-sec-ink"><Icon name={icon} /></span>}
      {children}
    </As>
  );
}

/* ---------- People & media ---------- */
const AVATAR_SIZES = {
  md: "size-10 text-[.8rem] rounded-xl",
  lg: "size-16 text-[1.15rem] rounded-2xl",
  xl: "size-23 text-[1.6rem] rounded-card",
};
export function Avatar({ p, size = "md", round, className }) {
  if (!p) return <span className={cx("relative inline-grid shrink-0 place-items-center bg-faint font-bold text-white", AVATAR_SIZES[size], className)}>?</span>;
  const badge = p.id === ME ? "home" : p.died ? "local_florist" : null;
  return (
    <span role="img" aria-label={fullName(p)} style={{ background: `color-mix(in oklab, ${p.color} 72%, #000)` }}
      className={cx(
        "relative inline-grid shrink-0 place-items-center font-bold tracking-[.02em] text-white",
        AVATAR_SIZES[size], round && "rounded-full!", p.died && "filter-[grayscale(.85)_sepia(.3)]", className,
      )}>
      {initials(p)}
      {badge && (
        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border-2 border-surface bg-pine-900 text-mint">
          <Icon name={badge} className="text-[12px]!" />
        </span>
      )}
    </span>
  );
}

/** A gradient tile with an icon, or a real image: `img` (the keepsake's own) or the bundled sample photo for `sample`. */
export function Photo({ p1 = "#6d8d72", p2 = "#2d4a3b", icon = "image", img, sample, alt, aspect = "aspect-4/3", flush, className, children, as: As = "div", ...rest }) {
  img ||= sample && samplePhoto(sample);
  return (
    <As role={As === "div" || As === "span" ? "img" : undefined} aria-label={alt}
      style={{ background: `linear-gradient(135deg, ${p1}, ${p2})` }}
      className={cx("group/photo relative grid place-items-center overflow-hidden text-white/85 no-underline", aspect, flush ? "rounded-none" : "rounded-xl", As !== "div" && As !== "span" && "lift", className)} {...rest}>
      {/* A picture that fails to load is hidden, so the gradient tile shows instead of a broken-image icon. */}
      {img ? <img src={img} alt={alt} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.hidden = true; }}
        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover/photo:scale-105" /> : <Icon name={icon} className="text-[44px]! opacity-55" />}
      {children}
    </As>
  );
}
export function PhotoOverlay({ className, children }) {
  return <span className={cx("absolute inset-x-0 bottom-0 bg-[linear-gradient(to_bottom,transparent,rgb(0_0_0/.6))] p-3 text-white", className)}>{children}</span>;
}
/** "Visible to: …" privacy line shown on keepsakes. */
export function Visibility({ children }) {
  const t = useT();
  // Stored values ("All Family Branches"…) are shown in the chosen language when a translation exists.
  const shown = typeof children === "string" && t(`vis.${children}`) !== `vis.${children}` ? t(`vis.${children}`) : children;
  return <span className="inline-flex items-center gap-1 text-xsmall font-semibold text-pine-700"><Icon name="lock" size="xs" /> {t("vis.label")} {shown}</span>;
}

export const PhotoCorner = ({ children }) => <span className="absolute top-2.5 left-2.5">{children}</span>;

/* ---------- Forms ---------- */
const inputCls = cx(
  "min-h-11 w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 outline-none transition-[border-color,box-shadow,background-color] hover:border-sec-edge",
  "focus:border-sec focus:bg-surface focus:shadow-[0_0_0_3px_var(--sec-line)]",
  "aria-invalid:border-rose aria-invalid:bg-rose-100/50",
);

export function ErrorText({ id, children }) {
  if (!children) return null;
  return <span id={id} className="flex items-center gap-1 text-xsmall text-rose"><Icon name="error" size="xs" /> {children}</span>;
}

export function Field({ id, label, hint, help, error, className, children }) {
  return (
    <div className={cx("grid gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="flex justify-between gap-2 text-[.86rem] font-semibold">
          <span>{label}</span>{hint && <span className="text-xsmall font-medium text-pine-700">{hint}</span>}
        </label>
      )}
      {children}
      {help && <span className="text-xsmall text-muted">{help}</span>}
      <ErrorText id={id && `${id}Err`}>{error}</ErrorText>
    </div>
  );
}

export function Input({ className, invalid, ...rest }) {
  return <input className={cx(inputCls, className)} aria-invalid={invalid || undefined} {...rest} />;
}
export function Textarea({ className, invalid, ...rest }) {
  return <textarea className={cx(inputCls, className)} aria-invalid={invalid || undefined} {...rest} />;
}
export function Select({ className, children, ...rest }) {
  return <select className={cx(inputCls, className)} {...rest}>{children}</select>;
}

export function InputIcon({ icon, className, children }) {
  return (
    <div className={cx("relative [&_input]:pl-9", className)}>
      <Icon name={icon} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[18px]! text-muted" />
      {children}
    </div>
  );
}

export function Check({ children, className, type = "checkbox", ...rest }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-2.5 text-[.84rem]", className)}>
      <input type={type} className="mt-0.5 size-4.5 shrink-0" {...rest} />
      <span>{children}</span>
    </label>
  );
}

/** Checkbox chips used to tag people in forms. */
export function PeopleChecks({ people, value, onChange }) {
  return (
    <Chips>
      {people.map((p) => {
        const on = value.includes(p.id);
        return (
          <label key={p.id} className={chipCls(false)}>
            <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])} />
            {p.first}
          </label>
        );
      })}
    </Chips>
  );
}

/** Accessible on/off switch with an optional description line. */
export function Switch({ checked, onChange, label, help, id, className }) {
  return (
    <label htmlFor={id} className={cx("flex cursor-pointer items-start justify-between gap-4", className)}>
      <span className="min-w-0">
        <strong id={`${id}-label`} className="block text-[.9rem] font-semibold">{label}</strong>
        {help && <span id={`${id}-help`} className="block text-xsmall text-muted">{help}</span>}
      </span>
      {/* Named and described explicitly, so screen readers announce "Sound cues, switch, off" plus the help text. */}
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        aria-labelledby={`${id}-label`} aria-describedby={help ? `${id}-help` : undefined}
        className={cx("relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors",
          checked ? "bg-sec" : "bg-[color-mix(in_oklab,var(--color-faint)_55%,var(--color-surface))] hover:bg-[color-mix(in_oklab,var(--sec)_45%,var(--color-surface))]")}>
        <span className={cx("inline-block size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/.3)] transition-transform", checked ? "translate-x-6 bg-sec-on!" : "translate-x-1")} />
      </button>
    </label>
  );
}
