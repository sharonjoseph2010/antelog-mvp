import { log } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";

interface Recommendation {
  id: string;
  text: string;
  votes: number;
  contributor: string;
  source: 'antelog' | 'guest';
}

export interface Cluster {
  canonical_text: string;
  recommendation_ids: string[];
  total_votes: number;
  mention_count: number;
  similarity_score: number;
  variations: Recommendation[];
}

/**
 * Main clustering function
 * Fetches all recommendations and groups similar ones
 */
export async function clusterRecommendations(requestId: string): Promise<Cluster[]> {
  log('=== STARTING CLUSTERING FOR REQUEST:', requestId);

  try {
    // Step 1: Fetch all recommendations from Antelog users
    const { data: antelogRecs, error: antelogError } = await supabase
      .from('response_recommendations')
      .select(`
        id,
        recommendation_text,
        vote_count,
        response_id
      `);

    if (antelogError) throw antelogError;

    // Filter by request_id via request_responses join
    const { data: responses, error: respError } = await supabase
      .from('request_responses')
      .select('id, responder_id')
      .eq('request_id', requestId);

    if (respError) throw respError;

    const responseIds = new Set((responses ?? []).map(r => r.id));
    const responderMap = new Map((responses ?? []).map(r => [r.id, r.responder_id]));

    // Get responder names
    const responderIds = [...new Set((responses ?? []).map(r => r.responder_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', responderIds.length > 0 ? responderIds : ['00000000-0000-0000-0000-000000000000']);

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p.full_name]));

    // Step 2: Fetch all recommendations from guests
    const { data: guestContributions, error: guestError } = await supabase
      .from('guest_contributions')
      .select('id, contributor_name, recommendations')
      .eq('request_id', requestId);

    if (guestError) throw guestError;

    // Step 3: Combine all recommendations into unified format
    const allRecommendations: Recommendation[] = [];

    // Add Antelog recommendations (filtered to this request)
    (antelogRecs ?? []).forEach(rec => {
      if (!responseIds.has(rec.response_id)) return;
      const responderId = responderMap.get(rec.response_id);
      allRecommendations.push({
        id: rec.id,
        text: rec.recommendation_text,
        votes: rec.vote_count || 0,
        contributor: (responderId ? profileMap.get(responderId) : null) || 'Anonymous',
        source: 'antelog'
      });
    });

    // Add guest recommendations (flatten JSONB array)
    (guestContributions ?? []).forEach(guest => {
      const recs = Array.isArray(guest.recommendations) ? (guest.recommendations as any[]) : [];
      recs.forEach((rec, idx) => {
        if (!rec) return;
        allRecommendations.push({
          id: `${guest.id}_${idx}`,
          text: rec.text || rec.recommendation_text || '',
          votes: rec.vote_count || 0,
          contributor: guest.contributor_name,
          source: 'guest'
        });
      });
    });

    log(`Found ${allRecommendations.length} total recommendations`);

    // Step 4: Cluster the recommendations
    const clusters = groupSimilarRecommendations(allRecommendations);

    log(`Created ${clusters.length} clusters`);

    return clusters;

  } catch (error) {
    console.error('Clustering error:', error);
    throw error;
  }
}

/**
 * Groups similar recommendations using fuzzy matching
 */
function groupSimilarRecommendations(recommendations: Recommendation[]): Cluster[] {
  const clusters: Cluster[] = [];
  const processed = new Set<string>();

  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  };

  // Sort by votes (highest first) to pick best canonical names
  const sorted = [...recommendations].sort((a, b) => b.votes - a.votes);

  for (const rec of sorted) {
    if (processed.has(rec.id)) continue;

    const cluster: Cluster = {
      canonical_text: rec.text,
      recommendation_ids: [rec.id],
      total_votes: rec.votes,
      mention_count: 1,
      similarity_score: 1.0,
      variations: [rec]
    };

    processed.add(rec.id);
    const normalizedCanonical = normalizeText(rec.text);

    for (const other of recommendations) {
      if (processed.has(other.id)) continue;

      const normalizedOther = normalizeText(other.text);
      const similarity = calculateSimilarity(normalizedCanonical, normalizedOther);

      if (similarity >= 0.85) {
        cluster.recommendation_ids.push(other.id);
        cluster.total_votes += other.votes;
        cluster.mention_count += 1;
        cluster.variations.push(other);
        processed.add(other.id);
        cluster.similarity_score = Math.min(cluster.similarity_score, similarity);
      }
    }

    clusters.push(cluster);
  }

  return clusters.sort((a, b) => b.total_votes - a.total_votes);
}

/**
 * Calculate text similarity using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - (distance / maxLen);
}

/**
 * Save clusters to database for review
 */
export async function saveClustersForReview(
  requestId: string,
  clusters: Cluster[]
): Promise<void> {
  log('=== SAVING CLUSTERS TO DATABASE');

  try {
    // Clear any existing clusters for this request
    await supabase
      .from('recommendation_clusters')
      .delete()
      .eq('request_id', requestId);

    // Insert new clusters
    const clusterData = clusters.map((cluster, index) => ({
      request_id: requestId,
      canonical_text: cluster.canonical_text,
      recommendation_ids: cluster.recommendation_ids,
      total_votes: cluster.total_votes,
      mention_count: cluster.mention_count,
      similarity_score: cluster.similarity_score,
      cluster_method: 'fuzzy_match',
      status: 'pending',
      position: index + 1
    }));

    if (clusterData.length > 0) {
      const { error } = await supabase
        .from('recommendation_clusters')
        .insert(clusterData);

      if (error) throw error;
    }

    log(`Saved ${clusterData.length} clusters`);

  } catch (error) {
    console.error('Error saving clusters:', error);
    throw error;
  }
}

/**
 * Update request status to 'reviewing'
 */
export async function startReviewProcess(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('requests')
    .update({ status: 'reviewing' as any })
    .eq('id', requestId);

  if (error) throw error;
}

/**
 * Main function: Cluster and start review
 */
export async function initiateClusteringReview(requestId: string): Promise<Cluster[]> {
  log('=== INITIATING CLUSTERING REVIEW');

  const clusters = await clusterRecommendations(requestId);
  await saveClustersForReview(requestId, clusters);
  await startReviewProcess(requestId);

  return clusters;
}
