// Caller identity + privileged client helpers.
//
// `getUser` resolves the *authenticated caller* from their JWT — never from a
// request-body field — which is the fix for the IDOR findings #3/#4/#5 where
// functions trusted a body `userId`. `adminClient` is the service-role client
// (RLS-bypassing) used for the function's actual work *after* the caller has
// been authorized.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface CallerIdentity {
  id: string;
  email?: string;
}

export async function getUser(req: Request): Promise<CallerIdentity | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function isAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) {
    console.error("[auth.isAdmin] has_role failed:", error.message);
    return false;
  }
  return data === true;
}
