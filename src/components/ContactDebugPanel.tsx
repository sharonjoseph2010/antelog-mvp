import { log } from "@/lib/logger";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { normalizePhone } from "@/lib/phone-utils";

interface ContactDebugData {
  id: string;
  contact_name: string;
  contact_phone: string;
  contact_phone_normalized: string;
  is_matched: boolean;
  matched_user_id?: string;
}

interface ProfileDebugData {
  id: string;
  full_name: string;
  handle: string;
  phone_number: string;
  phone_number_normalized: string;
}

const ContactDebugPanel = () => {
  const [contacts, setContacts] = useState<ContactDebugData[]>([]);
  const [profiles, setProfiles] = useState<ProfileDebugData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDebugData();
  }, []);

  const loadDebugData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      log("🔍 Loading debug data...");

      // Load contacts with phone numbers
      const { data: contactsData, error: contactsError } = await supabase
        .from('contact_imports')
        .select('*')
        .eq('user_id', user.id)
        .not('contact_phone', 'is', null);

      if (contactsError) throw contactsError;

      // Normalize contact phones
      const contactsWithNormalized = (contactsData || []).map(contact => ({
        id: contact.id,
        contact_name: contact.contact_name,
        contact_phone: contact.contact_phone || '',
        contact_phone_normalized: normalizePhone(contact.contact_phone || ''),
        is_matched: contact.is_matched,
        matched_user_id: contact.matched_user_id
      }));

      log("📋 Contacts loaded:", contactsWithNormalized);
      setContacts(contactsWithNormalized);

      // Load all profiles with phone numbers
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, handle, phone_number')
        .not('phone_number', 'is', null);

      if (profilesError) throw profilesError;

      // Normalize profile phones
      const profilesWithNormalized = (profilesData || []).map(profile => ({
        id: profile.id,
        full_name: profile.full_name || '',
        handle: profile.handle,
        phone_number: profile.phone_number || '',
        phone_number_normalized: normalizePhone(profile.phone_number || '')
      }));

      log("👥 Profiles loaded:", profilesWithNormalized);
      setProfiles(profilesWithNormalized);

      // Log matching analysis
      log("\n🔍 MATCHING ANALYSIS:");
      contactsWithNormalized.forEach(contact => {
        log(`\n📋 Contact: ${contact.contact_name}`);
        log(`   Original: "${contact.contact_phone}"`);
        log(`   Normalized: "${contact.contact_phone_normalized}"`);
        log(`   Is Matched: ${contact.is_matched}`);

        const matchingProfiles = profilesWithNormalized.filter(
          p => p.phone_number_normalized === contact.contact_phone_normalized
        );

        if (matchingProfiles.length > 0) {
          log(`   ✅ Found ${matchingProfiles.length} matching profile(s):`);
          matchingProfiles.forEach(p => {
            log(`      - ${p.full_name} (@${p.handle})`);
            log(`        Original: "${p.phone_number}"`);
            log(`        Normalized: "${p.phone_number_normalized}"`);
          });
        } else {
          log(`   ❌ No matching profiles found`);
          log(`   Available profile phones:`);
          profilesWithNormalized.forEach(p => {
            log(`      - ${p.full_name}: "${p.phone_number_normalized}"`);
          });
        }
      });

    } catch (error) {
      console.error('Error loading debug data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="mt-8 border-amber-200 bg-amber-50/50">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
          <span className="ml-2 text-amber-600">Loading debug data...</span>
        </CardContent>
      </Card>
    );
  }

  const getMatchStatus = (contact: ContactDebugData) => {
    const matchingProfiles = profiles.filter(
      p => p.phone_number_normalized === contact.contact_phone_normalized
    );
    return matchingProfiles.length > 0 ? matchingProfiles : null;
  };

  return (
    <Card className="mt-8 border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <AlertCircle className="w-5 h-5" />
          Debug Panel - Phone Number Matching Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Contacts Section */}
        <div>
          <h3 className="font-semibold text-lg mb-3 text-amber-900">
            Your Imported Contacts ({contacts.length})
          </h3>
          <div className="space-y-3">
            {contacts.map(contact => {
              const matchingProfiles = getMatchStatus(contact);
              return (
                <div key={contact.id} className="bg-white p-4 rounded-lg border border-amber-200">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium text-amber-900">{contact.contact_name}</div>
                    {contact.is_matched ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">Matched</Badge>
                    ) : (
                      <Badge variant="outline">Not Matched</Badge>
                    )}
                  </div>
                  <div className="text-sm space-y-1 font-mono text-amber-800">
                    <div>Original: <code className="bg-amber-100 px-1 rounded">{contact.contact_phone}</code></div>
                    <div>Normalized: <code className="bg-amber-100 px-1 rounded">{contact.contact_phone_normalized}</code></div>
                  </div>
                  {matchingProfiles && matchingProfiles.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-amber-200">
                      <div className="text-sm text-green-700 font-medium">
                        ✅ Should match: {matchingProfiles.map(p => `${p.full_name} (@${p.handle})`).join(', ')}
                      </div>
                    </div>
                  )}
                  {!matchingProfiles && (
                    <div className="mt-2 pt-2 border-t border-amber-200">
                      <div className="text-sm text-red-700 font-medium">
                        ❌ No matching profiles with this normalized phone
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Profiles Section */}
        <div>
          <h3 className="font-semibold text-lg mb-3 text-amber-900">
            All Profiles with Phone Numbers ({profiles.length})
          </h3>
          <div className="space-y-3">
            {profiles.map(profile => (
              <div key={profile.id} className="bg-white p-4 rounded-lg border border-amber-200">
                <div className="font-medium text-amber-900 mb-2">
                  {profile.full_name} (@{profile.handle})
                </div>
                <div className="text-sm space-y-1 font-mono text-amber-800">
                  <div>Original: <code className="bg-amber-100 px-1 rounded">{profile.phone_number}</code></div>
                  <div>Normalized: <code className="bg-amber-100 px-1 rounded">{profile.phone_number_normalized}</code></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ContactDebugPanel;
