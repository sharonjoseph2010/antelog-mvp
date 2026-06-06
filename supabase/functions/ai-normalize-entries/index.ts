import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, adminClient, isAdmin } from "../_shared/auth.ts";
import { json, preflight, fail } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { INJECTION_GUARD, wrapUserInput } from "../_shared/promptSafety.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  try {
    // This consolidates/deletes rows in the GLOBAL master directory, so it is
    // an admin-only operation (#5). Previously any caller could trigger
    // table-wide mutation driven by user-supplied content.
    const caller = await getUser(req);
    if (!caller) return json(req, { error: "Unauthorized" }, 401);

    const supabase = adminClient();
    if (!(await isAdmin(supabase, caller.id))) {
      return json(req, { error: "Forbidden" }, 403);
    }

    const rl = await enforceRateLimit(supabase, caller.id, "ai-normalize-entries", 5, 300);
    if (!rl.ok) return json(req, { error: "Too many requests. Please wait a moment." }, 429);

    const { entries } = await req.json();
    if (!entries || entries.length === 0) {
      return json(req, { normalized: [] });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;

    const batchSize = 10;
    const normalizedGroups: Array<{ canonical: string; variations: string[]; category?: string }> = [];

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const entryTexts = batch.map((entry: { display_content: string }) => entry.display_content).join("\n");

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Analyze these entries and group duplicates/variations of the same business/item. Provide a canonical name for each group.
${INJECTION_GUARD}

Entries:
${wrapUserInput(entryTexts)}

Rules:
- "Lavonne", "Lavonne Cafe", "Lavonne Bakery" are the same → "Lavonne Cafe"
- "Starbucks", "Starbucks Coffee" are the same → "Starbucks"
- "Inception", "Inception Movie", "Inception (2010)" are the same → "Inception (2010)"

Return JSON format:
{
  "groups": [
    { "canonical": "Lavonne Cafe", "variations": ["Lavonne", "Lavonne Cafe", "Lavonne Bakery"], "category": "places" }
  ]
}

Only return the JSON, no other text.`,
              }],
            }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
          }),
        },
      );

      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json();
        const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          try {
            const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
            const result = JSON.parse(cleanContent);
            if (result.groups) normalizedGroups.push(...result.groups);
          } catch (parseError) {
            console.error("Failed to parse normalization result");
          }
        }
      }

      if (i + batchSize < entries.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    for (const group of normalizedGroups) {
      if (group.variations && group.variations.length > 1) {
        const { data: matchingEntries } = await supabase
          .from("master_directory_entries")
          .select("*")
          .in("display_content", group.variations);

        if (matchingEntries && matchingEntries.length > 1) {
          const totalMentions = matchingEntries.reduce((sum, entry) => sum + entry.mention_count, 0);
          const allUsers = [...new Set(matchingEntries.flatMap((entry) => entry.mentioned_by_users))];
          const latestMention = new Date(
            Math.max(...matchingEntries.map((entry: { latest_mention_at: string }) => new Date(entry.latest_mention_at).getTime())),
          );

          const keepEntry = matchingEntries[0];
          const deleteIds = matchingEntries.slice(1).map((entry) => entry.id);

          await supabase
            .from("master_directory_entries")
            .update({
              display_content: group.canonical,
              normalized_content: group.canonical.toLowerCase(),
              mention_count: totalMentions,
              mentioned_by_users: allUsers,
              latest_mention_at: latestMention.toISOString(),
            })
            .eq("id", keepEntry.id);

          if (deleteIds.length > 0) {
            await supabase.from("master_directory_entries").delete().in("id", deleteIds);
          }
        }
      }
    }

    return json(req, {
      normalized: normalizedGroups,
      message: `Processed ${normalizedGroups.length} groups, consolidated duplicates`,
    });
  } catch (error) {
    return fail(req, "ai-normalize-entries", error);
  }
});
