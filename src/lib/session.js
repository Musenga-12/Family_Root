import { createContext, useContext } from "react";

/**
 * Who is signed in. `status` is one of:
 *   "demo"      no family server: the on-device sample family, no sign-in needed
 *   "loading"   checking a saved sign-in with the server
 *   "signedOut" a server is set up and nobody is signed in
 *   "signedIn"  `me` is the account ({ id, name, email, role, family_name, person_id, easy_mode })
 *   "error"     the server couldn't be reached; `error` says why and `retry()` tries again
 */
export const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);
