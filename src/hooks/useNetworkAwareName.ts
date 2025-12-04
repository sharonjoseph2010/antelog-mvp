import { supabase } from "@/integrations/supabase/client";

interface Profile {
  full_name: string | null;
  handle: string | null;
}

/**
 * Check if two users are directly connected (1st network)
 */
export async function areUsersConnected(userId1: string, userId2: string): Promise<boolean> {
  const { data: connection } = await supabase
    .from('friendships')
    .select('id')
    .or(`and(user1_id.eq.${userId1},user2_id.eq.${userId2}),and(user1_id.eq.${userId2},user2_id.eq.${userId1})`)
    .maybeSingle();
  
  return !!connection;
}

/**
 * Get display name based on network relationship
 * - If viewer is connected to user: show full_name (or handle as fallback)
 * - If viewer is NOT connected: show @handle (for privacy)
 */
export async function getNetworkAwareDisplayName(
  userId: string,
  viewerId: string,
  profile?: Profile | null
): Promise<{ displayName: string; isAnonymous: boolean }> {
  // Same user always sees their own name
  if (userId === viewerId) {
    const name = profile?.full_name || profile?.handle || 'You';
    return { displayName: name, isAnonymous: false };
  }

  // Check if connected
  const isConnected = await areUsersConnected(userId, viewerId);
  
  if (isConnected) {
    // Connected: show full name (or handle as fallback)
    const displayName = profile?.full_name || profile?.handle || 'Someone';
    return { displayName, isAnonymous: false };
  } else {
    // Not connected: show handle with @ prefix for privacy
    const displayName = profile?.handle ? `@${profile.handle}` : 'Someone';
    return { displayName, isAnonymous: true };
  }
}

/**
 * Get display names for multiple users in a network path
 */
export async function getNetworkPathDisplayNames(
  pathUserIds: string[],
  viewerId: string,
  profiles: Map<string, Profile>
): Promise<Array<{ userId: string; displayName: string; isAnonymous: boolean }>> {
  const results = await Promise.all(
    pathUserIds.map(async (userId) => {
      const profile = profiles.get(userId) || null;
      const { displayName, isAnonymous } = await getNetworkAwareDisplayName(
        userId,
        viewerId,
        profile
      );
      return { userId, displayName, isAnonymous };
    })
  );
  
  return results;
}

/**
 * Synchronous version when connection status is already known
 */
export function getDisplayNameSync(
  profile: Profile | null | undefined,
  isConnected: boolean
): string {
  if (isConnected) {
    return profile?.full_name || profile?.handle || 'Someone';
  } else {
    return profile?.handle ? `@${profile.handle}` : 'Someone';
  }
}
