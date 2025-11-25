import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Users, User, UserCheck } from "lucide-react";

interface Group {
  id: string;
  name: string;
}

interface ForwardRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  requestTitle: string;
  userGroups: Group[];
  onForwardComplete?: () => void;
}

export function ForwardRequestDialog({
  open,
  onOpenChange,
  requestId,
  requestTitle,
  userGroups,
  onForwardComplete
}: ForwardRequestDialogProps) {
  const { toast } = useToast();
  const [audienceType, setAudienceType] = useState<"first_network" | "group">("first_network");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [friends, setFriends] = useState<{id: string; full_name: string; handle: string}[]>([]);

  useEffect(() => {
    if (open) {
      loadFriends();
    }
  }, [open]);

  const loadFriends = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's 1st network
      const { data: friendships } = await supabase
        .from('friendships')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      const friendIds = friendships?.map(f => 
        f.user1_id === user.id ? f.user2_id : f.user1_id
      ) || [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, handle')
        .in('id', friendIds);

      setFriends(profiles?.filter(p => p.full_name && p.handle) || []);
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const toggleFriend = (friendId: string) => {
    setSelectedFriendIds(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleForward = async () => {
    if (audienceType === "group" && !selectedGroupId) {
      toast({
        title: "Error",
        description: "Please select a group",
        variant: "destructive"
      });
      return;
    }

    if (audienceType === "first_network" && selectedFriendIds.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one person",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get current user's profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, handle")
        .eq("id", user.id)
        .single();

      // Get request data to build network path
      const { data: requestData } = await supabase
        .from("requests")
        .select("creator_id")
        .eq("id", requestId)
        .single();

      if (!requestData) throw new Error("Request not found");

      // Get forwarding recipient IDs
      let recipientIds: string[] = [];
      if (audienceType === "first_network") {
        recipientIds = selectedFriendIds;
      } else if (audienceType === "group" && selectedGroupId) {
        const { data: groupMembers } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", selectedGroupId);
        recipientIds = groupMembers?.map(m => m.user_id) || [];
      }

      // Create forward record with network tracking
      const { error: forwardError } = await supabase
        .from("request_forwards")
        .insert([{
          request_id: requestId,
          forwarded_by_user_id: user.id,
          forwarded_to: recipientIds,
          forwarded_to_audience: audienceType,
          forwarded_to_group_id: audienceType === "group" ? selectedGroupId : null,
          network_depth: 2, // This is a simple forward
          network_path: [user.id] // Just the forwarder
        }]);

      if (forwardError) throw forwardError;

      toast({
        title: "Request shared!",
        description: `Request has been shared with your ${audienceType === "first_network" ? "1st network" : "group"}`,
      });

      onOpenChange(false);
      onForwardComplete?.();

    } catch (error) {
      console.error("Error forwarding request:", error);
      toast({
        title: "Error",
        description: "Failed to share request",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share Request to Your Network</DialogTitle>
          <DialogDescription>
            Share "{requestTitle}" with your network to get more recommendations
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={audienceType} onValueChange={(value: any) => setAudienceType(value)}>
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
              <RadioGroupItem value="first_network" id="first_network" />
              <Label htmlFor="first_network" className="flex items-center gap-2 flex-1 cursor-pointer">
                <User className="h-4 w-4" />
                <div>
                  <div className="font-medium">My 1st Network</div>
                  <div className="text-xs text-muted-foreground">Share with your trusted connections</div>
                </div>
              </Label>
            </div>

            {userGroups.length > 0 && (
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <RadioGroupItem value="group" id="group" />
                <Label htmlFor="group" className="flex items-center gap-2 flex-1 cursor-pointer">
                  <UserCheck className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Select Group</div>
                    <div className="text-xs text-muted-foreground">Share with a specific group</div>
                  </div>
                </Label>
              </div>
            )}
          </RadioGroup>

          {audienceType === "first_network" && friends.length > 0 && (
            <div className="space-y-2">
              <Label>Choose People</Label>
              <div className="max-h-[200px] overflow-y-auto space-y-2 border rounded-lg p-2">
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center space-x-2 p-2 rounded hover:bg-accent cursor-pointer"
                    onClick={() => toggleFriend(friend.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFriendIds.includes(friend.id)}
                      onChange={() => toggleFriend(friend.id)}
                      className="h-4 w-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{friend.full_name}</div>
                      <div className="text-xs text-muted-foreground">@{friend.handle}</div>
                    </div>
                  </div>
                ))}
              </div>
              {selectedFriendIds.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFriendIds.length} {selectedFriendIds.length === 1 ? 'person' : 'people'}
                </p>
              )}
            </div>
          )}

          {audienceType === "group" && userGroups.length > 0 && (
            <div className="space-y-2">
              <Label>Choose Group</Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {userGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleForward} disabled={isSubmitting}>
            {isSubmitting ? "Sharing..." : "Share Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}