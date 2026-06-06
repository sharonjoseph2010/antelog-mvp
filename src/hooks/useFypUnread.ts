import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export async function markFypVisited(_userId?: string | null) {
  try {
    await supabase.rpc("mark_for_you_visited" as any);
  } catch {}
}

export function useFypUnread(): boolean {
  const [hasUnread, setHasUnread] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data, error } = await supabase.rpc("has_fyp_unread" as any);
      if (cancelled || error) return;
      setHasUnread(Boolean(data));
    })();
    return () => { cancelled = true; };
  }, [location.pathname]);

  return hasUnread;
}