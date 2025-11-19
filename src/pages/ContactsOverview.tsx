import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus, Mail, Phone, Users, Send, Trash2, RefreshCw } from "lucide-react";
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

interface ContactWithStatus {
  id: string;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  is_matched: boolean;
  matched_user_id?: string;
  // Joined user info
  full_name?: string;
  handle?: string;
  // Relationship status
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
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadContacts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No authenticated user found');
        toast({
          title: "Authentication required",
          description: "Please log in to view your contacts",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      console.log('Loading contacts for user:', user.id);

      // First, get basic contacts data
      const { data: contactsData, error } = await supabase
        .from('contact_imports')
        .select('*')
        .eq('user_id', user.id)
        .order('is_matched', { ascending: false })
        .order('contact_name');

      console.log('Contacts query result:', { contactsData, error });

      if (error) {
        console.error('Contacts query error:', error);
        throw error;
      }

      if (!contactsData) {
        console.log('No contacts data returned');
        setContacts([]);
        setLoading(false);
        return;
      }

      // Now get profile data for matched contacts
      const processedContacts: ContactWithStatus[] = [];
      
      for (const contact of contactsData) {
        let profile = null;
        let isFriends = false;
        let hasSentRequest = false;
        let hasReceivedRequest = false;

        if (contact.is_matched && contact.matched_user_id) {
          // Get profile data
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name, handle')
            .eq('id', contact.matched_user_id)
            .single();
          
          profile = profileData;

          // Check friendship status
          const { data: friendshipData } = await supabase
            .from('friendships')
            .select('*')
            .or(`and(user1_id.eq.${user.id},user2_id.eq.${contact.matched_user_id}),and(user1_id.eq.${contact.matched_user_id},user2_id.eq.${user.id})`);
          
          isFriends = friendshipData && friendshipData.length > 0;

          // Check friend request status
          const { data: sentRequestData } = await supabase
            .from('friend_requests')
            .select('*')
            .eq('requester_id', user.id)
            .eq('addressee_id', contact.matched_user_id)
            .eq('status', 'pending');
          
          const { data: receivedRequestData } = await supabase
            .from('friend_requests')
            .select('*')
            .eq('requester_id', contact.matched_user_id)
            .eq('addressee_id', user.id)
            .eq('status', 'pending');

          hasSentRequest = sentRequestData && sentRequestData.length > 0;
          hasReceivedRequest = receivedRequestData && receivedRequestData.length > 0;
        }

        processedContacts.push({
          id: contact.id,
          contact_name: contact.contact_name,
          contact_email: contact.contact_email,
          contact_phone: contact.contact_phone,
          is_matched: contact.is_matched,
          matched_user_id: contact.matched_user_id,
          full_name: profile?.full_name,
          handle: profile?.handle,
          is_friends: isFriends,
          has_sent_request: hasSentRequest,
          has_received_request: hasReceivedRequest,
          friend_request_status: hasSentRequest ? 'pending' : hasReceivedRequest ? 'pending' : undefined
        });
      }

      setContacts(processedContacts);
    } catch (error) {
      console.error('Error loading contacts:', error);
      toast({
        title: "Error",
        description: "Failed to load contacts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteContact = async (contactId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to delete contacts",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('contact_imports')
        .delete()
        .eq('id', contactId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Contact removed",
        description: "The contact has been removed from your list",
      });

      // Update UI immediately
      setContacts(prev => prev.filter(c => c.id !== contactId));
      setContactToDelete(null);
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: "Error",
        description: "Failed to delete contact",
        variant: "destructive",
      });
    }
  };

  const sendFriendRequest = async (userId: string, contactName: string) => {
    try {
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          requester_id: (await supabase.auth.getUser()).data.user?.id,
          addressee_id: userId,
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: "Friend request sent!",
        description: `Friend request sent to ${contactName}`,
      });

      loadContacts(); // Refresh the list
    } catch (error) {
      console.error('Error sending friend request:', error);
      toast({
        title: "Error",
        description: "Failed to send friend request",
        variant: "destructive",
      });
    }
  };

  const rematchContacts = async () => {
    setIsRematching(true);
    try {
      console.log('🔄 Starting contact re-matching...');
      console.log('📱 This will normalize and re-match all phone numbers');
      
      const { data, error } = await supabase.functions.invoke('rematch-contacts', {
        body: {}
      });

      if (error) {
        console.error('❌ Re-match error:', error);
        throw error;
      }

      console.log('✅ Re-match completed:', data);

      const matchesFound = data?.stats?.matchesFound || 0;
      const contactsUpdated = data?.stats?.contactsUpdated || 0;

      toast({
        title: matchesFound > 0 ? "New matches found!" : "Re-match complete",
        description: data?.stats 
          ? `Found ${matchesFound} match${matchesFound !== 1 ? 'es' : ''}, updated ${contactsUpdated} contact${contactsUpdated !== 1 ? 's' : ''}`
          : "All contacts have been re-checked for matches",
        variant: matchesFound > 0 ? "default" : "default",
      });

      // Reload contacts to show updated matches
      console.log('🔄 Reloading contacts to show updated matches...');
      await loadContacts();
      console.log('✅ Contacts reloaded');
    } catch (error) {
      console.error('❌ Fatal error re-matching contacts:', error);
      toast({
        title: "Error",
        description: "Failed to re-match contacts. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsRematching(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const filteredContacts = contacts.filter(contact =>
    contact.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.contact_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.handle?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const onAntelogContacts = filteredContacts.filter(c => c.is_matched && c.matched_user_id);
  const notOnAntelogContacts = filteredContacts.filter(c => !c.is_matched || !c.matched_user_id);

  const getStatusBadge = (contact: ContactWithStatus) => {
    if (contact.is_friends) {
      return <Badge variant="secondary" className="bg-green-100 text-green-800">Friends</Badge>;
    }
    if (contact.has_sent_request) {
      return <Badge variant="outline">Request Sent</Badge>;
    }
    if (contact.has_received_request) {
      return <Badge variant="default">Request Received</Badge>;
    }
    return null;
  };

  const getActionButton = (contact: ContactWithStatus) => {
    if (contact.is_friends) {
      return (
        <Button variant="outline" size="sm" disabled>
          <Users className="w-4 h-4 mr-1" />
          Friends
        </Button>
      );
    }
    if (contact.has_sent_request) {
      return (
        <Button variant="outline" size="sm" disabled>
          Request Sent
        </Button>
      );
    }
    if (contact.has_received_request) {
      return (
        <Button 
          variant="default" 
          size="sm"
          onClick={() => navigate('/friends?tab=received')}
        >
          View Request
        </Button>
      );
    }
    return (
      <Button 
        variant="default" 
        size="sm"
        onClick={() => sendFriendRequest(contact.matched_user_id!, contact.contact_name)}
      >
        <UserPlus className="w-4 h-4 mr-1" />
        Send Request
      </Button>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Contacts - Antelog</title>
        <meta name="description" content="Manage your imported contacts and see who's on Antelog" />
      </Helmet>

      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Your Contacts</h1>
            <p className="text-muted-foreground mt-1">
              {contacts.length} contacts imported • {onAntelogContacts.length} on Antelog
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={rematchContacts}
              disabled={isRematching}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRematching ? 'animate-spin' : ''}`} />
              {isRematching ? 'Refreshing...' : 'Refresh Matches'}
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate('/contacts-import-hub')}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Import More
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="space-y-8">
          {/* On Antelog Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-green-600" />
                On Antelog ({onAntelogContacts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {onAntelogContacts.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">
                  None of your contacts have joined Antelog yet
                </p>
              ) : (
                <div className="space-y-3">
                  {onAntelogContacts.map((contact, index) => (
                    <div key={contact.id}>
                      <div className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div>
                              <h3 className="font-medium">
                                {contact.contact_name}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                @{contact.handle} • {contact.full_name}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                {contact.contact_email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    {contact.contact_email}
                                  </span>
                                )}
                                {contact.contact_phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {contact.contact_phone}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="ml-auto">
                              {getStatusBadge(contact)}
                            </div>
                           </div>
                         </div>
                         <div className="ml-4 flex items-center gap-2">
                           {getActionButton(contact)}
                           <Button
                             variant="ghost"
                             size="icon"
                             onClick={() => setContactToDelete(contact)}
                             className="text-destructive hover:text-destructive hover:bg-destructive/10"
                           >
                             <Trash2 className="w-4 h-4" />
                           </Button>
                         </div>
                       </div>
                      {index < onAntelogContacts.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Not on Antelog Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" />
                Not on Antelog Yet ({notOnAntelogContacts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {notOnAntelogContacts.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">
                  All your contacts are on Antelog! 🎉
                </p>
              ) : (
                <div className="space-y-3">
                  {notOnAntelogContacts.map((contact, index) => (
                    <div key={contact.id}>
                      <div className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg">
                        <div className="flex-1">
                          <h3 className="font-medium">{contact.contact_name}</h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            {contact.contact_email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {contact.contact_email}
                              </span>
                            )}
                            {contact.contact_phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {contact.contact_phone}
                              </span>
                            )}
                           </div>
                         </div>
                         <div className="flex items-center gap-2">
                           <Button variant="outline" size="sm">
                             <Send className="w-4 h-4 mr-1" />
                             Invite
                           </Button>
                           <Button
                             variant="ghost"
                             size="icon"
                             onClick={() => setContactToDelete(contact)}
                             className="text-destructive hover:text-destructive hover:bg-destructive/10"
                           >
                             <Trash2 className="w-4 h-4" />
                           </Button>
                         </div>
                       </div>
                      {index < notOnAntelogContacts.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!contactToDelete} onOpenChange={(open) => !open && setContactToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {contactToDelete?.contact_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the contact from your imported contacts list.
              {contactToDelete?.is_friends && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Note: This will not unfriend them if they're already your friend on Antelog.
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
              Remove Contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ContactsOverview;