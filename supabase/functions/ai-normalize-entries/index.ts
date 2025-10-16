import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      return new Response(JSON.stringify({ normalized: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiKey = Deno.env.get('GEMINI_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Process entries in batches to identify duplicates
    const batchSize = 10;
    const normalizedGroups = [];

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const entryTexts = batch.map((entry: any) => entry.display_content).join('\n');

      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyze these entries and group duplicates/variations of the same business/item. Provide a canonical name for each group.

Entries:
${entryTexts}

Rules:
- "Lavonne", "Lavonne Cafe", "Lavonne Bakery" are the same → "Lavonne Cafe"
- "Starbucks", "Starbucks Coffee" are the same → "Starbucks"  
- "Inception", "Inception Movie", "Inception (2010)" are the same → "Inception (2010)"

Return JSON format:
{
  "groups": [
    {
      "canonical": "Lavonne Cafe",
      "variations": ["Lavonne", "Lavonne Cafe", "Lavonne Bakery"],
      "category": "places"
    }
  ]
}

Only return the JSON, no other text.`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000,
          },
        }),
      });

      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json();
        const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          try {
            const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
            const result = JSON.parse(cleanContent);
            if (result.groups) {
              normalizedGroups.push(...result.groups);
            }
          } catch (parseError) {
            console.error('Failed to parse normalization result:', parseError);
          }
        }
      }

      // Rate limiting - wait 1 second between batches to respect free tier limits
      if (i + batchSize < entries.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Now update the master directory with normalized entries
    for (const group of normalizedGroups) {
      if (group.variations && group.variations.length > 1) {
        // Find all entries that match variations
        const { data: matchingEntries } = await supabase
          .from('master_directory_entries')
          .select('*')
          .in('display_content', group.variations);

        if (matchingEntries && matchingEntries.length > 1) {
          // Consolidate: sum mention counts, merge mentioned_by_users
          const totalMentions = matchingEntries.reduce((sum, entry) => sum + entry.mention_count, 0);
          const allUsers = [...new Set(matchingEntries.flatMap(entry => entry.mentioned_by_users))];
          const latestMention = new Date(Math.max(...matchingEntries.map((entry: any) => new Date(entry.latest_mention_at).getTime())));

          // Keep one entry with canonical name, delete others
          const keepEntry = matchingEntries[0];
          const deleteIds = matchingEntries.slice(1).map(entry => entry.id);

          // Update the kept entry
          await supabase
            .from('master_directory_entries')
            .update({
              display_content: group.canonical,
              normalized_content: group.canonical.toLowerCase(),
              mention_count: totalMentions,
              mentioned_by_users: allUsers,
              latest_mention_at: latestMention.toISOString(),
            })
            .eq('id', keepEntry.id);

          // Delete duplicate entries
          if (deleteIds.length > 0) {
            await supabase
              .from('master_directory_entries')
              .delete()
              .in('id', deleteIds);
          }
        }
      }
    }

    return new Response(JSON.stringify({ 
      normalized: normalizedGroups,
      message: `Processed ${normalizedGroups.length} groups, consolidated duplicates`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-normalize-entries:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
