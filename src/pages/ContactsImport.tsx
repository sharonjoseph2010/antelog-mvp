import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Users, UserPlus, CheckCircle } from "lucide-react";

interface Contact {
  name: string;
  email: string;
  isOnAntelog?: boolean;
  antelogUserId?: string;
  profile?: {
    handle: string;
    full_name: string;
  };
}

const ContactsImport = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      
      const nameIndex = headers.findIndex(h => h.includes('name'));
      const emailIndex = headers.findIndex(h => h.includes('email'));
      
      if (nameIndex === -1 || emailIndex === -1) {
        toast({
          title: "Invalid CSV format",
          description: "CSV must contain 'name' and 'email' columns.",
          variant: "destructive",
        });
        return;
      }

      const parsedContacts: Contact[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        if (values[nameIndex] && values[emailIndex]) {
          parsedContacts.push({
            name: values[nameIndex],
            email: values[emailIndex],
          });
        }
      }

      setContacts(parsedContacts);
      await checkAntelogUsers(parsedContacts);
      
      toast({
        title: "Contacts uploaded",
        description: `${parsedContacts.length} contacts imported successfully.`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to parse CSV file. Please check the format.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const checkAntelogUsers = async (contactList: Contact[]) => {
    setIsProcessing(true);
    try {
      const emails = contactList.map(c => c.email);
      
      // Check which emails belong to verified Antelog users
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, handle, full_name')
        .in('id', 
          // Get user IDs from auth.users table by email
          // Note: This is a simplified approach - in production you'd want a more secure method
          emails
        );

      if (error) {
        console.error('Error checking Antelog users:', error);
        return;
      }

      // For now, we'll mark all as not on Antelog since we can't directly query auth.users
      // This would need to be handled via an edge function in production
      const updatedContacts = contactList.map(contact => ({
        ...contact,
        isOnAntelog: false,
      }));

      setContacts(updatedContacts);
    } catch (error) {
      console.error('Error checking users:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const saveContacts = async () => {
    if (contacts.length === 0) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to save contacts.",
          variant: "destructive",
        });
        return;
      }

      const contactsToSave = contacts.map(contact => ({
        user_id: user.id,
        name: contact.name,
        email: contact.email,
        is_on_antelog: contact.isOnAntelog || false,
        antelog_user_id: contact.antelogUserId || null,
      }));

      const { error } = await supabase
        .from('contact_imports')
        .insert(contactsToSave);

      if (error) throw error;

      toast({
        title: "Contacts saved",
        description: "Your contacts have been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Failed to save contacts. Please try again.",
        variant: "destructive",
      });
    }
  };

  const sendFriendRequest = async (contact: Contact) => {
    if (!contact.antelogUserId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('friend_requests')
        .insert({
          requester_id: user.id,
          addressee_id: contact.antelogUserId,
          status: 'pending',
        });

      if (error) throw error;

      toast({
        title: "Friend request sent",
        description: `Friend request sent to ${contact.name}`,
      });
    } catch (error) {
      toast({
        title: "Request failed",
        description: "Failed to send friend request.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Helmet>
        <title>Import Contacts - Antelog</title>
        <meta name="description" content="Import your contacts to find friends on Antelog" />
      </Helmet>

      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Import Contacts</h1>
          <p className="text-muted-foreground">
            Upload your contacts to find friends who are already on Antelog
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload CSV File
            </CardTitle>
            <CardDescription>
              Upload a CSV file with 'name' and 'email' columns to import your contacts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="csv-upload">Choose CSV file</Label>
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="mt-1"
                />
              </div>
              
              {contacts.length > 0 && (
                <div className="flex gap-2">
                  <Button onClick={saveContacts} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Save Contacts ({contacts.length})
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {contacts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Imported Contacts ({contacts.length})
              </CardTitle>
              <CardDescription>
                {isProcessing ? "Checking which contacts are on Antelog..." : "Your imported contacts"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {contacts.map((contact, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <h3 className="font-medium">{contact.name}</h3>
                      <p className="text-sm text-muted-foreground">{contact.email}</p>
                      {contact.isOnAntelog && contact.profile && (
                        <p className="text-sm text-primary">
                          @{contact.profile.handle} • {contact.profile.full_name}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {contact.isOnAntelog ? (
                        <>
                          <span className="text-sm text-green-600 font-medium">On Antelog</span>
                          <Button
                            size="sm"
                            onClick={() => sendFriendRequest(contact)}
                            className="flex items-center gap-1"
                          >
                            <UserPlus className="h-3 w-3" />
                            Send Request
                          </Button>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not on Antelog</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
};

export default ContactsImport;