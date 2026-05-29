import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { checkForDuplicates } from "@/lib/masterDirectory";
import { MessageSquare, ArrowLeft, Users, User, UserCheck, Globe, X, CircleCheck, ExternalLink, AlertTriangle, Search, ClipboardList, Brain, Sparkles } from "lucide-react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerFooter } from "@/components/ui/drawer";
import PublicProfile from "@/pages/PublicProfile";
import ExpertProfileModal from "@/components/ExpertProfileModal";

interface Group {
  id: string;
  name: string;
  member_count: number;
}

// Known expertise domains and the title-keywords that map to them.
// Token-based, deterministic. No AI, no embeddings.
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "Food & Cafes": ["food", "cafe", "cafes", "coffee", "restaurant", "restaurants", "eat", "eatery", "dining", "brunch", "bakery", "dessert", "biryani", "pizza", "bar", "pub"],
  "Travel & Hotels": ["travel", "trip", "hotel", "hotels", "stay", "homestay", "resort", "hostel", "airbnb", "vacation", "holiday", "itinerary", "tour"],
  "Electronics & Gadgets": ["laptop", "phone", "smartphone", "headphones", "earbuds", "camera", "gadget", "electronics", "monitor", "tv", "console"],
  "Fashion & Clothing": ["fashion", "clothing", "clothes", "shirt", "dress", "shoes", "sneakers", "outfit", "wardrobe", "boutique"],
  "Fitness & Health": ["gym", "fitness", "workout", "yoga", "trainer", "pilates", "crossfit", "health", "wellness"],
  "Books & Media": ["book", "books", "novel", "film", "films", "movie", "movies", "series", "show", "podcast", "magazine"],
  "Home & Appliances": ["home", "appliance", "appliances", "furniture", "kitchen", "washing machine", "fridge", "ac", "interior"],
  "Finance & Banking": ["finance", "bank", "banking", "loan", "credit", "investment", "mutual fund", "stocks", "insurance", "tax"],
  "Beauty & Skincare": ["beauty", "skincare", "salon", "spa", "makeup", "hair", "barber"],
  "Parenting": ["parenting", "kids", "child", "children", "baby", "toddler", "school", "preschool", "daycare"],
  "Pets": ["pet", "pets", "dog", "cat", "vet", "groomer"],
  "Sports": ["sports", "cricket", "football", "tennis", "badminton", "running", "marathon"],
  "Cars & Bikes": ["car", "cars", "bike", "bikes", "motorcycle", "scooter", "ev", "mechanic"],
  "Education": ["education", "course", "tutor", "coaching", "college", "university", "bootcamp", "class"],
  "Real Estate": ["real estate", "apartment", "flat", "house", "rent", "broker", "property", "pg"],
};

function deriveDomainsFromTitle(title: string): string[] {
  const lower = ` ${title.toLowerCase()} `;
  const matched: string[] = [];
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      // word-boundary-ish match
      if (lower.includes(` ${kw} `) || lower.includes(` ${kw}s `) || lower.includes(` ${kw},`) || lower.includes(` ${kw}.`)) {
        matched.push(domain);
        break;
      }
    }
  }
  return matched;
}

// Input validation schema
const requestSchema = z.object({
  title: z.string().trim().min(10, "Request must be at least 10 characters").max(500, "Request must be less than 500 characters"),
  category: z.enum(['films', 'places', 'products', 'services', 'other']),
  location: z.string().trim().max(100, "Location must be less than 100 characters").optional(),
  audience_types: z.array(z.enum(['first_network', 'group', 'specific_people', 'anonymous_expertise'])).min(1, "Select at least one audience"),
  group_id: z.string().optional(),
  selected_users: z.array(z.string()).optional(),
  allow_forwarding: z.boolean()
});

export default function RequestsNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [networkCount, setNetworkCount] = useState(0);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [showAudienceModal, setShowAudienceModal] = useState(false);
  const [antelogContacts, setAntelogContacts] = useState<any[]>([]);
  const [externalContacts, setExternalContacts] = useState<any[]>([]);
  const [generatedShareLink, setGeneratedShareLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateResults, setDuplicateResults] = useState<any[]>([]);
  const [expiryDays, setExpiryDays] = useState("7");
  const [anonReach, setAnonReach] = useState<number | null>(null);
  // Nudge 1: similar directory lists
  const [similarDirectoryList, setSimilarDirectoryList] = useState<{
    id: string;
    title: string;
    total_votes: number;
    contributor_id: string | null;
    contributor_name: string | null;
    contributor_handle: string | null;
  } | null>(null);
  const [directoryNudgeDismissed, setDirectoryNudgeDismissed] = useState(false);
  // Nudge 2: network experts
  const [networkExperts, setNetworkExperts] = useState<Array<{
    profile_id: string;
    full_name: string | null;
    handle: string | null;
    matching_domains: string[];
    degree: number;
    expertise_cities: string[];
    connection_path: string[];
    intermediate_names: string[];
  }>>([]);
  const [expertNudgeDismissed, setExpertNudgeDismissed] = useState(false);
  // Inline message shown inside the directory nudge after "Send request to them"
  const [directoryForwardMessage, setDirectoryForwardMessage] = useState<string | null>(null);
  // V5C: pending forwards queued from expert pills (target profile_id)
  const [pendingForwards, setPendingForwards] = useState<Set<string>>(new Set());
  const [profileSheetExpertId, setProfileSheetExpertId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    category: '' as 'films' | 'places' | 'products' | 'services' | 'other',
    location: '',
    audience_types: [] as Array<'first_network' | 'group' | 'specific_people' | 'anonymous_expertise'>,
    group_id: '',
    allow_forwarding: false,
    selected_users: [] as string[]
  });

  useEffect(() => {
    loadUserGroups();
    loadNetworkCounts();
  }, []);

  // Anonymous expertise reach estimator (debounced, server-side)
  useEffect(() => {
    if (!formData.audience_types.includes('anonymous_expertise')) {
      setAnonReach(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('estimate_anonymous_expertise_reach', {
          p_category: formData.category || null,
          p_location: formData.location || null,
          p_keywords: null,
          p_title: formData.title || null,
        });
        if (!error) setAnonReach((data as number) ?? 0);
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.audience_types, formData.category, formData.location, formData.title]);

  // Nudge 1: debounced check for similar lists in Master Directory
  useEffect(() => {
    if (directoryNudgeDismissed) return;
    const title = formData.title.trim();
    if (title.length < 6) {
      setSimilarDirectoryList(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("find_similar_directory_lists", {
          p_title: title,
          p_threshold: 0.5,
        });
        if (error) throw error;
        if (data && data.length > 0) {
          const match = data[0] as any;
          // Fetch contributor id from master_directory_lists
          const { data: listRow } = await supabase
            .from("master_directory_lists")
            .select("original_contributor_id")
            .eq("id", match.id)
            .maybeSingle();

          let contributor_id: string | null = listRow?.original_contributor_id ?? null;
          let contributor_name: string | null = null;
          let contributor_handle: string | null = null;

          if (contributor_id) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: inNetwork } = await supabase.rpc("is_in_network", {
                viewer_id: user.id,
                profile_id: contributor_id,
              });
              if (inNetwork) {
                const { data: contributorProfile } = await supabase
                  .from("profiles")
                  .select("full_name, handle")
                  .eq("id", contributor_id)
                  .single();
                if (contributorProfile) {
                  contributor_name = contributorProfile.full_name ?? null;
                  contributor_handle = contributorProfile.handle ?? null;
                }
              }
            }
          }

          setSimilarDirectoryList({
            id: match.id,
            title: match.title,
            total_votes: match.total_votes ?? 0,
            contributor_id,
            contributor_name,
            contributor_handle,
          });
        } else {
          setSimilarDirectoryList(null);
        }
      } catch (err) {
        console.error("find_similar_directory_lists error", err);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [formData.title, directoryNudgeDismissed]);

  // Nudge 2: check network experts based on title text (token-matched against known expertise domains)
  useEffect(() => {
    if (expertNudgeDismissed) return;
    const title = (formData.title || "").trim();
    if (title.length < 4) {
      setNetworkExperts([]);
      return;
    }
    const domains = deriveDomainsFromTitle(title);
    if (domains.length === 0) {
      setNetworkExperts([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Query across all degrees, one call per derived domain, then merge.
        const results = await Promise.all(
          domains.map((dom) =>
            supabase.rpc("find_network_experts_all_degrees", {
              viewer_id: user.id,
              domain_filter: dom,
              max_depth: 4,
            })
          )
        );
        const merged = new Map<string, any>();
        for (const { data, error } of results) {
          if (error) {
            console.error("find_network_experts_all_degrees error", error);
            continue;
          }
          for (const r of (data || []) as any[]) {
            const nd = r.network_degree ?? r.degree;
            const existing = merged.get(r.expert_user_id);
            if (!existing || nd < (existing.network_degree ?? existing.degree)) merged.set(r.expert_user_id, r);
          }
        }
        const base = Array.from(merged.values())
          .sort((a, b) => (a.network_degree ?? a.degree) - (b.network_degree ?? b.degree))
          .slice(0, 8);

        setNetworkExperts(
          base.map((r: any) => {
            const path: string[] = Array.isArray(r.connection_path) ? r.connection_path : [];
            return {
              profile_id: r.expert_user_id,
              full_name: r.expert_name ?? null,
              handle: r.expert_handle ?? null,
              matching_domains: r.matched_domains || [],
              expertise_cities: r.matched_cities || [],
              degree: r.network_degree ?? r.degree,
              connection_path: path,
              intermediate_names: path.slice(1, -1).filter((n) => typeof n === "string" && n.trim().length > 0),
            };
          })
        );
      } catch (err) {
        console.error("find_network_experts error", err);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [formData.title, expertNudgeDismissed]);

  const frostedAmber = "relative rounded-lg border border-amber-200 border-l-[3px] border-l-amber-500 bg-amber-50 p-4 dark:bg-amber-950/30 dark:border-amber-700/50 dark:border-l-amber-400";
  const frostedSky = "relative rounded-lg border border-blue-200 border-l-[3px] border-l-[#3B82F6] bg-[#EFF6FF] p-4 dark:bg-sky-950/30 dark:border-sky-700/50 dark:border-l-sky-400";

  const loadUserGroups = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('groups')
        .select(`
          id,
          name,
          group_members(count)
        `)
        .eq('creator_id', user.id);

      if (error) throw error;

      const formattedGroups = data?.map(group => ({
        id: group.id,
        name: group.name,
        member_count: group.group_members?.[0]?.count || 0
      })) || [];

      setUserGroups(formattedGroups);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const loadNetworkCounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Count 1st network connections
      const { count: friendshipsCount, error: friendshipsError } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (friendshipsError) throw friendshipsError;
      setNetworkCount(friendshipsCount || 0);

      // Count total verified users on platform
      const { count: usersCount, error: usersError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_verified', true);

      if (usersError) throw usersError;
      setTotalUsersCount(usersCount || 0);
    } catch (error) {
      console.error('Error loading network counts:', error);
    }
  };

  const loadNetworkContacts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: friendships } = await supabase
        .from("friendships")
        .select("user1_id, user2_id")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      const friendIds = friendships?.map(f => 
        f.user1_id === user.id ? f.user2_id : f.user1_id
      ) || [];

      if (friendIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, handle, phone_number")
          .in("id", friendIds);
        setAntelogContacts(profiles || []);

        const antelogPhones = new Set(profiles?.map(p => p.phone_number).filter(Boolean));

        const { data: allContacts } = await supabase
          .from("contact_imports")
          .select("contact_name, contact_phone")
          .eq("user_id", user.id)
          .eq("is_matched", false);

        setExternalContacts(allContacts?.filter(c => 
          c.contact_phone && !antelogPhones.has(c.contact_phone)
        ) || []);
      } else {
        setAntelogContacts([]);
        setExternalContacts([]);
      }
    } catch (error) {
      console.error("Error loading contacts:", error);
    }
  };

  const toggleAudienceType = (type: 'first_network' | 'group' | 'specific_people' | 'anonymous_expertise') => {
    setFormData(prev => ({
      ...prev,
      audience_types: prev.audience_types.includes(type)
        ? prev.audience_types.filter(t => t !== type)
        : [...prev.audience_types, type]
    }));
  };

  // Handle "Send request to them" from the Master Directory nudge.
  // 1st-degree contributor → pre-select Specific People.
  // 2nd-degree contributor → pre-select 1st Network and show "via Mike" message.
  const handleSendRequestToContributor = async () => {
    const cid = similarDirectoryList?.contributor_id;
    const cname = similarDirectoryList?.contributor_name || "They";
    if (!cid) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check direct friendship
      const { data: directFriend } = await supabase
        .from("friendships")
        .select("id")
        .or(
          `and(user1_id.eq.${user.id},user2_id.eq.${cid}),and(user1_id.eq.${cid},user2_id.eq.${user.id})`
        )
        .maybeSingle();

      if (directFriend) {
        setFormData(prev => ({
          ...prev,
          audience_types: prev.audience_types.includes('specific_people')
            ? prev.audience_types
            : [...prev.audience_types, 'specific_people'],
          selected_users: prev.selected_users.includes(cid)
            ? prev.selected_users
            : [...prev.selected_users, cid],
        }));
        loadNetworkContacts();
        setDirectoryNudgeDismissed(true);
        return;
      }

      // 2nd degree — find a mutual friend to mention by name
      let mutualName = "a mutual friend";
      const { data: viewerFriends } = await supabase
        .from("friendships")
        .select("user1_id, user2_id")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);
      const viewerFriendIds = (viewerFriends || []).map(f =>
        f.user1_id === user.id ? f.user2_id : f.user1_id
      );

      if (viewerFriendIds.length > 0) {
        const { data: contribFriends } = await supabase
          .from("friendships")
          .select("user1_id, user2_id")
          .or(`user1_id.eq.${cid},user2_id.eq.${cid}`);
        const contribFriendIds = new Set(
          (contribFriends || []).map(f => (f.user1_id === cid ? f.user2_id : f.user1_id))
        );
        const mutualId = viewerFriendIds.find(id => contribFriendIds.has(id));
        if (mutualId) {
          const { data: mutualProfile } = await supabase
            .from("profiles")
            .select("full_name, handle")
            .eq("id", mutualId)
            .maybeSingle();
          mutualName = mutualProfile?.full_name || (mutualProfile?.handle ? `@${mutualProfile.handle}` : "a mutual friend");
        }
      }

      setFormData(prev => ({
        ...prev,
        audience_types: prev.audience_types.includes('first_network')
          ? prev.audience_types
          : [...prev.audience_types, 'first_network'],
      }));
      setDirectoryForwardMessage(
        `${cname} is in your extended network via ${mutualName}. Send to your 1st Network and ask ${mutualName} to forward it to ${cname}.`
      );
      // Auto-dismiss the nudge after 5s so user can read the message
      setTimeout(() => {
        setDirectoryNudgeDismissed(true);
        setDirectoryForwardMessage(null);
      }, 5000);
    } catch (err) {
      console.error("handleSendRequestToContributor error", err);
      setDirectoryNudgeDismissed(true);
    }
  };

  const handleTitleBlur = async () => {
    if (!formData.title.trim() || !formData.category) return;

    try {
      const check = await checkForDuplicates(formData.title, formData.category as any);
      
      if (check.isDuplicate && check.existingEntry) {
        setDuplicateResults([check.existingEntry]);
        setShowDuplicateWarning(true);
        return;
      }

      // Also search master directory for similar entries
      const { data } = await supabase
        .from('master_directory_entries')
        .select('*')
        .eq('category', formData.category as any)
        .ilike('display_content', `%${formData.title}%`)
        .limit(3);

      if (data && data.length > 0) {
        setDuplicateResults(data);
        setShowDuplicateWarning(true);
      } else {
        setShowDuplicateWarning(false);
        setDuplicateResults([]);
      }
    } catch (error) {
      console.error('Error checking duplicates:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate with zod
    try {
      const validatedData = requestSchema.parse({
        title: formData.title,
        category: formData.category,
        location: formData.location || undefined,
        audience_types: formData.audience_types,
        group_id: formData.group_id || undefined,
        selected_users: formData.selected_users,
        allow_forwarding: formData.allow_forwarding
      });

      // Additional business logic validation
      if (validatedData.audience_types.includes('group') && !validatedData.group_id) {
        toast({
          title: "Group Required",
          description: "Please select a group",
          variant: "destructive"
        });
        return;
      }

      if (validatedData.audience_types.includes('specific_people') && validatedData.selected_users.length === 0) {
        toast({
          title: "People Required",
          description: "Please select at least one person",
          variant: "destructive"
        });
        return;
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.issues[0].message,
          variant: "destructive"
        });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      console.log('=== REQUEST CREATION DEBUG START ===');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      console.log('Current user ID:', user.id);
      console.log('Form data:', {
        title: formData.title,
        audience_types: formData.audience_types,
        group_id: formData.group_id,
        selected_users: formData.selected_users,
        allow_forwarding: formData.allow_forwarding
      });

      // Disable forwarding for anonymous-only requests
      const allowForwarding = formData.audience_types.length === 1 && formData.audience_types[0] === 'anonymous_expertise'
        ? false
        : formData.allow_forwarding;

      console.log('Creating request with allow_forwarding:', allowForwarding);

      const expiresAt = new Date(Date.now() + parseInt(expiryDays) * 24 * 60 * 60 * 1000).toISOString();

      const { data: newRequest, error } = await supabase
        .from('requests')
        .insert({
          title: formData.title.trim(),
          category: formData.category,
          location: formData.location.trim() || null,
          audience_type: formData.audience_types[0],
          audience_types: formData.audience_types,
          group_id: formData.audience_types.includes('group') ? formData.group_id : null,
          selected_users: formData.audience_types.includes('specific_people') ? formData.selected_users : null,
          allow_forwarding: allowForwarding,
          creator_id: user.id,
          status: 'open',
          expires_at: expiresAt
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Request creation failed:', error);
        throw error;
      }

      console.log('✅ Request created successfully:', {
        id: newRequest.id,
        title: newRequest.title,
        audience_types: newRequest.audience_types
      });

      // Get creator profile for notification message
      console.log('Fetching creator profile for user:', user.id);
      const { data: creatorProfile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('⚠️ Error fetching creator profile:', profileError);
      }

      const creatorName = creatorProfile?.full_name || 'Someone';
      console.log('Creator name for notifications:', creatorName);

      // Create notifications for recipients
      const notifications: any[] = [];
      console.log('\n--- BUILDING NOTIFICATIONS ---');

      // 1. Notifications for 1st Network
      if (formData.audience_types.includes('first_network')) {
        console.log('📍 Processing 1st Network audience...');
        console.log('Querying friendships for user:', user.id);
        
        const { data: friends, error: friendsError } = await supabase
          .from('friendships')
          .select('user1_id, user2_id')
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

        console.log('Friendships query result:', {
          data: friends,
          error: friendsError,
          count: friends?.length || 0
        });

        if (friendsError) {
          console.error('❌ Error querying friendships:', friendsError);
        }

        const friendIds = friends?.map(f => 
          f.user1_id === user.id ? f.user2_id : f.user1_id
        ) || [];

        console.log('Extracted friend IDs:', friendIds);
        console.log('Number of friends:', friendIds.length);

        friendIds.forEach(friendId => {
          const notification = {
            user_id: friendId,
            type: 'new_request',
            title: 'New Request from Your Network',
            message: `${creatorName} sent you a request: ${formData.title}`,
            related_user_id: user.id,
            metadata: { request_id: newRequest.id }
          };
          console.log('Adding notification for friend:', friendId, notification);
          notifications.push(notification);
        });
      }

      // 2. Notifications for Group
      if (formData.audience_types.includes('group') && formData.group_id) {
        console.log('📍 Processing Group audience...');
        console.log('Group ID:', formData.group_id);
        
        const { data: groupMembers, error: membersError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', formData.group_id);

        console.log('Group members query result:', {
          data: groupMembers,
          error: membersError,
          count: groupMembers?.length || 0
        });

        const { data: group, error: groupError } = await supabase
          .from('groups')
          .select('name')
          .eq('id', formData.group_id)
          .single();

        console.log('Group name query result:', {
          data: group,
          error: groupError
        });

        groupMembers?.forEach(member => {
          if (member.user_id !== user.id) {
            const notification = {
              user_id: member.user_id,
              type: 'new_request',
              title: 'New Group Request',
              message: `${creatorName} sent a request to ${group?.name}: ${formData.title}`,
              related_user_id: user.id,
              metadata: { request_id: newRequest.id }
            };
            console.log('Adding notification for group member:', member.user_id, notification);
            notifications.push(notification);
          } else {
            console.log('Skipping notification for creator (self):', member.user_id);
          }
        });
      }

      // 3. Notifications for Specific People
      if (formData.audience_types.includes('specific_people')) {
        console.log('📍 Processing Specific People audience...');
        console.log('Selected users:', formData.selected_users);
        
        formData.selected_users.forEach(selectedUserId => {
          const notification = {
            user_id: selectedUserId,
            type: 'new_request',
            title: 'Direct Request from Network',
            message: `${creatorName} sent you a direct request: ${formData.title}`,
            related_user_id: user.id,
            metadata: { request_id: newRequest.id }
          };
          console.log('Adding notification for specific person:', selectedUserId, notification);
          notifications.push(notification);
        });
      }

      console.log('\n--- NOTIFICATION SUMMARY ---');
      console.log('Total notifications to create:', notifications.length);
      console.log('All notifications:', JSON.stringify(notifications, null, 2));

      // 4. Forward suggestions: notify mutual friends about 2nd-degree experts
      if (formData.audience_types.includes('first_network')) {
        try {
          const domains = deriveDomainsFromTitle(formData.title || "");
          if (domains.length > 0) {
            const { data: experts } = await supabase.rpc('find_network_experts', {
              viewer_id: user.id,
              query_domains: domains,
            });
            const secondDegreeExperts = (experts || []).filter((e: any) => e.degree === 2);

            if (secondDegreeExperts.length > 0) {
              // Viewer's direct friends
              const { data: viewerFriends } = await supabase
                .from('friendships')
                .select('user1_id, user2_id')
                .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);
              const viewerFriendIds = (viewerFriends || []).map(f =>
                f.user1_id === user.id ? f.user2_id : f.user1_id
              );

              const seenMutuals = new Set<string>();
              for (const expert of secondDegreeExperts) {
                const { data: expFriends } = await supabase
                  .from('friendships')
                  .select('user1_id, user2_id')
                  .or(`user1_id.eq.${expert.profile_id},user2_id.eq.${expert.profile_id}`);
                const expFriendIds = new Set(
                  (expFriends || []).map(f =>
                    f.user1_id === expert.profile_id ? f.user2_id : f.user1_id
                  )
                );
                const mutualId = viewerFriendIds.find(id => expFriendIds.has(id));
                if (!mutualId) continue;
                const dedupeKey = `${mutualId}:${expert.profile_id}`;
                if (seenMutuals.has(dedupeKey)) continue;
                seenMutuals.add(dedupeKey);
                notifications.push({
                  user_id: mutualId,
                  type: 'forward_suggestion',
                  title: `${expert.full_name || 'Someone'} in your network might know about this`,
                  message: `${creatorName} just asked about ${formData.title}. ${expert.full_name || 'Someone'} in your network has expertise in this — consider forwarding the request to them.`,
                  related_user_id: user.id,
                  metadata: {
                    request_id: newRequest.id,
                    expert_id: expert.profile_id,
                    expert_name: expert.full_name,
                  },
                });
              }
            }
          }
        } catch (err) {
          console.error('Forward suggestion generation failed:', err);
        }
      }

      // Insert all notifications
      if (notifications.length > 0) {
        console.log('\n🔄 Attempting to insert notifications into database...');
        
        try {
          const { data: insertedNotifications, error: notificationError } = await supabase
            .from('notifications')
            .insert(notifications)
            .select();

          if (notificationError) {
            console.error('❌ NOTIFICATION INSERT FAILED:', notificationError);
            console.error('Error details:', {
              message: notificationError.message,
              details: notificationError.details,
              hint: notificationError.hint,
              code: notificationError.code
            });
          } else {
            console.log('✅ NOTIFICATIONS CREATED SUCCESSFULLY!');
            console.log('Inserted notifications:', insertedNotifications);
            console.log('Number of notifications created:', insertedNotifications?.length || 0);
          }
        } catch (err) {
          console.error('❌ EXCEPTION during notification creation:', err);
          console.error('Exception details:', err);
        }
      } else {
        console.log('⚠️ No notifications to create (notifications array is empty)');
      }

      console.log('=== REQUEST CREATION DEBUG END ===\n');

      // V5C: execute queued forwards from expert pills
      let forwardedCount = 0;
      if (pendingForwards.size > 0) {
        try {
          const targetIds = Array.from(pendingForwards);
          const forwardRows: any[] = [];
          const forwardNotifs: any[] = [];
          const creatorFirst = (creatorName || 'Someone').split(' ')[0];

          for (const targetId of targetIds) {
            const expert = networkExperts.find((e) => e.profile_id === targetId);
            if (!expert) continue;

            const network_path =
              expert.connection_path && expert.connection_path.length >= 2
                ? expert.connection_path
                : [user.id, targetId];
            const network_depth = network_path.length - 1;
            const intermediates = expert.intermediate_names || [];

            forwardRows.push({
              request_id: newRequest.id,
              forwarded_by_user_id: user.id,
              forwarded_to: [targetId],
              network_path,
              network_depth,
              forwarded_to_audience: 'first_network',
            });

            const pathText =
              intermediates.length > 0
                ? `${creatorFirst} asked · forwarded via ${intermediates.join(' → ')} · to you`
                : `${creatorFirst} asked · forwarded directly to you`;

            forwardNotifs.push({
              user_id: targetId,
              type: 'request_forwarded',
              title: `${creatorName} asked about something you'd know`,
              message: `${pathText}: ${formData.title}`,
              related_user_id: user.id,
              metadata: { request_id: newRequest.id, network_path, network_depth },
            });
          }

          if (forwardRows.length > 0) {
            const { error: fwdErr } = await supabase
              .from('request_forwards')
              .insert(forwardRows);
            if (fwdErr) {
              console.error('Forward insert failed:', fwdErr);
            } else {
              forwardedCount = forwardRows.length;
              await supabase.from('notifications').insert(forwardNotifs);
            }
          }
        } catch (err) {
          console.error('Pending forwards execution failed:', err);
        }
      }

      toast({
        title: "Request Created!",
        description: forwardedCount > 0
          ? `Sent to ${formData.audience_types.length} ${formData.audience_types.length === 1 ? 'audience' : 'audiences'} · forwarded to ${forwardedCount} ${forwardedCount === 1 ? 'person' : 'people'}`
          : `Your request has been sent to ${formData.audience_types.length} ${formData.audience_types.length === 1 ? 'audience' : 'audiences'}`
      });

      navigate('/requests');
    } catch (error) {
      console.error('Error creating request:', error);
      toast({
        title: "Error",
        description: "Failed to create request. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories = [
    { value: 'films', label: 'Films & Movies' },
    { value: 'places', label: 'Places & Travel' },
    { value: 'products', label: 'Products & Shopping' },
    { value: 'services', label: 'Services & Professionals' },
    { value: 'other', label: 'Other' }
  ];

  const audienceOptions = [
    {
      value: 'first_network' as const,
      label: '1st Network',
      description: 'Send to people in your trusted network',
      icon: User,
      showForwarding: true
    },
    {
      value: 'group' as const,
      label: 'Specific Group',
      description: 'Send to a group you created',
      icon: UserCheck,
      showForwarding: true
    },
    {
      value: 'specific_people' as const,
      label: 'Specific People',
      description: 'Choose specific contacts from your 1st network',
      icon: Users,
      showForwarding: true
    },
    {
      value: 'anonymous_expertise' as const,
      label: 'Relevant anonymous contributors',
      description: 'Your request may be selectively shown to people with relevant expertise or interests.',
      helperText: 'Requests are routed privately to a small number of relevant contributors. They are not publicly broadcast or searchable.',
      icon: Sparkles,
      showForwarding: false
    }
  ];

  const estimateReach = () => {
    let count = 0;
    if (formData.audience_types.includes('first_network')) {
      count += networkCount;
    }
    if (formData.audience_types.includes('group') && formData.group_id) {
      const group = userGroups.find(g => g.id === formData.group_id);
      count += group?.member_count || 0;
    }
    if (formData.audience_types.includes('specific_people')) {
      count += formData.selected_users.length;
    }
    return count;
  };

  const formatReachCount = (count: number) => {
    if (count === 0) return '0 people';
    if (count === 1) return '1 person';
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k+ people`;
    }
    return `${count} people`;
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/requests')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Requests
        </Button>
        
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <MessageSquare className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Create Request</h1>
            <p className="text-muted-foreground">Ask your network for recommendations</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What are you looking for?</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Request Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Your Request *</Label>
              <Textarea
                id="title"
                placeholder="e.g., Can someone recommend good coffee shops near SRFTI campus?"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                onBlur={handleTitleBlur}
                className="min-h-[100px] resize-none"
                maxLength={500}
              />
              <p className="text-sm text-muted-foreground">
                {formData.title.length}/500 characters
              </p>

              {/* Pre-submit nudges (Master Directory + Network experts) */}
              {(() => {
                const showDirectory = similarDirectoryList && !directoryNudgeDismissed;
                const showExperts = networkExperts.length > 0 && !expertNudgeDismissed;
                const matchedExpert = showDirectory && similarDirectoryList?.contributor_id
                  ? networkExperts.find(e => e.profile_id === similarDirectoryList.contributor_id)
                  : null;
                const unified = !!matchedExpert;

                return (
                  <div className="space-y-3">
                    {/* Unified panel: contributor IS also a matching expert */}
                    {showDirectory && unified && similarDirectoryList && matchedExpert && (
                       <div className={frostedAmber}>
                         <button
                           type="button"
                           onClick={() => { setDirectoryNudgeDismissed(true); setExpertNudgeDismissed(true); }}
                           className="absolute top-2 right-2 text-amber-500 hover:text-amber-700 dark:text-amber-400/70 dark:hover:text-amber-300"
                           aria-label="Dismiss"
                         >
                           <X className="h-4 w-4" />
                         </button>
                         <div className="flex items-start gap-2 pr-6">
                           <Brain className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-300 shrink-0" />
                           <div className="space-y-2 flex-1">
                             <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                               {similarDirectoryList.contributor_name || (matchedExpert.full_name ?? "Someone")} in your network already made this list
                             </p>
                             <p className="text-sm text-amber-800 dark:text-amber-100">
                               "{similarDirectoryList.title}" — {similarDirectoryList.total_votes} {similarDirectoryList.total_votes === 1 ? "vote" : "votes"}
                             </p>
                             <p className="text-sm text-amber-800 dark:text-amber-100">
                               {(similarDirectoryList.contributor_name || matchedExpert.full_name || "They").split(" ")[0]} knows: {matchedExpert.matching_domains.join(", ")}
                             </p>
                             {directoryForwardMessage && (
                               <p className="text-sm text-amber-800 bg-amber-100/50 border border-amber-300/50 rounded p-2 dark:text-amber-100 dark:bg-amber-500/10 dark:border-amber-400/30">
                                 {directoryForwardMessage}
                               </p>
                             )}
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button type="button" variant="outline" size="sm" onClick={() => window.open(`/directory/${similarDirectoryList.id}`, '_blank')}>
                                View their list
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={handleSendRequestToContributor}>
                                Send request to them
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => { setDirectoryNudgeDismissed(true); setExpertNudgeDismissed(true); }}>
                                Continue
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Directory nudge (when not unified) */}
                    {showDirectory && !unified && similarDirectoryList && (
                       <div className={frostedAmber}>
                         <button
                           type="button"
                           onClick={() => setDirectoryNudgeDismissed(true)}
                           className="absolute top-2 right-2 text-amber-500 hover:text-amber-700 dark:text-amber-400/70 dark:hover:text-amber-300"
                           aria-label="Dismiss"
                         >
                           <X className="h-4 w-4" />
                         </button>
                         <div className="flex items-start gap-2 pr-6">
                           <ClipboardList className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-300 shrink-0" />
                           <div className="space-y-2 flex-1">
                             {similarDirectoryList.contributor_name ? (
                               <>
                                 <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                                   {similarDirectoryList.contributor_name} in your network already made this list
                                 </p>
                                 <p className="text-sm text-amber-800 dark:text-amber-100">
                                   "{similarDirectoryList.title}" — {similarDirectoryList.total_votes} {similarDirectoryList.total_votes === 1 ? "vote" : "votes"}
                                 </p>
                                 {directoryForwardMessage && (
                                   <p className="text-sm text-amber-800 bg-amber-100/50 border border-amber-300/50 rounded p-2 dark:text-amber-100 dark:bg-amber-500/10 dark:border-amber-400/30">
                                     {directoryForwardMessage}
                                   </p>
                                 )}
                                 <div className="flex flex-wrap gap-2 pt-1">
                                   <Button type="button" variant="outline" size="sm" onClick={() => window.open(`/directory/${similarDirectoryList.id}`, '_blank')}>
                                     View their list
                                   </Button>
                                   <Button type="button" variant="outline" size="sm" onClick={handleSendRequestToContributor}>
                                     Send request to them
                                   </Button>
                                   <Button type="button" variant="ghost" size="sm" onClick={() => setDirectoryNudgeDismissed(true)}>
                                     Continue
                                   </Button>
                                 </div>
                               </>
                             ) : (
                               <>
                                 <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                                   This might already exist in the Master Directory
                                 </p>
                                 <p className="text-sm text-amber-800 dark:text-amber-100">
                                   "{similarDirectoryList.title}" — {similarDirectoryList.total_votes} {similarDirectoryList.total_votes === 1 ? "vote" : "votes"}
                                 </p>
                                 <div className="flex flex-wrap gap-2 pt-1">
                                   <Button type="button" variant="outline" size="sm" onClick={() => window.open(`/directory/${similarDirectoryList.id}`, '_blank')}>
                                     View existing list
                                   </Button>
                                   <Button type="button" variant="ghost" size="sm" onClick={() => setDirectoryNudgeDismissed(true)}>
                                     Continue creating request
                                   </Button>
                                 </div>
                               </>
                             )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Expert nudge (suppressed when unified to avoid duplication) */}
                     {showExperts && !unified && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3 w-3" style={{ color: 'var(--color-text-secondary)' }} />
                             <span style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 500 }}>
                               {networkExperts.length} {networkExperts.length === 1 ? 'person' : 'people'} across your network know about this
                             </span>
                          </div>
                          {(() => {
                            const titleLower = (formData.title || '').toLowerCase();
                            const enriched = networkExperts.map((expert) => {
                              const matchedCity = (expert.expertise_cities || []).find(
                                (c) => c && titleLower.includes(c.toLowerCase())
                              ) || null;
                              const hasDomain = (expert.matching_domains || []).length > 0;
                              const rank = hasDomain && matchedCity ? 0 : hasDomain ? 1 : matchedCity ? 2 : 3;
                              return { ...expert, matchedCity, rank };
                            });
                            enriched.sort((a, b) => a.rank - b.rank);
                            return enriched;
                          })().map((expert) => {
                           const name = expert.full_name || (expert.handle ? `@${expert.handle}` : 'Someone');
                           const initials = (expert.full_name || expert.handle || '?')
                             .split(/\s+/)
                             .map((p) => p.charAt(0).toUpperCase())
                             .slice(0, 2)
                             .join('');
                           const ordinal = (n: number) => {
                             const s = ['th', 'st', 'nd', 'rd'];
                             const v = n % 100;
                             return n + (s[(v - 20) % 10] || s[v] || s[0]);
                           };
                           const degreeLabel = ordinal(expert.degree);
                           const degreeOpacity =
                             expert.degree <= 1 ? 1 : expert.degree === 2 ? 0.95 : expert.degree === 3 ? 0.9 : 0.85;
                           const intermediates = expert.intermediate_names || [];
                           const queued = pendingForwards.has(expert.profile_id);
                           return (
                              <div
                                key={expert.profile_id}
                                 className="flex items-center gap-2.5"
                                 style={{
                                   background: 'var(--color-background-secondary)',
                                   border: '0.5px solid var(--color-border-tertiary)',
                                   borderRadius: 12,
                                   padding: '10px 12px',
                                   opacity: degreeOpacity,
                                 }}
                              >
                               <div
                                 className="flex items-center justify-center shrink-0"
                                 style={{
                                    width: 32,
                                    height: 32,
                                   borderRadius: '9999px',
                                   background: '#97C459',
                                   color: '#173404',
                                    fontSize: 12,
                                   fontWeight: 600,
                                 }}
                               >
                                 {initials || '?'}
                               </div>
                                 <div className="flex-1 min-w-0">
                                   <div
                                     className="truncate"
                                     style={{ color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500 }}
                                   >
                                     {name}
                                   </div>
                                   <div
                                     className="truncate"
                                     style={{ color: 'var(--color-text-secondary)', fontSize: 10 }}
                                   >
                                     {[
                                       degreeLabel,
                                       intermediates.length > 0 ? `via ${intermediates.join(' → ')}` : null,
                                       expert.matching_domains.length > 0 ? expert.matching_domains.join(', ') : null,
                                       expert.matchedCity ? `knows ${expert.matchedCity}` : null,
                                     ]
                                       .filter(Boolean)
                                       .join(' · ')}
                                   </div>
                                 </div>
                                 <div className="flex items-center gap-1.5 shrink-0">
                                   <button
                                     type="button"
                                     onClick={() => setProfileSheetExpertId(expert.profile_id)}
                                     style={{
                                       border: '0.5px solid var(--color-border-secondary)',
                                       borderRadius: 6,
                                       color: 'var(--color-text-secondary)',
                                       fontSize: 10,
                                       background: 'transparent',
                                       padding: '4px 8px',
                                       cursor: 'pointer',
                                       whiteSpace: 'nowrap',
                                     }}
                                   >
                                     View →
                                   </button>
                                   <button
                                     type="button"
                                     disabled={queued}
                                     onClick={() => {
                                       setPendingForwards((prev) => {
                                         const next = new Set(prev);
                                         next.add(expert.profile_id);
                                         return next;
                                       });
                                     }}
                                     style={{
                                       border: 'none',
                                       borderRadius: 6,
                                       color: 'var(--color-background-primary)',
                                       fontSize: 10,
                                       background: 'var(--color-text-primary)',
                                       padding: '4px 8px',
                                       opacity: queued ? 0.5 : 1,
                                       cursor: queued ? 'default' : 'pointer',
                                       whiteSpace: 'nowrap',
                                     }}
                                   >
                                     {queued ? 'Forwarding ✓' : 'Forward →'}
                                   </button>
                                 </div>
                              </div>
                           );
                         })}
                       </div>
                     )}
                  </div>
                );
              })()}

              {/* Duplicate Warning */}
              {showDuplicateWarning && duplicateResults.length > 0 && (
                <Alert variant="default" className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertTitle>Similar lists already exist</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p className="text-sm">These might already have what you're looking for:</p>
                    <div className="space-y-2">
                      {duplicateResults.map((result: any) => (
                        <div key={result.id} className="flex items-center justify-between p-2 rounded border bg-background">
                          <div>
                            <p className="text-sm font-medium">{result.display_content}</p>
                            <p className="text-xs text-muted-foreground">
                              {result.mention_count} {result.mention_count === 1 ? 'person recommends' : 'people recommend'} this
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={() => navigate(`/directory?search=${encodeURIComponent(result.display_content)}`)}
                          >
                            <Search className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/directory?search=${encodeURIComponent(formData.title)}`)}
                      >
                        Search Directory First
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDuplicateWarning(false)}
                      >
                        Continue Anyway
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value as any})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location">Location (Optional)</Label>
              <Input
                id="location"
                placeholder="e.g., in Mumbai, near campus, online"
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                maxLength={100}
              />
            </div>

            {/* Audience Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Send to * (Select one or more)</Label>
                {formData.audience_types.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {formData.audience_types.length} {formData.audience_types.length === 1 ? 'audience' : 'audiences'} selected
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground -mt-2">
                You can select multiple audiences to maximize reach
              </p>

              <div className="space-y-3">
                {audienceOptions.map((option) => {
                  const Icon = option.icon;
                  const isChecked = formData.audience_types.includes(option.value);
                  
                  return (
                    <div key={option.value} className="space-y-3">
                      <div className="flex items-start space-x-3 p-4 rounded-lg border hover:bg-accent/50 transition-colors">
                        <Checkbox
                          id={option.value}
                          checked={isChecked}
                          onCheckedChange={() => toggleAudienceType(option.value)}
                          className="mt-1"
                        />
                        <div className="flex-1 cursor-pointer" onClick={() => toggleAudienceType(option.value)}>
                          <div className="flex items-center justify-between">
                            <Label htmlFor={option.value} className="cursor-pointer font-medium flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {option.label}
                            </Label>
                            {isChecked && option.value === 'first_network' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadNetworkContacts();
                                  setShowAudienceModal(true);
                                }}
                              >
                                <Users className="h-3 w-3 mr-1" />
                                View & Select People
                              </Button>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                          {option.helperText && (
                            <p className="text-xs text-muted-foreground mt-2 italic">{option.helperText}</p>
                          )}
                        </div>
                      </div>

                      {/* Show forwarding checkbox for selected non-public options */}
                      {isChecked && option.showForwarding && (
                        <div className="pl-11 space-y-2">
                          <div className="flex items-start space-x-2">
                            <Checkbox
                              id={`${option.value}_forwarding`}
                              checked={formData.allow_forwarding}
                              onCheckedChange={(checked) => setFormData({...formData, allow_forwarding: checked as boolean})}
                            />
                            <div>
                              <Label htmlFor={`${option.value}_forwarding`} className="cursor-pointer text-sm font-normal">
                                Allow recipients to forward to their networks
                              </Label>
                              <p className="text-xs text-muted-foreground mt-1">
                                Recipients can share this with people they trust. Each forward shows the full path.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Show group selector */}
                      {isChecked && option.value === 'group' && (
                        <div className="pl-11 space-y-2">
                          <Label htmlFor="group">Select Group</Label>
                          {userGroups.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              You haven't created any groups yet. <Link to="/groups/new" className="text-primary hover:underline">Create your first group</Link>
                            </p>
                          ) : (
                            <>
                              <Select
                                value={formData.group_id}
                                onValueChange={(value) => setFormData({...formData, group_id: value})}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a group..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {userGroups.map((group) => (
                                    <SelectItem key={group.id} value={group.id}>
                                      {group.name} ({group.member_count} {group.member_count === 1 ? 'member' : 'members'})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {formData.group_id && (
                                <p className="text-xs text-muted-foreground">
                                  {userGroups.find(g => g.id === formData.group_id)?.member_count || 0} people will receive this request
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Show people selector for specific_people */}
                      {isChecked && option.value === 'specific_people' && (
                        <div className="pl-11 space-y-2">
                          <Label>Choose People</Label>
                          <p className="text-sm text-muted-foreground">
                            Multi-select functionality coming soon. For now, you can send to your entire 1st Network or a Group.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reach Summary */}
            {formData.audience_types.length > 0 && (
              <div className="p-4 bg-muted/50 rounded-lg space-y-1">
                <p className="text-sm font-medium mb-1">Estimated Reach</p>
                <p className="text-xs text-muted-foreground">
                  Direct network: <span className="font-semibold">{formatReachCount(estimateReach())}</span>
                </p>
                {formData.audience_types.includes('anonymous_expertise') && (
                  <p className="text-xs text-muted-foreground">
                    Anonymous expertise: <span className="font-semibold">~{anonReach ?? '…'} relevant contributors</span>
                  </p>
                )}
              </div>
            )}

            {/* Expiry Duration */}
            <div className="space-y-2">
              <Label htmlFor="expiry-days">Close request after</Label>
              <Select value={expiryDays} onValueChange={setExpiryDays}>
                <SelectTrigger id="expiry-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button 
                type="submit" 
                size="lg" 
                className="w-full"
                disabled={isSubmitting || formData.audience_types.length === 0}
              >
                {isSubmitting ? "Creating Request..." : "Send Request"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Audience Modal */}
      <Dialog open={showAudienceModal} onOpenChange={setShowAudienceModal}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your 1st Network</DialogTitle>
            <DialogDescription>
              See who's on Antelog and who needs a share link
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* On Antelog */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CircleCheck className="h-4 w-4 text-green-600" />
                <h3 className="font-semibold">On Antelog ({antelogContacts.length})</h3>
              </div>
              <p className="text-xs text-muted-foreground">These people will be notified in-app</p>
              {antelogContacts.length > 0 ? (
                <div className="space-y-2">
                  {antelogContacts.map((contact) => (
                    <div key={contact.id} className="flex items-center gap-3 p-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
                      <div className="h-8 w-8 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center text-sm font-medium">
                        {contact.full_name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{contact.full_name}</p>
                        <p className="text-xs text-muted-foreground">@{contact.handle}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">On Antelog</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">None of your contacts are on Antelog yet</p>
              )}
            </div>

            {/* Not on Antelog */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-orange-600" />
                <h3 className="font-semibold">Not on Antelog ({externalContacts.length})</h3>
              </div>
              <p className="text-xs text-muted-foreground">Generate a share link for these contacts</p>
              {externalContacts.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {externalContacts.slice(0, 10).map((contact, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30">
                        <div className="h-8 w-8 rounded-full bg-orange-200 dark:bg-orange-800 flex items-center justify-center text-sm font-medium">
                          {contact.contact_name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{contact.contact_name}</p>
                          <p className="text-xs text-muted-foreground">{contact.contact_phone}</p>
                        </div>
                      </div>
                    ))}
                    {externalContacts.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center">
                        + {externalContacts.length - 10} more contacts
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      toast({
                        title: "Create Request First",
                        description: "A share link will be generated after you create the request. You can then share it with contacts not on Antelog.",
                      });
                      setShowAudienceModal(false);
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Share link generated after request creation
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">All your contacts are already on Antelog!</p>
              )}
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="button"
              onClick={() => setShowAudienceModal(false)}
              className="w-full"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ExpertProfileModal
        expert={profileSheetExpertId ? networkExperts.find((e) => e.profile_id === profileSheetExpertId) || null : null}
        requestText={formData.title}
        queued={profileSheetExpertId ? pendingForwards.has(profileSheetExpertId) : false}
        onClose={() => setProfileSheetExpertId(null)}
        onForward={() => {
          if (!profileSheetExpertId) return;
          setPendingForwards((prev) => {
            const next = new Set(prev);
            next.add(profileSheetExpertId);
            return next;
          });
          setProfileSheetExpertId(null);
        }}
      />
    </div>
  );
}