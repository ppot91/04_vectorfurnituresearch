import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn(
    "Supabase environment variables are missing. API routes that call Supabase will fail until they are configured.",
  );
}

export const supabaseAdmin = createClient(url ?? "", serviceKey ?? "", {
  auth: {
    persistSession: false,
  },
});
