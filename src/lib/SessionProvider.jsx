/* Sign-in state for the family server (see session.js). With no server set up it stays "demo" and does nothing. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, SIGNED_OUT_EVENT, authApi, connected, getToken, setToken } from "./api";
import { SessionContext } from "./session";
import { useStore } from "./store";

export function SessionProvider({ children }) {
  const { setEasy } = useStore();
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(() => (!connected ? "demo" : getToken() ? "loading" : "signedOut"));

  // Ask the server who the saved token belongs to. State only changes once it answers.
  const load = useCallback(() => authApi.me().then(
    (m) => { setMe(m); setError(null); setStatus("signedIn"); return m; },
    (e) => {
      // A refused sign-in (401) has already cleared the token; anything else means the server is unreachable.
      if (e instanceof ApiError && e.status === 401) { setMe(null); setStatus("signedOut"); return null; }
      setError(e.message);
      setStatus("error");
      return null;
    },
  ), []);

  // A sign-in saved on this device is checked once when the app opens.
  useEffect(() => {
    if (connected && getToken()) load();
  }, [load]);

  // The server stopped accepting the saved sign-in (expired, password changed elsewhere, access removed).
  useEffect(() => {
    const onOut = () => { setMe(null); setStatus("signedOut"); };
    window.addEventListener(SIGNED_OUT_EVENT, onOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onOut);
  }, []);

  /** Keep the token from a sign-in, registration or password reset, then load the account. The account's
   *  Easy-to-Read choice is applied, since it was made for this person rather than this device. */
  const signIn = useCallback(async (token) => {
    setToken(token);
    const m = await load();
    if (m) setEasy(!!m.easy_mode);
    return m;
  }, [load, setEasy]);

  const signOut = useCallback(() => {
    setToken(null);
    setMe(null);
    if (connected) setStatus("signedOut");
  }, []);

  const retry = useCallback(() => { setStatus("loading"); load(); }, [load]);

  const value = useMemo(() => ({ status, me, error, retry, signIn, signOut, connected }),
    [status, me, error, retry, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
