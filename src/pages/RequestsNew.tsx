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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, ArrowLeft, Users, User, UserCheck, Globe } from "lucide-react";
import { z } from "zod";

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
  }, []);

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

  const toggleAudienceType = (type: 'first_network' | 'group' | 'specific_people' | 'public') => {
    setFormData(prev => ({
      ...prev,
      audience_types: prev.audience_types.includes(type)
        ? prev.audience_types.filter(t => t !== type)
        : [...prev.audience_types, type]
    }));
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Set allow_forwarding to false if only public is selected
      const allowForwarding = formData.audience_types.length === 1 && formData.audience_types[0] === 'public' 
        ? false 
        : formData.allow_forwarding;

      const { error } = await supabase
        .from('requests')
        .insert({
          title: formData.title.trim(),
          category: formData.category,
          location: formData.location.trim() || null,
          audience_type: formData.audience_types[0], // Keep for backward compatibility
          audience_types: formData.audience_types,
          group_id: formData.audience_types.includes('group') ? formData.group_id : null,
          selected_users: formData.audience_types.includes('specific_people') ? formData.selected_users : null,
          allow_forwarding: allowForwarding,
          creator_id: user.id,
          status: 'open'
        });

      if (error) throw error;

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
      // This would need to be fetched from friendships table
      count += 24; // Placeholder
    }
    if (formData.audience_types.includes('group') && formData.group_id) {
      const group = userGroups.find(g => g.id === formData.group_id);
      count += group?.member_count || 0;
    }
    if (formData.audience_types.includes('specific_people')) {
      count += formData.selected_users.length;
    }
    if (formData.audience_types.includes('public')) {
      count += 1000; // Placeholder for public reach
    }
    return count;
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
                className="min-h-[100px] resize-none"
                maxLength={500}
              />
              <p className="text-sm text-muted-foreground">
                {formData.title.length}/500 characters
              </p>
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
                          <Label htmlFor={option.value} className="cursor-pointer font-medium flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {option.label}
                          </Label>
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
                  This request will reach approximately <span className="font-semibold">{estimateReach()} people</span> across {formData.audience_types.length} {formData.audience_types.length === 1 ? 'audience' : 'audiences'}
                </p>
              </div>
            )}

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
    </div>
  );
}