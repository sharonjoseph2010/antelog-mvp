import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, adminClient } from "../_shared/auth.ts";
import { json, preflight, fail } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { INJECTION_GUARD, wrapUserInput } from "../_shared/promptSafety.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  try {
    // Identity comes from the verified JWT, never from the request body (#3).
    // Previously this function rewrote user_expertise for an arbitrary body
    // `userId`, letting any caller overwrite anyone's expertise profile.
    const caller = await getUser(req);
    if (!caller) return json(req, { error: "Unauthorized" }, 401);

    const admin = adminClient();

    const rl = await enforceRateLimit(admin, caller.id, "ai-update-user-expertise", 5, 60);
    if (!rl.ok) return json(req, { error: "Too many requests. Please wait a moment." }, 429);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const userId = caller.id;

    const { data: lists, error: listsError } = await admin
      .from("lists")
      .select("title, category, description")
      .eq("owner_id", userId)
      .eq("visibility", "public")
      .limit(50);

    if (listsError) throw listsError;

    if (!lists || lists.length === 0) {
      return json(req, { message: "No public lists found for expertise analysis" });
    }

    const listsText = lists
      .map((l) => `${l.title} (${l.category})${l.description ? ": " + l.description : ""}`)
      .join("\n");

    const prompt = `Analyze the following user's public lists and extract 5-10 expertise tags that represent their knowledge areas. Focus on locations, categories, interests, and specific domains.
${INJECTION_GUARD}

Lists:
${wrapUserInput(listsText)}

Return ONLY a JSON object with this structure:
{
  "tags": ["tag1", "tag2", "tag3"],
  "confidence_scores": [0.9, 0.85, 0.8]
}

Tags should be lowercase, single words or short phrases. Confidence scores should be between 0 and 1.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
        }),
      },
    );

    if (!geminiResponse.ok) {
      console.error("Gemini API error:", await geminiResponse.text());
      throw new Error("Failed to analyze expertise with Gemini");
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) throw new Error("No response from Gemini API");

    let expertiseData: { tags?: string[]; confidence_scores?: number[] };
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in Gemini response");
    expertiseData = JSON.parse(jsonMatch[0]);

    const { error: updateError } = await admin
      .from("user_expertise")
      .upsert(
        {
          user_id: userId,
          expertise_tags: expertiseData.tags || [],
          confidence_scores: expertiseData.confidence_scores || [],
          last_updated: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (updateError) throw updateError;

    return json(req, {
      success: true,
      tags: expertiseData.tags,
      message: "User expertise updated successfully",
    });
  } catch (error) {
    return fail(req, "ai-update-user-expertise", error);
  }
});
