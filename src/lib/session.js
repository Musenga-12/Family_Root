import { createContext, useContext } from "react";

/**
 * Who is signed in. `status` is one of:
 *   "demo"      no family server: the on-device sample family, no sign-in needed
 *   "loading"   checking a saved sign-in with the server
 *   "signedOut" a server is set up and nobody is signed in
 *   "signedIn"  `me` is the account ({ id, name, email, role, family_name, person_id, easy_mode, onboarding_done })
 *   "error"     the server couldn't be reached; `error` says why and `retry()` tries again
 */
export const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

/* Someone who left the welcome steps unfinished is taken back to them once per visit when they open the Overview,
   never on every page, and never again after they finish or skip them (the account remembers that). */
const WELCOME_SEEN = "fr-welcome-seen";
export const welcomeSeen = () => { try { return sessionStorage.getItem(WELCOME_SEEN) === "1"; } catch { return true; } };
export const markWelcomeSeen = () => { try { sessionStorage.setItem(WELCOME_SEEN, "1"); } catch { /* storage blocked */ } };

/** The signed-in account shaped like a person in the tree ({ first, last, color }), for avatars and greetings,
 *  while the archive's screens still read the sample family. */
export function accountPerson(me) {
  const [first = "", ...rest] = (me?.name || "").trim().split(/\s+/);
  return { id: `account-${me?.id}`, first, last: rest.join(" "), color: "#3f7a63" };
}
