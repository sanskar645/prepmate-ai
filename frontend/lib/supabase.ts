// PrepMate AI — Supabase client helpers (Section 7)
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Browser-side Supabase client (use in Client Components). */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
