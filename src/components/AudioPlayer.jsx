/* Audio player. If a real audio URL exists (recorded in this session) it plays it; otherwise it
   simulates playback so the archived demo clips feel alive. Only one player plays at a time. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx, fmtDur } from "../lib/format";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { Icon } from "./ui";

let stopCurrent = null;
const RATES = [1, 1.5, 2, 0.75];

function waveBars(n, seed) {
  return Array.from({ length: n }, (_, i) =>
    Math.min(100, 20 + Math.abs(Math.sin(i * 0.7 + seed) * 60 + Math.sin(i * 1.9 + seed * 2) * 20)));
}

export default function AudioPlayer({ id, duration = 0, label: labelProp, dark }) {
  const tr = useT();
  const label = labelProp ?? tr("audio.recording");
  const { audioUrl } = useStore();
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [dur, setDur] = useState(duration);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  const audio = useRef(null);
  const bars = useMemo(() => waveBars(56, id.length), [id]);
  const [rate, setRate] = useState(1);
  const rateRef = useRef(1);

  const changeRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    rateRef.current = next;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  };
  const seek = (sec) => {
    const v = Math.max(0, Math.min(dur, sec));
    tRef.current = v;
    setT(v);
    if (audio.current) audio.current.currentTime = v;
  };

  const stop = () => {
    clearInterval(timer.current); timer.current = null;
    audio.current?.pause();
    setPlaying(false);
    if (stopCurrent === stop) stopCurrent = null;
  };
  // Stop on unmount (e.g. navigating away).
  const stopRef = useRef(stop);
  useLayoutEffect(() => { stopRef.current = stop; });
  useEffect(() => () => stopRef.current(), []);

  const toggle = () => {
    if (playing) return stop();
    stopCurrent?.();
    stopCurrent = stop;
    setPlaying(true);
    const url = audioUrl(id);
    if (url) {
      const a = (audio.current ||= new Audio(url));
      a.ontimeupdate = () => { tRef.current = a.currentTime; setT(a.currentTime); if (isFinite(a.duration)) setDur(a.duration); };
      a.onended = () => { stop(); tRef.current = 0; setT(0); };
      a.playbackRate = rateRef.current;
      a.play();
    } else {
      // Simulated: 8x speed so the demo is quick.
      timer.current = setInterval(() => {
        tRef.current += rateRef.current;
        if (tRef.current >= dur) { tRef.current = 0; stop(); }
        setT(tRef.current);
      }, 1000 / 8);
    }
  };

  const frac = dur ? t / dur : 0;
  return (
    <div className={cx("flex min-w-0 items-center gap-3 rounded-xl border px-3.5 py-2.5",
      dark ? "border-white/10 bg-white/5" : "border-line bg-surface")}>
      <button type="button" onClick={toggle} aria-label={tr(playing ? "audio.pause" : "audio.play", { label })}
        className={cx("pressable grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 hover:scale-110 hover:ring-4 hover:ring-sec-edge",
          dark ? "bg-mint text-pine-900" : "bg-sec text-sec-on shadow-[0_4px_12px_-6px_var(--sec)]")}>
        <Icon name={playing ? "pause" : "play_arrow"} fill />
      </button>
      <div role="slider" tabIndex={0} aria-label={tr("audio.seek", { label })} aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
        aria-valuetext={tr("audio.of", { a: fmtDur(t), b: fmtDur(dur) })}
        onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - b.left) / b.width) * dur); }}
        onKeyDown={(e) => {
          const d = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[e.key];
          if (d) { e.preventDefault(); seek(t + d); }
          if (e.key === "Home") { e.preventDefault(); seek(0); }
        }}
        className="flex h-7.5 min-w-0 flex-1 basis-0 cursor-pointer items-center gap-0.5 overflow-hidden rounded">
        {bars.map((h, i) => (
          <i key={i} style={{ height: `${h}%` }}
            className={cx("block w-0.75 shrink-0 rounded-xs",
              i / bars.length < frac ? (dark ? "bg-mint" : "bg-sec") : (dark ? "bg-white/20" : "bg-sec-line"))} />
        ))}
      </div>
      <span className={cx("font-mono text-[.74rem] whitespace-nowrap tabular-nums", dark ? "text-on-dark" : "text-muted")}>
        {fmtDur(t)} / {fmtDur(dur)}
      </span>
      <button type="button" onClick={changeRate} aria-label={tr("audio.speedValue", { rate })} title={tr("stories.speed")}
        className={cx("shrink-0 cursor-pointer rounded-md border px-1.5 py-0.5 font-mono text-[.7rem] font-semibold",
          dark ? "border-white/20 bg-transparent text-on-dark hover:bg-white/10" : "hover-fill border-sec-line bg-sec-soft text-sec-ink")}>
        {rate}×
      </button>
    </div>
  );
}
