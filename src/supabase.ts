import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://ajqukplphetzavnfcxio.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_p7M3OA6dClrOTRM5sKHM2A_c8kjIPvu";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export async function sendContariSignInLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) {
    if (/redirect.*not allowed|redirect.*allow/i.test(error.message)) {
      throw new Error("Supabase blocked this sign-in redirect. Add your Contari production URL to Authentication > URL Configuration > Redirect URLs, then try again.");
    }
    throw error;
  }
}

export async function ensureContariSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error("Sign in with your email using the link in the workspace header before creating or managing lockers.");
  return session;
}
