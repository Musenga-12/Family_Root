/* Photographs on the welcome page: a slow hero slideshow of generations together, and one photo per part of the archive.
   Motion is gentle and optional: slides change every few seconds with a slow zoom, a visible button pauses them, and
   nothing moves for anyone who asked for reduced motion (system setting or Settings → Reduce motion). */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HERO_PHOTOS, TOPIC_PHOTOS, photoCredit, samplePhoto } from "../../lib/photos";
import { Icon } from "../../components/ui";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { useStore } from "../../lib/store";

const SLIDE_MS = 6500;

/** True when the visitor asked for less motion, in the app's own setting or in their system. */
function useReducedMotion() {
  const { prefs } = useStore();
  const [system, setSystem] = useState(() => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = (e) => setSystem(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return system || prefs.motion === "reduced";
}

const Credit = ({ p, className }) => {
  const t = useT();
  return (
    <a href={p.page} target="_blank" rel="noreferrer" className={cx("text-xsmall text-white/85 underline-offset-2 hover:text-white hover:underline", className)}>
      {t("home.photos.credit", { name: p.name })}
    </a>
  );
};

export function HeroPhotos() {
  const t = useT();
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState(null); // the slide fading out, which keeps zooming until it has gone
  const iRef = useRef(0);
  useEffect(() => { iRef.current = i; }, [i]);
  const go = (k) => { setPrev(iRef.current); setI(k); };
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false); // while the pointer or keyboard focus is on the slideshow
  const n = HERO_PHOTOS.length;
  const playing = !paused && !reduced;

  useEffect(() => {
    if (!playing || held) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setPrev(iRef.current);
      setI((iRef.current + 1) % n);
    }, SLIDE_MS);
    return () => clearInterval(id);
  }, [playing, held, n]);

  const p = HERO_PHOTOS[i];
  return (
    <div className="relative" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHeld(false)}>
      <div role="group" aria-roledescription="slideshow" aria-label={t("home.photos.label")}
        className="relative aspect-4/3 overflow-hidden rounded-[28px] bg-surface-3 shadow-pop">
        {HERO_PHOTOS.map((ph, k) => (
          <img key={ph.key} src={ph.src} alt={k === i ? t(`home.photo.${ph.key}.alt`) : ""} aria-hidden={k !== i || undefined}
            width="1200" height="900" decoding="async" loading={k === 0 ? "eager" : "lazy"}
            className={cx("absolute inset-0 size-full object-cover transition-opacity duration-[1400ms] ease-out", k === i ? "opacity-100" : "opacity-0",
              // Slow zoom: starts when a photo comes in and carries on while it fades out, so nothing jumps.
              playing && (k === i || k === prev) && "animate-kenburns")} />
        ))}
        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgb(10_25_18/.78),transparent)] px-5 pt-16 pb-4 text-white">
          <p key={i} className="animate-fade font-serif text-[1.25rem] leading-snug" aria-live={playing ? "off" : "polite"}>{t(`home.photo.${p.key}`)}</p>
          <div className="mt-2 flex items-center gap-3">
            <Credit p={p} />
            <span className="flex-1" />
            {/* Dots choose a photo; each says which one it shows. */}
            <div className="flex items-center gap-1.5">
              {HERO_PHOTOS.map((ph, k) => (
                <button key={ph.key} type="button" onClick={() => k !== i && go(k)} aria-current={k === i ? "true" : undefined}
                  aria-label={t("home.photos.show", { n: k + 1, total: n, caption: t(`home.photo.${ph.key}`) })}
                  className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0">
                  <span className={cx("block h-2 rounded-full transition-all", k === i ? "w-6 bg-white" : "w-2 bg-white/55")} />
                </button>
              ))}
            </div>
            {!reduced && (
              <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}
                aria-label={paused ? t("home.photos.play") : t("home.photos.pause")} title={paused ? t("home.photos.play") : t("home.photos.pause")}
                className="grid size-9 cursor-pointer place-items-center rounded-full border border-white/40 bg-black/25 text-white backdrop-blur-sm hover:bg-black/40">
                <Icon name={paused ? "play_arrow" : "pause"} size="sm" />
              </button>
            )}
          </div>
        </div>
      </div>
      {/* What a family keeps: a voice and a confirmed date. They drift gently, as if pinned to the photo. */}
      <div aria-hidden="true" className="absolute top-[8%] -left-2 flex animate-float items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-pop max-sm:hidden sm:-left-6">
        <span className="grid size-9 place-items-center rounded-full bg-rec/15 text-rec"><Icon name="graphic_eq" /></span>
        <span><strong className="block text-small">{t("home.art.voice")}</strong><small className="text-xsmall text-muted">{t("home.art.voiceSub")}</small></span>
      </div>
      <div aria-hidden="true" className="absolute -right-2 bottom-[30%] flex animate-float items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-pop [animation-delay:-3s] max-sm:hidden sm:-right-5">
        <span className="grid size-9 place-items-center rounded-full bg-gold-100 text-gold-ink"><Icon name="favorite" /></span>
        <span><strong className="block text-small">{t("home.art.date")}</strong><small className="text-xsmall text-muted">{t("home.art.dateSub")}</small></span>
      </div>
    </div>
  );
}

/** Cards fade up as they scroll into view, one after another. Shown at once without IntersectionObserver or with reduced motion. */
function useReveal(reduced) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => reduced || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (shown || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return [ref, shown || reduced];
}

export function TopicPhotos() {
  const t = useT();
  const reduced = useReducedMotion();
  const [ref, shown] = useReveal(reduced);
  const names = [...new Map(TOPIC_PHOTOS.concat(HERO_PHOTOS).map((p) => [p.name, p])).values()];
  return (
    <>
      <ul ref={ref} className="m-0 mt-6 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-5">
        {TOPIC_PHOTOS.map((p, k) => (
          <li key={p.key} className={cx("transition-[opacity,translate] duration-700 ease-out", shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
            k === 4 && "max-sm:col-span-2")} style={{ transitionDelay: shown ? `${k * 110}ms` : "0ms" }}>
            <Link to={p.to} className="group relative block h-full overflow-hidden rounded-card text-white no-underline shadow-card focus-visible:outline-offset-4">
              <img src={p.src} alt={t(`home.keep.${p.key}.alt`)} width="720" height="900" loading="lazy" decoding="async"
                className={cx("block w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06] group-focus-visible:scale-[1.06]",
                  k === 4 ? "aspect-4/5 max-sm:aspect-16/10" : "aspect-4/5")} />
              <span className="absolute inset-x-0 bottom-0 grid gap-1 bg-[linear-gradient(to_top,rgb(10_25_18/.85),rgb(10_25_18/.35)_60%,transparent)] p-4 pt-14">
                <span className="flex items-center gap-1.5 font-serif text-[1.15rem] leading-tight"><Icon name={p.icon} size="sm" className="text-mint" />{t(`home.keep.${p.key}`)}</span>
                <span className="text-small text-white/85">{t(`home.keep.${p.key}.line`)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {/* Unsplash asks for nothing, but photographers deserve their names. */}
      <p className="mt-3 text-xsmall text-muted">
        {t("home.keep.credits")}{" "}
        {names.map((p, k) => (
          <span key={p.name}>{k > 0 && (k === names.length - 1 ? ` ${t("home.keep.and")} ` : ", ")}<a href={p.profile || p.page} target="_blank" rel="noreferrer">{p.name}</a></span>
        ))}.
      </p>
    </>
  );
}

/**
 * A photograph for a public page slot (see SAMPLE in lib/photos.js), with its credit. `alt` describes what it shows.
 * It fades in gently and zooms a touch on hover; both are switched off with reduced motion by the global CSS rule.
 */
export function PagePhoto({ slot, alt, aspect = "aspect-4/3", className, eager }) {
  const t = useT();
  const src = samplePhoto(slot);
  const credit = photoCredit(slot);
  if (!src) return null;
  return (
    <figure className={cx("group relative m-0 animate-fade overflow-hidden rounded-[26px] bg-surface-3 shadow-pop", aspect, className)}>
      <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async"
        className="size-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]" />
      {credit && (
        <figcaption className="absolute right-0 bottom-0 left-0 bg-[linear-gradient(to_top,rgb(10_25_18/.6),transparent)] px-4 pt-8 pb-2.5 text-right">
          <a href={credit.page} target="_blank" rel="noreferrer" className="text-xsmall text-white/90 underline-offset-2 hover:text-white hover:underline">
            {t("home.photos.credit", { name: credit.name })}
          </a>
        </figcaption>
      )}
    </figure>
  );
}
