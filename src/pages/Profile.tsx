import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, X, Check, Plus, ShieldCheck, AlertCircle } from "lucide-react";

interface ProfileData {
  full_name: string;
  handle: string;
  phone_number: string;
  location: string;
  occupation: string;
  bio: string;
  interests: string[];
  expertise_domains: string[];
  expertise_cities: string[];
  user_type: string;
  verification_status: string;
  is_verified: boolean;
}

const emptyProfile: ProfileData = {
  full_name: "", handle: "", phone_number: "", location: "",
  occupation: "", bio: "", interests: [], expertise_domains: [],
  expertise_cities: [], user_type: "guest",
  verification_status: "pending", is_verified: false,
};

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [draft, setDraft] = useState<ProfileData>(emptyProfile);

  const [newInterest, setNewInterest] = useState("");
  const [newExpertise, setNewExpertise] = useState("");
  const [newCity, setNewCity] = useState("");
  const interestInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate("/login"); return; }

        setUserId(user.id);
        setEmail(user.email || "");

        const { data, error } = await supabase
          .from("profiles")
          .select("full_name, handle, phone_number, location, occupation, bio, interests, expertise_domains, expertise_cities, user_type, verification_status, is_verified")
          .eq("id", user.id)
          .single();

        if (error) {
          toast({ title: "Error loading profile", description: error.message, variant: "destructive" });
          return;
        }

        if (data) {
          const parsed: ProfileData = {
            full_name: data.full_name || "",
            handle: data.handle || "",
            phone_number: data.phone_number || "",
            location: data.location || "",
            occupation: (data as any).occupation || "",
            bio: data.bio || "",
            interests: Array.isArray(data.interests) ? (data.interests as any[]).map(String) : [],
            expertise_domains: Array.isArray((data as any).expertise_domains) ? ((data as any).expertise_domains as any[]).map(String) : [],
            expertise_cities: Array.isArray((data as any).expertise_cities) ? ((data as any).expertise_cities as any[]).map(String) : [],
            user_type: data.user_type || "guest",
            verification_status: data.verification_status || "pending",
            is_verified: data.is_verified || false,
          };
          setProfile(parsed);
          setDraft(parsed);
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [navigate, toast]);

  const startEditing = () => {
    setDraft({ ...profile });
    setNewInterest(""); setNewExpertise(""); setNewCity("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft({ ...profile });
    setNewInterest(""); setNewExpertise(""); setNewCity("");
    setEditing(false);
  };

  const addTag = (
    field: "interests" | "expertise_domains" | "expertise_cities",
    value: string,
    setInput: (v: string) => void,
    max = 20,
  ) => {
    const tag = value.trim();
    if (!tag) return;
    if (draft[field].length >= max) return;
    if (draft[field].some((i) => i.toLowerCase() === tag.toLowerCase())) {
      setInput(""); return;
    }
    setDraft((d) => ({ ...d, [field]: [...d[field], tag] }));
    setInput("");
  };

  const removeTag = (field: "interests" | "expertise_domains" | "expertise_cities", tag: string) => {
    setDraft((d) => ({ ...d, [field]: d[field].filter((i) => i !== tag) }));
  };

  const handleSave = async () => {
    if (!userId) return;

    if (!draft.full_name || draft.full_name.trim().length < 2) {
      toast({ title: "Name required", description: "At least 2 characters", variant: "destructive" });
      return;
    }
    if (draft.bio.length > 160) {
      toast({ title: "Bio too long", description: "Max 160 characters", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: draft.full_name.trim(),
          location: draft.location.trim() || null,
          occupation: draft.occupation.trim() || null,
          bio: draft.bio.trim() || null,
          interests: draft.interests.length > 0 ? (draft.interests as any) : null,
          expertise_domains: (draft.expertise_domains as any),
          expertise_cities: (draft.expertise_cities as any),
          phone_number: draft.phone_number.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) {
        toast({ title: "Error saving", description: error.message, variant: "destructive" });
        return;
      }

      setProfile({ ...draft });
      setEditing(false);
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderTagEditor = (
    label: string,
    field: "interests" | "expertise_domains" | "expertise_cities",
    inputVal: string,
    setInput: (v: string) => void,
    placeholder: string,
    emptyText: string,
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {(editing ? draft[field] : profile[field]).map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 text-sm">
            {tag}
            {editing && (
              <button type="button" onClick={() => removeTag(field, tag)} className="ml-0.5 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {(editing ? draft[field] : profile[field]).length === 0 && !editing && (
          <p className="text-sm text-muted-foreground italic">{emptyText}</p>
        )}
      </div>
      {editing && (
        <div className="flex gap-2 mt-1">
          <Input
            value={inputVal}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(field, inputVal, setInput); } }}
            placeholder={placeholder}
            maxLength={40}
            className="flex-1"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => addTag(field, inputVal, setInput)} disabled={!inputVal.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Profile | Antelog</title>
        <meta name="description" content="Manage your profile on Antelog" />
      </Helmet>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Profile</h1>
            <p className="text-muted-foreground mt-1">Your personal information</p>
          </div>
          {!editing && (
            <Button variant="outline" onClick={startEditing}>
              <Pencil className="mr-2 h-4 w-4" /> Edit Profile
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {/* Account */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Handle</Label>
                <p className="text-sm font-mono font-semibold">@{profile.handle}</p>
                <p className="text-xs text-muted-foreground">Your handle rotates every login for privacy</p>
              </div>
              <Separator />
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Email</Label>
                <p className="text-sm">{email}</p>
              </div>
              <Separator />
              <div className="flex items-center gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Verification</Label>
                  <div className="flex items-center gap-2">
                    {profile.is_verified ? (
                      <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" /> Verified</Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" /> {profile.verification_status}</Badge>
                    )}
                    <Badge variant="outline">{profile.user_type}</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personal Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Personal Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full Name</Label>
                {editing ? (
                  <Input id="fullName" value={draft.full_name} onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))} maxLength={50} />
                ) : (
                  <p className="text-sm">{profile.full_name || <span className="text-muted-foreground italic">Not set</span>}</p>
                )}
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone Number</Label>
                {editing ? (
                  <Input id="phone" type="tel" value={draft.phone_number} onChange={(e) => setDraft((d) => ({ ...d, phone_number: e.target.value }))} placeholder="+91 9876543210" />
                ) : (
                  <p className="text-sm">{profile.phone_number || <span className="text-muted-foreground italic">Not set</span>}</p>
                )}
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="location">Location</Label>
                {editing ? (
                  <Input id="location" value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} placeholder="e.g. Mumbai, India" maxLength={100} />
                ) : (
                  <p className="text-sm">{profile.location || <span className="text-muted-foreground italic">Not set</span>}</p>
                )}
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="occupation">Occupation</Label>
                {editing ? (
                  <Input id="occupation" value={draft.occupation} onChange={(e) => setDraft((d) => ({ ...d, occupation: e.target.value }))} placeholder="e.g. Software Engineer" maxLength={80} />
                ) : (
                  <p className="text-sm">{profile.occupation || <span className="text-muted-foreground italic">Not set</span>}</p>
                )}
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="bio">Bio</Label>
                {editing ? (
                  <>
                    <Textarea id="bio" value={draft.bio} onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))} placeholder="A short intro about you..." maxLength={160} rows={3} />
                    <p className="text-xs text-muted-foreground text-right">{draft.bio.length}/160</p>
                  </>
                ) : (
                  <p className="text-sm">{profile.bio || <span className="text-muted-foreground italic">Not set</span>}</p>
                )}
              </div>

              <Separator />

              {renderTagEditor("Cities I know well", "expertise_cities", newCity, setNewCity, "Type a city and press Enter", "No cities added")}

              <Separator />

              {renderTagEditor("Expert in", "expertise_domains", newExpertise, setNewExpertise, "Type a topic and press Enter", "No expertise added")}

              <Separator />

              {renderTagEditor("Interests", "interests", newInterest, setNewInterest, "Type an interest and press Enter", "No interests added")}
            </CardContent>
          </Card>

          {editing && (
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelEditing} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Check className="mr-2 h-4 w-4" /> Save Changes
              </Button>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default Profile;
