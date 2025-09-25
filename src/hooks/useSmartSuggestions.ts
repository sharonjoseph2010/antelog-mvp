import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SmartSuggestion {
  text: string;
  type: 'existing' | 'new';
  category?: string;
  mentions?: number;
}

interface CategorySuggestion {
  entry: string;
  category: string;
  confidence: number;
}

export const useSmartSuggestions = () => {
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [categorySuggestions, setCategorySuggestions] = useState<CategorySuggestion[]>([]);

  const getSuggestions = useCallback(async (input: string, listCategory?: string) => {
    console.log('🎯 getSuggestions called with:', { input, listCategory, inputLength: input?.length });
    
    if (!input || input.length < 2) {
      console.log('❌ Input too short, clearing suggestions');
      setSuggestions([]);
      return;
    }

    console.log('🔄 Starting getSuggestions request...');
    setLoading(true);
    try {
      console.log('📡 Invoking ai-smart-suggestions edge function...');
      const { data, error } = await supabase.functions.invoke('ai-smart-suggestions', {
        body: { input, listCategory }
      });

      console.log('📨 Edge function response:', { data, error });
      
      if (error) {
        console.error('❌ Edge function error:', error);
        throw error;
      }
      
      const suggestions = data?.suggestions || [];
      console.log('✅ Setting suggestions:', suggestions);
      setSuggestions(suggestions);
    } catch (error) {
      console.error('💥 Error getting smart suggestions:', error);
      setSuggestions([]);
    } finally {
      console.log('🏁 getSuggestions complete, loading = false');
      setLoading(false);
    }
  }, []);

  const getCategorySuggestions = useCallback(async (entries: string[] | string) => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-suggest-category', {
        body: { entries }
      });

      if (error) throw error;
      setCategorySuggestions(data.suggestions || []);
      return data.suggestions || [];
    } catch (error) {
      console.error('Error getting category suggestions:', error);
      return [];
    }
  }, []);

  const normalizeEntries = useCallback(async (entries: any[]) => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-normalize-entries', {
        body: { entries }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error normalizing entries:', error);
      return null;
    }
  }, []);

  return {
    suggestions,
    loading,
    categorySuggestions,
    getSuggestions,
    getCategorySuggestions,
    normalizeEntries,
  };
};