import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { userId } = await req.json();

    if (!userId) {
      throw new Error('userId is required');
    }

    // Get user's public lists
    const { data: lists, error: listsError } = await supabase
      .from('lists')
      .select('title, category, description')
      .eq('owner_id', userId)
      .eq('visibility', 'public')
      .limit(50);

    if (listsError) throw listsError;

    if (!lists || lists.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No public lists found for expertise analysis' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare prompt for Gemini
    const listsText = lists.map(l => `${l.title} (${l.category})${l.description ? ': ' + l.description : ''}`).join('\n');
    
    const prompt = `Analyze the following user's public lists and extract 5-10 expertise tags that represent their knowledge areas. Focus on locations, categories, interests, and specific domains.

Lists:
${listsText}

Return ONLY a JSON object with this structure:
{
  "tags": ["tag1", "tag2", "tag3"],
  "confidence_scores": [0.9, 0.85, 0.8]
}

Tags should be lowercase, single words or short phrases. Confidence scores should be between 0 and 1.`;

    // Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      throw new Error('Failed to analyze expertise with Gemini');
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error('No response from Gemini API');
    }

    // Parse JSON from response
    let expertiseData;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        expertiseData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', responseText);
      throw new Error('Failed to parse expertise data');
    }

    // Update user_expertise table
    const { error: updateError } = await supabase
      .from('user_expertise')
      .upsert({
        user_id: userId,
        expertise_tags: expertiseData.tags || [],
        confidence_scores: expertiseData.confidence_scores || [],
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ 
        success: true,
        tags: expertiseData.tags,
        message: 'User expertise updated successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-update-user-expertise:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
