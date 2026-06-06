import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, adminClient } from "../_shared/auth.ts";
import { json, preflight, fail } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { INJECTION_GUARD, wrapUserInput } from "../_shared/promptSafety.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  try {
    const caller = await getUser(req);
    if (!caller) return json(req, { error: "Unauthorized" }, 401);

    const supabase = adminClient();

    // Tight limit: this fires on typing and calls a paid LLM (cost amplification).
    const rl = await enforceRateLimit(supabase, caller.id, "ai-smart-suggestions", 30, 60);
    if (!rl.ok) return json(req, { error: "Too many requests. Please slow down." }, 429);

    const { input, listCategory } = await req.json();
    if (!input || input.length < 2) {
      return json(req, { suggestions: [] });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;

    // Sanitize the term before embedding it in a PostgREST `.or` filter string:
    // commas, parens, dots and `*` are filter syntax and must not be attacker-
    // controlled. We keep alphanumerics and spaces only for the search term.
    const safeTerm = String(input).replace(/[^\p{L}\p{N}\s]/gu, "").slice(0, 100);

    let existingEntries: Array<{ display_content: string; category: string; mention_count: number }> = [];
    if (safeTerm.length >= 2) {
      const { data } = await supabase
        .from("master_directory_entries")
        .select("display_content, normalized_content, category, mention_count")
        .or(`display_content.ilike.%${safeTerm}%,normalized_content.ilike.%${safeTerm}%`)
        .order("mention_count", { ascending: false })
        .limit(5);
      existingEntries = data ?? [];
    }

    const prompt = `Given the user input below for a ${listCategory || "general"} category list, suggest 3-5 relevant completions. Consider: restaurants, cafes, movies, books, places, products, services. Format as a JSON array of strings. Only return the JSON array, no other text.
${INJECTION_GUARD}

User input:
${wrapUserInput(input, 200)}

Examples:
Input: "Lavonne" → ["Lavonne Cafe", "Lavonne Bakery", "Lavonne Academy"]
Input: "Inception" → ["Inception (2010)", "Inception Movie", "Inception Film"]`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
        }),
      },
    );

    let aiSuggestions: string[] = [];
    if (geminiResponse.ok) {
      const geminiData = await geminiResponse.json();
      const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        try {
          const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
          const parsed = JSON.parse(cleanContent);
          if (Array.isArray(parsed)) aiSuggestions = parsed;
        } catch (parseError) {
          console.error("Failed to parse AI suggestions");
        }
      }
    } else {
      console.error("Gemini API error (smart-suggestions)");
    }

    const existingSuggestions = existingEntries.map((entry) => ({
      text: entry.display_content,
      type: "existing",
      category: entry.category,
      mentions: entry.mention_count,
    }));

    const newSuggestions = aiSuggestions
      .filter((s) => !existingSuggestions.some((e) => e.text.toLowerCase() === s.toLowerCase()))
      .map((s) => ({ text: s, type: "new", category: listCategory, mentions: 0 }));

    const allSuggestions = [...existingSuggestions, ...newSuggestions].slice(0, 8);
    return json(req, { suggestions: allSuggestions });
  } catch (error) {
    return fail(req, "ai-smart-suggestions", error);
  }
});
