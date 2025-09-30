import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  const [groups, setGroups] = useState<Group[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    category: "",
    location: "",
    audienceType: "",
    groupId: ""
  });

  useEffect(() => {
    loadUserGroups();
  }, []);

  const loadUserGroups = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("groups")
        .select(`
          id,
          name,
          group_members(count)
        `)
        .eq("creator_id", user.id);

      if (error) throw error;

      const formattedGroups = data?.map(group => ({
        id: group.id,
        name: group.name,
        member_count: group.group_members?.length || 0
      })) || [];

      setGroups(formattedGroups);
    } catch (error) {
      console.error("Error loading groups:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.category || !formData.audienceType) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    if (formData.audienceType === "specific_group" && !formData.groupId) {
      toast({
        title: "Group Required",
        description: "Please select a group for your request",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("requests")
        .insert({
          creator_id: user.id,
          title: formData.title.trim(),
          category: formData.category as any,
          location: formData.location.trim() || null,
          audience_type: formData.audienceType as any,
          group_id: formData.audienceType === "specific_group" ? formData.groupId : null
        });

      if (error) throw error;

      toast({
        title: "Request Created!",
        description: "Your request has been sent to your network"
      });

      navigate("/requests");
    } catch (error) {
      console.error("Error creating request:", error);
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
    { value: "films", label: "Films & Movies" },
    { value: "places", label: "Places & Travel" },
    { value: "products", label: "Products & Shopping" },
    { value: "services", label: "Services & Professionals" },
    { value: "other", label: "Other" }
  ];

  const audienceOptions = [
    { value: "friends", label: "Friends", description: "Send to your direct connections" },
    { value: "extended_network", label: "Extended Network", description: "Send to friends of friends" },
    { value: "specific_group", label: "Specific Group", description: "Send to a group you created" },
    { value: "public", label: "Public (Anonymous)", description: "Share publicly with anonymous identity via AI matching" }
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/requests")}
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
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
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
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                Help others understand the context or area you're interested in
              </p>
            </div>

            {/* Audience Selection */}
            <div className="space-y-4">
              <Label>Send to *</Label>
              <RadioGroup 
                value={formData.audienceType} 
                onValueChange={(value) => setFormData({ ...formData, audienceType: value, groupId: "" })}
                className="space-y-3"
              >
                {audienceOptions.map((option) => (
                  <div key={option.value} className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value={option.value} id={option.value} />
                      <Label htmlFor={option.value} className="font-medium cursor-pointer">
                        {option.label}
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground ml-6">
                      {option.description}
                    </p>
                  </div>
                ))}
              </RadioGroup>

              {/* Group Selection */}
              {formData.audienceType === "specific_group" && (
                <div className="ml-6 space-y-2">
                  <Label>Select Group</Label>
                  {groups.length > 0 ? (
                    <Select value={formData.groupId} onValueChange={(value) => setFormData({ ...formData, groupId: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a group" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            <div className="flex items-center gap-2">
                              <span>{group.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {group.member_count} members
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                      You don't have any groups yet. 
                      <Button 
                        variant="link" 
                        className="h-auto p-0 ml-1"
                        onClick={() => navigate("/groups/new")}
                      >
                        Create your first group
                      </Button>
                    </div>
                  )}
                </div>
              )}
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