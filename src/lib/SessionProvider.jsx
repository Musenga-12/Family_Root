/* Sign-in state for the family server (see session.js). With no server set up it stays "demo" and does nothing.
   Signed in, it hands the account to the store, which then shows and saves that family's own archive. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, SIGNED_OUT_EVENT, authApi, connected, getToken, setToken } from "./api";
import { SessionContext } from "./session";
import { useStore } from "./store";

/* A visitor to a hosted FamilyRoots may look around the sample family first, without an account. It lasts for the
   browser tab and stays on the device: nothing is sent to the server. */
const TRYING = "fr-trying-demo";
const trying = () => { try { return sessionStorage.getItem(TRYING) === "1"; } catch { return false; } };
const setTrying = (on) => { try { if (on) sessionStorage.setItem(TRYING, "1"); else sessionStorage.removeItem(TRYING); } catch { /* storage blocked */ } };

export function SessionProvider({ children }) {
  const { setEasy, server } = useStore();
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(() => (!connected ? "demo" : getToken() ? "loading" : trying() ? "demo" : "signedOut"));

  // Ask the server who the saved token belongs to. State only changes once it answers.
  const load = useCallback(() => authApi.me().then(
    (m) => { setMe(m); setError(null); setStatus("signedIn"); setTrying(false); return m; },
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

  // Signed in: the store shows this family's archive from the server. Otherwise: the on-device sample family.
  const { connect, disconnect } = server;
  useEffect(() => {
    if (status === "signedIn" && me) connect(me);
    else if (status === "signedOut" || status === "demo") disconnect();
  }, [status, me, connect, disconnect]);

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
    setTrying(false);
    setMe(null);
    if (connected) setStatus("signedOut");
  }, []);

  /** Visitors: look around the sample family on this device (see TRYING). */
  const tryDemo = useCallback(() => {
    if (!connected || getToken()) return;
    setTrying(true);
    setStatus("demo");
  }, []);

  const retry = useCallback(() => { setStatus("loading"); load(); }, [load]);

  /** Change the account (name, Easy-to-Read, welcome steps done…) and keep the answer as the current account. */
  const updateMe = useCallback(async (body) => {
    const m = await authApi.updateMe(body);
    setMe(m);
    return m;
  }, []);

  // "trial": a visitor looking at the sample family on a hosted site (status is "demo" then too).
  const trial = connected && status === "demo";
  const value = useMemo(() => ({ status, me, error, retry, signIn, signOut, updateMe, tryDemo, trial, connected }),
    [status, me, error, retry, signIn, signOut, updateMe, tryDemo, trial]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
