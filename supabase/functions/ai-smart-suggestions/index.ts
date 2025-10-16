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

  console.log('🚀 ai-smart-suggestions function called');

  try {
    const { input, listCategory } = await req.json();
    console.log('📝 Parsed request body:', { input, listCategory });
    
    if (!input || input.length < 2) {
      console.log('❌ Input validation failed:', { input, length: input?.length });
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiKey = Deno.env.get('GEMINI_API_KEY')!;
    
    console.log('🔧 Environment check:', { 
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey, 
      hasGeminiKey: !!geminiKey 
    });
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // First, search existing master directory entries
    console.log('🔍 Searching existing entries...');
    const { data: existingEntries, error: searchError } = await supabase
      .from('master_directory_entries')
      .select('display_content, normalized_content, category, mention_count')
      .or(`display_content.ilike.%${input}%,normalized_content.ilike.%${input}%`)
      .order('mention_count', { ascending: false })
      .limit(5);

    console.log('📊 Existing entries result:', { existingEntries, searchError, count: existingEntries?.length });

    // Use Gemini to enhance suggestions and provide smart completions
    console.log('🤖 Calling Gemini API...');
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Given the user input "${input}" for a ${listCategory || 'general'} category list, suggest 3-5 relevant completions. Consider: restaurants, cafes, movies, books, places, products, services. Format as JSON array of strings. Only return the JSON array, no other text.
            
            Examples:
            Input: "Lavonne" → ["Lavonne Cafe", "Lavonne Bakery", "Lavonne Academy"]
            Input: "Inception" → ["Inception (2010)", "Inception Movie", "Inception Film"]
            Input: "Starbucks" → ["Starbucks Coffee", "Starbucks Reserve", "Starbucks Frappuccino"]`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 200,
        },
      }),
    });

    let aiSuggestions = [];
    console.log('🌐 Gemini response status:', geminiResponse.status);
    if (geminiResponse.ok) {
      const geminiData = await geminiResponse.json();
      console.log('🤖 Gemini data:', geminiData);
      const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        try {
          // Clean up the response to ensure it's valid JSON
          const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
          console.log('🧹 Cleaned content:', cleanContent);
          aiSuggestions = JSON.parse(cleanContent);
          console.log('✅ Parsed AI suggestions:', aiSuggestions);
        } catch (parseError) {
          console.error('❌ Failed to parse AI suggestions:', parseError, 'Content:', content);
        }
      }
    } else {
      console.error('❌ Gemini API error:', await geminiResponse.text());
    }

    // Combine existing entries with AI suggestions
    const existingSuggestions = existingEntries?.map(entry => ({
      text: entry.display_content,
      type: 'existing',
      category: entry.category,
      mentions: entry.mention_count
    })) || [];

    const newSuggestions = aiSuggestions
      .filter((suggestion: string) => !existingSuggestions.some(existing => 
        existing.text.toLowerCase() === suggestion.toLowerCase()
      ))
      .map((suggestion: string) => ({
        text: suggestion,
        type: 'new',
        category: listCategory,
        mentions: 0
      }));

    const allSuggestions = [...existingSuggestions, ...newSuggestions].slice(0, 8);
    console.log('📋 Final suggestions:', allSuggestions);

    return new Response(JSON.stringify({ suggestions: allSuggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Unhandled error in ai-smart-suggestions:', error);
    return new Response(JSON.stringify({ error: (error as Error).message, suggestions: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});