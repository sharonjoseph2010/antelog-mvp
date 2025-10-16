import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries } = await req.json();
    
    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY')!;
    const entryTexts = Array.isArray(entries) ? entries.join('\n') : entries;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze these list entries and suggest the most appropriate category for each:

Entries:
${entryTexts}

Available categories:
- films (movies, TV shows, documentaries)
- places (restaurants, cafes, hotels, attractions, cities)  
- products (physical items, gadgets, books, clothing)
- services (apps, software, professional services, tools)
- other (everything else)

Additional context:
- Cafes, restaurants, bars → "places"
- Movies, series, documentaries → "films"  
- Books, physical products → "products"
- Apps, software, online tools → "services"

Return JSON format:
{
  "suggestions": [
    {
      "entry": "Lavonne Cafe",
      "category": "places",
      "confidence": 0.95
    }
  ]
}

Only return the JSON, no other text.`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
        },
      }),
    });

    let suggestions = [];
    if (geminiResponse.ok) {
      const geminiData = await geminiResponse.json();
      const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        try {
          const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
          const result = JSON.parse(cleanContent);
          suggestions = result.suggestions || [];
        } catch (parseError) {
          console.error('Failed to parse category suggestions:', parseError);
          // Fallback: return basic suggestions based on keywords
          suggestions = Array.isArray(entries) ? entries.map(entry => ({
            entry,
            category: getBasicCategory(entry),
            confidence: 0.5
          })) : [{
            entry: entries,
            category: getBasicCategory(entries),
            confidence: 0.5
          }];
        }
      }
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-suggest-category:', error);
    
    // Fallback category detection
    const { entries: requestEntries } = await req.json();
    const fallbackSuggestions = Array.isArray(requestEntries) ? requestEntries.map((entry: string) => ({
      entry,
      category: getBasicCategory(entry),
      confidence: 0.3
    })) : [{
      entry: requestEntries,
      category: getBasicCategory(requestEntries),
      confidence: 0.3
    }];

    return new Response(JSON.stringify({ suggestions: fallbackSuggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getBasicCategory(entry: string): string {
  const lower = entry.toLowerCase();
  
  if (lower.includes('cafe') || lower.includes('restaurant') || lower.includes('bar') || 
      lower.includes('hotel') || lower.includes('place') || lower.includes('city')) {
    return 'places';
  }
  if (lower.includes('movie') || lower.includes('film') || lower.includes('series') || 
      lower.includes('show') || lower.includes('documentary')) {
    return 'films';
  }
  if (lower.includes('app') || lower.includes('software') || lower.includes('tool') || 
      lower.includes('service') || lower.includes('platform')) {
    return 'services';
  }
  if (lower.includes('book') || lower.includes('product') || lower.includes('item') ||
      lower.includes('gadget') || lower.includes('device')) {
    return 'products';
  }
  
  return 'other';
}