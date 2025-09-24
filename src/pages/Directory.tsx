import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Search, Filter, ChevronDown, ExternalLink, Users, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MasterDirectoryEntry {
  id: string;
  display_content: string;
  normalized_content: string;
  category: string;
  url?: string;
  mention_count: number;
  mentioned_by_users: string[];
  total_search_count: number;
  latest_mention_at: string;
  network_contributors?: NetworkContributor[];
}

interface NetworkContributor {
  contributor_id: string;
  full_name: string;
  handle: string;
  is_friend: boolean;
  is_extended_network: boolean;
}

interface ContributorProfile {
  full_name: string;
  handle: string;
  id: string;
}

const CATEGORIES = [
  { value: 'places', label: 'Places' },
  { value: 'films', label: 'Films' },
  { value: 'products', label: 'Products' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' }
];

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Most Relevant' },
  { value: 'votes', label: 'Most Voted' },
  { value: 'popular', label: 'Most Searched' },
  { value: 'recent', label: 'Most Recent' }
];

export default function Directory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState("relevance");
  const [results, setResults] = useState<MasterDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [userType, setUserType] = useState<'verified' | 'guest' | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    checkUserType();
  }, []);

  const checkUserType = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('id', session.user.id)
        .single();
      
      setUserType(profile?.user_type || 'guest');
    }
  };

  const searchDirectory = async () => {
    if (!searchQuery.trim() && selectedCategory === "all") {
      toast({
        title: "Please enter a search term or select a category",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      // Search the new master directory entries
      let query = supabase
        .from('master_directory_entries')
        .select(`
          id,
          display_content,
          normalized_content,
          category,
          url,
          mention_count,
          mentioned_by_users,
          total_search_count,
          latest_mention_at,
          searchable_text
        `);

      // Apply search filters with broader matching across content and list titles
      if (searchQuery.trim()) {
        const searchTerm = searchQuery.trim();
        query = query.or(`display_content.ilike.%${searchTerm}%,normalized_content.ilike.%${searchTerm}%,searchable_text.ilike.%${searchTerm}%`);
      }

      if (selectedCategory && selectedCategory !== "all") {
        query = query.eq('category', selectedCategory as any);
      }

      // Apply sorting
      switch (sortBy) {
        case 'votes':
          query = query.order('mention_count', { ascending: false });
          break;
        case 'popular':
          query = query.order('total_search_count', { ascending: false });
          break;
        case 'recent':
          query = query.order('latest_mention_at', { ascending: false });
          break;
        default:
          // For relevance, combine mention_count and search_count
          query = query.order('mention_count', { ascending: false })
                      .order('total_search_count', { ascending: false });
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      // Get network contributor info for verified users
      let processedResults: MasterDirectoryEntry[] = [];
      
      if (data && data.length > 0) {
        if (userType === 'verified') {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            // Get all unique contributor IDs
            const allContributorIds = [...new Set(
              data.flatMap(item => item.mentioned_by_users || [])
            )];

            // Get network contributor info
            const { data: networkContributors } = await supabase
              .rpc('get_network_contributors', {
                user_id_param: session.user.id,
                contributor_ids: allContributorIds
              });

            // Create a map for easy lookup
            const contributorMap = new Map(
              networkContributors?.map(c => [c.contributor_id, c]) || []
            );

            processedResults = data.map(item => ({
              ...item,
              network_contributors: item.mentioned_by_users
                ?.map(userId => contributorMap.get(userId))
                .filter(Boolean) || []
            }));
          }
        } else {
          // For guest users, no network contributor info
          processedResults = data.map(item => ({ 
            ...item, 
            network_contributors: [] 
          }));
        }
      }

      setResults(processedResults);

      // Track search analytics
      const { data: { session } } = await supabase.auth.getSession();
      const categoryValue = selectedCategory !== "all" ? selectedCategory as any : null;
      
      await supabase.from('search_analytics').insert({
        user_id: session?.user.id || null,
        search_query: searchQuery.trim(),
        category: categoryValue,
        results_count: processedResults.length
      });

      // Increment search count for returned results
      if (processedResults.length > 0) {
        await supabase.rpc('increment_master_directory_search_count', {
          entry_ids: processedResults.map(r => r.id)
        });
      }

    } catch (error: any) {
      console.error('Search error:', error);
      toast({
        title: "Search failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Note: In the master directory, vote count represents unique user mentions
  // User voting on directory entries is separate from mention counting

  return (
    <>
      <Helmet>
        <title>Antelog Directory - Discover Recommendations</title>
        <meta 
          name="description" 
          content="Search through curated recommendations from verified users. Find places, films, books, products and more." 
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">Master Directory</h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Search through curated recommendations from our verified community. 
              Discover places, films, products, and more based on real experiences.
            </p>
          </div>

          {/* Search Interface */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Directory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 flex-col sm:flex-row">
                <div className="flex-1">
                  <Input
                    placeholder="Search for recommendations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchDirectory()}
                  />
                </div>
                <Button onClick={searchDirectory} disabled={loading} className="px-8">
                  {loading ? "Searching..." : "Search"}
                </Button>
              </div>

              <div className="flex gap-4 flex-col sm:flex-row">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="sm:w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="sm:w-48">
                    <ChevronDown className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {hasSearched && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">
                  {results.length} Results
                  {searchQuery && ` for "${searchQuery}"`}
                </h2>
                {selectedCategory !== "all" && (
                  <Badge variant="secondary" className="capitalize">
                    {selectedCategory}
                  </Badge>
                )}
              </div>

              {loading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : results.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <div className="text-muted-foreground">
                      No results found. Try adjusting your search terms or category filter.
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {results.map((entry) => (
                    <Card key={entry.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">{entry.display_content}</h3>
                              {entry.url && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  className="h-6 w-6 p-0"
                                >
                                  <a
                                    href={entry.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </Button>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <Badge variant="outline" className="capitalize">
                                {entry.category}
                              </Badge>
                              
                              {entry.network_contributors && entry.network_contributors.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  <span>by {entry.network_contributors.map(c => c.full_name).join(', ')}</span>
                                </div>
                              )}
                              
                              <div className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                <span>{entry.total_search_count} searches</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-center">
                              <div className="text-sm font-medium text-green-600">
                                ↑ {entry.mention_count}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Recommended by {entry.mention_count === 1 ? '1 person' : `${entry.mention_count} people`}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CTA for non-searched state */}
          {!hasSearched && (
            <Card className="text-center py-12">
              <CardContent>
                <Search className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Start Exploring</h3>
                <p className="text-muted-foreground mb-6">
                  Search for recommendations or browse by category to discover curated content from our verified community.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {CATEGORIES.slice(0, 4).map((cat) => (
                    <Button
                      key={cat.value}
                      variant="outline"
                      onClick={() => {
                        setSelectedCategory(cat.value);
                        searchDirectory();
                      }}
                    >
                      Browse {cat.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}