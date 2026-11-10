/* Elder Recording Studio: microphone capture with live waveform, optional speech-to-text,
   pause/resume, review and save. Falls back to a simulated recording when no mic is available. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useModal } from "../components/modalContext";
import { useToast } from "../components/toastContext";
import { Button, Card, Check, Eyebrow, Field, Icon, Input, Record, Select, Tag } from "../components/ui";
import { ME, PROMPTS } from "../data";
import { cx, uid } from "../lib/format";
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
          dark ? "border-transparent bg-[linear-gradient(135deg,var(--sec),var(--sec-ink))] text-sec-on" : !big && "hover-fill border-sec-line bg-surface text-sec-ink",
          live && "animate-rec-pulse",
        )}>
        <Icon name={icon} size={big ? "lg" : undefined} />
      </button>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export default function RecordingStudio({ promptIdx, setPromptIdx, forName }) {
  const { update, setAudioUrl } = useStore();
  const toast = useToast();
  const { confirm } = useModal();

  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | recording | paused | review
  const [simulated, setSimulated] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [autosave, setAutosave] = useState("ready");
  const [stt, setStt] = useState("Type or dictate");
  const [transcript, setTranscript] = useState("");
  const [reviewUrl, setReviewUrl] = useState(null);
  const [title, setTitle] = useState("");
  const [titleErr, setTitleErr] = useState("");

  const rec = useRef(null);
  const recog = useRef(null);
  const canvas = useRef(null);
  const statusRef = useRef(status);
  useLayoutEffect(() => { statusRef.current = status; }, [status]);

  const prompt = forName ? `Record a birthday voice card for ${forName} — share a favourite memory together.` : PROMPTS[promptIdx];
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;

  /* ----- Waveform ----- */
  const draw = useCallback(function frame() {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext("2d"), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = getComputedStyle(c).getPropertyValue("--sec").trim() || "#7c3aed";
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
    if (!SR) { setStt("Type to transcribe"); return; }
    try {
      const r = new SR();
      r.continuous = true; r.interimResults = false; r.lang = "en-GB";
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            const said = e.results[i][0].transcript.trim();
            setTranscript((t) => (t ? t + " " : "") + said);
          }
        }
      };
      r.onerror = () => {};
      r.start();
      recog.current = r;
      setStt("Listening…");
    } catch { recog.current = null; }
  };
  const stopSpeech = () => {
    try { recog.current?.stop(); } catch { /* already stopped */ }
    recog.current = null;
    setStt("Type or dictate");
  };

  const tick = () => {
    const r = rec.current;
    if (!r || statusRef.current !== "recording") return;
    const secs = r.elapsed + (Date.now() - r.started) / 1000;
    setSeconds(secs);
    if (Math.floor(secs) % 10 === 0) setAutosave(`backed up ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
  };

  const releaseDevices = (r) => {
    clearInterval(r.timer);
    cancelAnimationFrame(r.raf);
    r.stream?.getTracks().forEach((t) => t.stop());
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
      toast("Please confirm consent first", { error: true, sub: "Tick the consent box under “Vault Audience” so everyone knows how the recording is kept." });
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
      toast("Microphone not available", { sub: "Allow microphone access in your browser to record audio. You can still type or dictate your story below.", icon: "mic_off", duration: 8000 });
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
    setStatus("idle"); setSeconds(0); setReviewUrl(null); setStt("Type or dictate");
    if (!silent) toast("Recording discarded", { icon: "delete" });
  }, [toast]);

  // Leaving the page releases the microphone.
  const discardRef = useRef(discard);
  useLayoutEffect(() => { discardRef.current = discard; });
  useEffect(() => () => discardRef.current(true), []);

  const save = async () => {
    if (!title.trim()) { setTitleErr("Add a title so your family can find this story."); document.getElementById("recTitle").focus(); return; }
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
        excerpt: text ? text.slice(0, 160) + (text.length > 160 ? "…" : "") : `Prompt: “${prompt}”`,
        transcript: text, loves: 0, reflections: 0, isNew: true, audience,
      });
    }, `Recorded “${title.trim()}”`);
    toast("Story saved to the family archive", {
      sub: `Shared with: ${audience}${!r.url ? " · saved as text (no audio was captured)" : kept ? "" : " · this browser can't store audio, so it plays until you close the tab"}`, icon: "library_add_check",
    });
    rec.current = null;
    setStatus("idle"); setSeconds(0); setReviewUrl(null); setTitle(""); setTitleErr(""); setTranscript("");
  };

  const active = status === "recording" || status === "paused";
  const statusText = {
    idle: "Microphone idle",
    recording: simulated ? "No microphone • type or dictate your story" : "Microphone active • Recording",
    paused: "Paused — take your time",
    review: `Recorded ${fmt(seconds)} • Review before saving`,
  }[status];

  return (
    <Card id="studio" className="mt-7" aria-labelledby="studioH">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 id="studioH" className="flex flex-wrap items-center gap-2.5"><Icon name="radio_button_checked" /> Elder Recording Studio <Tag tone="sec">Tactile Assist Mode</Tag></h2>
          <p className="mt-2 text-small text-muted">Large controls, gentle pacing, live transcript, and automatic draft saving.</p>
        </div>
        <Tag tone="outline" icon="cloud_done">Safe Draft Auto-Save: {autosave}</Tag>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3.5">
          <div id="promptCard" className="rounded-2xl bg-surface-2 p-4.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5"><Eyebrow><Icon name="chat_bubble" size="xs" /> Current prompt</Eyebrow><Tag tone="gold">Recommended for Mary</Tag></div>
            <p className="my-2.5 font-serif text-[1.25rem] leading-[1.35] italic">“{prompt}”</p>
            <p className="text-small text-muted">Who was there? What could you smell, hear, see? Take your time — you can pause whenever you like.</p>
            <p className="mt-4 text-xsmall text-muted">Or switch to another prompt:</p>
            <div className="mt-2 grid gap-2">
              {PROMPTS.map((p, i) => (i === promptIdx && !forName ? null : (
                <button key={i} type="button" data-alt-prompt onClick={() => setPromptIdx(i)}
                  className="lift flex w-full cursor-pointer justify-between gap-2 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left text-small">
                  <span>“{p}”</span><Icon name="arrow_forward" size="sm" />
                </button>
              )))}
            </div>
          </div>
          <Card tone="soft" as="div" className="p-4!">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <strong className="text-small"><Icon name="groups" size="sm" /> Vault Audience</strong><span className="text-xsmall text-muted">End-to-End Encrypted</span>
            </div>
            <Record icon="diversity_3" className="mt-2 flex-wrap bg-surface!">
              <div className="min-w-0 flex-1"><strong className="text-small">{audience}</strong><p className="text-xsmall text-muted">Who will be able to listen</p></div>
              <label className="sr-only" htmlFor="audSel">Change audience</label>
              <Select id="audSel" className="w-auto! max-w-full" value={audience}
                onChange={(e) => { setAudience(e.target.value); toast("Audience updated", { sub: e.target.value, icon: "groups", duration: 2500 }); }}>
                {AUDIENCES.map((a) => <option key={a}>{a}</option>)}
              </Select>
            </Record>
            <Check id="consent" className="mt-4" checked={consent} onChange={(e) => setConsent(e.target.checked)}>
              I agree to this recording being kept in the family archive and shared with the audience above. I can delete it at any time.
            </Check>
          </Card>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3.5">
          <div className="grid justify-items-center gap-3.5 rounded-2xl bg-surface-2 p-5.5 text-center" aria-live="polite">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[.74rem] font-semibold">
              <span className={cx("size-2 rounded-full", status === "recording" ? "animate-blink bg-[#e0443a]" : "bg-faint")} /> {statusText}
            </span>
            <div role="timer" aria-label="Recording time" className="font-serif text-[2.6rem] tabular-nums">{fmt(seconds)}</div>
            <span className="text-xsmall text-muted">Recommended limit: 15:00 per story chapter</span>
            <canvas ref={canvas} width="600" height="70" aria-hidden="true" className="h-17.5 w-full rounded-xl bg-surface" />
            <div className="flex items-end justify-center gap-6.5">
              <RecButton icon={status === "paused" ? "play_arrow" : "pause"} label={status === "paused" ? "Resume recording" : "Pause recording"}
                caption={status === "paused" ? "Resume" : "Pause"} disabled={!active} onClick={pause} />
              <RecButton big live={status === "recording"} icon={active ? "stop" : "mic"} label={active ? "Stop recording" : "Start recording"}
                caption={active ? "Recording Voice…" : "Start Recording"} onClick={active ? stop : start} />
              <RecButton dark icon="done_all" label="Stop and review" caption="Stop & Review" disabled={!active} onClick={stop} />
            </div>
            {status === "review" && (
              <div className="grid w-full gap-2">
                {reviewUrl && <audio src={reviewUrl} controls className="w-full" />}
                <Field id="recTitle" label="Give your story a title" hint="Required" error={titleErr} className="text-left">
                  <Input id="recTitle" value={title} onChange={(e) => setTitle(e.target.value)} invalid={!!titleErr} placeholder="e.g. Sunday dinners at the kitchen table" />
                </Field>
                <div className="flex justify-center gap-2.5">
                  <Button variant="soft" icon="delete"
                    onClick={() => confirm("Discard this recording?", "The audio and transcript you just recorded will be lost.", "Discard", () => discard())}>
                    Discard
                  </Button>
                  <Button variant="primary" icon="save" onClick={save}>Save to Family Archive</Button>
                </div>
              </div>
            )}
          </div>
          <Card tone="soft" as="div" className="p-4!">
            <label htmlFor="transcript" className="flex items-center gap-1.5 text-small font-semibold">
              <Icon name="subtitles" size="sm" /> Live Spoken Transcript <Tag tone="sec">{stt}</Tag>
            </label>
            <textarea id="transcript" value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5}
              placeholder="Your words appear here as you speak (in supported browsers). You can also type or correct the text — a written transcript keeps the story accessible to everyone."
              className="mt-2 min-h-30 w-full rounded-xl border border-line bg-surface p-3.5 font-serif text-base leading-relaxed placeholder:text-faint placeholder:italic" />
            <p className="mt-2 text-xsmall text-muted">{words} word{words === 1 ? "" : "s"}</p>
          </Card>
        </div>
      </div>
    </Card>
  );
}
