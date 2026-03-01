import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Search, Filter, ChevronDown, ChevronRight, Users, MessageSquare, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MasterDirectoryList {
  list_id: string;
  list_title: string;
  list_description: string | null;
  category: string;
  owner_id: string;
  creator_handle: string;
  creator_name: string;
  primary_creator_handle: string;
  contributor_count: number;
  contributor_handles: string[];
  item_count: number;
  items_preview: string;
  items_array: string[];
  searchable_text: string;
  latest_item_at: string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { value: 'places', label: 'Places' },
  { value: 'films', label: 'Films' },
  { value: 'products', label: 'Products' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' }
];

const SORT_OPTIONS = [
  { value: 'items', label: 'Most Items' },
  { value: 'recent', label: 'Most Recent' }
];

export default function Directory() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || "");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState("items");
  const [results, setResults] = useState<MasterDirectoryList[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [userType, setUserType] = useState<'verified' | 'guest' | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    checkUserType();
  }, []);

  useEffect(() => {
    const searchFromParams = searchParams.get('search');
    if (searchFromParams) {
      setSearchQuery(searchFromParams);
      setTimeout(() => searchDirectory(searchFromParams), 100);
    }
  }, [searchParams]);

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

  const searchDirectory = async (overrideQuery?: string) => {
    const query = overrideQuery || searchQuery;
    if (!query.trim() && selectedCategory === "all") {
      toast({
        title: "Please enter a search term or select a category",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      let dbQuery = supabase
        .from('master_directory_lists_view')
        .select('*');

      if (query.trim()) {
        const searchTerm = query.trim();
        dbQuery = dbQuery.or(
          `list_title.ilike.%${searchTerm}%,searchable_text.ilike.%${searchTerm}%,items_preview.ilike.%${searchTerm}%`
        );
      }

      if (selectedCategory && selectedCategory !== "all") {
        dbQuery = dbQuery.eq('category', selectedCategory as any);
      }

      switch (sortBy) {
        case 'recent':
          dbQuery = dbQuery.order('latest_item_at', { ascending: false });
          break;
        default:
          dbQuery = dbQuery.order('item_count', { ascending: false });
      }

      const { data, error } = await dbQuery.limit(20);
      if (error) throw error;
      setResults((data as any[]) || []);

      // Track search analytics
      const { data: { session } } = await supabase.auth.getSession();
      const categoryValue = selectedCategory !== "all" ? selectedCategory as any : null;
      await supabase.from('search_analytics').insert({
        user_id: session?.user.id || null,
        search_query: query.trim(),
        category: categoryValue,
        results_count: data?.length || 0
      });

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

  return (
    <>
      <Helmet>
        <title>Antelog Directory - Discover Curated Lists</title>
        <meta 
          name="description" 
          content="Search through curated lists from verified users. Find places, films, products and more — discover by list title or items inside." 
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">Master Directory</h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Search through curated lists from our verified community.
              Find lists by title or search for items inside them.
            </p>
          </div>

          {/* Search Interface */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Lists
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 flex-col sm:flex-row">
                <div className="flex-1">
                  <Input
                    placeholder="Search for lists or items inside them..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchDirectory()}
                  />
                </div>
                <Button onClick={() => searchDirectory()} disabled={loading} className="px-8">
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
                  {results.length} {results.length === 1 ? 'List' : 'Lists'}
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
                  {[...Array(4)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-5 bg-muted rounded w-3/4 mb-3" />
                        <div className="h-3 bg-muted rounded w-1/2 mb-4" />
                        <div className="flex gap-2">
                          <div className="h-6 bg-muted rounded w-16" />
                          <div className="h-6 bg-muted rounded w-20" />
                          <div className="h-6 bg-muted rounded w-14" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : results.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No lists found</h3>
                    <p className="text-muted-foreground mb-6">
                      "{searchQuery}" doesn't match any lists in our directory yet
                    </p>
                    {userType === 'verified' ? (
                      <Button onClick={() => navigate('/requests/new')}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Be the First! Create a Request
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => navigate('/signup')}>
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        Get Verified to Create Requests
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {results.map((list) => (
                    <Card
                      key={list.list_id}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => navigate(`/lists/${list.list_id}`)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {/* List Title */}
                            <h3 className="font-semibold text-lg mb-1">{list.list_title}</h3>

                            {/* Metadata */}
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-3">
                              <Badge variant="outline" className="capitalize">
                                {list.category}
                              </Badge>
                              <span>•</span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-1 cursor-help">
                                      <Users className="h-3 w-3" />
                                      by @{list.primary_creator_handle || list.creator_handle}
                                      {list.contributor_count > 1 && (
                                        <span className="text-primary font-medium">
                                          {" "}(+{list.contributor_count - 1} {list.contributor_count - 1 === 1 ? 'other' : 'others'})
                                        </span>
                                      )}
                                    </span>
                                  </TooltipTrigger>
                                  {list.contributor_count > 1 && list.contributor_handles && (
                                    <TooltipContent>
                                      <div className="space-y-1">
                                        <p className="font-medium text-xs">Contributors:</p>
                                        {list.contributor_handles.map((handle: string) => (
                                          <p key={handle} className="text-xs">@{handle}</p>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                              <span>•</span>
                              <span>{list.item_count} {list.item_count === 1 ? 'item' : 'items'}</span>
                            </div>

                            {/* Items Preview */}
                            {list.items_array && list.items_array.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1.5">Items in this list:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {list.items_array.slice(0, 6).map((item, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs font-normal">
                                      {item}
                                    </Badge>
                                  ))}
                                  {list.items_array.length > 6 && (
                                    <Badge variant="secondary" className="text-xs font-normal">
                                      +{list.items_array.length - 6} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* View Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/lists/${list.list_id}`);
                            }}
                          >
                            View List
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Create Request CTA */}
                  {userType === 'verified' && (
                    <Card className="border-dashed">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Not satisfied with these results?</p>
                            <p className="text-sm text-muted-foreground">
                              Create your own request and ask your network
                            </p>
                          </div>
                          <Button variant="outline" onClick={() => navigate('/requests/new')}>
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Create Request
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Initial state */}
          {!hasSearched && (
            <Card className="text-center py-12">
              <CardContent>
                <Search className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Start Exploring</h3>
                <p className="text-muted-foreground mb-6">
                  Search for lists or browse by category to discover curated content from our verified community.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {CATEGORIES.map((cat) => (
                    <Button
                      key={cat.value}
                      variant="outline"
                      onClick={() => {
                        setSelectedCategory(cat.value);
                        setTimeout(() => searchDirectory(), 50);
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
