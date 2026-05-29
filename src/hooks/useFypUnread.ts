import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY_PREFIX = "antelog:fyp_last_visited_at:";

export function markFypVisited(userId: string | null | undefined) {
  if (!userId) return;
  try {
    localStorage.setItem(KEY_PREFIX + userId, new Date().toISOString());
  } catch {}
}

export function useFypUnread(): boolean {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data, error } = await supabase.rpc("get_fyp_latest_surfaced_at");
      if (cancelled || error) return;
      const latest = data as string | null;
      if (!latest) {
        setHasUnread(false);
        return;
      }
      const lastVisited = localStorage.getItem(KEY_PREFIX + user.id);
      if (!lastVisited || new Date(latest) > new Date(lastVisited)) {
        setHasUnread(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return hasUnread;
}