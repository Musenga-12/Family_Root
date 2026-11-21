/* What a signed-in account leaves on this device, and clearing it, so the next person to use the device (a shared
   family tablet, a library computer) doesn't find someone else's unsent words or recordings.

   Cleared: form drafts (useDraft), "Recent" in quick search, and recordings kept for upload (audioStore).
   Kept: display preferences (theme, text size, language…), which belong to the device, and the on-device demo.

   Signing out clears it at once. A sign-in that simply ran out (expired, password changed elsewhere) keeps it, so
   nothing typed is lost; it is cleared when a different account signs in next. */
import { clearAudio } from "./audioStore";

const DRAFT_PREFIX = "fr-draft-";
const RECENT = "fr-pref-recent";
const OWNER = "fr-account"; // id of the account whose things are on this device

/** Remove the account's drafts, Recent list and saved recordings from this device. */
export function clearAccountData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(DRAFT_PREFIX)) localStorage.removeItem(k);
    localStorage.removeItem(RECENT);
  } catch { /* storage blocked: nothing was saved either */ }
  return clearAudio();
}

/** An account has signed in. Unless the things on this device are known to be this account's own, they are cleared
 *  (that includes things saved before owners were recorded, and the demo's drafts). Returns true when it cleared. */
export function claimDevice(accountId) {
  const id = String(accountId);
  let previous;
  try { previous = localStorage.getItem(OWNER); localStorage.setItem(OWNER, id); } catch { return false; }
  if (previous === id) return false;
  clearAccountData();
  return true;
}

/** Signing out: clear the account's things and forget whose they were. */
export function releaseDevice() {
  try { localStorage.removeItem(OWNER); } catch { /* storage blocked */ }
  return clearAccountData();
}
