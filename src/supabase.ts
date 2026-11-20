import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://ajqukplphetzavnfcxio.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_p7M3OA6dClrOTRM5sKHM2A_c8kjIPvu";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export async function ensureContariSession() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session) return session;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error("Anonymous sign-in is not enabled for Contari yet. In Supabase, open Authentication > Sign In / Providers and enable Anonymous Sign-Ins, then reload.");
  if (!data.session) throw new Error("Could not start a Contari session.");
  return data.session;
}
