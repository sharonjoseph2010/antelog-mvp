import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, adminClient } from "../_shared/auth.ts";
import { json, preflight, fail } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { INJECTION_GUARD, wrapUserInput } from "../_shared/promptSafety.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  // Parsed once so the fallback path can reuse it (the request body is a
  // one-shot stream — re-reading it later throws).
  let entries: unknown;

  try {
    const caller = await getUser(req);
    if (!caller) return json(req, { error: "Unauthorized" }, 401);

    const supabase = adminClient();
    const rl = await enforceRateLimit(supabase, caller.id, "ai-suggest-category", 30, 60);
    if (!rl.ok) return json(req, { error: "Too many requests. Please slow down." }, 429);

    ({ entries } = await req.json());
    if (!entries || (Array.isArray(entries) && entries.length === 0)) {
      return json(req, { suggestions: [] });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
    const entryTexts = Array.isArray(entries) ? entries.join("\n") : String(entries);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyze these list entries and suggest the most appropriate category for each.
${INJECTION_GUARD}

Entries:
${wrapUserInput(entryTexts)}

Available categories:
- films (movies, TV shows, documentaries)
- places (restaurants, cafes, hotels, attractions, cities)
- products (physical items, gadgets, books, clothing)
- services (apps, software, professional services, tools)
- other (everything else)

Return JSON format:
{ "suggestions": [ { "entry": "Lavonne Cafe", "category": "places", "confidence": 0.95 } ] }

Only return the JSON, no other text.`,
            }],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
        }),
      },
    );

    let suggestions: unknown[] = [];
    if (geminiResponse.ok) {
      const geminiData = await geminiResponse.json();
      const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        try {
          const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
          const result = JSON.parse(cleanContent);
          suggestions = result.suggestions || [];
        } catch (parseError) {
          console.error("Failed to parse category suggestions");
          suggestions = basicSuggestions(entries, 0.5);
        }
      }
    } else {
      suggestions = basicSuggestions(entries, 0.5);
    }

    return json(req, { suggestions });
  } catch (error) {
    // Keyword fallback so the feature degrades gracefully rather than 500ing.
    console.error("[ai-suggest-category]", error instanceof Error ? error.message : String(error));
    return json(req, { suggestions: basicSuggestions(entries, 0.3) });
  }
});

function basicSuggestions(entries: unknown, confidence: number) {
  const toItem = (entry: string) => ({ entry, category: getBasicCategory(entry), confidence });
  if (Array.isArray(entries)) return entries.map((e: string) => toItem(e));
  if (typeof entries === "string") return [toItem(entries)];
  return [];
}

function getBasicCategory(entry: string): string {
  const lower = entry.toLowerCase();
  if (lower.includes("cafe") || lower.includes("restaurant") || lower.includes("bar") ||
      lower.includes("hotel") || lower.includes("place") || lower.includes("city")) return "places";
  if (lower.includes("movie") || lower.includes("film") || lower.includes("series") ||
      lower.includes("show") || lower.includes("documentary")) return "films";
  if (lower.includes("app") || lower.includes("software") || lower.includes("tool") ||
      lower.includes("service") || lower.includes("platform")) return "services";
  if (lower.includes("book") || lower.includes("product") || lower.includes("item") ||
      lower.includes("gadget") || lower.includes("device")) return "products";
  return "other";
}
