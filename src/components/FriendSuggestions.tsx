import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, X, Phone, Mail } from "lucide-react";

interface FriendSuggestion {
  id: string;
  suggested_user_id: string;
  match_type: string;
  match_value: string;
  created_at: string;
  user_profile?: {
    full_name: string;
    handle: string;
  };
}

export const FriendSuggestions = () => {
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('friend_suggestions')
        .select(`
          id,
          suggested_user_id,
          match_type,
          match_value,
          created_at
        `)
        .eq('user_id', user.id)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Get profile info for suggested users
      if (data && data.length > 0) {
        const userIds = data.map(s => s.suggested_user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, handle')
          .in('id', userIds);
        
        const enrichedSuggestions = data.map(suggestion => ({
          ...suggestion,
          user_profile: profiles?.find(p => p.id === suggestion.suggested_user_id)
        }));
        
        setSuggestions(enrichedSuggestions);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendFriendRequest = async (suggestedUserId: string, suggestionId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if friend request already exists
      const { data: existingRequest } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('requester_id', user.id)
        .eq('addressee_id', suggestedUserId)
        .single();

      if (existingRequest) {
        toast({
          title: "Friend request already sent",
          description: "You've already sent a friend request to this person",
        });
        return;
      }

      // Send friend request
      const { error: requestError } = await supabase
        .from('friend_requests')
        .insert({
          requester_id: user.id,
          addressee_id: suggestedUserId,
          status: 'pending',
        });

      if (requestError) throw requestError;

      // Dismiss the suggestion
      await dismissSuggestion(suggestionId);

      toast({
        title: "Friend request sent!",
        description: "Your friend request has been sent successfully",
      });
    } catch (error) {
      console.error('Error sending friend request:', error);
      toast({
        title: "Error sending request",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const dismissSuggestion = async (suggestionId: string) => {
    try {
      const { error } = await supabase
        .from('friend_suggestions')
        .update({ is_dismissed: true })
        .eq('id', suggestionId);

      if (error) throw error;

      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    } catch (error) {
      console.error('Error dismissing suggestion:', error);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Friend Suggestions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Loading suggestions...</div>
        </CardContent>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Friend Suggestions</CardTitle>
          <CardDescription>
            We'll suggest friends when people from your contacts join Antelog
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">
            No new suggestions at the moment
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Friend Suggestions</CardTitle>
        <CardDescription>
          People from your contacts who joined Antelog
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                  {suggestion.match_type === 'phone' ? (
                    <Phone className="h-4 w-4 text-primary" />
                  ) : (
                    <Mail className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div>
                  <h3 className="font-medium">
                    {suggestion.user_profile?.full_name || 'Unknown User'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    @{suggestion.user_profile?.handle || 'unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Matched via {suggestion.match_type}: {suggestion.match_value}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => sendFriendRequest(suggestion.suggested_user_id, suggestion.id)}
                  className="flex items-center gap-1"
                >
                  <UserPlus className="h-3 w-3" />
                  Connect
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismissSuggestion(suggestion.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};