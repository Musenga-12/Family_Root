/* Shared UI primitives styled with Tailwind. */
import { Link } from "react-router-dom";
import { ME } from "../data";
import { cx } from "../lib/format";
import { fullName, initials } from "../lib/store";

export function Icon({ name, size, fill, className }) {
  return <span className={cx("ms", size, fill && "fill", className)} aria-hidden="true">{name}</span>;
}

/* ---------- Buttons ---------- */
const BTN_VARIANTS = {
  default: "bg-surface border-line text-ink hover:bg-surface-2",
  primary: "bg-pine-900 border-pine-900 text-white hover:bg-pine-800",
  mint: "bg-mint border-mint text-pine-900 hover:bg-mint-hover",
  soft: "bg-surface-3 border-transparent text-ink hover:bg-surface-2",
  ghost: "bg-transparent border-transparent text-pine-700 hover:bg-surface-2",
  danger: "bg-rose border-rose text-white hover:brightness-95",
};
const BTN_SIZES = {
  md: "px-4 py-2.5 text-[.86rem] rounded-[10px]",
  sm: "px-2.5 py-1.5 text-[.78rem] rounded-lg",
  lg: "px-4 py-3.5 text-[.95rem] rounded-[10px]",
};
const btnCls = (variant = "default", size = "md", block = false, extra, wrap = false) =>
  cx(
    "inline-flex items-center justify-center gap-2 border font-semibold no-underline cursor-pointer",
    "transition active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed easy:min-h-12",
    block || wrap ? "min-w-0 whitespace-normal text-center" : "whitespace-nowrap max-sm:whitespace-normal max-sm:text-center",
    variant === "ghost" && size === "md" ? "px-2 py-2.5 text-[.86rem] rounded-[10px]" : BTN_SIZES[size],
    BTN_VARIANTS[variant], block && "w-full", extra,
  );

export function Button({ variant, size, block, wrap, icon, iconSize = "sm", to, className, children, ...rest }) {
  const cls = btnCls(variant, size, block, className, wrap);
  const inner = <>{icon && <Icon name={icon} size={iconSize} />}{children}</>;
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>;
  return <button type="button" className={cls} {...rest}>{inner}</button>;
}

export function IconButton({ icon, label, className, iconProps, children, ...rest }) {
  return (
    <button type="button" aria-label={label}
      className={cx("relative inline-grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-line bg-surface text-pine-800 hover:bg-surface-2", className)}
      {...rest}>
      <Icon name={icon} {...iconProps} />{children}
    </button>
  );
}

/** Decorative rounded square holding an icon (used beside headings). */
export function IconBox({ icon, tone = "mint", className }) {
  const tones = { mint: "bg-mint text-pine-900", dark: "bg-pine-900 text-mint", gold: "bg-gold-100 text-gold-ink" };
  return <span className={cx("inline-grid size-10 shrink-0 place-items-center rounded-[10px]", tones[tone], className)}><Icon name={icon} /></span>;
}

/* ---------- Tags & chips ---------- */
const TAG_TONES = {
  default: "bg-surface-3 text-pine-800",
  mint: "bg-mint-200 text-pine-900",
  gold: "bg-gold-100 text-gold-ink",
  rose: "bg-rose-100 text-rose",
  dark: "bg-pine-900 text-mint",
  outline: "border border-line bg-transparent text-muted",
  glass: "bg-white/90 text-pine-800",
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
    "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[.78rem] font-medium whitespace-nowrap cursor-pointer easy:min-h-12",
    pressed ? "border-pine-900 bg-pine-900 text-white" : "border-line bg-surface text-ink hover:border-pine-600",
  );

export function Chip({ pressed, count, icon, className, children, ...rest }) {
  return (
    <button type="button" aria-pressed={pressed} className={cx(chipCls(pressed), className)} {...rest}>
      {icon && <Icon name={icon} size="xs" />}{children}
      {count !== undefined && (
        <span className={cx("rounded-full px-1.75 text-[.7rem]", pressed ? "bg-mint text-pine-900" : "bg-surface-3")}>{count}</span>
      )}
    </button>
  );
}

export function Chips({ scroll, className, children, ...rest }) {
  return <div className={cx("flex gap-2", scroll ? "flex-nowrap overflow-x-auto pb-1" : "flex-wrap", className)} {...rest}>{children}</div>;
}

/** Segmented tab control. items: [[key, label]] */
export function Tabs({ items, value, onChange, dark, label, role = "tablist", className, itemClassName }) {
  return (
    <div role={role} aria-label={label} className={cx("inline-flex flex-wrap gap-0.5 rounded-xl border border-line bg-surface-2 p-1", className)}>
      {items.map(([key, text, aria]) => {
        const sel = value === key;
        return (
          <button key={key} type="button" aria-label={aria}
            {...(role === "tablist" ? { role: "tab", "aria-selected": sel } : { "aria-pressed": sel })}
            onClick={() => onChange(key)}
            className={cx(
              "inline-flex items-center justify-center gap-1 rounded-[9px] border-0 px-3.5 py-2 text-[.84rem] cursor-pointer easy:min-h-12",
              sel ? (dark ? "bg-pine-900 font-semibold text-white" : "bg-surface font-semibold text-ink shadow-card") : "bg-transparent font-medium text-muted",
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
export function Card({ tone = "default", as: As = "section", className, children, ...rest }) {
  return <As className={cx("rounded-card border p-5.5 max-sm:p-4.5", CARD_TONES[tone], className)} {...rest}>{children}</As>;
}

export function Hero({ as: As = "section", className, children, ...rest }) {
  return (
    <As className={cx("rounded-card border border-line bg-[linear-gradient(135deg,var(--color-mint-100)_0%,var(--color-surface)_60%,var(--color-mint-100)_100%)] p-7 max-sm:p-4.5", className)} {...rest}>
      {children}
    </As>
  );
}

export function Eyebrow({ icon, className, children }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-tag font-semibold tracking-[.14em] text-pine-700 uppercase", className)}>
      {icon && <Icon name={icon} size="sm" />}{children}
    </span>
  );
}

export function SectionTitle({ className, children }) {
  return <div className={cx("mb-3.5 flex flex-wrap items-center justify-between gap-3", className)}>{children}</div>;
}

export function Stat({ value, label }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface px-4.5 py-3.5">
      <strong className="block font-serif text-2xl">{value}</strong>
      <span className="text-[.66rem] font-semibold tracking-widest text-muted uppercase">{label}</span>
    </div>
  );
}

export function Empty({ icon, title, className, children }) {
  return (
    <div className={cx("rounded-[14px] border-2 border-dashed border-line px-5 py-10 text-center text-muted", className)}>
      <Icon name={icon} className="text-[40px]! text-pine-600" />
      {title && <h3 className="mt-2 mb-1 text-ink">{title}</h3>}
      {children}
    </div>
  );
}

/** A soft row with a leading icon tile (records, notifications, linked items). */
export function Record({ icon, as: As = "div", className, children, ...rest }) {
  return (
    <As className={cx("flex items-center gap-3 rounded-xl bg-surface-2 p-3 text-inherit no-underline", className)} {...rest}>
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface text-pine-700"><Icon name={icon} /></span>}
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
    <span role="img" aria-label={fullName(p)} style={{ background: p.color }}
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

/** Placeholder "photo": a gradient tile with an icon, or a real image when provided. */
export function Photo({ p1 = "#6d8d72", p2 = "#2d4a3b", icon = "image", img, alt, aspect = "aspect-4/3", flush, className, children, as: As = "div", ...rest }) {
  return (
    <As role={As === "div" || As === "span" ? "img" : undefined} aria-label={alt}
      style={{ background: `linear-gradient(135deg, ${p1}, ${p2})` }}
      className={cx("relative grid place-items-center overflow-hidden text-white/85 no-underline", aspect, flush ? "rounded-none" : "rounded-xl", className)} {...rest}>
      {img ? <img src={img} alt={alt} className="absolute inset-0 size-full object-cover" /> : <Icon name={icon} className="text-[44px]! opacity-55" />}
      {children}
    </As>
  );
}
export function PhotoOverlay({ className, children }) {
  return <span className={cx("absolute inset-x-0 bottom-0 bg-[linear-gradient(to_bottom,transparent,rgb(0_0_0/.6))] p-3 text-white", className)}>{children}</span>;
}
/** "Visible to: …" privacy line shown on keepsakes. */
export function Visibility({ children }) {
  return <span className="inline-flex items-center gap-1 text-xsmall font-semibold text-pine-700"><Icon name="lock" size="xs" /> Visible to: {children}</span>;
}

export const PhotoCorner = ({ children }) => <span className="absolute top-2.5 left-2.5">{children}</span>;

/* ---------- Forms ---------- */
const inputCls = cx(
  "w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 outline-none",
  "focus:border-pine-600 focus:bg-surface focus:shadow-[0_0_0_3px_rgba(31,138,99,.18)]",
  "aria-invalid:border-rose aria-invalid:bg-rose-100/50",
);

export function ErrorText({ id, children }) {
  if (!children) return null;
  return <span id={id} className="flex items-center gap-1 text-[.76rem] text-rose"><Icon name="error" size="xs" /> {children}</span>;
}

export function Field({ id, label, hint, help, error, className, children }) {
  return (
    <div className={cx("grid gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="flex justify-between gap-2 text-[.8rem] font-semibold">
          <span>{label}</span>{hint && <span className="text-xsmall font-medium text-pine-700">{hint}</span>}
        </label>
      )}
      {children}
      {help && <span className="text-[.74rem] text-muted">{help}</span>}
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
        <strong className="block text-[.9rem] font-semibold">{label}</strong>
        {help && <span className="block text-xsmall text-muted">{help}</span>}
      </span>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx("relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors",
          checked ? "bg-pine-800 dark:bg-mint" : "bg-surface-3 ring-1 ring-line ring-inset")}>
        <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6 dark:bg-pine-950" : "translate-x-1")} />
      </button>
    </label>
  );
}
