import { useEffect, useState } from "react";
import { useUI } from "../ui";
import { getStatus, signInEmail, signInGoogle, signOut, signUpEmail, subscribe, type AuthStatus } from "../lib/sync";
import { Modal } from "./common";

export function useAuth(): AuthStatus {
  const [s, setS] = useState(getStatus());
  useEffect(() => subscribe(setS), []);
  return s;
}

export function AuthModal() {
  const open = useUI((s) => s.authOpen);
  const setOpen = useUI((s) => s.setAuth);
  const auth = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { if (auth.user && open) setMsg(""); }, [auth.user, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(""); setMsg("");
    try {
      if (mode === "in") { await signInEmail(email.trim(), pw); setOpen(false); }
      else {
        const r = await signUpEmail(email.trim(), pw);
        if (r === "confirm-email") setMsg("Check your email for a confirmation link, then sign in. Your saved schedule will sync when you do.");
        else setOpen(false);
      }
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const google = async () => { setErr(""); try { await signInGoogle(); } catch (x) { setErr((x as Error).message); } };

  return (
    <Modal open={open} onClose={() => setOpen(false)} title={auth.user ? "Your account" : "Sign in or create an account"}>
      {auth.user ? (
        <div className="auth">
          <p>Signed in as <strong>{auth.user.email}</strong>.</p>
          <p className="muted">{auth.sync === "synced" ? "Your schedule, college, majors, minors and completed requirements are synced to the cloud." : auth.sync === "syncing" ? "Syncing…" : auth.sync === "error" ? `Sync problem: ${auth.message}` : ""}</p>
          <button className="btn" onClick={async () => { await signOut(); setOpen(false); }}>Sign out</button>
          <p className="hint">Signing out keeps a copy in this browser.</p>
        </div>
      ) : (
        <div className="auth">
          <div className="alert">
            <strong>This is a 5C Course Atlas account.</strong> Hyperschedule and the 5C Portal and degree-audit systems do not support third-party sign-in, so there is no “log in with Pomona/CMC/Pitzer”. An Atlas account only syncs your Atlas data across devices. <strong>You never need one</strong>: everything works as a guest and saves in this browser.
          </div>
          {!auth.configured ? (
            <div className="alert alert-warn">
              Cloud accounts are not enabled on this deployment yet. To turn them on, create a Supabase project, run <code>supabase/migrations</code>, and put its URL and anon key in <code>config.json</code> (see the README). Until then your data stays in this browser.
            </div>
          ) : (
            <>
              <button className="btn btn-block" onClick={google}>Continue with Google</button>
              <div className="or"><span>or use email</span></div>
              <div className="seg" role="group"><button className={mode === "in" ? "on" : ""} onClick={() => setMode("in")}>Sign in</button><button className={mode === "up" ? "on" : ""} onClick={() => setMode("up")}>Create account</button></div>
              <form onSubmit={submit} className="auth-form">
                <input className="input" type="email" required placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="input" type="password" required minLength={8} placeholder="Password (8+ characters)" autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
                <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "…" : mode === "in" ? "Sign in" : "Create account"}</button>
              </form>
              <p className="hint">On sign-in, what is saved in this browser is merged with your cloud copy. Nothing is deleted.</p>
            </>
          )}
          {err && <p className="hint warn" role="alert">{err}</p>}
          {msg && <p className="hint">{msg}</p>}
        </div>
      )}
    </Modal>
  );
}
