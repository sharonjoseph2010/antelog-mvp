import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Users, Upload, Trash2 } from "lucide-react";
import { FriendRequestButton } from "@/components/FriendRequestButton";

// Custom icon for 2nd degree - two people connected
const TwoPersonChain = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    {/* First person */}
    <circle cx="6" cy="8" r="2.5" />
    <path d="M 3.5 14 Q 6 11.5 8.5 14" />
    
    {/* Connection line */}
    <line x1="8.5" y1="12" x2="15.5" y2="12" strokeDasharray="2,2" />
    
    {/* Second person */}
    <circle cx="18" cy="8" r="2.5" />
    <path d="M 15.5 14 Q 18 11.5 20.5 14" />
  </svg>
);

// Custom icon for 3rd+ degree - three people connected
const ThreePersonChain = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    {/* First person */}
    <circle cx="4" cy="8" r="2" />
    <path d="M 2.5 13 Q 4 11 5.5 13" />
    
    {/* Connection line 1 */}
    <line x1="5.5" y1="11" x2="9.5" y2="11" strokeDasharray="1,1" />
    
    {/* Second person */}
    <circle cx="12" cy="8" r="2" />
    <path d="M 10.5 13 Q 12 11 13.5 13" />
    
    {/* Connection line 2 */}
    <line x1="13.5" y1="11" x2="18.5" y2="11" strokeDasharray="1,1" />
    
    {/* Third person */}
    <circle cx="20" cy="8" r="2" />
    <path d="M 18.5 13 Q 20 11 21.5 13" />
  </svg>
);

interface Friendship {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  friend_profile?: {
    id: string;
    handle: string;
    full_name: string;
  };
  contact_name?: string;
}

interface ExtendedNetworkMember {
  profile_id: string;
  full_name: string;
  handle: string;
  mutual_friends: string[];
}

interface Contact {
  id: string;
  contact_name: string;
  contact_phone: string | null;
  is_matched: boolean;
  matched_user_id: string | null;
  matched_profile?: {
    id: string;
    handle: string;
    full_name: string;
  };
}

const Friends = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [extendedNetwork, setExtendedNetwork] = useState<ExtendedNetworkMember[]>([]);
  const [thirdPlusNetwork, setThirdPlusNetwork] = useState<ExtendedNetworkMember[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addingToNetwork, setAddingToNetwork] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadFriendships();
      loadExtendedNetwork();
      loadAllContacts();
    }
  }, [currentUserId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const loadFriendships = async () => {
    if (!currentUserId) return;

    try {
      // Load friendships where current user is user1
      const { data: friendships1, error: error1 } = await supabase
        .from('friendships')
        .select('*')
        .eq('user1_id', currentUserId);

      // Load friendships where current user is user2
      const { data: friendships2, error: error2 } = await supabase
        .from('friendships')
        .select('*')
        .eq('user2_id', currentUserId);

      if (error1) throw error1;
      if (error2) throw error2;

      const allFriendshipsData = [
        ...(friendships1 || []),
        ...(friendships2 || [])
      ];

      // Get friend profiles and contact names
      if (allFriendshipsData.length > 0) {
        const friendIds = allFriendshipsData.map(f => 
          f.user1_id === currentUserId ? f.user2_id : f.user1_id
        );
        
        const { data: friendProfiles } = await supabase
          .from('profiles')
          .select('id, handle, full_name')
          .in('id', friendIds);

        // Get contact names for these friends
        const { data: contactData } = await supabase
          .from('contact_imports')
          .select('matched_user_id, contact_name')
          .eq('user_id', currentUserId)
          .in('matched_user_id', friendIds)
          .eq('is_matched', true);

        const friendshipsWithProfiles = allFriendshipsData.map(friendship => {
          const friendId = friendship.user1_id === currentUserId ? friendship.user2_id : friendship.user1_id;
          const friendProfile = friendProfiles?.find(p => p.id === friendId);
          const contactName = contactData?.find(c => c.matched_user_id === friendId)?.contact_name;
          
          return {
            ...friendship,
            friend_profile: friendProfile,
            contact_name: contactName
          };
        });

        setFriendships(friendshipsWithProfiles);
      } else {
        setFriendships([]);
      }
    } catch (error) {
      console.error('Error loading friendships:', error);
    }
  };

  const loadExtendedNetwork = async () => {
    if (!currentUserId) return;

    try {
      const { data: networkData, error } = await supabase.rpc('get_extended_network', {
        user_id: currentUserId
      });

      if (error) {
        console.error('Error loading extended network:', error);
        setExtendedNetwork([]);
        return;
      }

      setExtendedNetwork(networkData || []);
    } catch (error) {
      console.error('Error loading extended network:', error);
      setExtendedNetwork([]);
    }
  };

  const loadAllContacts = async () => {
    if (!currentUserId) return;

    try {
      const { data: contacts, error } = await supabase
        .from('contact_imports')
        .select('id, contact_name, contact_phone, is_matched, matched_user_id')
        .eq('user_id', currentUserId)
        .order('contact_name');

      if (error) throw error;

      // Get matched user profiles
      const matchedUserIds = contacts
        ?.filter(c => c.matched_user_id)
        .map(c => c.matched_user_id!) || [];

      if (matchedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, handle, full_name')
          .in('id', matchedUserIds);

        const contactsWithProfiles = contacts?.map(contact => ({
          ...contact,
          matched_profile: profiles?.find(p => p.id === contact.matched_user_id)
        })) || [];

        setAllContacts(contactsWithProfiles);
      } else {
        setAllContacts(contacts || []);
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
      setAllContacts([]);
    }
  };

  const isAlreadyInNetwork = (contactUserId: string | null) => {
    if (!contactUserId) return false;
    return friendships.some(f => 
      (f.user1_id === contactUserId || f.user2_id === contactUserId)
    );
  };

  const addToNetwork = async (contact: Contact) => {
    if (!currentUserId || !contact.matched_user_id) return;

    // Check if already in network
    if (isAlreadyInNetwork(contact.matched_user_id)) {
      toast({
        title: "Already in 1st Network",
        description: `${contact.contact_name} is already in your 1st network.`,
      });
      return;
    }

    setAddingToNetwork(contact.id);

    try {
      // Add to friendships table
      const { error: friendshipError } = await supabase
        .from('friendships')
        .insert({
          user1_id: currentUserId,
          user2_id: contact.matched_user_id,
        });

      if (friendshipError) throw friendshipError;

      // Resolve the adder's full_name from profiles (do NOT use the saved contact name)
      const { data: adderProfile } = await supabase
        .from('profiles')
        .select('full_name, handle')
        .eq('id', currentUserId)
        .maybeSingle();
      const adderDisplay =
        adderProfile?.full_name ||
        (adderProfile?.handle ? `@${adderProfile.handle}` : 'Someone');

      // Create notification for the added person
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: contact.matched_user_id,
          type: 'network_addition',
          title: 'Added to 1st Network',
          message: `${adderDisplay} added you to their 1st Network`,
          related_user_id: currentUserId,
        });

      if (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Don't throw - friendship was created successfully
      }

      toast({
        title: "Added to 1st Network",
        description: `${contact.contact_name} has been added to your 1st network.`,
      });

      // Reload data
      await Promise.all([loadFriendships(), loadExtendedNetwork()]);
    } catch (error: any) {
      console.error('Error adding to network:', error);
      toast({
        title: "Failed to add",
        description: error.message || "Failed to add to 1st network. Please try again.",
        variant: "destructive",
      });
    } finally {
      setAddingToNetwork(null);
    }
  };

  const removeFriend = async (friendshipId: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);

      if (error) throw error;

      toast({
        title: "Removed from 1st Network",
        description: "Connection has been removed from your 1st network.",
      });

      await Promise.all([loadFriendships(), loadExtendedNetwork()]);
    } catch (error) {
      toast({
        title: "Remove failed",
        description: "Failed to remove connection. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Helmet>
        <title>Network - Antelog</title>
        <meta name="description" content="Manage your network connections on Antelog" />
      </Helmet>

      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Network</h1>
              <p className="text-muted-foreground">
                Manage your network connections
              </p>
            </div>
            
            <Button asChild className="flex items-center gap-2 self-start sm:self-auto">
              <Link to="/contacts/import">
                <Upload className="h-4 w-4" />
                Import Contacts
              </Link>
            </Button>
          </div>

          <Tabs defaultValue="friends" className="space-y-6">
            <TabsList className="h-auto p-0 bg-transparent flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <TabsTrigger 
                value="friends" 
                className="group rounded-full border border-border text-sm font-medium px-4 py-1.5 flex items-center gap-2 whitespace-nowrap data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:border-foreground bg-background text-muted-foreground hover:text-foreground transition-colors shadow-none"
              >
                1st Network
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-muted text-muted-foreground group-data-[state=active]:bg-white/20 group-data-[state=active]:text-background">
                  {friendships.length}
                </span>
              </TabsTrigger>
              
              <TabsTrigger 
                value="second-degree" 
                className="group rounded-full border border-border text-sm font-medium px-4 py-1.5 flex items-center gap-2 whitespace-nowrap data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:border-foreground bg-background text-muted-foreground hover:text-foreground transition-colors shadow-none"
              >
                2nd Network
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-muted text-muted-foreground group-data-[state=active]:bg-white/20 group-data-[state=active]:text-background">
                  {extendedNetwork.length}
                </span>
              </TabsTrigger>

              <TabsTrigger 
                value="third-plus" 
                className="group rounded-full border border-border text-sm font-medium px-4 py-1.5 flex items-center gap-2 whitespace-nowrap data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:border-foreground bg-background text-muted-foreground hover:text-foreground transition-colors shadow-none"
              >
                3rd+ Network
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-muted text-muted-foreground group-data-[state=active]:bg-white/20 group-data-[state=active]:text-background">
                  {thirdPlusNetwork.length}
                </span>
              </TabsTrigger>

              <TabsTrigger 
                value="contacts" 
                className="group rounded-full border border-border text-sm font-medium px-4 py-1.5 flex items-center gap-2 whitespace-nowrap data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:border-foreground bg-background text-muted-foreground hover:text-foreground transition-colors shadow-none"
              >
                Groups
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-muted text-muted-foreground group-data-[state=active]:bg-white/20 group-data-[state=active]:text-background">
                  {allContacts.length}
                </span>
              </TabsTrigger>
            </TabsList>

          <TabsContent value="friends">
            <Card>
              <CardHeader>
                <CardTitle>Your 1st Network</CardTitle>
                <CardDescription>
                  People you trust for recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {friendships.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No one in your 1st network yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Build your 1st network by importing contacts
                    </p>
                    <Button asChild>
                      <Link to="/contacts/import">Import Contacts</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {friendships.map((friendship) => (
                      <div
                        key={friendship.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <h3 className="font-medium">
                            {friendship.friend_profile?.id ? (
                              <Link
                                to={`/profile/${friendship.friend_profile.id}`}
                                className="hover:underline"
                              >
                                {friendship.contact_name || friendship.friend_profile?.full_name || 'Unknown User'}
                              </Link>
                            ) : (
                              friendship.contact_name || friendship.friend_profile?.full_name || 'Unknown User'
                            )}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            @{friendship.friend_profile?.handle || 'unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Connected since {new Date(friendship.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeFriend(friendship.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

            <TabsContent value="second-degree">
              <Card>
                <CardHeader>
                  <CardTitle>2nd Degree Network</CardTitle>
                  <CardDescription>
                    Friends-of-friends in your extended network
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {extendedNetwork.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                        <TwoPersonChain className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">No 2nd Degree Connections Yet</h3>
                      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                        2nd degree connections will appear as your 1st network grows
                      </p>
                      <Button asChild size="lg">
                        <Link to="/contacts/import" className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Import Contacts
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {extendedNetwork.map((member) => (
                        <div
                          key={member.profile_id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div>
                            <h3 className="font-medium">
                              <Link
                                to={`/profile/${member.profile_id}`}
                                className="hover:underline"
                              >
                                {member.full_name}
                              </Link>
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              @{member.handle}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              via {member.mutual_friends.slice(0, 2).join(', ')}
                              {member.mutual_friends.length > 2 && ` +${member.mutual_friends.length - 2} more`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/profile/${member.profile_id}`}>View Profile</Link>
                            </Button>
                            {currentUserId && (
                              <FriendRequestButton
                                currentUserId={currentUserId}
                                targetUserId={member.profile_id}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="third-plus">
              <Card>
                <CardHeader>
                  <CardTitle>3rd+ Degree Network</CardTitle>
                  <CardDescription>
                    Extended connections beyond your 2nd degree network
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <ThreePersonChain className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">3rd+ Degree Connections</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Extended network connections will appear here as your network grows
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contacts">
              <Card>
                <CardHeader>
                  <CardTitle>All Contacts</CardTitle>
                  <CardDescription>
                    Everyone you've imported from your contacts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {allContacts.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                        <Users className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">No Contacts Imported</h3>
                      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                        Import contacts to see them here
                      </p>
                      <Button asChild size="lg">
                        <Link to="/contacts/import" className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Import Contacts
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {allContacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">
                                {contact.is_matched && contact.matched_user_id ? (
                                  <Link
                                    to={`/profile/${contact.matched_user_id}`}
                                    className="hover:underline"
                                  >
                                    {contact.contact_name}
                                  </Link>
                                ) : (
                                  contact.contact_name
                                )}
                              </h3>
                              {contact.is_matched ? (
                                <Badge variant="default" className="text-xs">On Antelog</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Not on Antelog yet</Badge>
                              )}
                            </div>
                            {contact.matched_profile && (
                              <p className="text-sm text-muted-foreground">
                                @{contact.matched_profile.handle}
                              </p>
                            )}
                            {contact.contact_phone && (
                              <p className="text-xs text-muted-foreground">
                                {contact.contact_phone}
                              </p>
                            )}
                          </div>
                          
                          {contact.is_matched ? (
                            isAlreadyInNetwork(contact.matched_user_id) ? (
                              <Badge variant="default" className="text-xs px-3 py-1">
                                In 1st Network
                              </Badge>
                            ) : (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => addToNetwork(contact)}
                                disabled={addingToNetwork === contact.id}
                              >
                                {addingToNetwork === contact.id ? "Adding..." : "Add to 1st Network"}
                              </Button>
                            )
                          ) : (
                            <Button variant="outline" size="sm">
                              Invite
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
        </Tabs>
        </div>
      </div>
    </>
  );
};

export default Friends;