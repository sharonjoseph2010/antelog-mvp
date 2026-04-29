import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { X } from "lucide-react";

const TOPIC_OPTIONS = [
  "Food & Cafes",
  "Travel & Hotels",
  "Electronics & Gadgets",
  "Fashion & Clothing",
  "Fitness & Health",
  "Books & Media",
  "Home & Appliances",
  "Finance & Banking",
  "Beauty & Skincare",
  "Parenting",
  "Pets",
  "Sports",
  "Cars & Bikes",
  "Education",
  "Real Estate",
];

const CITY_SUGGESTIONS = [
  "Bengaluru",
  "Mumbai",
  "Delhi",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Goa",
];

const TOTAL_STEPS = 5;

const Welcome = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [expertiseCities, setExpertiseCities] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState("");

  // Step 2
  const [occupation, setOccupation] = useState("");
  const [bio, setBio] = useState("");

  // Step 3
  const [expertiseDomains, setExpertiseDomains] = useState<string[]>([]);
  const [expertiseOther, setExpertiseOther] = useState("");

  // Step 4
  const [interests, setInterests] = useState<string[]>([]);
  const [interestsOther, setInterestsOther] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/login", { replace: true });
        return;
      }
      setUserId(session.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, location, occupation, bio, expertise_cities, expertise_domains, interests, questionnaire_completed")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profile?.questionnaire_completed) {
        navigate("/dashboard", { replace: true });
        return;
      }
      if (profile) {
        setFullName(profile.full_name || "");
        setCity(profile.location || "");
        setOccupation(profile.occupation || "");
        setBio(profile.bio || "");
        setExpertiseCities(Array.isArray(profile.expertise_cities) ? (profile.expertise_cities as any[]).map(String) : []);
        setExpertiseDomains(Array.isArray(profile.expertise_domains) ? (profile.expertise_domains as any[]).map(String) : []);
        setInterests(Array.isArray(profile.interests) ? (profile.interests as any[]).map(String) : []);
      }
      setLoading(false);
    })();
  }, [navigate]);

  const progress = useMemo(() => (step / TOTAL_STEPS) * 100, [step]);

  const addExpertiseCity = (val: string) => {
    const v = val.trim();
    if (!v) return;
    if (expertiseCities.includes(v)) return;
    setExpertiseCities([...expertiseCities, v]);
    setCityInput("");
  };

  const removeExpertiseCity = (v: string) => {
    setExpertiseCities(expertiseCities.filter((c) => c !== v));
  };

  const toggle = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    if (arr.includes(val)) setArr(arr.filter((v) => v !== val));
    else setArr([...arr, val]);
  };

  const canNext = () => {
    if (step === 1) return fullName.trim().length > 0 && city.trim().length > 0;
    if (step === 2) return occupation.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (!canNext()) {
      toast({ title: "Please fill in the required fields", variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  const handleSkip = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));

  const finalExpertise = useMemo(() => {
    const arr = [...expertiseDomains];
    if (expertiseOther.trim()) arr.push(expertiseOther.trim());
    return arr;
  }, [expertiseDomains, expertiseOther]);

  const finalInterests = useMemo(() => {
    const arr = [...interests];
    if (interestsOther.trim()) arr.push(interestsOther.trim());
    return arr;
  }, [interests, interestsOther]);

  const handleFinish = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          location: city.trim(),
          occupation: occupation.trim(),
          bio: bio.trim() || null,
          expertise_cities: expertiseCities as any,
          expertise_domains: finalExpertise as any,
          interests: finalInterests as any,
          questionnaire_completed: true,
          questionnaire_completed_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (error) throw error;
      toast({ title: "All set!", description: "Welcome to Antelog." });
      navigate("/dashboard", { replace: true });
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message || "Please try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  const showSkip = step === 3 || step === 4;

  return (
    <>
      <Helmet>
        <title>Welcome | Antelog</title>
        <meta name="description" content="Tell us a bit about yourself to get the most out of Antelog." />
      </Helmet>
      <div className="min-h-screen bg-background py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground">
              <span>Step {step} of {TOTAL_STEPS}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                {step === 1 && "Your name & location"}
                {step === 2 && "What do you do?"}
                {step === 3 && "What are you an expert in?"}
                {step === 4 && "Your interests"}
                {step === 5 && "You're all set"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {step === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City you're based in</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Bengaluru"
                      list="city-suggestions"
                    />
                    <datalist id="city-suggestions">
                      {CITY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <Label>Cities you know well</Label>
                    <div className="flex gap-2">
                      <Input
                        value={cityInput}
                        onChange={(e) => setCityInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addExpertiseCity(cityInput);
                          }
                        }}
                        placeholder="Type a city and press Enter"
                        list="city-suggestions"
                      />
                      <Button type="button" variant="outline" onClick={() => addExpertiseCity(cityInput)}>Add</Button>
                    </div>
                    {expertiseCities.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {expertiseCities.map((c) => (
                          <Badge key={c} variant="secondary" className="gap-1">
                            {c}
                            <button onClick={() => removeExpertiseCity(c)} aria-label={`Remove ${c}`}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="occupation">Occupation</Label>
                    <Input id="occupation" value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="e.g. Software Engineer, Chef, Architect" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">One line about yourself</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, 120))}
                      placeholder="A short line about you"
                      maxLength={120}
                    />
                    <div className="text-xs text-muted-foreground text-right">{bio.length}/120</div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <p className="text-sm text-muted-foreground">What topics can you give great recommendations on?</p>
                  <div className="flex flex-wrap gap-2">
                    {TOPIC_OPTIONS.map((t) => {
                      const active = expertiseDomains.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggle(expertiseDomains, setExpertiseDomains, t)}
                          className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-accent"}`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expOther">Other</Label>
                    <Input id="expOther" value={expertiseOther} onChange={(e) => setExpertiseOther(e.target.value)} placeholder="Add a custom topic" />
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <p className="text-sm text-muted-foreground">What are you always looking for recommendations on?</p>
                  <div className="flex flex-wrap gap-2">
                    {TOPIC_OPTIONS.map((t) => {
                      const active = interests.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggle(interests, setInterests, t)}
                          className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-accent"}`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intOther">Other</Label>
                    <Input id="intOther" value={interestsOther} onChange={(e) => setInterestsOther(e.target.value)} placeholder="Add a custom interest" />
                  </div>
                </>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <p className="text-muted-foreground">You're all set! Your network will now know what you're great at recommending.</p>
                  <div className="rounded-lg border p-4 space-y-3 text-sm">
                    <div><span className="text-muted-foreground">Name:</span> {fullName || "—"}</div>
                    <div><span className="text-muted-foreground">Based in:</span> {city || "—"}</div>
                    {expertiseCities.length > 0 && (
                      <div><span className="text-muted-foreground">Knows well:</span> {expertiseCities.join(", ")}</div>
                    )}
                    <div><span className="text-muted-foreground">Occupation:</span> {occupation || "—"}</div>
                    {bio && <div><span className="text-muted-foreground">Bio:</span> {bio}</div>}
                    {finalExpertise.length > 0 && (
                      <div><span className="text-muted-foreground">Expert in:</span> {finalExpertise.join(", ")}</div>
                    )}
                    {finalInterests.length > 0 && (
                      <div><span className="text-muted-foreground">Interests:</span> {finalInterests.join(", ")}</div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4">
                <Button type="button" variant="ghost" onClick={handleBack} disabled={step === 1 || saving}>
                  Back
                </Button>
                <div className="flex gap-2">
                  {showSkip && (
                    <Button type="button" variant="ghost" onClick={handleSkip} disabled={saving}>
                      Skip
                    </Button>
                  )}
                  {step < TOTAL_STEPS ? (
                    <Button type="button" onClick={handleNext} disabled={!canNext()}>
                      Next
                    </Button>
                  ) : (
                    <Button type="button" onClick={handleFinish} disabled={saving}>
                      {saving ? "Saving…" : "Go to Dashboard"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default Welcome;