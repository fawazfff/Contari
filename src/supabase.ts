import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://ajqukplphetzavnfcxio.supabase.co",
  "sb_publishable_p7M3OA6dClrOTRM5sKHM2A_c8kjIPvu",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

export async function ensureContariSession() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session) return session;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error("Contari sign-in is not enabled on this Supabase project yet. Enable Anonymous Sign-Ins under Authentication > Sign In / Providers, then reload.");
  if (!data.session) throw new Error("Could not start a Contari session.");
  return data.session;
}
