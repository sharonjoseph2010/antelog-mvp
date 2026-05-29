import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Users, UserPlus, CheckCircle, Shield, AlertTriangle } from "lucide-react";

interface Contact {
  name: string;
  email: string;
  phone?: string;
  isOnAntelog?: boolean;
  antelogUserId?: string;
  consentGiven?: boolean;
  profile?: {
    handle: string;
    full_name: string;
  };
}

const ContactsImport = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
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
      // SECURITY FIX: Don't attempt to query user emails directly
      // Instead, show consent dialog and mark all as unknown for now
      // In production, this would be handled via secure edge function
      
      const updatedContacts = contactList.map(contact => ({
        ...contact,
        isOnAntelog: false, // Will be determined after consent and secure processing
        consentGiven: false,
      }));

      setContacts(updatedContacts);
      setShowConsentDialog(true);
    } catch (error) {
      console.error('Error processing contacts:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConsentGiven = () => {
    const updatedContacts = contacts.map(contact => ({
      ...contact,
      consentGiven: true,
    }));
    setContacts(updatedContacts);
    setShowConsentDialog(false);
    
    toast({
      title: "Consent recorded",
      description: "Your contacts will be processed securely with your consent.",
    });
  };

  const handleConsentDenied = () => {
    setContacts([]);
    setShowConsentDialog(false);
    
    toast({
      title: "Privacy respected",
      description: "No contact data will be stored without your consent.",
    });
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

      // SECURITY FIX: Only save contacts with explicit consent
      const contactsWithConsent = contacts.filter(contact => contact.consentGiven);
      
      if (contactsWithConsent.length === 0) {
        toast({
          title: "No contacts to save",
          description: "Please provide consent to save contacts.",
          variant: "destructive",
        });
        return;
      }

      const contactsToSave = contactsWithConsent.map(contact => ({
        user_id: user.id,
        contact_name: contact.name,
        contact_email: contact.email,
        contact_phone: contact.phone || null,
        import_source: 'file',
        is_matched: contact.isOnAntelog || false,
        matched_user_id: contact.antelogUserId || null,
        consent_given: true, // SECURITY: Explicit consent tracking
      }));

      const { error } = await supabase
        .from('contact_imports')
        .insert(contactsToSave);

      if (error) throw error;

      // Automatically match the newly imported contacts
      const { data: matchCount, error: matchError } = await supabase.rpc('update_matched_contacts', {
        user_id_input: user.id
      });

      if (matchError) {
        console.error('Error auto-matching contacts:', matchError);
      }

      toast({
        title: "Contacts saved securely",
        description: `Imported ${contactsWithConsent.length} contacts. ${matchCount || 0} are already on Antelog.`,
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
                      {contact.consentGiven ? (
                        <div className="flex items-center gap-2">
                          <Shield className="h-3 w-3" style={{ color: 'hsl(var(--trust-fg))' }} />
                          <span className="text-sm font-medium" style={{ color: 'hsl(var(--trust-fg))' }}>Consent Given</span>
                          {contact.isOnAntelog ? (
                            <Button
                              size="sm"
                              onClick={() => sendFriendRequest(contact)}
                              className="flex items-center gap-1"
                            >
                              <UserPlus className="h-3 w-3" />
                              Send Request
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">Processing...</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-3 w-3" style={{ color: 'hsl(var(--attention-fg))' }} />
                          <span className="text-sm" style={{ color: 'hsl(var(--attention-fg))' }}>Consent Required</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* SECURITY: Consent Dialog for Contact Privacy */}
        <Dialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                Privacy & Consent
              </DialogTitle>
              <DialogDescription className="space-y-2">
                <p>
                  We respect your privacy and the privacy of your contacts. Before processing your contacts:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Contact data will be encrypted and stored securely</li>
                  <li>We'll only check if contacts are Antelog users with your permission</li>
                  <li>You can delete this data anytime from your settings</li>
                  <li>Contact data expires automatically after 1 year</li>
                </ul>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={handleConsentDenied}>
                Don't Store Contacts
              </Button>
              <Button onClick={handleConsentGiven} className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                I Consent to Secure Storage
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default ContactsImport;