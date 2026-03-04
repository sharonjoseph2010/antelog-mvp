import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  full_name: string | null;
  handle: string | null;
}

// Cache for network check results to avoid redundant RPC calls
const networkCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_TTL = 60_000; // 1 minute

/**
 * Check if two users are in the same network (1st or 2nd degree)
 * Uses the Supabase is_in_network RPC function
 */
export async function isInNetwork(viewerId: string, profileId: string): Promise<boolean> {
  if (viewerId === profileId) return true;

  const cacheKey = `${viewerId}:${profileId}`;
  const cached = networkCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  // Try up to 2 times on error
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.rpc('is_in_network', {
      viewer_id: viewerId,
      profile_id: profileId,
    });

    if (!error) {
      const result = !!data;
      networkCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    console.warn(`isInNetwork attempt ${attempt + 1} failed:`, error.message);
    if (attempt === 0) {
      // Brief delay before retry
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // On persistent failure, don't cache and default to false (show handle only)
  console.error('isInNetwork failed after retries, defaulting to false');
  return false;
}

/**
 * Get the display name for a user based on network relationship.
 * - Same user or in-network → full_name (or handle fallback)
 * - Out of network → @handle (randomized anonymous handle)
 */
export async function getNetworkAwareDisplayName(
  viewerId: string,
  profileId: string,
  profile?: Profile | null
): Promise<{ displayName: string; isAnonymous: boolean }> {
  if (viewerId === profileId) {
    return { displayName: profile?.full_name || profile?.handle || 'You', isAnonymous: false };
  }

  const inNetwork = await isInNetwork(viewerId, profileId);

  if (inNetwork) {
    return {
      displayName: profile?.full_name || profile?.handle || 'Someone',
      isAnonymous: false,
    };
  } else {
    return {
      displayName: profile?.handle ? `@${profile.handle}` : 'Someone',
      isAnonymous: true,
    };
  }
}

/**
 * Synchronous version when network status is already known
 */
export function getDisplayNameSync(
  profile: Profile | null | undefined,
  isInNetwork: boolean
): string {
  if (isInNetwork) {
    return profile?.full_name || profile?.handle || 'Someone';
  } else {
    return profile?.handle ? `@${profile.handle}` : 'Someone';
  }
}

/**
 * React hook that resolves display names for a set of user IDs
 * based on the viewer's network relationship.
 * 
 * Returns a Map<userId, { displayName, isAnonymous }>
 */
export function useNetworkAwareNames(
  viewerId: string | null,
  profiles: Map<string, Profile> | Array<{ id: string; full_name: string | null; handle: string | null }>
) {
  const [names, setNames] = useState<Map<string, { displayName: string; isAnonymous: boolean }>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  // Normalize to Map
  const profileMap = Array.isArray(profiles)
    ? new Map(profiles.map(p => [p.id, { full_name: p.full_name, handle: p.handle }]))
    : profiles;

  const profileKeys = Array.from(profileMap.keys()).sort().join(',');

  useEffect(() => {
    if (!viewerId || profileMap.size === 0) return;

    let cancelled = false;
    setIsLoading(true);

    const resolve = async () => {
      const result = new Map<string, { displayName: string; isAnonymous: boolean }>();

      await Promise.all(
        Array.from(profileMap.entries()).map(async ([userId, profile]) => {
          const { displayName, isAnonymous } = await getNetworkAwareDisplayName(
            viewerId,
            userId,
            profile
          );
          result.set(userId, { displayName, isAnonymous });
        })
      );

      if (!cancelled) {
        setNames(result);
        setIsLoading(false);
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [viewerId, profileKeys]);

  const getDisplayName = useCallback(
    (userId: string): string => {
      return names.get(userId)?.displayName || 'Someone';
    },
    [names]
  );

  const isAnonymous = useCallback(
    (userId: string): boolean => {
      return names.get(userId)?.isAnonymous ?? true;
    },
    [names]
  );

  return { names, getDisplayName, isAnonymous, isLoading };
}

// Keep backward compatibility
export async function areUsersConnected(userId1: string, userId2: string): Promise<boolean> {
  return isInNetwork(userId1, userId2);
}
