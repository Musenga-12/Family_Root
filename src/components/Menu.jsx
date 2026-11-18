/* Dropdown menu: a trigger button plus a popup list. Closes on outside click, Escape or choosing an item; arrow keys move between items.
   Opens upward when there isn't room below (e.g. on the newest message in a chat). */
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "../lib/format";
import { Icon } from "./ui";

export function Menu({ trigger, label, align = "right", className, children }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef(null);
  const id = useId();
  const toggle = (e) => {
    setUp(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom < 280);
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const items = () => [...ref.current.querySelectorAll("[role=menuitem], [role=menuitemradio]")];
    items()[0]?.focus();
    const onDown = (e) => { if (!ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); ref.current.querySelector("[aria-haspopup]")?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement);
        list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className={cx("relative", className)}>
      {trigger({ "aria-haspopup": "menu", "aria-expanded": open, "aria-controls": id, onClick: toggle })}
      {open && (
        <div id={id} role="menu" aria-label={label} onClick={(e) => e.target.closest("[role^=menuitem]") && setOpen(false)}
          className={cx("absolute z-50 grid min-w-55 animate-pop gap-0.5 rounded-[14px] border border-line bg-surface p-1.5 shadow-pop",
            up ? "bottom-full mb-2" : "top-full mt-2",
            align === "right" ? "right-0" : "left-0")}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, checked, onClick, children, hint }) {
  const radio = checked !== undefined;
  return (
    <button type="button" role={radio ? "menuitemradio" : "menuitem"} aria-checked={radio ? checked : undefined} onClick={onClick}
      className="group flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-2.5 py-2 text-left text-[.88rem] text-ink hover-fill easy:min-h-12">
      {icon && <Icon name={icon} size="sm" className="text-sec-ink transition-transform group-hover:scale-110" />}
      <span className="min-w-0 flex-1">{children}</span>
      {hint && <kbd className="text-xsmall text-muted">{hint}</kbd>}
      {radio && checked && <Icon name="check" size="sm" className="text-sec-ink" />}
    </button>
  );
}

export const MenuLabel = ({ children }) => <div className="px-2.5 pt-2 pb-1 text-tag font-semibold tracking-[.12em] text-muted uppercase">{children}</div>;
export const MenuDivider = () => <hr className="my-1 border-0 border-t border-line" />;
