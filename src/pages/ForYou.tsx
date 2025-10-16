import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, TrendingUp, Users, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

interface DisplayIdentity {
  name: string;
  handle: string;
  is_anonymous: boolean;
  is_verified: boolean;
}

interface RequestWithRelevance {
  id: string;
  title: string;
  category: string;
  location: string | null;
  created_at: string;
  creator_id: string;
  relevance_score: number;
  creator_identity: DisplayIdentity | null;
}

interface TrendingList {
  id: string;
  title: string;
  category: string;
  description: string | null;
  owner_id: string;
  mention_count: number;
  owner_identity: DisplayIdentity | null;
}

export default function ForYou() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [relevantRequests, setRelevantRequests] = useState<RequestWithRelevance[]>([]);
  const [trendingLists, setTrendingLists] = useState<TrendingList[]>([]);
  const [similarLists, setSimilarLists] = useState<TrendingList[]>([]);

  useEffect(() => {
    loadForYouContent();
  }, []);

  const loadForYouContent = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      // Load relevant requests
      await loadRelevantRequests(user.id);
      
      // Load trending public lists
      await loadTrendingLists(user.id);
      
      // Load similar interest lists
      await loadSimilarLists(user.id);

    } catch (error) {
      console.error('Error loading For You content:', error);
      toast.error('Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  const loadRelevantRequests = async (userId: string) => {
    // Get all public requests
    const { data: requests, error } = await supabase
      .from('requests')
      .select('*')
      .in('audience_type', ['public', 'friends', 'extended_network'])
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error loading requests:', error);
      return;
    }

    if (!requests || requests.length === 0) {
      setRelevantRequests([]);
      return;
    }

    // Calculate relevance scores and get identities
    const requestsWithScores = await Promise.all(
      requests.map(async (request) => {
        // Calculate relevance score
        const { data: scoreData } = await supabase.rpc('calculate_request_relevance', {
          user_id_param: userId,
          request_id_param: request.id
        });

        // Get creator display identity
        const { data: identityData } = await supabase.rpc('get_display_identity', {
          viewer_id: userId,
          profile_id: request.creator_id
        });

        return {
          ...request,
          relevance_score: scoreData || 0,
          creator_identity: identityData?.[0] || null
        };
      })
    );

    // Sort by relevance and filter score > 0
    const sortedRequests = requestsWithScores
      .filter(r => r.relevance_score > 0)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 10);

    setRelevantRequests(sortedRequests);
  };

  const loadTrendingLists = async (userId: string) => {
    // Get trending public lists based on mention counts
    const { data: entries, error } = await supabase
      .from('master_directory_entries')
      .select('*')
      .order('mention_count', { ascending: false })
      .limit(15);

    if (error) {
      console.error('Error loading trending lists:', error);
      return;
    }

    if (!entries || entries.length === 0) {
      setTrendingLists([]);
      return;
    }

    // Get unique contributors and their identities
    const uniqueUserIds = [...new Set(entries.flatMap(e => e.mentioned_by_users))];
    const listsWithIdentities = await Promise.all(
      uniqueUserIds.slice(0, 10).map(async (ownerId) => {
        // Get a list owned by this user
        const { data: list } = await supabase
          .from('lists')
          .select('id, title, category, description, owner_id')
          .eq('owner_id', ownerId)
          .eq('visibility', 'public')
          .limit(1)
          .single();

        if (!list) return null;

        // Get display identity
        const { data: identityData } = await supabase.rpc('get_display_identity', {
          viewer_id: userId,
          profile_id: ownerId
        });

        // Count mentions for this user
        const mentionCount = entries
          .filter(e => e.mentioned_by_users.includes(ownerId))
          .reduce((sum, e) => sum + e.mention_count, 0);

        return {
          ...list,
          mention_count: mentionCount,
          owner_identity: identityData?.[0] || null
        };
      })
    );

    setTrendingLists(listsWithIdentities.filter(Boolean) as TrendingList[]);
  };

  const loadSimilarLists = async (userId: string) => {
    // Get user's list categories
    const { data: userLists } = await supabase
      .from('lists')
      .select('category')
      .eq('owner_id', userId);

    if (!userLists || userLists.length === 0) {
      setSimilarLists([]);
      return;
    }

    const userCategories = [...new Set(userLists.map(l => l.category))];

    // Find public lists in same categories by other users
    const { data: lists, error } = await supabase
      .from('lists')
      .select('id, title, category, description, owner_id')
      .in('category', userCategories)
      .eq('visibility', 'public')
      .neq('owner_id', userId)
      .limit(10);

    if (error) {
      console.error('Error loading similar lists:', error);
      return;
    }

    if (!lists || lists.length === 0) {
      setSimilarLists([]);
      return;
    }

    // Get identities
    const listsWithIdentities = await Promise.all(
      lists.map(async (list) => {
        const { data: identityData } = await supabase.rpc('get_display_identity', {
          viewer_id: userId,
          profile_id: list.owner_id
        });

        return {
          ...list,
          mention_count: 0,
          owner_identity: identityData?.[0] || null
        };
      })
    );

    setSimilarLists(listsWithIdentities);
  };

  if (loading) {
    return (
      <div className="container max-w-6xl py-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>For You - Antelog</title>
        <meta name="description" content="Discover curated recommendations and requests matched to your expertise" />
      </Helmet>

      <div className="container max-w-6xl py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">For You</h1>
        </div>

        {/* Requests You Can Answer */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-2xl font-semibold">Requests You Can Answer</h2>
          </div>
          
          {relevantRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No relevant requests found. Create more public lists to help us match you with requests!
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {relevantRequests.map((request) => (
                <Card key={request.id} className="hover:border-primary transition-colors cursor-pointer" onClick={() => navigate(`/requests/${request.id}`)}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{request.title}</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          {request.creator_identity && (
                            <span className="flex items-center gap-1">
                              {request.creator_identity.name}
                              {request.creator_identity.is_verified && (
                                <BadgeCheck className="h-4 w-4 text-primary" />
                              )}
                            </span>
                          )}
                          {request.location && <span>• {request.location}</span>}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{request.category}</Badge>
                        <Badge variant="outline">Match: {request.relevance_score}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Trending Public Lists */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-2xl font-semibold">Trending Lists</h2>
          </div>
          
          {trendingLists.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No trending lists available yet
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {trendingLists.map((list) => (
                <Card key={list.id} className="hover:border-primary transition-colors cursor-pointer" onClick={() => navigate(`/lists/${list.id}`)}>
                  <CardHeader>
                    <CardTitle className="text-lg">{list.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      {list.owner_identity && (
                        <span className="flex items-center gap-1">
                          {list.owner_identity.name}
                          {list.owner_identity.is_verified && (
                            <BadgeCheck className="h-4 w-4 text-primary" />
                          )}
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{list.category}</Badge>
                      <span className="text-sm text-muted-foreground">{list.mention_count} mentions</span>
                    </div>
                    {list.description && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{list.description}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Similar Interests */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-2xl font-semibold">Similar Interests</h2>
          </div>
          
          {similarLists.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Create some lists to see recommendations based on your interests
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {similarLists.map((list) => (
                <Card key={list.id} className="hover:border-primary transition-colors cursor-pointer" onClick={() => navigate(`/lists/${list.id}`)}>
                  <CardHeader>
                    <CardTitle className="text-lg">{list.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      {list.owner_identity && (
                        <span className="flex items-center gap-1">
                          {list.owner_identity.name}
                          {list.owner_identity.is_verified && (
                            <BadgeCheck className="h-4 w-4 text-primary" />
                          )}
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="secondary">{list.category}</Badge>
                    {list.description && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{list.description}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
