import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ListCategory = Database["public"]["Enums"]["list_category"];

interface DuplicateCheck {
  isDuplicate: boolean;
  existingEntry?: {
    id: string;
    display_content: string;
    normalized_content: string;
    category: string;
    mention_count: number;
    mentioned_by_users: string[];
  };
  similarity?: number;
}

/**
 * Calculate similarity between two strings (Levenshtein distance based)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

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
  return 1 - distance / maxLen;
}

/**
 * Check if a similar entry already exists in the Master Directory
 */
export async function checkForDuplicates(
  title: string,
  category: ListCategory
): Promise<DuplicateCheck> {
  const normalizedTitle = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");

  const { data: existingEntries, error } = await supabase
    .from("master_directory_entries")
    .select("*")
    .eq("category", category);

  if (error) {
    console.error("Error checking duplicates:", error);
    return { isDuplicate: false };
  }

  for (const entry of existingEntries || []) {
    const existingNormalized = entry.normalized_content
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ");

    const similarity = calculateSimilarity(normalizedTitle, existingNormalized);

    if (similarity >= 0.9) {
      return {
        isDuplicate: true,
        existingEntry: entry,
        similarity,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Publish a list to the Master Directory by making it public
 * and refreshing the materialized directory.
 */
export async function publishToMasterDirectory(
  listId: string,
  _userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Update list visibility to public
    const { error: updateError } = await supabase
      .from("lists")
      .update({ visibility: "public" as const })
      .eq("id", listId);

    if (updateError) throw updateError;

    // Refresh the master directory so the new public list is indexed
    const { error: refreshError } = await supabase.rpc(
      "refresh_master_directory"
    );

    if (refreshError) {
      console.warn("Master directory refresh failed (non-blocking):", refreshError);
      // Non-blocking — the list is still public, refresh can happen later
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error publishing to Master Directory:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Merge with an existing entry: make list public and update the
 * existing master directory entry's metadata, then refresh.
 */
export async function mergeWithExisting(
  listId: string,
  userId: string,
  existingEntryId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Make the list public so its items appear in the directory
    const { error: updateError } = await supabase
      .from("lists")
      .update({ visibility: "public" as const })
      .eq("id", listId);

    if (updateError) throw updateError;

    // Update master directory entry to include new contributor
    // This uses the SECURITY DEFINER refresh function
    const { error: refreshError } = await supabase.rpc(
      "refresh_master_directory"
    );

    if (refreshError) {
      console.warn("Master directory refresh failed (non-blocking):", refreshError);
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error merging with existing:", error);
    return { success: false, error: error.message };
  }
}
