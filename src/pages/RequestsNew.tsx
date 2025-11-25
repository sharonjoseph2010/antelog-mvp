import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, ArrowLeft } from "lucide-react";

interface Group {
  id: string;
  name: string;
  member_count: number;
}

export default function RequestsNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    category: '' as 'films' | 'places' | 'products' | 'services' | 'other',
    location: '',
    audience_type: 'first_network' as 'first_network' | 'group' | 'specific_people' | 'public',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.category) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    if (formData.audience_type === 'group' && !formData.group_id) {
      toast({
        title: "Group Required",
        description: "Please select a group for your request",
        variant: "destructive"
      });
      return;
    }

    if (formData.audience_type === 'specific_people' && formData.selected_users.length === 0) {
      toast({
        title: "People Required",
        description: "Please select at least one person",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Set allow_forwarding to false for public requests
      const allowForwarding = formData.audience_type === 'public' ? false : formData.allow_forwarding;

      const { error } = await supabase
        .from('requests')
        .insert({
          title: formData.title,
          category: formData.category,
          location: formData.location || null,
          audience_type: formData.audience_type,
          group_id: formData.audience_type === 'group' ? formData.group_id : null,
          selected_users: formData.audience_type === 'specific_people' ? formData.selected_users : null,
          allow_forwarding: allowForwarding,
          creator_id: (await supabase.auth.getUser()).data.user?.id!,
          status: 'open'
        });

      if (error) throw error;

      toast({
        title: "Request Created!",
        description: "Your request has been sent to your network"
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
      value: 'first_network',
      label: '1st Network',
      description: 'Send to people in your trusted network',
      showForwarding: true
    },
    {
      value: 'group',
      label: 'Specific Group',
      description: 'Send to a group you created',
      showForwarding: true
    },
    {
      value: 'specific_people',
      label: 'Specific People',
      description: 'Choose specific contacts from your 1st network',
      showForwarding: true
    },
    {
      value: 'public',
      label: 'Public (Anonymous)',
      description: 'Share publicly with anonymous identity via AI matching',
      helperText: 'Your request will appear in the Master Directory and be matched to relevant users. Your identity remains anonymous to users outside your network.',
      showForwarding: false
    }
  ];

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
              />
              <p className="text-sm text-muted-foreground">
                Help others understand the context or area you're interested in
              </p>
            </div>

            {/* Audience Selection */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Send to *</Label>
              <RadioGroup 
                value={formData.audience_type} 
                onValueChange={(value) => setFormData({...formData, audience_type: value as any})}
              >
                {audienceOptions.map((option) => (
                  <div key={option.value} className="space-y-3">
                    <div className="flex items-start space-x-3 p-4 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer">
                      <RadioGroupItem 
                        value={option.value} 
                        id={option.value}
                        className="mt-1"
                      />
                      <div className="flex-1 cursor-pointer" onClick={() => setFormData({...formData, audience_type: option.value as any})}>
                        <Label htmlFor={option.value} className="cursor-pointer font-medium">
                          {option.label}
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                        {option.helperText && (
                          <p className="text-xs text-muted-foreground mt-2 italic">{option.helperText}</p>
                        )}
                      </div>
                    </div>

                    {/* Show forwarding checkbox for selected option */}
                    {formData.audience_type === option.value && option.showForwarding && (
                      <div className="pl-11 space-y-2">
                        <div className="flex items-start space-x-2">
                          <Checkbox
                            id="allow_forwarding"
                            checked={formData.allow_forwarding}
                            onCheckedChange={(checked) => setFormData({...formData, allow_forwarding: checked as boolean})}
                          />
                          <div>
                            <Label htmlFor="allow_forwarding" className="cursor-pointer text-sm font-normal">
                              Allow recipients to forward to their networks
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">
                              Your {option.value === 'first_network' ? '1st network' : option.value === 'group' ? 'group members' : 'selected people'} can share this with people they trust. Each forward shows the full path.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Show group selector */}
                    {formData.audience_type === 'group' && option.value === 'group' && (
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
                    {formData.audience_type === 'specific_people' && option.value === 'specific_people' && (
                      <div className="pl-11 space-y-2">
                        <Label>Choose People</Label>
                        <p className="text-sm text-muted-foreground">
                          Multi-select functionality coming soon. For now, you can send to your entire 1st Network or a Group.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button 
                type="submit" 
                size="lg" 
                className="w-full"
                disabled={isSubmitting}
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