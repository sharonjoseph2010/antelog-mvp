import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus, Mail, Phone, Users, Send, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ContactDebugPanel from "@/components/ContactDebugPanel";

interface ContactWithStatus {
  id: string;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  is_matched: boolean;
  matched_user_id?: string;
  full_name?: string;
  handle?: string;
  friend_request_status?: 'pending' | 'accepted' | 'rejected';
  friendship_id?: string;
  is_friends: boolean;
  has_sent_request: boolean;
  has_received_request: boolean;
}

const ContactsOverview = () => {
  const [contacts, setContacts] = useState<ContactWithStatus[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [contactToDelete, setContactToDelete] = useState<ContactWithStatus | null>(null);
  const [isRematching, setIsRematching] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      setIsAdmin(roleData?.role === 'admin');
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const loadContacts = async () => {
    setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const { data: contactImports, error: contactError } = await supabase
        .from('contact_imports')
        .select(`
          id,
          contact_name,
          contact_email,
          contact_phone,
          is_matched,
          matched_user_id
        `)
        .eq('user_id', user.id)
        .order('contact_name');

      if (contactError) {
        console.error('Error fetching contacts:', contactError);
        throw contactError;
      }

      const matchedUserIds = contactImports
        ?.filter(c => c.is_matched && c.matched_user_id)
        .map(c => c.matched_user_id) || [];

      let matchedProfiles = [];
      if (matchedUserIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, handle')
          .in('id', matchedUserIds);

        if (profileError) {
          console.error('Error fetching profiles:', profileError);
        } else {
          matchedProfiles = profiles || [];
        }
      }

      const { data: friendRequests, error: requestError } = await supabase
        .from('friend_requests')
        .select('requester_id, addressee_id, status')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .in('status', ['pending', 'accepted']);

      if (requestError) {
        console.error('Error fetching friend requests:', requestError);
      }

      const { data: friendships, error: friendshipError } = await supabase
        .from('friendships')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (friendshipError) {
        console.error('Error fetching friendships:', friendshipError);
      }

      const contactsWithStatus: ContactWithStatus[] = (contactImports || []).map(contact => {
        const profile = matchedProfiles.find(p => p.id === contact.matched_user_id);
        
        const sentRequest = friendRequests?.find(
          fr => fr.requester_id === user.id && fr.addressee_id === contact.matched_user_id
        );
        const receivedRequest = friendRequests?.find(
          fr => fr.requester_id === contact.matched_user_id && fr.addressee_id === user.id
        );
        
        const friendship = friendships?.find(
          f => (f.user1_id === user.id && f.user2_id === contact.matched_user_id) ||
               (f.user2_id === user.id && f.user1_id === contact.matched_user_id)
        );

        return {
          ...contact,
          full_name: profile?.full_name,
          handle: profile?.handle,
          is_friends: !!friendship,
          has_sent_request: !!sentRequest,
          has_received_request: !!receivedRequest,
          friend_request_status: (sentRequest?.status || receivedRequest?.status) as 'pending' | 'accepted' | 'rejected' | undefined,
        };
      });

      setContacts(contactsWithStatus);
    } catch (error) {
      console.error('Error loading contacts:', error);
      toast({
        title: "Error",
        description: "Failed to load contacts. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const rematchContacts = async () => {
    setIsRematching(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in",
          variant: "destructive"
        });
        return;
      }

      const { data: matchCount, error: matchError } = await supabase
        .rpc('update_matched_contacts', { user_id_input: user.id });

      if (matchError) {
        console.error('Error matching contacts:', matchError);
        toast({
          title: "Error",
          description: "Failed to match contacts. Please try again.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Contacts Rematched",
        description: `Found ${matchCount || 0} matches`,
      });
      
      await loadContacts();
    } catch (error) {
      console.error('Error in rematchContacts:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsRematching(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const deleteContact = async (contactId: string) => {
    try {
      const { error } = await supabase
        .from('contact_imports')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      toast({
        title: "Contact Deleted",
        description: "Contact has been removed from your list",
      });

      await loadContacts();
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: "Error",
        description: "Failed to delete contact",
        variant: "destructive"
      });
    } finally {
      setContactToDelete(null);
    }
  };

  const sendFriendRequest = async (userId: string, contactName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in",
          variant: "destructive"
        });
        return;
      }

      const { error: existingRequestError, data: existingRequest } = await supabase
        .from('friend_requests')
        .select('id, status')
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
        .maybeSingle();

      if (existingRequestError) {
        console.error('Error checking existing request:', existingRequestError);
      }

      if (existingRequest) {
        if (existingRequest.status === 'pending') {
          toast({
            title: "Friend Request Already Sent",
            description: `You've already sent a friend request to ${contactName}`,
          });
          return;
        }
      }

      const { error: insertError } = await supabase
        .from('friend_requests')
        .insert({
          requester_id: user.id,
          addressee_id: userId,
          status: 'pending'
        });

      if (insertError) throw insertError;

      toast({
        title: "Friend Request Sent",
        description: `Request sent to ${contactName}`,
      });

      await loadContacts();
    } catch (error) {
      console.error('Error sending friend request:', error);
      toast({
        title: "Error",
        description: "Failed to send friend request",
        variant: "destructive"
      });
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.contact_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.contact_phone?.includes(searchTerm)
  );

  const onAntelogContacts = filteredContacts.filter(c => c.is_matched && c.matched_user_id);
  const notOnAntelogContacts = filteredContacts.filter(c => !c.is_matched || !c.matched_user_id);

  return (
    <>
      <Helmet>
        <title>My Contacts - Antelog</title>
        <meta name="description" content="View and manage your imported contacts on Antelog" />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">My Contacts</h1>
          <p className="text-muted-foreground">
            Manage your imported contacts and send friend requests
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          <Button 
            onClick={rematchContacts}
            disabled={isRematching}
            variant="outline"
          >
            <Users className="mr-2 h-4 w-4" />
            {isRematching ? "Rematching..." : "Refresh Matches"}
          </Button>
          
          <Button 
            onClick={() => navigate('/contacts-import-hub')}
            variant="default"
          >
            Import More Contacts
          </Button>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading contacts...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* On Antelog */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  On Antelog ({onAntelogContacts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {onAntelogContacts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No contacts found on Antelog yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {onAntelogContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{contact.contact_name}</h3>
                            {contact.full_name && (
                              <Badge variant="secondary" className="text-xs">
                                @{contact.handle}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {contact.contact_phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {contact.contact_phone}
                              </div>
                            )}
                            {contact.contact_email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {contact.contact_email}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {contact.is_friends ? (
                            <Badge variant="default">Friends</Badge>
                          ) : contact.has_sent_request ? (
                            <Badge variant="secondary">Request Sent</Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => sendFriendRequest(contact.matched_user_id!, contact.contact_name)}
                            >
                              <UserPlus className="h-4 w-4 mr-1" />
                              Add Friend
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setContactToDelete(contact)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Not on Antelog Yet */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Not on Antelog Yet ({notOnAntelogContacts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {notOnAntelogContacts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    All your contacts are on Antelog!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {notOnAntelogContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1">
                          <h3 className="font-medium mb-1">{contact.contact_name}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {contact.contact_phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {contact.contact_phone}
                              </div>
                            )}
                            {contact.contact_email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {contact.contact_email}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline">
                            <Send className="h-4 w-4 mr-1" />
                            Invite
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setContactToDelete(contact)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {isAdmin && (
          <div className="mt-8">
            <ContactDebugPanel />
          </div>
        )}

        <AlertDialog open={!!contactToDelete} onOpenChange={() => setContactToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Contact?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove {contactToDelete?.contact_name} from your contacts list.
                {contactToDelete?.is_friends && (
                  <span className="block mt-2 font-medium text-foreground">
                    Note: This will not remove your friendship on Antelog.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => contactToDelete && deleteContact(contactToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
};

export default ContactsOverview;
