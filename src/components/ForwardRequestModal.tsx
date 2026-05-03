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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, AlertCircle, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Friend {
  id: string;
  full_name: string;
  handle: string;
}

interface NetworkPath {
  user_id: string;
  user_name: string;
  user_handle: string;
}

interface ForwardRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  requestTitle: string;
  requestCreatorName: string;
  requestCreatorId: string;
  existingNetworkPath?: NetworkPath[];
  onForwardComplete?: () => void;
  preselectedFriendIds?: string[];
}

export function ForwardRequestModal({
  open,
  onOpenChange,
  requestId,
  requestTitle,
  requestCreatorName,
  requestCreatorId,
  existingNetworkPath = [],
  onForwardComplete,
  preselectedFriendIds,
}: ForwardRequestModalProps) {
  const { toast } = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadFriends();
      if (preselectedFriendIds && preselectedFriendIds.length > 0) {
        setSelectedFriendIds(preselectedFriendIds);
      }
    }
  }, [open, preselectedFriendIds]);

  const loadFriends = async () => {
    try {
      console.log('=== FETCHING 1ST NETWORK FOR FORWARDING ===');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No authenticated user');
        return;
      }
      
      console.log('Current user ID (forwarder):', user.id);
      console.log('Request creator ID (to exclude):', requestCreatorId);
      console.log('Request being forwarded:', requestId);

      // Get user's 1st network connections
      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      console.log('Friendships query result:', friendships);
      console.log('Friendships error:', error);

      if (error) throw error;

      // Extract friend IDs
      const friendIds = friendships?.map(f => 
        f.user1_id === user.id ? f.user2_id : f.user1_id
      ) || [];

      console.log('Friend IDs extracted:', friendIds);

      // If no friends, set empty array and return early
      if (friendIds.length === 0) {
        console.log('No friends found in 1st network');
        setFriends([]);
        setLoading(false);
        return;
      }

      // Get friend profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, handle')
        .in('id', friendIds);

      console.log('Profiles query result:', profiles);
      console.log('Profiles error:', profilesError);

      if (profilesError) throw profilesError;

      // SIMPLIFIED FILTERING: Only exclude the request creator
      console.log('Request creator to exclude:', requestCreatorId);
      console.log('Profiles before filtering:', profiles);
      
      // Debug each profile
      profiles?.forEach(profile => {
        console.log(`Checking profile: ${profile.handle || profile.full_name}`);
        console.log(`  - ID: ${profile.id}`);
        console.log(`  - Is creator? ${profile.id === requestCreatorId}`);
        console.log(`  - Has full_name? ${!!profile.full_name}`);
        console.log(`  - Has handle? ${!!profile.handle}`);
        console.log(`  - Has identifier? ${!!(profile.full_name || profile.handle)}`);
      });
      
      const filteredProfiles = profiles?.filter(p => {
        // Exclude creator
        if (p.id === requestCreatorId) {
          console.log(`Profile ${p.handle || p.full_name}: ❌ EXCLUDED (is creator)`);
          return false;
        }
        
        // Include if has any identifier (full_name OR handle)
        const hasIdentifier = p.full_name || p.handle;
        if (hasIdentifier) {
          console.log(`Profile ${p.handle || p.full_name}: ✅ INCLUDED`);
          return true;
        }
        
        console.log(`Profile unknown: ❌ EXCLUDED (no identifier)`);
        return false;
      }) || [];

      console.log('Filtered profiles for forwarding:', filteredProfiles);
      console.log('Number of available contacts:', filteredProfiles.length);
      
      setFriends(filteredProfiles as Friend[]);
    } catch (error) {
      console.error('Error loading friends:', error);
      toast({
        title: "Error",
        description: "Failed to load your network",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
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
    if (selectedFriendIds.length === 0) {
      toast({
        title: "No recipients selected",
        description: "Please select at least one person to forward to",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get current user's profile
      console.log('=== FETCHING FORWARDER PROFILE ===');
      console.log('Current user ID:', user.id);
      
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, handle')
        .eq('id', user.id)
        .single();

      console.log('Profile fetch error:', profileError);
      console.log('Profile data:', profile);
      console.log('full_name:', profile?.full_name);
      console.log('handle:', profile?.handle);

      const forwarderName = profile?.full_name || profile?.handle || 'Someone';
      console.log('Forwarder name to use:', forwarderName);

      // Build network path (add current user to end of existing path)
      const newNetworkPath = [
        ...existingNetworkPath,
        {
          user_id: user.id,
          user_name: forwarderName,
          user_handle: profile?.handle || 'unknown'
        }
      ];

      // Calculate network depth (how many hops from original)
      const networkDepth = newNetworkPath.length + 1;

      // Create forward record
      const { error } = await supabase
        .from('request_forwards')
        .insert({
          request_id: requestId,
          forwarded_by_user_id: user.id,
          forwarded_to: selectedFriendIds,
          network_depth: networkDepth,
          network_path: newNetworkPath.map(p => p.user_id),
          forwarded_to_audience: 'first_network'
        });

      if (error) throw error;

      // Create notifications for recipients with actual names
      console.log('=== CREATING FORWARD NOTIFICATIONS ===');
      console.log('Forwarder name for notification:', forwarderName);
      console.log('Request title:', requestTitle);
      console.log('Request creator name:', requestCreatorName);
      
      const notifications = selectedFriendIds.map(friendId => ({
        user_id: friendId,
        type: 'request_forwarded',
        title: `${forwarderName} endorsed a request`,
        message: `"${requestTitle}" - from ${requestCreatorName}`,
        related_user_id: user.id,
        metadata: { request_id: requestId }
      }));
      
      console.log('Notifications to insert:', notifications);

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications);
      
      console.log('Notification insert error:', notifError);

      toast({
        title: "Request Forwarded!",
        description: `Forwarded to ${selectedFriendIds.length} ${selectedFriendIds.length === 1 ? 'person' : 'people'} in your network`
      });

      onOpenChange(false);
      onForwardComplete?.();

    } catch (error) {
      console.error('Error forwarding request:', error);
      toast({
        title: "Error",
        description: "Failed to forward request. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderNetworkPath = () => {
    if (existingNetworkPath.length === 0) {
      return (
        <div className="text-sm">
          <span className="font-medium">{requestCreatorName}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="font-medium">{requestCreatorName}</span>
        {existingNetworkPath.map((person, index) => (
          <span key={index} className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">via</span>
            <span className="font-medium">{person.user_name}</span>
          </span>
        ))}
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <Badge variant="secondary">endorsed by You</Badge>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Endorse & Forward Request</DialogTitle>
          <DialogDescription>
            Forward this request to people in your trusted network
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Request Preview */}
          <div className="p-4 border rounded-lg bg-muted/50 space-y-2">
            <div className="font-medium text-sm text-muted-foreground">Request</div>
            <div className="font-semibold">{requestTitle}</div>
            <div className="text-sm">
              <div className="font-medium mb-1">Network Path:</div>
              {renderNetworkPath()}
            </div>
          </div>

          {/* Recipients will see */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Recipients will see:</strong> "Request from {requestCreatorName}
              {existingNetworkPath.length > 0 && ` → via ${existingNetworkPath.map(p => p.user_name).join(' → ')}`}
              → endorsed by You"
            </AlertDescription>
          </Alert>

          {/* Friend Selection */}
          <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <Label className="text-base font-medium">
                Select people from your 1st Network:
              </Label>
            </div>
            
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading your network...
              </div>
            ) : friends.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No one available to forward to</p>
                <p className="text-sm mt-2">Build your 1st network to forward requests</p>
              </div>
            ) : (
              <ScrollArea className="flex-1 border rounded-lg p-2">
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => toggleFriend(friend.id)}
                    >
                      <Checkbox
                        checked={selectedFriendIds.includes(friend.id)}
                        onCheckedChange={() => toggleFriend(friend.id)}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{friend.full_name || friend.handle}</div>
                        {friend.handle && <div className="text-sm text-muted-foreground">@{friend.handle}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            
            {selectedFriendIds.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Selected: {selectedFriendIds.length} {selectedFriendIds.length === 1 ? 'person' : 'people'}
              </div>
            )}
          </div>

          {/* Accountability */}
          <Alert>
            <AlertDescription className="text-xs">
              <strong>By forwarding, you're vouching that:</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>This is a genuine request</li>
                <li>The recipients can provide valuable input</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleForward} 
            disabled={isSubmitting || selectedFriendIds.length === 0}
          >
            {isSubmitting ? "Forwarding..." : `Forward to ${selectedFriendIds.length || '...'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
