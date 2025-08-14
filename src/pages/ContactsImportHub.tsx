import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Phone, Mail, Upload, Users, Plus, Trash2 } from "lucide-react";

interface ManualContact {
  name: string;
  phone: string;
  email: string;
}

export default function ContactsImportHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [manualContacts, setManualContacts] = useState<ManualContact[]>([
    { name: "", phone: "", email: "" }
  ]);
  const [fileContacts, setFileContacts] = useState<ManualContact[]>([]);

  const addManualContact = () => {
    setManualContacts([...manualContacts, { name: "", phone: "", email: "" }]);
  };

  const removeManualContact = (index: number) => {
    if (manualContacts.length > 1) {
      setManualContacts(manualContacts.filter((_, i) => i !== index));
    }
  };

  const updateManualContact = (index: number, field: keyof ManualContact, value: string) => {
    const updated = [...manualContacts];
    updated[index][field] = value;
    setManualContacts(updated);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const contacts = parseContactFile(text, file.name);
      setFileContacts(contacts);
      toast({
        title: "File uploaded",
        description: `Found ${contacts.length} contacts in the file`,
      });
    };
    reader.readAsText(file);
  };

  const parseContactFile = (content: string, filename: string): ManualContact[] => {
    const contacts: ManualContact[] = [];
    
    if (filename.endsWith('.vcf')) {
      // Parse vCard format
      const vcards = content.split('BEGIN:VCARD');
      for (const vcard of vcards) {
        if (!vcard.trim()) continue;
        
        const nameMatch = vcard.match(/FN:(.+)/);
        const phoneMatch = vcard.match(/TEL.*:(.+)/);
        const emailMatch = vcard.match(/EMAIL.*:(.+)/);
        
        if (nameMatch) {
          contacts.push({
            name: nameMatch[1].trim(),
            phone: phoneMatch ? phoneMatch[1].trim().replace(/[^\d+]/g, '') : '',
            email: emailMatch ? emailMatch[1].trim() : ''
          });
        }
      }
    } else {
      // Parse CSV format
      const lines = content.split('\n');
      const headers = lines[0].toLowerCase().split(',');
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length < 2) continue;
        
        const nameIdx = headers.findIndex(h => h.includes('name'));
        const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile'));
        const emailIdx = headers.findIndex(h => h.includes('email'));
        
        contacts.push({
          name: values[nameIdx] || `Contact ${i}`,
          phone: values[phoneIdx] ? values[phoneIdx].replace(/[^\d+]/g, '') : '',
          email: values[emailIdx] || ''
        });
      }
    }
    
    return contacts.filter(c => c.name.trim());
  };

  const saveContacts = async (contacts: ManualContact[], source: string) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const contactsToSave = contacts
        .filter(c => c.name.trim())
        .map(contact => ({
          user_id: user.id,
          contact_name: contact.name,
          contact_phone: contact.phone || null,
          contact_email: contact.email || null,
          import_source: source
        }));

      const { error } = await supabase
        .from('contact_imports')
        .insert(contactsToSave);

      if (error) throw error;

      toast({
        title: "Contacts imported successfully",
        description: `${contactsToSave.length} contacts have been added to your network`,
      });

      // Navigate to dashboard after successful import
      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving contacts:', error);
      toast({
        title: "Error importing contacts",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const initGoogleContactsImport = () => {
    toast({
      title: "Google Contacts integration",
      description: "Coming soon! For now, you can export your Google contacts as CSV and upload them here.",
    });
  };

  return (
    <>
      <Helmet>
        <title>Import Contacts - Antelog</title>
        <meta name="description" content="Import your contacts to find friends and build your trust network on Antelog" />
      </Helmet>
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Add People You Trust</h1>
          <p className="text-muted-foreground">
            Import your contacts to discover friends and build your trusted network on Antelog
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
          {/* Option A: Google Contacts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Google Contacts
              </CardTitle>
              <CardDescription>
                Import directly from your Google account (easiest option)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={initGoogleContactsImport} className="w-full" variant="outline">
                <Mail className="h-4 w-4 mr-2" />
                Connect Google Contacts
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Securely import your Google contacts with one click
              </p>
            </CardContent>
          </Card>

          {/* Option B: File Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Contact File
              </CardTitle>
              <CardDescription>
                Import from CSV or vCard (.vcf) files
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="contact-file">Choose file</Label>
                <Input
                  id="contact-file"
                  type="file"
                  accept=".csv,.vcf"
                  onChange={handleFileUpload}
                  className="mt-1"
                />
              </div>
              
              {fileContacts.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    Found {fileContacts.length} contacts
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {fileContacts.slice(0, 5).map((contact, idx) => (
                      <div key={idx} className="text-xs text-muted-foreground">
                        {contact.name} {contact.phone && `(${contact.phone})`}
                      </div>
                    ))}
                    {fileContacts.length > 5 && (
                      <div className="text-xs text-muted-foreground">
                        ...and {fileContacts.length - 5} more
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => saveContacts(fileContacts, 'file')}
                    disabled={isLoading}
                    className="w-full mt-3"
                  >
                    Import {fileContacts.length} Contacts
                  </Button>
                </div>
              )}
              
              <div className="text-xs text-muted-foreground">
                <p className="font-medium mb-1">How to export:</p>
                <p>• iPhone: Contacts app → Export → Choose format</p>
                <p>• Android: Contacts app → Export to file</p>
                <p>• Google: contacts.google.com → Export</p>
              </div>
            </CardContent>
          </Card>

          {/* Option C: Manual Entry */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Add Manually
              </CardTitle>
              <CardDescription>
                Enter contacts one by one
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-64 overflow-y-auto space-y-3">
                {manualContacts.map((contact, index) => (
                  <div key={index} className="space-y-2 p-3 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-medium">Contact {index + 1}</Label>
                      {manualContacts.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeManualContact(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Input
                      placeholder="Name"
                      value={contact.name}
                      onChange={(e) => updateManualContact(index, 'name', e.target.value)}
                    />
                    <Input
                      placeholder="Phone number"
                      value={contact.phone}
                      onChange={(e) => updateManualContact(index, 'phone', e.target.value)}
                    />
                    <Input
                      placeholder="Email (optional)"
                      type="email"
                      value={contact.email}
                      onChange={(e) => updateManualContact(index, 'email', e.target.value)}
                    />
                  </div>
                ))}
              </div>
              
              <Button
                variant="outline"
                onClick={addManualContact}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Another Contact
              </Button>
              
              <Button
                onClick={() => saveContacts(manualContacts, 'manual')}
                disabled={isLoading || !manualContacts.some(c => c.name.trim())}
                className="w-full"
              >
                Save Contacts
              </Button>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-8" />

        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Your contacts are private and only used to find mutual connections
          </p>
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard')}
          >
            Skip for now
          </Button>
        </div>
      </div>
    </>
  );
}