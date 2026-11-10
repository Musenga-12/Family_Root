/* Non-visual feedback: short tones (Web Audio) and vibration. Both are opt-in from Settings and fail silently when unsupported. */
let ctx = null;
const settings = { sound: false, haptics: false };

/** Called by the store whenever the preferences change. */
export const setFeedbackPrefs = (p) => { settings.sound = !!p.sound; settings.haptics = !!p.haptics; };

// Distinct shapes so cues can be told apart without looking: rising = done, low double = error, single soft = info.
const TONES = {
  success: [[660, 0, 0.08], [880, 0.09, 0.1]],
  error: [[220, 0, 0.12], [196, 0.16, 0.16]],
  info: [[520, 0, 0.07]],
  tap: [[440, 0, 0.03]],
};
const BUZZ = { success: 30, error: [60, 50, 60], info: 15, tap: 10 };

function tone(kind) {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    for (const [freq, at, len] of TONES[kind] || TONES.info) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.12, now + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + len + 0.02);
    }
  } catch { /* audio unavailable */ }
}

/** cue("success" | "error" | "info" | "tap", { force }) – force plays even when the setting is off (used by the Settings "Test" button). */
export function cue(kind = "info", { force } = {}) {
  if (settings.sound || force) tone(kind);
  if (settings.haptics || force) { try { navigator.vibrate?.(BUZZ[kind] || 15); } catch { /* unsupported */ } }
}
