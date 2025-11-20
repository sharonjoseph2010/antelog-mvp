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
import { getLast10Digits } from "@/lib/phone-utils";

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

  const debugPhoneMatching = async () => {
    console.log('\n=== DEBUG PHONE MATCHING - COMPREHENSIVE CHECK ===');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in",
        variant: "destructive"
      });
      return;
    }
    
    console.log('Current logged in user ID:', user.id);
    
    // STEP 1: Check if Jeff's specific profile exists
    console.log('\n--- STEP 1: Looking for Jeff\'s profile specifically ---');
    const jeffPhones = ['+918075268971', '918075268971', '8075268971'];
    console.log('Searching for phones:', jeffPhones);
    
    const { data: jeffProfile, error: jeffError } = await supabase
      .from('profiles')
      .select('id, full_name, handle, phone_number, is_verified, user_type, verification_status')
      .or(`phone_number.eq.${jeffPhones[0]},phone_number.eq.${jeffPhones[1]},phone_number.eq.${jeffPhones[2]}`);
    
    console.log('Jeff\'s profile query result:', jeffProfile);
    console.log('Jeff\'s profile error:', jeffError);
    
    if (jeffProfile && jeffProfile.length > 0) {
      console.log('✅ FOUND Jeff\'s profile:');
      jeffProfile.forEach(p => {
        console.log('  ID:', p.id);
        console.log('  Name:', p.full_name);
        console.log('  Phone:', p.phone_number);
        console.log('  Verified:', p.is_verified);
        console.log('  User Type:', p.user_type);
        console.log('  Verification Status:', p.verification_status);
      });
    } else {
      console.log('❌ Jeff\'s profile NOT FOUND in query result');
      console.log('This could mean:');
      console.log('  1. Profile doesn\'t exist in database');
      console.log('  2. Phone number is stored in different format');
      console.log('  3. RLS policy is blocking access');
    }
    
    // STEP 2: Check RLS - Try to get ALL profiles (will be filtered by RLS)
    console.log('\n--- STEP 2: Checking what RLS allows us to see ---');
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, handle, phone_number, is_verified, user_type')
      .not('phone_number', 'is', null)
      .neq('phone_number', '');

    if (error) {
      console.error('❌ Error fetching profiles:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      toast({
        title: "Error",
        description: `Failed to fetch profiles: ${error.message}`,
        variant: "destructive"
      });
      return;
    }

    console.log('=== PROFILES VISIBLE WITH CURRENT RLS ===');
    console.log('Total profiles found:', profiles?.length || 0);
    console.log('⚠️ If this is only 1, RLS is likely blocking other profiles');
    
    profiles?.forEach((profile, index) => {
      console.log(`\n[${index + 1}] Profile:`);
      console.log('  ID:', profile.id);
      console.log('  Full Name:', profile.full_name);
      console.log('  Handle:', profile.handle);
      console.log('  Phone (RAW):', profile.phone_number);
      console.log('  Phone (last 10 digits):', getLast10Digits(profile.phone_number || ''));
      console.log('  Is Verified:', profile.is_verified);
      console.log('  User Type:', profile.user_type);
      console.log('  Is Current User?:', profile.id === user.id ? '✅ YES' : '❌ NO');
    });
    
    // STEP 3: Try to count total profiles (admin view)
    console.log('\n--- STEP 3: Checking if user is admin ---');
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    console.log('User role:', roleData?.role || 'none');
    
    if (roleData?.role !== 'admin') {
      console.log('\n⚠️⚠️⚠️ CRITICAL ISSUE IDENTIFIED ⚠️⚠️⚠️');
      console.log('You are NOT an admin, so RLS policy "View basic profile info only" applies.');
      console.log('This policy ONLY shows profiles that are:');
      console.log('  1. Your own profile, OR');
      console.log('  2. Profiles where ALL of these are true:');
      console.log('     - is_verified = true');
      console.log('     - full_name IS NOT NULL');
      console.log('     - handle IS NOT NULL');
      console.log('     - AND either:');
      console.log('       a) You are friends with them, OR');
      console.log('       b) They have a public list AND are in your extended network');
      console.log('\nIf Jeff doesn\'t meet these conditions, you CANNOT see his profile.');
      console.log('SOLUTION: Contact matching needs a security definer function to bypass RLS.');
    }
    
    console.log('\n=== PROFILES EXCLUDING CURRENT USER ===');
    const otherProfiles = profiles?.filter(p => p.id !== user.id);
    console.log('Count (excluding current user):', otherProfiles?.length || 0);

    toast({
      title: "Debug Complete",
      description: `Found ${profiles?.length || 0} total profiles, ${otherProfiles?.length || 0} excluding you. Check console for RLS analysis.`,
      duration: 5000
    });
  };

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

      console.log('=== STEP 1: FETCHING CONTACTS ===');
      console.log('User ID:', user.id);

      const { data: contactsData, error } = await supabase
        .from('contact_imports')
        .select('*')
        .eq('user_id', user.id)
        .order('is_matched', { ascending: false })
        .order('contact_name');

      console.log('Contacts query executed');
      console.log('Contacts found:', contactsData?.length || 0);
      console.log('Contacts data:', JSON.stringify(contactsData, null, 2));

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

      const processedContacts: ContactWithStatus[] = [];
      
      for (const contact of contactsData) {
        let profile = null;
        let isFriends = false;
        let hasSentRequest = false;
        let hasReceivedRequest = false;

        if (contact.is_matched && contact.matched_user_id) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, full_name, handle, is_verified')
            .eq('id', contact.matched_user_id)
            .single();

          profile = profileData;

          const { data: friendshipData } = await supabase
            .from('friendships')
            .select('id')
            .or(`and(user1_id.eq.${user.id},user2_id.eq.${contact.matched_user_id}),and(user1_id.eq.${contact.matched_user_id},user2_id.eq.${user.id})`)
            .maybeSingle();

          isFriends = !!friendshipData;

          const { data: sentRequestData } = await supabase
            .from('friend_requests')
            .select('status')
            .eq('requester_id', user.id)
            .eq('addressee_id', contact.matched_user_id)
            .maybeSingle();

          hasSentRequest = !!sentRequestData && sentRequestData.status === 'pending';

          const { data: receivedRequestData } = await supabase
            .from('friend_requests')
            .select('status')
            .eq('requester_id', contact.matched_user_id)
            .eq('addressee_id', user.id)
            .maybeSingle();

          hasReceivedRequest = !!receivedRequestData && receivedRequestData.status === 'pending';
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
        });
      }

      console.log('Processed contacts:', processedContacts);
      setContacts(processedContacts);
    } catch (error) {
      console.error('Error loading contacts:', error);
      toast({
        title: "Error loading contacts",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const rematchContacts = async () => {
    try {
      setIsRematching(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Authentication required",
          description: "You must be logged in",
          variant: "destructive"
        });
        return;
      }

      console.log('=== Starting Contact Rematch (using secure function) ===');

      // Call the SECURITY DEFINER function that bypasses RLS and updates matches
      const { data: matchCount, error: matchError } = await supabase
        .rpc('update_matched_contacts', { user_id_input: user.id });

      if (matchError) {
        console.error('Error matching contacts:', matchError);
        toast({
          title: "Error",
          description: "Failed to match contacts",
          variant: "destructive",
        });
        return;
      }

      console.log('=== Rematch Complete ===');
      console.log('Total matches found and updated:', matchCount);

      toast({
        title: "Contacts Rematched",
        description: `Found ${matchCount || 0} matches`,
      });
      
      await loadContacts();
    } catch (error) {
      console.error('Error in rematchContacts:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while rematching contacts",
        variant: "destructive"
      });
    } finally {
      setIsRematching(false);
    }
  };

  const deleteContact = async (contactId: string) => {
    try {
      const { error } = await supabase
        .from('contact_imports')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      toast({
        title: "Contact deleted",
        description: "The contact has been removed from your list"
      });
      
      setContacts(contacts.filter(c => c.id !== contactId));
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
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          requester_id: (await supabase.auth.getUser()).data.user?.id!,
          addressee_id: userId,
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: "Friend request sent",
        description: `Request sent to ${contactName}`
      });
      
      await loadContacts();
    } catch (error: any) {
      console.error('Error sending friend request:', error);
      if (error.code === '23505') {
        toast({
          title: "Request already sent",
          description: "You've already sent a request to this user",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to send friend request",
          variant: "destructive"
        });
      }
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const filteredContacts = contacts.filter(contact =>
    contact.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.contact_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.contact_phone?.includes(searchTerm)
  );

  const matchedContacts = filteredContacts.filter(c => c.is_matched);
  const unmatchedContacts = filteredContacts.filter(c => !c.is_matched);

  return (
    <>
      <Helmet>
        <title>My Contacts - Antelog</title>
      </Helmet>
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">My Contacts</h1>
          <p className="text-muted-foreground">
            Manage your imported contacts and connect with friends on Antelog
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          <Button 
            onClick={rematchContacts}
            disabled={isRematching}
            variant="outline"
          >
            {isRematching ? "Refreshing..." : "Refresh Matches"}
          </Button>
          <Button 
            onClick={debugPhoneMatching}
            variant="outline"
          >
            Debug Phone Matching
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
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading contacts...</p>
          </div>
        ) : (
          <>
            {matchedContacts.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    On Antelog ({matchedContacts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {matchedContacts.map((contact) => (
                      <div key={contact.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{contact.contact_name}</h3>
                            <Badge variant="secondary">
                              @{contact.handle}
                            </Badge>
                            {contact.is_friends && (
                              <Badge variant="default">Friends</Badge>
                            )}
                          </div>
                          {contact.contact_email && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {contact.contact_email}
                            </div>
                          )}
                          {contact.contact_phone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {contact.contact_phone}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!contact.is_friends && !contact.has_sent_request && !contact.has_received_request && (
                            <Button 
                              size="sm"
                              onClick={() => sendFriendRequest(contact.matched_user_id!, contact.contact_name)}
                            >
                              <Send className="h-4 w-4 mr-1" />
                              Send Request
                            </Button>
                          )}
                          {contact.has_sent_request && (
                            <Badge variant="outline">Request Pending</Badge>
                          )}
                          {contact.has_received_request && (
                            <Button 
                              size="sm"
                              onClick={() => navigate('/friends')}
                            >
                              View Request
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
                </CardContent>
              </Card>
            )}

            {unmatchedContacts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    Not on Antelog Yet ({unmatchedContacts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {unmatchedContacts.map((contact) => (
                      <div key={contact.id} className="flex items-center justify-between p-4 border rounded-lg opacity-60">
                        <div className="flex-1">
                          <h3 className="font-semibold mb-1">{contact.contact_name}</h3>
                          {contact.contact_email && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {contact.contact_email}
                            </div>
                          )}
                          {contact.contact_phone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {contact.contact_phone}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setContactToDelete(contact)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {filteredContacts.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No contacts found</p>
                  <Button 
                    onClick={() => navigate('/contacts-import-hub')}
                    className="mt-4"
                  >
                    Import Contacts
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {isAdmin && <ContactDebugPanel />}
      </div>

      <AlertDialog open={!!contactToDelete} onOpenChange={() => setContactToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {contactToDelete?.contact_name}? This will only remove them from your contacts list. If you're already friends, this won't affect your friendship.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => contactToDelete && deleteContact(contactToDelete.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ContactsOverview;
