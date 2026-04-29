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
import { MessageSquare, ArrowLeft, Users, User, UserCheck, Globe, X, CircleCheck, ExternalLink, AlertTriangle, Search, ClipboardList, Brain } from "lucide-react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Group {
  id: string;
  name: string;
  member_count: number;
}

// Input validation schema
const requestSchema = z.object({
  title: z.string().trim().min(10, "Request must be at least 10 characters").max(500, "Request must be less than 500 characters"),
  category: z.enum(['films', 'places', 'products', 'services', 'other']),
  location: z.string().trim().max(100, "Location must be less than 100 characters").optional(),
  audience_types: z.array(z.enum(['first_network', 'group', 'specific_people', 'public'])).min(1, "Select at least one audience"),
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
  const [networkExperts, setNetworkExperts] = useState<Array<{ profile_id: string; full_name: string | null; handle: string | null; matching_domains: string[]; degree: number }>>([]);
  const [expertNudgeDismissed, setExpertNudgeDismissed] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    category: '' as 'films' | 'places' | 'products' | 'services' | 'other',
    location: '',
    audience_types: [] as Array<'first_network' | 'group' | 'specific_people' | 'public'>,
    group_id: '',
    allow_forwarding: false,
    selected_users: [] as string[]
  });

  useEffect(() => {
    loadUserGroups();
    loadNetworkCounts();
  }, []);

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

  // Nudge 2: check network experts when category changes
  useEffect(() => {
    if (expertNudgeDismissed) return;
    if (!formData.category) {
      setNetworkExperts([]);
      return;
    }
    const categoryToDomains: Record<string, string[]> = {
      places: ["Food & Cafes"],
      products: ["Electronics & Gadgets", "Home & Appliances"],
      films: ["Books & Media"],
      travel: ["Travel & Hotels"],
    };
    const domains = categoryToDomains[formData.category];
    if (!domains) {
      setNetworkExperts([]);
      return;
    }
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.rpc("find_network_experts", {
          viewer_id: user.id,
          query_domains: domains,
        });
        if (error) throw error;
        setNetworkExperts((data || []).slice(0, 3));
      } catch (err) {
        console.error("find_network_experts error", err);
      }
    })();
  }, [formData.category, expertNudgeDismissed]);

  const frostedAmber = "relative rounded-lg border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.10)] backdrop-blur-sm p-4";
  const frostedSky = "relative rounded-lg border border-[rgba(56,189,248,0.4)] bg-[rgba(56,189,248,0.10)] backdrop-blur-sm p-4";

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

  const toggleAudienceType = (type: 'first_network' | 'group' | 'specific_people' | 'public') => {
    setFormData(prev => ({
      ...prev,
      audience_types: prev.audience_types.includes(type)
        ? prev.audience_types.filter(t => t !== type)
        : [...prev.audience_types, type]
    }));
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

      // Set allow_forwarding to false if only public is selected
      const allowForwarding = formData.audience_types.length === 1 && formData.audience_types[0] === 'public' 
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

      toast({
        title: "Request Created!",
        description: `Your request has been sent to ${formData.audience_types.length} ${formData.audience_types.length === 1 ? 'audience' : 'audiences'}`
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
      value: 'public' as const,
      label: 'Public (Anonymous)',
      description: 'Share publicly with anonymous identity via AI matching',
      helperText: 'Your request will appear in the Master Directory. Your identity remains anonymous to users outside your network.',
      icon: Globe,
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
    if (formData.audience_types.includes('public')) {
      count += totalUsersCount;
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

              {/* Nudge 1: Master Directory similar list */}
              {similarDirectoryList && !directoryNudgeDismissed && (
                <div className={frostedAmber}>
                  <button
                    type="button"
                    onClick={() => setDirectoryNudgeDismissed(true)}
                    className="absolute top-2 right-2 text-amber-300/70 hover:text-amber-200"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="flex items-start gap-2 pr-6">
                    <ClipboardList className="h-4 w-4 mt-0.5 text-amber-300 shrink-0" />
                    <div className="space-y-2 flex-1">
                      {similarDirectoryList.contributor_name ? (
                        <>
                          <p className="text-sm font-medium text-amber-200">
                            Someone in your network already made this list
                          </p>
                          <p className="text-sm text-amber-100/90">
                            {similarDirectoryList.contributor_name} made "{similarDirectoryList.title}" — {similarDirectoryList.total_votes} {similarDirectoryList.total_votes === 1 ? "vote" : "votes"}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/directory/${similarDirectoryList.id}`)}
                            >
                              View their list
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const cid = similarDirectoryList.contributor_id;
                                if (cid) {
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
                                }
                                setDirectoryNudgeDismissed(true);
                              }}
                            >
                              Send request to them
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDirectoryNudgeDismissed(true)}
                            >
                              Continue
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-amber-200">
                            This might already exist in the Master Directory
                          </p>
                          <p className="text-sm text-amber-100/90">
                            "{similarDirectoryList.title}" — {similarDirectoryList.total_votes} {similarDirectoryList.total_votes === 1 ? "vote" : "votes"}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/directory/${similarDirectoryList.id}`)}
                            >
                              View existing list
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDirectoryNudgeDismissed(true)}
                            >
                              Continue creating request
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-1">Estimated Reach</p>
                <p className="text-xs text-muted-foreground">
                  This request will reach approximately <span className="font-semibold">{formatReachCount(estimateReach())}</span> across {formData.audience_types.length} {formData.audience_types.length === 1 ? 'audience' : 'audiences'}
                </p>
              </div>
            )}

            {/* Nudge 2: Network experts */}
            {networkExperts.length > 0 && !expertNudgeDismissed && (
              <div className={frostedSky}>
                <button
                  type="button"
                  onClick={() => setExpertNudgeDismissed(true)}
                  className="absolute top-2 right-2 text-sky-300/70 hover:text-sky-200"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-start gap-2 pr-6">
                  <Brain className="h-4 w-4 mt-0.5 text-sky-300 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <p className="text-sm font-medium text-sky-200">
                      People in your network know about this
                    </p>
                    <ul className="space-y-1">
                      {networkExperts.map((expert) => {
                        const label = expert.degree === 1 ? "friend" : "friend of a friend";
                        const name = expert.full_name || (expert.handle ? `@${expert.handle}` : "Someone");
                        return (
                          <li key={expert.profile_id} className="text-sm text-sky-100/90">
                            {name} <span className="text-sky-200/70">({label})</span> · knows: {expert.matching_domains.join(", ")}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-xs text-sky-100/70 italic">
                      They'll be able to answer this well.
                    </p>
                  </div>
                </div>
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
    </div>
  );
}