import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

const INTEREST_OPTIONS = [
  "Movies & TV",
  "Food & Dining",
  "Books & Reading",
  "Travel",
  "Technology",
  "Fashion & Style",
  "Fitness & Health",
  "Music",
  "Gaming",
  "Art & Design",
];

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  
  // Form fields
  const [fullName, setFullName] = useState("");
  const [handle, setHandle] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate("/login");
          return;
        }
        
        setUserId(user.id);
        setEmail(user.email || "");
        
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("full_name, handle, phone_number, location, bio, interests")
          .eq("id", user.id)
          .single();
        
        if (error) {
          console.error("Error loading profile:", error);
          toast({
            title: "Error loading profile",
            description: error.message,
            variant: "destructive",
          });
          return;
        }
        
        if (profile) {
          setFullName(profile.full_name || "");
          setHandle(profile.handle || "");
          setPhoneNumber(profile.phone_number || "");
          setLocation(profile.location || "");
          setBio(profile.bio || "");
          // Parse interests as string array
          const parsedInterests = Array.isArray(profile.interests) 
            ? profile.interests as string[]
            : [];
          setInterests(parsedInterests);
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadProfile();
  }, [navigate, toast]);

  const handleInterestToggle = (interest: string) => {
    if (interests.includes(interest)) {
      setInterests(interests.filter(i => i !== interest));
    } else {
      if (interests.length < 10) {
        setInterests([...interests, interest]);
      }
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    
    // Validate full name
    if (!fullName || fullName.trim().length < 2) {
      toast({
        title: "Name required",
        description: "Please enter your full name (at least 2 characters)",
        variant: "destructive",
      });
      return;
    }
    
    // Validate bio length
    if (bio && bio.length > 200) {
      toast({
        title: "Bio too long",
        description: "Bio must be 200 characters or less",
        variant: "destructive",
      });
      return;
    }
    
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          location: location.trim() || null,
          bio: bio.trim() || null,
          interests: interests.length > 0 ? interests : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      
      if (error) {
        console.error("Error saving profile:", error);
        toast({
          title: "Error saving profile",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully",
      });
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
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

  return (
    <>
      <Helmet>
        <title>Profile | Antelog</title>
        <meta name="description" content="Manage your profile and personal information on Antelog" />
      </Helmet>
      
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground mt-2">
            Manage your personal information and preferences
          </p>
        </div>
        
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Your essential profile details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <div className="flex gap-2">
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Mike Johnson"
                    maxLength={50}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  This is how you appear to people in your network
                </p>
              </div>
              
              <Separator />
              
              {/* Handle (Read-only) */}
              <div className="space-y-2">
                <Label>Username (Handle)</Label>
                <p className="text-sm text-muted-foreground font-mono">
                  @{handle}
                </p>
                <p className="text-xs text-muted-foreground">
                  Read-only, generated from your email
                </p>
              </div>
              
              <Separator />
              
              {/* Email (Read-only) */}
              <div className="space-y-2">
                <Label>Email</Label>
                <p className="text-sm text-muted-foreground">
                  {email}
                </p>
                <p className="text-xs text-muted-foreground">
                  Cannot be changed
                </p>
              </div>
              
              <Separator />
              
              {/* Phone Number (Read-only) */}
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <p className="text-sm text-muted-foreground">
                  {phoneNumber || "Not set"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Used to match with contacts
                </p>
              </div>
            </CardContent>
          </Card>
          
          {/* Get to Know You */}
          <Card>
            <CardHeader>
              <CardTitle>Get to Know You</CardTitle>
              <CardDescription>
                Help us personalize your experience (optional)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Bangalore, India"
                  maxLength={100}
                />
              </div>
              
              <Separator />
              
              {/* Interests */}
              <div className="space-y-3">
                <Label>Interests (select up to 10)</Label>
                <div className="grid grid-cols-2 gap-3">
                  {INTEREST_OPTIONS.map((interest) => (
                    <div key={interest} className="flex items-center space-x-2">
                      <Checkbox
                        id={interest}
                        checked={interests.includes(interest)}
                        onCheckedChange={() => handleInterestToggle(interest)}
                      />
                      <label
                        htmlFor={interest}
                        className="text-sm cursor-pointer"
                      >
                        {interest}
                      </label>
                    </div>
                  ))}
                </div>
                {interests.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {interests.length} selected
                  </p>
                )}
              </div>
              
              <Separator />
              
              {/* Bio */}
              <div className="space-y-2">
                <Label htmlFor="bio">Bio (optional)</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell your network about yourself..."
                  maxLength={200}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {bio.length}/200
                </p>
              </div>
            </CardContent>
          </Card>
          
          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Profile
            </Button>
          </div>
        </div>
      </main>
    </>
  );
};

export default Profile;
