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
import { Search, UserPlus, Mail, Phone, Users, Send } from "lucide-react";

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
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadContacts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all contacts with relationship status
      const { data: contactsData, error } = await supabase
        .from('contact_imports')
        .select(`
          *,
          profiles:matched_user_id(full_name, handle),
          outgoing_requests:friend_requests!requester_id(status, addressee_id),
          incoming_requests:friend_requests!addressee_id(status, requester_id),
          friendships_user1:friendships!user1_id(user2_id),
          friendships_user2:friendships!user2_id(user1_id)
        `)
        .eq('user_id', user.id)
        .order('is_matched', { ascending: false })
        .order('contact_name');

      if (error) throw error;

      const processedContacts: ContactWithStatus[] = contactsData?.map(contact => {
        const profile = Array.isArray(contact.profiles) ? contact.profiles[0] : contact.profiles;
        
        // Check friendship status
        const friendships1 = Array.isArray(contact.friendships_user1) ? contact.friendships_user1 : [];
        const friendships2 = Array.isArray(contact.friendships_user2) ? contact.friendships_user2 : [];
        const isFriends = friendships1.some(f => f.user2_id === contact.matched_user_id) ||
                         friendships2.some(f => f.user1_id === contact.matched_user_id);

        // Check friend request status
        const outgoingRequests = Array.isArray(contact.outgoing_requests) ? contact.outgoing_requests : [];
        const incomingRequests = Array.isArray(contact.incoming_requests) ? contact.incoming_requests : [];
        
        const sentRequest = outgoingRequests.find(r => r.addressee_id === contact.matched_user_id && r.status === 'pending');
        const receivedRequest = incomingRequests.find(r => r.requester_id === contact.matched_user_id && r.status === 'pending');

        return {
          id: contact.id,
          contact_name: contact.contact_name,
          contact_email: contact.contact_email,
          contact_phone: contact.contact_phone,
          is_matched: contact.is_matched,
          matched_user_id: contact.matched_user_id,
          full_name: profile?.full_name,
          handle: profile?.handle,
          is_friends: isFriends,
          has_sent_request: !!sentRequest,
          has_received_request: !!receivedRequest,
          friend_request_status: sentRequest?.status || receivedRequest?.status
        };
      }) || [];

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

  useEffect(() => {
    loadContacts();
  }, []);

  const filteredContacts = contacts.filter(contact =>
    contact.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.contact_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.handle?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const onAntelogContacts = filteredContacts.filter(c => c.is_matched);
  const notOnAntelogContacts = filteredContacts.filter(c => !c.is_matched);

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
          <Button 
            variant="outline"
            onClick={() => navigate('/contacts-import-hub')}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Import More
          </Button>
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
                        <div className="ml-4">
                          {getActionButton(contact)}
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
                        <Button variant="outline" size="sm">
                          <Send className="w-4 h-4 mr-1" />
                          Invite
                        </Button>
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
    </>
  );
};

export default ContactsOverview;