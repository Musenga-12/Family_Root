/* Elder Recording Studio: microphone capture with live waveform, optional speech-to-text,
   pause/resume, review and save. Falls back to a simulated recording when no mic is available. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Card, Check, Eyebrow, Field, Icon, Input, Record, Select, Tag } from "../components/ui";
import { ME } from "../data";
import { cx, uid } from "../lib/format";
import { localeOf, useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { saveAudio } from "../lib/audioStore";

const AUDIENCES = ["Mackenzie Kinship Circle", "Immediate Family", "Only Me (private draft)"];
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function RecButton({ label, caption, big, dark, live, disabled, icon, onClick }) {
  return (
    <figure className="m-0 grid justify-items-center gap-1.5 text-[.74rem] text-muted">
      <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
        className={cx(
          "grid cursor-pointer place-items-center rounded-full enabled:hover:scale-105 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
          big ? "size-19 border-6 border-[#f5c7c2] bg-rec text-white" : "size-13 border",
          dark ? "border-transparent bg-sec text-sec-on" : !big && "hover-fill border-sec-line bg-surface text-sec-ink",
          live && "animate-rec-pulse",
        )}>
        <Icon name={icon} size={big ? "lg" : undefined} />
      </button>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export default function RecordingStudio({ promptIdx, setPromptIdx, forName }) {
  const { update, setAudioUrl, prefs } = useStore();
  const toast = useToast();
  const { confirm } = useModal();
  const t = useT();
  const prompts = t("rs.prompts");

  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | recording | paused | review
  const [simulated, setSimulated] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [stt, setStt] = useState("idle"); // idle | typeOnly | listening
  const [transcript, setTranscript] = useState("");
  const [reviewUrl, setReviewUrl] = useState(null);
  const [title, setTitle] = useState("");
  const [titleErr, setTitleErr] = useState("");

  const rec = useRef(null);
  const recog = useRef(null);
  const canvas = useRef(null);
  const statusRef = useRef(status);
  useLayoutEffect(() => { statusRef.current = status; }, [status]);

  const prompt = forName ? t("rs.birthday", { name: forName }) : prompts[promptIdx];
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;

  /* ----- Waveform ----- */
  const draw = useCallback(function frame() {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext("2d"), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = getComputedStyle(c).getPropertyValue("--sec").trim() || "#c2410c";
    const r = rec.current, live = statusRef.current === "recording";
    let data = null;
    if (r?.analyser) { data = new Uint8Array(r.analyser.frequencyBinCount); r.analyser.getByteFrequencyData(data); }
    const bars = 80, bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const v = !live ? 0.06
        : data ? data[Math.floor((i / bars) * data.length * 0.6)] / 255
        : (Math.random() * 0.6 + 0.2) * Math.abs(Math.sin(Date.now() / 300 + i / 4));
      const bh = Math.max(3, v * h * 0.9);
      g.fillRect(i * bw + 1, (h - bh) / 2, bw - 2, bh);
    }
    if (live && r) r.raf = requestAnimationFrame(frame);
  }, []);

  // Redraw whenever the status changes (starts the animation loop while recording).
  useEffect(() => { draw(); }, [status, draw]);

  /* ----- Speech-to-text (supported browsers only) ----- */
  const startSpeech = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStt("typeOnly"); return; }
    try {
      const r = new SR();
      r.continuous = true; r.interimResults = false; r.lang = localeOf(prefs.lang);
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            const said = e.results[i][0].transcript.trim();
            setTranscript((x) => (x ? x + " " : "") + said);
          }
        }
      };
      r.onerror = () => {};
      r.start();
      recog.current = r;
      setStt("listening");
    } catch { recog.current = null; }
  };
  const stopSpeech = () => {
    try { recog.current?.stop(); } catch { /* already stopped */ }
    recog.current = null;
    setStt("idle");
  };

  const tick = () => {
    const r = rec.current;
    if (!r || statusRef.current !== "recording") return;
    setSeconds(r.elapsed + (Date.now() - r.started) / 1000);
  };

  const releaseDevices = (r) => {
    clearInterval(r.timer);
    cancelAnimationFrame(r.raf);
    r.stream?.getTracks().forEach((tr) => tr.stop());
    try { if (r.ctx && r.ctx.state !== "closed") r.ctx.close(); } catch { /* ignore */ }
    r.analyser = null;
  };

  const finishReview = () => {
    const r = rec.current;
    if (!r) return;
    if (r.chunks.length) {
      r.blob = new Blob(r.chunks, { type: r.mr.mimeType || "audio/webm" });
      r.url = URL.createObjectURL(r.blob);
      setReviewUrl(r.url);
    } else setReviewUrl(null);
    setTimeout(() => document.getElementById("recTitle")?.focus());
  };

  const start = async () => {
    if (!consent) {
      toast(t("rs.consentFirst"), { error: true, sub: t("rs.consentFirstSub") });
      document.getElementById("consent").focus();
      return;
    }
    const r = { chunks: [], elapsed: 0, started: Date.now() };
    rec.current = r;
    try {
      if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error("unsupported");
      r.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      r.mr = new MediaRecorder(r.stream);
      r.mr.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
      r.mr.onstop = finishReview;
      r.mr.start(250);
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        r.ctx = new AC();
        r.analyser = r.ctx.createAnalyser();
        r.analyser.fftSize = 256;
        r.ctx.createMediaStreamSource(r.stream).connect(r.analyser);
      }
      setSimulated(false);
    } catch {
      setSimulated(true);
      toast(t("rs.noMic"), { sub: t("rs.noMicSub"), icon: "mic_off", duration: 8000 });
    }
    r.started = Date.now();
    r.timer = setInterval(tick, 250);
    setReviewUrl(null);
    setStatus("recording");
    statusRef.current = "recording";
    startSpeech();
  };

  const pause = () => {
    const r = rec.current;
    if (!r) return;
    if (status === "recording") {
      r.elapsed += (Date.now() - r.started) / 1000;
      if (r.mr?.state === "recording") r.mr.pause();
      stopSpeech();
      cancelAnimationFrame(r.raf);
      setStatus("paused");
    } else if (status === "paused") {
      r.started = Date.now();
      if (r.mr?.state === "paused") r.mr.resume();
      startSpeech();
      setStatus("recording");
    }
  };

  const stop = () => {
    const r = rec.current;
    if (!r || status === "review") return;
    if (status === "recording") r.elapsed += (Date.now() - r.started) / 1000;
    setSeconds(r.elapsed);
    setStatus("review");
    releaseDevices(r);
    stopSpeech();
    if (r.mr && r.mr.state !== "inactive") r.mr.stop(); else finishReview();
  };

  const discard = useCallback((silent) => {
    const r = rec.current;
    if (r) {
      releaseDevices(r);
      if (r.mr && r.mr.state !== "inactive") { r.mr.onstop = null; r.mr.stop(); }
    }
    try { recog.current?.stop(); } catch { /* ignore */ }
    recog.current = null;
    rec.current = null;
    setStatus("idle"); setSeconds(0); setReviewUrl(null); setStt("idle");
    if (!silent) toast(t("rs.discarded"), { icon: "delete" });
  }, [toast, t]);

  // Leaving the page releases the microphone.
  const discardRef = useRef(discard);
  useLayoutEffect(() => { discardRef.current = discard; });
  useEffect(() => () => discardRef.current(true), []);

  const save = async () => {
    if (!title.trim()) { setTitleErr(t("rs.errTitle")); document.getElementById("recTitle").focus(); return; }
    const r = rec.current;
    const id = uid("s");
    const text = transcript.trim();
    if (r.url) setAudioUrl(id, r.url);
    // Keep the audio itself on this device so it can be played again after the tab is closed.
    const kept = r.blob ? await saveAudio(id, r.blob) : false;
    update((s) => {
      s.stories.unshift({
        id, title: title.trim(), kind: "audio", category: "Spoken Audio", by: ME, recorded: new Date().toISOString().slice(0, 10),
        duration: Math.max(1, Math.round(r.elapsed)),
        excerpt: text ? text.slice(0, 160) + (text.length > 160 ? "…" : "") : t("rs.promptExcerpt", { prompt }),
        transcript: text, loves: 0, reflections: 0, isNew: true, audience,
      });
    }, t("rs.history", { title: title.trim() }));
    toast(t("rs.saved"), {
      sub: t("rs.sharedWith", { audience: t(`aud.${audience}`) }) + (!r.url ? t("rs.textOnly") : kept ? "" : t("rs.noStore")), icon: "library_add_check",
    });
    rec.current = null;
    setStatus("idle"); setSeconds(0); setReviewUrl(null); setTitle(""); setTitleErr(""); setTranscript("");
  };

  const active = status === "recording" || status === "paused";
  const statusText = {
    idle: t("rs.status.idle"),
    recording: t(simulated ? "rs.status.noMic" : "rs.status.recording"),
    paused: t("rs.status.paused"),
    review: t("rs.status.review", { time: fmt(seconds) }),
  }[status];

  return (
    <Card id="studio" className="mt-7" aria-labelledby="studioH">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 id="studioH" className="flex flex-wrap items-center gap-2.5"><Icon name="radio_button_checked" /> {t("rs.title")} <Tag tone="sec">{t("rs.tactile")}</Tag></h2>
          <p className="mt-2 text-small text-muted">{t("rs.sub")}</p>
        </div>
        {/* Nothing is kept until Save: a closed tab loses the recording, so the tag says so. */}
        <Tag tone="outline" icon="save">{t("rs.autosave")}</Tag>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3.5">
          <div id="promptCard" className="rounded-2xl bg-surface-2 p-4.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5"><Eyebrow><Icon name="chat_bubble" size="xs" /> {t("rs.current")}</Eyebrow><Tag tone="gold">{t("rs.recommended")}</Tag></div>
            <p className="my-2.5 font-serif text-[1.25rem] leading-[1.35] italic">“{prompt}”</p>
            <p className="text-small text-muted">{t("rs.hint")}</p>
            <p className="mt-4 text-xsmall text-muted">{t("rs.switch")}</p>
            <div className="mt-2 grid gap-2">
              {prompts.map((p, i) => (i === promptIdx && !forName ? null : (
                <button key={i} type="button" data-alt-prompt onClick={() => setPromptIdx(i)}
                  className="lift flex w-full cursor-pointer justify-between gap-2 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left text-small">
                  <span>“{p}”</span><Icon name="arrow_forward" size="sm" />
                </button>
              )))}
            </div>
          </div>
          <Card tone="soft" as="div" className="p-4!">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <strong className="text-small"><Icon name="groups" size="sm" /> {t("rs.audience")}</strong><span className="text-xsmall text-muted">{t("rs.encrypted")}</span>
            </div>
            <Record icon="diversity_3" className="mt-2 flex-wrap bg-surface!">
              <div className="min-w-0 flex-1"><strong className="text-small">{t(`aud.${audience}`)}</strong><p className="text-xsmall text-muted">{t("rs.whoListens")}</p></div>
              <label className="sr-only" htmlFor="audSel">{t("rs.changeAudience")}</label>
              <Select id="audSel" className="w-auto! max-w-full" value={audience}
                onChange={(e) => { setAudience(e.target.value); toast(t("rs.audienceUpdated"), { sub: t(`aud.${e.target.value}`), icon: "groups", duration: 2500 }); }}>
                {AUDIENCES.map((a) => <option key={a} value={a}>{t(`aud.${a}`)}</option>)}
              </Select>
            </Record>
            <Check id="consent" className="mt-4" checked={consent} onChange={(e) => setConsent(e.target.checked)}>
              {t("rs.consent")}
            </Check>
          </Card>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3.5">
          <div className="grid justify-items-center gap-3.5 rounded-2xl bg-surface-2 p-5.5 text-center" aria-live="polite">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[.74rem] font-semibold">
              <span className={cx("size-2 rounded-full", status === "recording" ? "animate-blink bg-[#e0443a]" : "bg-faint")} /> {statusText}
            </span>
            <div role="timer" aria-label={t("rs.time")} className="font-serif text-[2.6rem] tabular-nums">{fmt(seconds)}</div>
            <span className="text-xsmall text-muted">{t("rs.limit")}</span>
            <canvas ref={canvas} width="600" height="70" aria-hidden="true" className="h-17.5 w-full rounded-xl bg-surface" />
            <div className="flex items-end justify-center gap-6.5">
              <RecButton icon={status === "paused" ? "play_arrow" : "pause"} label={status === "paused" ? t("rs.resumeLabel") : t("rs.pauseLabel")}
                caption={status === "paused" ? t("rs.resume") : t("rs.pause")} disabled={!active} onClick={pause} />
              <RecButton big live={status === "recording"} icon={active ? "stop" : "mic"} label={active ? t("rs.stopLabel") : t("rs.startLabel")}
                caption={active ? t("rs.recordingNow") : t("rs.start")} onClick={active ? stop : start} />
              <RecButton dark icon="done_all" label={t("rs.reviewLabel")} caption={t("rs.review")} disabled={!active} onClick={stop} />
            </div>
            {status === "review" && (
              <div className="grid w-full gap-2">
                {reviewUrl && <audio src={reviewUrl} controls className="w-full" />}
                <Field id="recTitle" label={t("rs.giveTitle")} hint={t("common.required")} error={titleErr} className="text-left">
                  <Input id="recTitle" value={title} onChange={(e) => setTitle(e.target.value)} invalid={!!titleErr} placeholder={t("rs.titlePh")} />
                </Field>
                <div className="flex justify-center gap-2.5">
                  <Button variant="soft" icon="delete"
                    onClick={() => confirm(t("rs.discardQ"), t("rs.discardBody"), t("rs.discard"), () => discard())}>
                    {t("rs.discard")}
                  </Button>
                  <Button variant="primary" icon="save" onClick={save}>{t("rs.save")}</Button>
                </div>
              </div>
            )}
          </div>
          <Card tone="soft" as="div" className="p-4!">
            <label htmlFor="transcript" className="flex items-center gap-1.5 text-small font-semibold">
              <Icon name="subtitles" size="sm" /> {t("rs.transcript")} <Tag tone="sec">{t(`rs.stt.${stt}`)}</Tag>
            </label>
            <textarea id="transcript" value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5}
              placeholder={t("rs.transcriptPh")}
              className="mt-2 min-h-30 w-full rounded-xl border border-line bg-surface p-3.5 font-serif text-base leading-relaxed placeholder:text-faint placeholder:italic" />
            <p className="mt-2 text-xsmall text-muted">{words === 1 ? t("rs.word") : t("rs.words", { n: words })}</p>
          </Card>
        </div>
      </div>
    </Card>
  );
}
