import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { loadConfig } from "./hyperschedule";
import { emptyUserData, hasUserData, mergeUserData, pickUserData, useStore, type UserData } from "../store";

/**
 * Optional cloud sync. The app is fully usable without it. When a Supabase project is
 * configured (public/config.json) and the user signs in, their localStorage data is merged
 * with whatever is in their cloud row, then kept in sync. Table: user_state (see supabase/migrations).
 */

export type SyncState = "off" | "signed-out" | "syncing" | "synced" | "error";
export interface AuthStatus { configured: boolean; user: User | null; sync: SyncState; message: string }

let client: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient | null> | null = null;
let status: AuthStatus = { configured: false, user: null, sync: "off", message: "" };
const listeners = new Set<(s: AuthStatus) => void>();
const emit = (p: Partial<AuthStatus>) => { status = { ...status, ...p }; listeners.forEach((l) => l(status)); };

export const getStatus = () => status;
export function subscribe(fn: (s: AuthStatus) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export async function getClient(): Promise<SupabaseClient | null> {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const cfg = await loadConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return client;
  })();
  return clientPromise;
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let lastPushed = 0;
let applying = false;

async function pull(user: User) {
  if (!client) return;
  emit({ sync: "syncing", message: "" });
  const { data, error } = await client.from("user_state").select("state").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  const local = pickUserData(useStore.getState());
  const cloud: UserData | null = data?.state ? { ...emptyUserData(), ...(data.state as UserData) } : null;
  let next = local;
  if (cloud) next = hasUserData(local) ? mergeUserData(local, cloud) : cloud;
  applying = true;
  useStore.getState().replaceUserData(next);
  applying = false;
  await push(user);
}

async function push(user: User) {
  if (!client) return;
  const d = pickUserData(useStore.getState());
  const { error } = await client.from("user_state").upsert({ user_id: user.id, state: d, updated_at: new Date().toISOString() });
  if (error) throw error;
  lastPushed = d.updatedAt;
  emit({ sync: "synced", message: "" });
}

function schedulePush() {
  if (!status.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try { emit({ sync: "syncing" }); await push(status.user!); }
    catch (e) { emit({ sync: "error", message: (e as Error).message }); }
  }, 1800);
}

let started = false;
export async function initAuth() {
  if (started) return;
  started = true;
  const c = await getClient();
  if (!c) { emit({ configured: false, sync: "off" }); return; }
  emit({ configured: true, sync: "signed-out" });

  const onSession = async (session: Session | null) => {
    if (!session?.user) { emit({ user: null, sync: "signed-out", message: "" }); return; }
    emit({ user: session.user });
    try { await pull(session.user); }
    catch (e) { emit({ sync: "error", message: (e as Error).message }); }
  };
  const { data } = await c.auth.getSession();
  await onSession(data.session);
  c.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") void onSession(session);
  });

  useStore.subscribe((s) => {
    if (applying) return;
    if (s.updatedAt !== lastPushed) schedulePush();
  });
}

export async function signInEmail(email: string, password: string) {
  const c = await getClient();
  if (!c) throw new Error("Cloud accounts are not set up on this deployment.");
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUpEmail(email: string, password: string): Promise<"signed-in" | "confirm-email"> {
  const c = await getClient();
  if (!c) throw new Error("Cloud accounts are not set up on this deployment.");
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
  return data.session ? "signed-in" : "confirm-email";
}
export async function signInGoogle() {
  const c = await getClient();
  if (!c) throw new Error("Cloud accounts are not set up on this deployment.");
  const { error } = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
export async function signOut() {
  const c = await getClient();
  await c?.auth.signOut();
}

/** For the Atlas Edge Function: the user's token if signed in, else the anon key. */
export async function bearerToken(): Promise<string> {
  const cfg = await loadConfig();
  const c = await getClient();
  const { data } = (await c?.auth.getSession()) || { data: { session: null } };
  return data.session?.access_token || cfg.supabaseAnonKey;
}
